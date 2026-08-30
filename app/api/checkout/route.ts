import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import {
  pushBookingToJobber,
  pickCrewForWindow,
  effectiveBusySpan,
  windowToDateRange,
} from "@/lib/jobber";
import { loadBusinessHours, toDisplay, toMinutes } from "@/lib/businessHours";
import { preWorkProjectConflict, depositDueCentsFor } from "@/lib/paymentLedger";
import { runDepositCheckout, resumeDepositCheckout } from "@/lib/depositFlow";
import { stripeGateway } from "@/lib/paymentGateway";
import { recordCapture, recordCaptureFailure } from "@/lib/depositRecording";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { loadIdentity } from "@/lib/storefrontIdentity";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { findOpenVisit } from "@/lib/openVisit";

export async function POST(req: Request) {
  console.log("=== CHECKOUT ROUTE HIT — this line should always appear if logs are streaming ===");

  // ADR §2.2. Checkout was the last customer-facing route deriving nothing
  // from a site identifier — it read ServiceArea unscoped, so with two
  // contractors it would have validated a ZIP against EVERY contractor's
  // service area and booked whoever happened to cover it.
  //
  // It was missed because ServiceArea was still classified pending when the
  // storefront routes were converted; it became tenant-owned later the same
  // day. Found by a sweep that derives its model list from the guard rather
  // than from a list written down beside it.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  return withSite(site, async (db) => {
  const sessionId = getOrCreateSessionId();
  const body = await req.json();
  const { name, email, phone, address, zipCode, date, windowStart, windowEnd, paymentMethodId, resumePaymentIntentId } = body;

  // ADR-011. Keyed on the contractor the site resolved to. Unkeyed, a
  // visitor with a cart on another contractor's storefront would have checked
  // that cart out here, against this contractor's crew and service area.
  const visit = await db.visit.findFirst({
    where: { contractorId: site.contractorId, sessionId, status: "OPEN" },
    include: {
      lineItems: {
        include: {
          service: {
            select: {
              name: true,
              slug: true,
              // For the one-project invariant and the deposit snapshot. Both
              // are decided from the services actually on this visit, never
              // from a list of slugs written down somewhere else.
              requiresPreWorkVisit: true,
              depositCents: true,
            },
          },
        },
      },
    },
  });

  if (!visit || visit.lineItems.length === 0) {
    return NextResponse.json({ error: "No items in visit" }, { status: 400 });
  }

  // Nothing gets booked while a line is still being priced.
  //
  // The cart disables the button and the schedule page redirects, but this is
  // the last gate before a customer is committed to a total and a crew is
  // dispatched — so it refuses outright rather than summing around the gap.
  // Left unguarded, an unpriced line would count as zero and the customer
  // would book at a total quietly missing an item.
  //
  // Checked BEFORE anything is created: further down this route makes a
  // Customer and possibly an ArrivalWindow, and bailing after that would
  // leave orphans behind.
  const unpriced = visit.lineItems.filter((li) => li.computedPriceCents === null);
  if (unpriced.length > 0) {
    return NextResponse.json(
      {
        error: "AWAITING_QUOTE",
        message:
          unpriced.length === 1
            ? "One item on your visit is still being priced. We'll email you as soon as it's ready."
            : `${unpriced.length} items on your visit are still being priced. We'll email you as soon as they're ready.`,
      },
      { status: 409 }
    );
  }

  // V1 INVARIANT: at most one pre-work project per booking.
  //
  // PreWorkVisit is 1:1 on Booking, so two deposit-bearing services on one
  // visit would mean two projects, two permits, two verification visits — and
  // one workflow record. There is no correct behavior to pick; the model has
  // nowhere to put the second one.
  //
  // Refused here, alongside the unpriced-line gate, because both are the same
  // kind of check: something that must be true before any row is written.
  // Normal services ride along freely.
  const preWork = preWorkProjectConflict(
    visit.lineItems.map((li) => ({
      slug: li.service.slug,
      requiresPreWorkVisit: li.service.requiresPreWorkVisit,
    }))
  );
  if (preWork.conflict) {
    return NextResponse.json(
      {
        error: "One project at a time",
        detail:
          "These need their own visit each, so we can verify and permit them separately.",
        slugs: preWork.slugs,
      },
      { status: 400 }
    );
  }

  // Service area, before anything is created.
  //
  // This used to happen further down, AFTER the customer row, and if no
  // active ServiceArea existed it CREATED one with an empty ZIP list and
  // carried on — which meant checkout was writing business configuration to
  // get past its own validation. Every ZIP in the country passed.
  //
  // Now it fails closed: no configured area, no booking. And it runs before
  // any row is written, so a rejection leaves nothing behind.
  const normalizedZip = String(zipCode ?? "").trim().slice(0, 5);
  if (!/^\d{5}$/.test(normalizedZip)) {
    return NextResponse.json(
      { error: "INVALID_ZIP", message: "Please enter a five-digit ZIP code." },
      { status: 400 }
    );
  }

  // Scoped by the guard: this contractor's service area, not everyone's.
  const serviceArea = await db.serviceArea.findFirst({ where: { active: true } });
  if (!serviceArea) {
    // Configuration is missing, which is an Elite problem rather than a
    // customer one — so it reads as a system fault, not a rejection.
    console.error("[checkout] no active ServiceArea configured — refusing to book");
    return NextResponse.json(
      {
        error: "NO_SERVICE_AREA",
        message:
          "We can't take bookings online just now. Please give us a call and we'll get you scheduled.",
      },
      { status: 503 }
    );
  }

  if (!serviceArea.zipCodes.includes(normalizedZip)) {
    return NextResponse.json(
      {
        error: "OUTSIDE_SERVICE_AREA",
        message:
          `We don't currently cover ${normalizedZip}. If you think that's wrong, give us a call — ` +
          `we do sometimes travel a little further.`,
      },
      { status: 422 }
    );
  }

  // Internal dispatch data — sum of every line item's snapshotted duration.
  // Null (not 0) if ANY item is missing an estimate, so it's obvious in the
  // data that the total is incomplete rather than silently under-counting.
  // Computed here, before the availability check below, since a job
  // longer than its arrival window needs to correctly block a crew's
  // calendar for its real length, not just the 3-hour window.
  const hasCompleteEstimates = visit.lineItems.every((li) => li.estimatedMinutes !== null);
  const estimatedDurationMinutes = hasCompleteEstimates
    ? visit.lineItems.reduce((sum, li) => sum + (li.estimatedMinutes ?? 0), 0)
    : null;

  // Final, live availability check — right here, right before anything is
  // created. The schedule page only re-checks Jobber when a day tab is
  // actually clicked; the DEFAULT day shown on first load never gets a
  // second look unless someone switches away and back. Between that
  // initial snapshot and a customer actually finishing checkout (a
  // multi-step flow — schedule, then details, then submit), real time
  // passes and the calendar can genuinely change. This is the one place
  // that's guaranteed to check the instant a booking is actually about to
  // be committed, and it's what stops a booking from being created at all
  // for a window that's no longer really open — rather than creating it
  // anyway and only discovering the conflict later trying to push to Jobber.
  const dateISO = new Date(date).toISOString().split("T")[0];
  // Guarded: crew members are contractor-owned (ADR-011). This decides
  // whether a window is bookable, so another contractor's crew calendar must
  // never be able to open or close a slot on this one.
  const eligibleCrews = await db.jobberCrewMember.findMany({
    where: { eligibleForWebsiteBookings: true },
    select: { jobberUserId: true },
  });
  const [windowStartDate, windowEndDate] = effectiveBusySpan(dateISO, windowStart, windowEnd, estimatedDurationMinutes);

  // Would this job run past the end of the crew's day?
  //
  // The schedule page already hides windows a job can't fit in, but that's
  // presentation — this is the rule. A stale tab, a bookmarked URL or a direct
  // POST would otherwise put a crew on site hours after they should have gone
  // home, and nobody would find out until the day itself.
  const businessHours = await loadBusinessHours(db, site.contractorId);
  const [, workdayEnd] = windowToDateRange(
    dateISO,
    "8:00 AM",
    toDisplay(toMinutes(businessHours.dayEnd))
  );
  if (windowEndDate.getTime() > workdayEnd.getTime()) {
    return NextResponse.json(
      {
        error: "WINDOW_TOO_LATE",
        message:
          "That job needs more time than's left in the day for that arrival window. Please pick an earlier one.",
      },
      { status: 409 }
    );
  }
  const assignedCrewId = await pickCrewForWindow(
    site.contractorId,
    dateISO,
    windowStartDate,
    windowEndDate,
    eligibleCrews.map((c) => c.jobberUserId)
  );

  if (!assignedCrewId) {
    return NextResponse.json(
      { error: "Sorry, that arrival window was just taken. Please go back and pick another." },
      { status: 409 }
    );
  }

  // Safe by the guard above — every line has a price by this point. The
  // fallback is belt-and-braces rather than a real branch.
  const totalCents = visit.lineItems.reduce((sum, li) => sum + (li.computedPriceCents ?? 0), 0);

  // Snapshotted, not read live. A later change to a contractor's depositCents
  // must not alter what somebody already agreed to — the same discipline
  // LineItem already follows for price and resolved crew-hours.
  //
  // Zero when nothing is due, which is a different fact from the null carried
  // by every booking made before this system existed. Evaluated-and-none is
  // not the same as never-evaluated.
  const depositDueCents = depositDueCentsFor(visit.lineItems.map((li) => li.service));

  // ONE TRANSACTION for all four related writes.
  //
  // These used to run as four independent statements. A failure part-way
  // through left an orphaned Customer and ArrivalWindow behind with no
  // Booking — and the pass-three audit found exactly one ownerless Customer
  // in live data, which is what that looks like after the fact.
  //
  // UNGUARDED CLIENT, DELIBERATELY. Booking and ArrivalWindow derive their
  // owners through Visit and ServiceArea (ADR-010), so they have no
  // contractorId to stamp and the guard refuses a direct create rather than
  // inventing one. Both parents are already proven through the guarded
  // client: `visit` and `serviceArea` are both reads that would have returned
  // null for another contractor. Customer IS direct-owned, so its owner is
  // stamped explicitly here — inside a raw transaction the extension does not
  // fire, and an unstamped Customer would be an ownerless row again.
  //
  // Nothing external happens inside this block. The Jobber push and the
  // confirmation email run after it commits, because a transaction held open
  // across a network call holds database locks for as long as a third party
  // takes to answer.
  // Takes the authorized PaymentIntent so the deposit rows are written in the
  // SAME transaction as the booking. Undefined for every non-deposit checkout,
  // which therefore takes a byte-identical path to the one it took before.
  const writeCheckout = (authorizedIntentId?: string) => prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { contractorId: site.contractorId, name, email, phone },
    });

    // Phase 2 stub: find-or-create the ArrivalWindow for this date/time rather
    // than requiring admin-seeded capacity data up front. Real capacity
    // enforcement (booked vs. total) is Phase 6.
    //
    // Tenant-safe through serviceAreaId: serviceArea was read on the guarded
    // client, so this can only ever match or create a window under THIS
    // contractor's area. That is the relation ArrivalWindow now derives its
    // owner from — before pass three, serviceAreaId was a bare scalar and a
    // Booking could point at another contractor's window.
    //
    // Still racy: there is no unique on (date, startTime, endTime,
    // serviceAreaId), so two concurrent checkouts can create duplicate
    // windows and split the capacity counter. That constraint is a contract
    // change and ships with the destructive step, not here.
    let arrivalWindow = await tx.arrivalWindow.findFirst({
      where: { date: new Date(date), startTime: windowStart, endTime: windowEnd, serviceAreaId: serviceArea.id },
    });
    if (!arrivalWindow) {
      arrivalWindow = await tx.arrivalWindow.create({
        data: {
          date: new Date(date),
          startTime: windowStart,
          endTime: windowEnd,
          serviceAreaId: serviceArea.id,
          capacityTotal: 4,
        },
      });
    }

    const booking = await tx.booking.create({
      data: {
        visitId: visit.id,
        customerId: customer.id,
        address,
        zipCode: normalizedZip,
        arrivalWindowId: arrivalWindow.id,
        totalCents,
        estimatedDurationMinutes,
        // Card-on-file, captured after completion — decided in the approved
        // architecture. Real Stripe SetupIntent wiring is Phase 6; for now
        // paymentStatus reflects that no charge has happened yet.
        paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION",
        paymentStatus: "pending_card_capture_setup",
        // Evaluated by the deposit system, so a real number rather than null.
        depositDueCents,
        // LEGACY_UNTRACKED until capture ships. A booking made today has its
        // money handled outside this system exactly as one made last month
        // did, and labeling it AWAITING_METHOD would claim a lifecycle it
        // cannot enter.
        // A deposit booking enters the lifecycle at DEPOSIT_AUTHORIZED — the
        // hold exists, the money has not moved. Everything else stays outside
        // this system exactly as it was.
        paymentState: authorizedIntentId ? "DEPOSIT_AUTHORIZED" : "LEGACY_UNTRACKED",
      },
    });

    // ── the deposit rows, atomically with the booking ────────────────────
    //
    // Appointment and PreWorkVisit are created HERE rather than after capture,
    // so a booking can never exist without the workflow rows describing it.
    // They are INERT until DEPOSIT_CAPTURED: preWorkMayProceed gates
    // scheduling and the Jobber push, so the rows existing is not the same as
    // the visit being real.
    if (authorizedIntentId) {
      const appointment = await tx.appointment.create({
        data: {
          bookingId: booking.id,
          kind: "PRE_WORK",
          arrivalWindowId: arrivalWindow.id,
          status: "SCHEDULED",
        },
      });
      await tx.preWorkVisit.create({
        data: {
          bookingId: booking.id,
          appointmentId: appointment.id,
          scopeState: "PENDING_VERIFICATION",
        },
      });
      // The authorization is a ledger fact even though no money moved: it
      // records that a hold exists, which is what makes an abandoned checkout
      // distinguishable from one that never started.
      await tx.paymentEvent.create({
        data: {
          bookingId: booking.id,
          kind: "AUTHORIZATION_CREATED",
          amountCents: depositDueCents,
          stripeObjectId: authorizedIntentId,
        },
      });
    }

    await tx.visit.update({ where: { id: visit.id }, data: { status: "CHECKED_OUT" } });

    return { customer, arrivalWindow, booking };
  });

  // ARRIVAL WINDOW CONFLICT — retry the whole transaction once.
  //
  // The find-or-create above races: two concurrent checkouts for the same slot
  // can both miss and both insert. Contract adds
  // @@unique([date, startTime, endTime, serviceAreaId]) to close it — but a
  // constraint on its own does not fix a race. It converts "both silently
  // succeed, capacity split across two rows" into "one succeeds, one throws",
  // and something has to turn the throw into correct behavior. That is this.
  //
  // Retrying the WHOLE transaction rather than catching inside it is not a
  // stylistic choice: in Postgres an error aborts the enclosing transaction,
  // so a catch-and-re-read within the same tx would run against a dead
  // transaction. On the retry the loser's find-or-create finds the window the
  // winner just committed, and proceeds normally.
  //
  // WORKS AGAINST BOTH SCHEMA SHAPES. Before contract there is no constraint,
  // so P2002 never fires and this is dead code. After contract it is the thing
  // that keeps checkout correct. That is what lets this deploy ahead of the
  // schema change rather than with it.
  const isUniqueViolation = (e: unknown) =>
    typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

  // ── DEPOSIT PATH ─────────────────────────────────────────────────────
  //
  // Authorize -> transaction -> capture. Reached only when a service on the
  // visit carries a deposit; every other checkout falls through to the path
  // below, unchanged.
  if (depositDueCents > 0) {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { id: site.contractorId },
      select: {
        stripeAccountId: true, stripeMerchantConfigured: true,
          stripeCardPaymentsStatus: true, stripeOnboardingBlocked: true,
          stripeReadinessCheckedAt: true,
      },
    });
    const gateway = stripeGateway();
    if (!gateway) {
      return NextResponse.json(
        { error: "Online payment isn't available right now.", detail: "Stripe is not configured." },
        { status: 503 }
      );
    }

    // The SAME metadata on the way out and on the way back. On resume it is
    // compared against what Stripe actually holds, so an intent id belonging
    // to another checkout is refused even on the right connected account.
    const correlation = {
      // Correlation only. Tenancy comes from the connected account on the
      // way back in, never from this.
      price2book_visit_id: visit.id,
      price2book_contractor_id: site.contractorId,
    };

    const depositRequest = {
      stripeAccountId: contractor.stripeAccountId ?? "",
      // Recomputed on BOTH paths from the services on this visit, so the
      // browser cannot influence the amount across the authentication round
      // trip. The server stays the sole author of what is charged.
      amountCents: depositDueCents,
      // Stable for this visit, so a double-submitted checkout cannot create
      // a second hold or a second capture.
      idempotencyKey: `visit_${visit.id}`,
      metadata: correlation,
      // The homeowner's card, tokenized in the browser by Stripe.
      paymentMethod: typeof paymentMethodId === "string" ? paymentMethodId : undefined,
    };

    const depositDeps = {
      gateway,
      connect: contractor,
      writeLocal: async (intentId: string) => (await writeCheckout(intentId)).booking.id,
      recordCapture: async (bookingId: string, intentId: string) => {
        await recordCapture(prisma, bookingId, intentId, depositDueCents);
      },
      recordCaptureFailure: async (bookingId: string, intentId: string, error: string) => {
        await recordCaptureFailure(prisma, bookingId, intentId, error);
      },
    };

    // Two ways in, one ordering. `resume` picks up an intent the customer has
    // just authenticated — it does NOT authorize again, so the same hold that
    // was created before the challenge is the one that gets captured.
    const attempt =
      typeof resumePaymentIntentId === "string" && resumePaymentIntentId
        ? await resumeDepositCheckout(
            { ...depositRequest, paymentIntentId: resumePaymentIntentId, expectedMetadata: correlation },
            depositDeps
          )
        : await runDepositCheckout(depositRequest, depositDeps);

    // The card is real; the bank wants the cardholder to prove it. No booking
    // exists yet and nothing has been captured. The client secret finishes
    // THIS intent — it cannot create one or change its amount.
    if (attempt.outcome === "requires_action") {
      return NextResponse.json({
        requiresAction: true,
        clientSecret: attempt.clientSecret,
        paymentIntentId: attempt.paymentIntentId,
      });
    }

    if (attempt.outcome === "not_ready") {
      return NextResponse.json(
        { error: "This service can't be booked online yet.", detail: attempt.reason },
        { status: 409 }
      );
    }
    if (attempt.outcome === "authorize_failed" || attempt.outcome === "write_failed") {
      return NextResponse.json(
        { error: "We couldn't complete your booking.", detail: attempt.error },
        { status: 502 }
      );
    }

    // captured OR capture_failed: the booking exists either way and the
    // customer is told so. A failed capture is an operator's problem to chase,
    // not a reason to make the customer's booking vanish.
    // GUARDED. A read on a derived model can be scoped — the guard merges the
    // owner filter onto the where clause — so unlike the writes above there is
    // no reason to reach for the unguarded client here.
    const made = await db.booking.findUniqueOrThrow({
      where: { id: attempt.bookingId },
      select: { id: true, paymentState: true },
    });
    return NextResponse.json({
      bookingId: made.id,
      paymentState: made.paymentState,
      depositDueCents,
      // The pre-work visit is not schedulable until the deposit captures.
      preWorkReady: made.paymentState === "DEPOSIT_CAPTURED",
    });
  }

  let customer, arrivalWindow, booking;
  try {
    ({ customer, arrivalWindow, booking } = await writeCheckout());
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;
    console.warn(
      `[checkout] arrival-window conflict for ${date} ${windowStart}-${windowEnd}; ` +
        `another checkout created the slot first — retrying once.`
    );
    ({ customer, arrivalWindow, booking } = await writeCheckout());
  }

  // Jobber push and confirmation email now run CONCURRENTLY, not one
  // after the other — previously email sat behind the entire Jobber push
  // chain (including its retry), and a slow or retried Jobber push could
  // eat enough of the request's time budget that the email code never
  // even got a chance to run before the platform's execution limit hit.
  // Running them side by side means a slow Jobber call can no longer
  // silently crowd out the email. Both are still individually
  // non-blocking — either one failing never prevents the customer from
  // getting their booking confirmed on the site itself.
  const jobberPush = (async () => {
    try {
      let result;
      try {
        result = await pushBookingToJobber(site.contractorId, db, booking.id, assignedCrewId);
      } catch (firstErr) {
        console.warn(`First Jobber push attempt failed for booking ${booking.id}, retrying once:`, firstErr);
        await new Promise((r) => setTimeout(r, 750));
        result = await pushBookingToJobber(site.contractorId, db, booking.id, assignedCrewId);
      }
      // Recovery semantics unchanged and deliberately preserved: the booking
      // is already committed locally, and jobberJobId IS NULL continues to
      // mean "committed here, not successfully pushed yet" — which is what
      // the admin "Send to Jobber" action looks for. No new booking state.
      // Guarded. Booking derives through Visit, so this update is scoped by
      // relation path and still runs inside the site's tenant context — the
      // push is awaited by Promise.allSettled below, inside withSite.
      await db.booking.update({ where: { id: booking.id }, data: { jobberJobId: result.jobberJobId } });
    } catch (err) {
      console.error(`Automatic Jobber push failed for booking ${booking.id} after retry — needs manual "Send to Jobber":`, err);
    }
  })();

  // The confirmation goes out under the CONTRACTOR's name and number, not the
  // platform's — the customer hired them, not us.
  const sender = await loadIdentity(db, site.contractorId);
  const confirmationEmail = sendBookingConfirmationEmail({
    identity: sender.identity,
    fromAddress: sender.fromAddress,
    address,
    zipCode,
    totalCents,
    customer,
    arrivalWindow,
    lineItems: visit.lineItems.map((li) => ({ isPrimary: li.isPrimary, serviceName: li.service.name })),
  }).catch((err) => {
    console.error(`Confirmation email failed for booking ${booking.id}:`, err);
  });

  await Promise.allSettled([jobberPush, confirmationEmail]);

  return NextResponse.json({ bookingId: booking.id });
  });
}