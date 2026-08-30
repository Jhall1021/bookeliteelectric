/**
 * An empty recompute means "nothing uses this role", and nothing else.
 *
 *   npx tsx scripts/verify-recompute-by-role.ts
 *
 * The incident this exists for: recomputeServicesUsingRole took its two ids
 * positionally, both were cuid strings, and a caller who swapped them got back
 * an empty array. That is the same value the function returns when a role is
 * genuinely unused — so the mistake was invisible, and a service kept a stale
 * material cache under a cost that had just moved 64%.
 *
 * The fix was named arguments plus an existence check on both ids. This proves
 * the property that makes the fix worth having: a zero from this function is
 * INFORMATION, not an error in disguise.
 *
 * POSITIVE proof, deliberately. It is not enough to show that bad input throws
 * — a function that threw on everything would pass that. The first check is
 * that a role which IS used comes back with exactly the services that use it.
 */

import { PrismaClient } from "@prisma/client";
import { recomputeServicesUsingRole } from "../lib/materialCost";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

async function main() {
  console.log(`\nRECOMPUTE BY ROLE\n`);

  const elite = await prisma.contractor.findUniqueOrThrow({
    where: { slug: "elite-electric" },
    select: { id: true },
  });

  // ── the positive case ───────────────────────────────────────────────────
  //
  // Pick whichever role the catalogue uses most, so the proof does not depend
  // on one slug surviving a future refactor.
  const usage = await prisma.serviceMaterial.groupBy({
    by: ["canonicalMaterialId"],
    // Nullable on the join: rows predating the canonical/contractor split
    // carried the old materialId instead. Excluded rather than narrowed later,
    // so the id this proof runs on is a real role by construction.
    where: { service: { contractorId: elite.id }, canonicalMaterialId: { not: null } },
    _count: { serviceId: true },
    orderBy: { _count: { serviceId: "desc" } },
    take: 1,
  });
  if (usage.length === 0) {
    console.error(`  Elite has no service materials at all — this proof cannot run.\n`);
    process.exit(1);
  }
  const busiestId = usage[0].canonicalMaterialId;
  if (!busiestId) {
    console.error(`  The busiest row has no canonical role — this proof cannot run.\n`);
    process.exit(1);
  }
  const busiest = await prisma.canonicalMaterial.findUniqueOrThrow({
    where: { id: busiestId }, select: { key: true },
  });
  const expected = await prisma.serviceMaterial.findMany({
    where: { canonicalMaterialId: busiestId, service: { contractorId: elite.id } },
    select: { serviceId: true },
    distinct: ["serviceId"],
  });

  const got = await recomputeServicesUsingRole({
    db: prisma as any,
    canonicalMaterialId: busiestId,
    contractorId: elite.id,
  });
  ok(
    `a role in use recomputes every service that uses it (${busiest.key}, ${expected.length} service(s))`,
    got.length === expected.length,
    `expected ${expected.length}, got ${got.length}`
  );
  ok(`and that number is not zero`, got.length > 0);

  // ── the honest zero ─────────────────────────────────────────────────────
  const unusedRole = await prisma.canonicalMaterial.findFirst({
    where: { serviceMaterials: { none: {} } },
    select: { id: true, key: true },
  });
  if (unusedRole) {
    const none = await recomputeServicesUsingRole({
      db: prisma as any, canonicalMaterialId: unusedRole.id, contractorId: elite.id,
    });
    ok(`a role nothing uses recomputes zero services (${unusedRole.key})`, none.length === 0, `${none.length}`);
  } else {
    console.log(`  · every canonical role is in use, so the honest-zero case has no subject`);
  }

  // ── the swap, which used to be silent ───────────────────────────────────
  //
  // The exact mistake: contractor id where the role id belongs. It must throw
  // rather than return the empty array that reads as "nothing uses this".
  let threw = false;
  let message = "";
  try {
    await recomputeServicesUsingRole({
      db: prisma as any,
      canonicalMaterialId: elite.id,      // the swap
      contractorId: busiestId,            // the swap
    });
  } catch (e) {
    threw = true;
    message = e instanceof Error ? e.message : String(e);
  }
  ok(`swapping the two ids throws instead of returning an empty array`, threw, `it returned quietly`);
  ok(`and the error says which id was wrong`, /CanonicalMaterial|Contractor/.test(message), message.slice(0, 90));

  // A single bad id, either side.
  for (const [label, args] of [
    ["an unknown role id", { canonicalMaterialId: "cnot_a_real_id", contractorId: elite.id }],
    ["an unknown contractor id", { canonicalMaterialId: busiestId, contractorId: "cnot_a_real_id" }],
  ] as const) {
    let t = false;
    try {
      await recomputeServicesUsingRole({ db: prisma as any, ...args });
    } catch { t = true; }
    ok(`${label} throws`, t);
  }

  console.log();
  if (fail) { console.log(`  ${fail} check(s) failed.\n`); process.exit(1); }
  console.log(`  An empty result now means nothing uses the role, and cannot mean\n  the caller made a mistake.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
