/**
 * Checkout's local writes are atomic — ADR-011.
 *
 * Checkout creates a Customer, finds-or-creates an ArrivalWindow, creates a
 * Booking and flips the Visit to CHECKED_OUT. Before pass three those were
 * four independent statements: a failure part-way left an orphaned Customer
 * and ArrivalWindow with no Booking pointing at them. The pass-three audit
 * found exactly one ownerless Customer in live data, which is what that looks
 * like after the fact.
 *
 * This proves the property rather than asserting it, by running the same
 * sequence and forcing it to fail at the last step, then checking that
 * nothing survived. It runs offline against the real database using a
 * throwaway contractor, and cleans up whatever it made.
 *
 * Deliberately NOT a test of the route's HTTP behavior: the route reaches
 * Jobber before it writes anything, so an end-to-end run needs live Jobber
 * credentials. The transaction is the part that can be proven here, and it is
 * the part pass three changed.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
/**
 * RUN-UNIQUE, because the worktree and the database are shared.
 *
 * The fixed slug was worse here than a create collision. `upsert` meant two
 * concurrent runs SHARED one contractor, and the "starting clean" assertion
 * counts customers, windows and bookings scoped to it — so one run's fixture
 * rows failed the other run's assertion, and either run's teardown deleted
 * the contractor the other was still using. A product-shaped failure with no
 * product defect behind it.
 *
 * Same shape as verify-activation-dependencies, deliberately. The prefix
 * stays fixed so a probe from a crashed run is still sweepable.
 */
const PREFIX = "__checkout_atomicity_probe__";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

/** Old enough that no run could still be using it. */
const STALE_AFTER_MS = 60 * 60 * 1000;

let pass = 0, fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? `\n         ${detail}` : ""}`); }
}

async function purge(contractorId: string) {
  await prisma.booking.deleteMany({ where: { visit: { contractorId } } });
  await prisma.lineItem.deleteMany({ where: { visit: { contractorId } } });
  await prisma.visit.deleteMany({ where: { contractorId } });
  await prisma.customer.deleteMany({ where: { contractorId } });
  await prisma.arrivalWindow.deleteMany({ where: { serviceArea: { contractorId } } });
  await prisma.serviceArea.deleteMany({ where: { contractorId } });
  await prisma.contractor.deleteMany({ where: { id: contractorId } });
}

async function main() {
  console.log("\nCHECKOUT ATOMICITY\n");

  // Only genuinely abandoned siblings. Purging every one of them would
  // destroy a CONCURRENT run's live probe — the collision the run-unique slug
  // exists to prevent, reintroduced by the cleanup.
  const stale = await prisma.contractor.findMany({
    where: {
      slug: { startsWith: PREFIX },
      NOT: { slug: SLUG },
      createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
    },
    select: { id: true },
  });
  for (const old of stale) await purge(old.id);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned probe(s))`);

  const c = await prisma.contractor.create({
    data: { slug: SLUG, name: "Checkout atomicity probe" },
  });
  try {
    const area = await prisma.serviceArea.create({
      data: { contractorId: c.id, name: "probe area", zipCodes: ["07701"], active: true },
    });
    const visit = await prisma.visit.create({
      data: { contractorId: c.id, sessionId: "probe-session", status: "OPEN" },
    });

    const before = {
      customers: await prisma.customer.count({ where: { contractorId: c.id } }),
      windows: await prisma.arrivalWindow.count({ where: { serviceAreaId: area.id } }),
      bookings: await prisma.booking.count({ where: { visitId: visit.id } }),
    };
    ok(before.customers === 0 && before.windows === 0 && before.bookings === 0,
       "starting clean", JSON.stringify(before));

    // The same sequence checkout runs, forced to fail at the final step.
    let threw = false;
    try {
      await prisma.$transaction(async (tx) => {
        await tx.customer.create({
          data: { contractorId: c.id, name: "probe", email: "p@example.test" },
        });
        await tx.arrivalWindow.create({
          data: {
            date: new Date("2030-01-01"),
            startTime: "8:00 AM",
            endTime: "11:00 AM",
            serviceAreaId: area.id,
            capacityTotal: 4,
          },
        });
        // Fails: a Booking needs a customerId, and this names one that does
        // not exist. Stands in for any failure after the first two writes.
        await tx.booking.create({
          data: {
            visitId: visit.id,
            customerId: "does-not-exist",
            address: "1 Test Way",
            zipCode: "07701",
            arrivalWindowId: "also-does-not-exist",
            totalCents: 1,
            paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
            paymentStatus: "pending_card_capture_setup",
          },
        });
      });
    } catch {
      threw = true;
    }
    ok(threw, "the transaction failed, as the probe intended");

    const after = {
      customers: await prisma.customer.count({ where: { contractorId: c.id } }),
      windows: await prisma.arrivalWindow.count({ where: { serviceAreaId: area.id } }),
      bookings: await prisma.booking.count({ where: { visitId: visit.id } }),
    };
    ok(after.customers === 0, "NO orphaned Customer survived the failure", `found ${after.customers}`);
    ok(after.windows === 0, "NO orphaned ArrivalWindow survived the failure", `found ${after.windows}`);
    ok(after.bookings === 0, "and no Booking, obviously", `found ${after.bookings}`);

    // ── THE DEPOSIT ROWS ROLL BACK TOO ────────────────────────────────────
    //
    // A deposit checkout writes five more rows inside the same transaction:
    // Appointment, PreWorkVisit and a PaymentEvent recording the hold. If any
    // of those survived a failed checkout, a contractor would have a pre-work
    // visit on the calendar for a booking that does not exist — and a ledger
    // row for money nobody is holding.
    const afterDeposit = {
      appointments: await prisma.appointment.count({ where: { booking: { visitId: visit.id } } }),
      preWork: await prisma.preWorkVisit.count({ where: { booking: { visitId: visit.id } } }),
      events: await prisma.paymentEvent.count({ where: { booking: { visitId: visit.id } } }),
    };
    ok(afterDeposit.appointments === 0, "NO orphaned Appointment survived the failure",
       `found ${afterDeposit.appointments}`);
    ok(afterDeposit.preWork === 0, "NO orphaned PreWorkVisit survived the failure",
       `found ${afterDeposit.preWork}`);
    ok(afterDeposit.events === 0, "NO orphaned PaymentEvent survived the failure",
       `found ${afterDeposit.events}`);

    // ── FAILING LATER, NOT ONLY AT THE BOOKING ────────────────────────────
    //
    // The probe above fails at the Booking, which is the FIRST place the
    // deposit rows could not exist yet. A deposit checkout has three more
    // write points after it, so failing only there proves the easy half.
    // This one gets all the way to the PaymentEvent and dies on the last row.
    let lateThrew = false;
    try {
      await prisma.$transaction(async (tx) => {
        const cust = await tx.customer.create({
          data: { contractorId: c.id, name: "late probe", email: "late@example.test" },
        });
        const win = await tx.arrivalWindow.create({
          data: {
            date: new Date("2030-01-02"), startTime: "8:00 AM", endTime: "11:00 AM",
            serviceAreaId: area.id, capacityTotal: 4,
          },
        });
        const bk = await tx.booking.create({
          data: {
            visitId: visit.id, customerId: cust.id, address: "1 Test Way", zipCode: "07701",
            arrivalWindowId: win.id, totalCents: 1,
            paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
            paymentStatus: "probe", paymentState: "DEPOSIT_AUTHORIZED", depositDueCents: 24900,
          },
        });
        const appt = await tx.appointment.create({
          data: { bookingId: bk.id, kind: "PRE_WORK", arrivalWindowId: win.id },
        });
        await tx.preWorkVisit.create({
          data: { bookingId: bk.id, appointmentId: appt.id },
        });
        // Fails on the LAST row: a PaymentEvent naming a booking that will not
        // survive. Everything before it has already been written.
        await tx.paymentEvent.create({
          data: {
            bookingId: "does-not-exist", kind: "AUTHORIZATION_CREATED",
            amountCents: 24900, stripeObjectId: "pi_late_probe",
          },
        });
      });
    } catch {
      lateThrew = true;
    }
    ok(lateThrew, "a deposit transaction failing at its LAST row still throws");

    const afterLate = {
      customers: await prisma.customer.count({ where: { contractorId: c.id } }),
      bookings: await prisma.booking.count({ where: { visitId: visit.id } }),
      appointments: await prisma.appointment.count({ where: { booking: { visitId: visit.id } } }),
      preWork: await prisma.preWorkVisit.count({ where: { booking: { visitId: visit.id } } }),
      events: await prisma.paymentEvent.count({ where: { stripeObjectId: "pi_late_probe" } }),
    };
    ok(Object.values(afterLate).every((n) => n === 0),
       "and every row it had already written rolled back",
       JSON.stringify(afterLate));

    const v = await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } });
    ok(v.status === "OPEN", "the Visit is still OPEN — not half checked out", `got ${v.status}`);

    // Positive control: the same sequence, succeeding, must commit all four.
    const customer = await prisma.$transaction(async (tx) => {
      const cust = await tx.customer.create({
        data: { contractorId: c.id, name: "probe2", email: "p2@example.test" },
      });
      const win = await tx.arrivalWindow.create({
        data: {
          date: new Date("2030-01-02"),
          startTime: "8:00 AM",
          endTime: "11:00 AM",
          serviceAreaId: area.id,
          capacityTotal: 4,
        },
      });
      await tx.booking.create({
        data: {
          visitId: visit.id,
          customerId: cust.id,
          address: "1 Test Way",
          zipCode: "07701",
          arrivalWindowId: win.id,
          totalCents: 1,
          paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
          paymentStatus: "pending_card_capture_setup",
        },
      });
      await tx.visit.update({ where: { id: visit.id }, data: { status: "CHECKED_OUT" } });
      return cust;
    });
    const done = {
      customers: await prisma.customer.count({ where: { contractorId: c.id } }),
      windows: await prisma.arrivalWindow.count({ where: { serviceAreaId: area.id } }),
      bookings: await prisma.booking.count({ where: { visitId: visit.id } }),
      status: (await prisma.visit.findUniqueOrThrow({ where: { id: visit.id } })).status,
    };
    ok(done.customers === 1 && done.windows === 1 && done.bookings === 1 && done.status === "CHECKED_OUT",
       "POSITIVE CONTROL: a succeeding run commits all four writes",
       JSON.stringify(done));
    ok(customer.contractorId === c.id, "and the Customer carries its owner — stamped, not inferred");

    // jobberJobId is the recovery marker and must start null.
    const b = await prisma.booking.findFirstOrThrow({ where: { visitId: visit.id } });
    ok(b.jobberJobId === null,
       "a fresh Booking has jobberJobId null — 'committed here, not pushed yet'");
  } finally {
    await purge(c.id);
    console.log("\n  Probe contractor removed.");
  }

  console.log(fail === 0 ? `\n${pass} checks passed.\n` : `\n${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); process.exit(1); })
        .finally(() => prisma.$disconnect());
}
