/**
 * Pass-three backfill: stamp the owner onto the four ownership roots.
 *
 *   Visit, Customer, Photo, JobberCrewMember
 *
 * Two sources of ownership, in strict order of preference:
 *
 *   1. DERIVED — read the owner off a trustworthy existing relation.
 *      This is the only source the script trusts on its own.
 *
 *   2. PROVENANCE — for rows with no relation to derive from, fall back to
 *      the single contractor that historically owned all of this data.
 *
 * Provenance is migration knowledge, never application behavior. Runtime
 * code must never assume "the only contractor is Elite." So this script
 * refuses to use provenance unless it can PROVE the assumption for this
 * dataset, right now, against two conditions:
 *
 *   a. exactly one Contractor row exists, and
 *   b. every row it *could* derive derived to that same contractor.
 *
 * If either fails, the underivable rows are left null and the script exits
 * non-zero rather than guessing. Contract will not pass until they are
 * resolved deliberately.
 *
 * Idempotent: only ever writes where contractorId IS NULL. Safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type Plan = { model: string; derived: Map<string, string>; underivable: string[] };

function only<T>(xs: T[]): T | null {
  const s = [...new Set(xs)];
  return s.length === 1 ? s[0] : null;
}

async function planVisit(): Promise<Plan> {
  const rows = await prisma.visit.findMany({
    where: { id: { in: [] } }, // was contractorId: null — NOT NULL as of contract
    select: { id: true, lineItems: { select: { service: { select: { contractorId: true } } } } },
  });
  const derived = new Map<string, string>();
  const underivable: string[] = [];
  for (const v of rows) {
    const c = only(v.lineItems.map((l) => l.service.contractorId));
    if (c) derived.set(v.id, c);
    else underivable.push(v.id); // no line items yet, or (never seen) mixed
  }
  return { model: "Visit", derived, underivable };
}

async function planCustomer(): Promise<Plan> {
  const rows = await prisma.customer.findMany({
    where: { id: { in: [] } }, // was contractorId: null — NOT NULL as of contract
    select: {
      id: true,
      quotes: { select: { service: { select: { contractorId: true } } } },
      bookings: {
        select: { visit: { select: { lineItems: { select: { service: { select: { contractorId: true } } } } } } },
      },
    },
  });
  const derived = new Map<string, string>();
  const underivable: string[] = [];
  for (const c of rows) {
    const seen = [
      ...c.quotes.map((q) => q.service.contractorId),
      ...c.bookings.flatMap((b) => b.visit.lineItems.map((l) => l.service.contractorId)),
    ];
    const one = only(seen);
    if (one) derived.set(c.id, one);
    else underivable.push(c.id);
  }
  return { model: "Customer", derived, underivable };
}

async function planPhoto(): Promise<Plan> {
  const rows = await prisma.photo.findMany({
    where: { id: { in: [] } }, // was contractorId: null — NOT NULL as of contract
    select: {
      id: true,
      quote: { select: { service: { select: { contractorId: true } } } },
      lineItem: { select: { service: { select: { contractorId: true } } } },
    },
  });
  const derived = new Map<string, string>();
  const underivable: string[] = [];
  for (const p of rows) {
    // Either parent is authoritative; where both exist they must agree.
    const seen = [p.quote?.service.contractorId, p.lineItem?.service.contractorId].filter(Boolean) as string[];
    const one = only(seen);
    if (one) derived.set(p.id, one);
    else underivable.push(p.id);
  }
  return { model: "Photo", derived, underivable };
}

async function planCrew(): Promise<Plan> {
  // Crew rows carry no relation at all. The only historical evidence of who
  // synced them is the JobberConnection set. One connection => unambiguous.
  const rows = await prisma.jobberCrewMember.findMany({ where: { id: { in: [] } }, select: { id: true } }); // was contractorId: null
  const conns = await prisma.jobberConnection.findMany({ select: { contractorId: true } });
  const owners = conns.map((c) => c.contractorId).filter(Boolean) as string[];
  const one = only(owners);
  const derived = new Map<string, string>();
  if (one) for (const r of rows) derived.set(r.id, one);
  return { model: "JobberCrewMember", derived, underivable: one ? [] : rows.map((r) => r.id) };
}

(async () => {
  console.log(`PASS-THREE OWNERSHIP BACKFILL   ${APPLY ? "APPLY" : "DRY RUN (pass --apply to write)"}\n`);
  console.log(`  COMPLETE. All four columns are NOT NULL as of pass three's`);
  console.log(`  contract, so there are no unowned rows left for this to find.`);
  console.log(`  Kept as the record of how 87 rows got their owner.\n`);

  const plans = [await planVisit(), await planCustomer(), await planPhoto(), await planCrew()];

  // ---- prove (or refuse) the provenance fallback --------------------------
  const contractors = await prisma.contractor.findMany({ select: { id: true, name: true } });
  const allDerived = [...new Set(plans.flatMap((p) => [...p.derived.values()]))];
  const soleContractor = contractors.length === 1 ? contractors[0] : null;
  const provenanceOk =
    soleContractor !== null && (allDerived.length === 0 || (allDerived.length === 1 && allDerived[0] === soleContractor.id));

  console.log("PROVENANCE TEST — may migration fall back to a historical owner?");
  console.log(`  contractor rows                        ${contractors.length}${soleContractor ? `  (${soleContractor.name})` : ""}`);
  console.log(`  distinct owners across derived rows    ${allDerived.length}  ${allDerived.join(", ")}`);
  console.log(`  fallback permitted                     ${provenanceOk ? "YES — single historical owner, proven" : "NO — refusing to guess"}\n`);

  let wrote = 0;
  let stranded = 0;

  for (const plan of plans) {
    const total = plan.derived.size + plan.underivable.length;
    console.log(`${plan.model}`);
    console.log(`  needing an owner                       ${total}`);
    console.log(`  derived from relations                 ${plan.derived.size}`);
    console.log(`  underivable                            ${plan.underivable.length}${plan.underivable.length ? `  ${plan.underivable.map((i) => i.slice(0, 8)).join(" ")}` : ""}`);

    const writes = new Map(plan.derived);
    if (plan.underivable.length) {
      if (provenanceOk && soleContractor) {
        for (const id of plan.underivable) writes.set(id, soleContractor.id);
        console.log(`  -> underivable assigned by provenance   ${soleContractor.name}`);
      } else {
        stranded += plan.underivable.length;
        console.log(`  -> LEFT NULL — provenance not provable`);
      }
    }

    if (APPLY && writes.size) {
      const byOwner = new Map<string, string[]>();
      for (const [id, c] of writes) byOwner.set(c, [...(byOwner.get(c) ?? []), id]);
      for (const [contractorId, ids] of byOwner) {
        // contractorId: null in the filter keeps this idempotent — a re-run
        // never overwrites an owner that is already set.
        const r = await (prisma as any)[plan.model[0].toLowerCase() + plan.model.slice(1)].updateMany({
          where: { id: { in: ids }, contractorId: null },
          data: { contractorId },
        });
        wrote += r.count;
        console.log(`  WROTE ${String(r.count).padStart(4)} -> ${contractorId}`);
      }
    }
    console.log();
  }

  console.log("─".repeat(70));
  console.log(APPLY ? `  ${wrote} row(s) stamped.` : "  Dry run — nothing written.");
  if (stranded) {
    console.log(`  ${stranded} row(s) left without an owner. Resolve deliberately before contract.`);
    await prisma.$disconnect();
    process.exit(1);
  }
  await prisma.$disconnect();
})().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
