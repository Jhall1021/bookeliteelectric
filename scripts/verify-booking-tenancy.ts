/**
 * Booking-flow tenancy integrity (pass three).
 *
 * Deriving ownership correctly does not make secondary references safe.
 * Booking's owner comes from its Visit, but it also points at a Customer and
 * an ArrivalWindow; Quote's owner comes from its Service, but it also points
 * at a Customer and possibly a Visit. Each of those is a separate chance to
 * cross a tenant boundary while every individual model looks correctly owned.
 *
 * Same principle as AnswerOption.referencedServiceId under ADR-007a.
 *
 * Checks, in two groups:
 *   OWNERSHIP  — every ownership root actually carries an owner
 *   AGREEMENT  — every secondary tenant reference resolves to the same owner
 *
 * Fails closed: any violation, or any query that cannot run, exits non-zero.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Check = { group: string; label: string; sql: string };

const CHECKS: Check[] = [
  // ---- OWNERSHIP ---------------------------------------------------------
  { group: "OWNERSHIP", label: "Visit without an owner",
    sql: `SELECT id FROM visits WHERE "contractorId" IS NULL` },
  { group: "OWNERSHIP", label: "Customer without an owner",
    sql: `SELECT id FROM customers WHERE "contractorId" IS NULL` },
  { group: "OWNERSHIP", label: "Photo without an owner",
    sql: `SELECT id FROM photos WHERE "contractorId" IS NULL` },
  { group: "OWNERSHIP", label: "JobberCrewMember without an owner",
    sql: `SELECT id FROM jobber_crew_members WHERE "contractorId" IS NULL` },
  { group: "OWNERSHIP", label: "ServiceArea without an owner",
    sql: `SELECT id FROM service_areas WHERE "contractorId" IS NULL` },

  // ---- AGREEMENT: derived models vs their owning parent ------------------
  { group: "AGREEMENT", label: "LineItem.service belongs to another contractor than its Visit",
    sql: `SELECT li.id FROM line_items li
          JOIN visits v ON v.id = li."visitId"
          JOIN services s ON s.id = li."serviceId"
          WHERE s."contractorId" IS DISTINCT FROM v."contractorId"` },
  { group: "AGREEMENT", label: "Visit whose line items span more than one contractor",
    sql: `SELECT li."visitId" AS id FROM line_items li
          JOIN services s ON s.id = li."serviceId"
          GROUP BY li."visitId" HAVING count(DISTINCT s."contractorId") > 1` },

  { group: "AGREEMENT", label: "Booking.customer belongs to another contractor than its Visit",
    sql: `SELECT b.id FROM bookings b
          JOIN visits v ON v.id = b."visitId"
          JOIN customers c ON c.id = b."customerId"
          WHERE c."contractorId" IS DISTINCT FROM v."contractorId"` },
  { group: "AGREEMENT", label: "Booking.arrivalWindow resolves to another contractor's ServiceArea",
    sql: `SELECT b.id FROM bookings b
          JOIN visits v ON v.id = b."visitId"
          JOIN arrival_windows aw ON aw.id = b."arrivalWindowId"
          JOIN service_areas sa ON sa.id = aw."serviceAreaId"
          WHERE sa."contractorId" IS DISTINCT FROM v."contractorId"` },

  { group: "AGREEMENT", label: "Quote.customer belongs to another contractor than its Service",
    sql: `SELECT q.id FROM quotes q
          JOIN services s ON s.id = q."serviceId"
          JOIN customers c ON c.id = q."customerId"
          WHERE c."contractorId" IS DISTINCT FROM s."contractorId"` },
  { group: "AGREEMENT", label: "Quote.visit belongs to another contractor than its Service",
    sql: `SELECT q.id FROM quotes q
          JOIN services s ON s.id = q."serviceId"
          JOIN visits v ON v.id = q."visitId"
          WHERE q."visitId" IS NOT NULL
            AND v."contractorId" IS DISTINCT FROM s."contractorId"` },
  { group: "AGREEMENT", label: "Quote.lineItem belongs to another contractor than its Service",
    sql: `SELECT q.id FROM quotes q
          JOIN services s ON s.id = q."serviceId"
          JOIN line_items li ON li.id = q."lineItemId"
          JOIN visits v ON v.id = li."visitId"
          WHERE q."lineItemId" IS NOT NULL
            AND v."contractorId" IS DISTINCT FROM s."contractorId"` },

  // ---- AGREEMENT: Photo, whose owner is stamped rather than derived ------
  { group: "AGREEMENT", label: "Photo.quote belongs to another contractor than the Photo",
    sql: `SELECT p.id FROM photos p
          JOIN quotes q ON q.id = p."quoteId"
          JOIN services s ON s.id = q."serviceId"
          WHERE p."quoteId" IS NOT NULL
            AND s."contractorId" IS DISTINCT FROM p."contractorId"` },
  { group: "AGREEMENT", label: "Photo.lineItem belongs to another contractor than the Photo",
    sql: `SELECT p.id FROM photos p
          JOIN line_items li ON li.id = p."lineItemId"
          JOIN visits v ON v.id = li."visitId"
          WHERE p."lineItemId" IS NOT NULL
            AND v."contractorId" IS DISTINCT FROM p."contractorId"` },
  { group: "AGREEMENT", label: "Photo attached to no parent at all",
    sql: `SELECT id FROM photos
          WHERE "quoteId" IS NULL AND "lineItemId" IS NULL AND "bookingId" IS NULL` },

  { group: "AGREEMENT", label: "ArrivalWindow.serviceArea missing",
    sql: `SELECT aw.id FROM arrival_windows aw
          LEFT JOIN service_areas sa ON sa.id = aw."serviceAreaId"
          WHERE sa.id IS NULL` },

  // ---- The invariant behind the Visit lookup key -------------------------
  { group: "AGREEMENT", label: "More than one OPEN Visit for the same contractor + session",
    sql: `SELECT "sessionId" AS id FROM visits
          WHERE status = 'OPEN' AND "sessionId" IS NOT NULL
          GROUP BY "contractorId", "sessionId" HAVING count(*) > 1` },
];

(async () => {
  console.log("BOOKING-FLOW TENANCY INTEGRITY — pass three\n");
  let failed = 0;
  let group = "";
  for (const c of CHECKS) {
    if (c.group !== group) {
      group = c.group;
      console.log(`  ${group}`);
    }
    let rows: { id: string }[];
    try {
      rows = (await prisma.$queryRawUnsafe(c.sql)) as { id: string }[];
    } catch (e) {
      // A check that cannot run is a failure, not a pass.
      console.log(`    ERROR ${c.label}`);
      console.log(`          ${(e as Error).message.split("\n")[0]}`);
      failed++;
      continue;
    }
    const bad = rows.length;
    console.log(`    ${bad === 0 ? "ok  " : "FAIL"} ${c.label.padEnd(62)} ${bad}`);
    if (bad) {
      failed++;
      for (const r of rows.slice(0, 5)) console.log(`           ${r.id}`);
      if (bad > 5) console.log(`           …and ${bad - 5} more`);
    }
  }
  console.log("\n" + "─".repeat(78));
  if (failed) {
    console.log(`  ${failed} check(s) failed. Booking-flow tenancy is not intact.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log(`  ${CHECKS.length} checks passed. Every owner present, every secondary reference agrees.`);
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
