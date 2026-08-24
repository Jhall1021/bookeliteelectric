/**
 * Primary-service selection — verification.
 *
 *   npx tsx scripts/verify-visit-primary.ts
 *
 * No database, no network.
 *
 * The whole point of lib/visitPrimary.ts is that a customer's total cannot
 * depend on the order they added things. That's a claim about every possible
 * ordering, so it's checked against every possible ordering rather than
 * argued for in a comment.
 *
 * Real published figures from the catalog, so a change to the pricing rules
 * that breaks this shows up here rather than on someone's invoice.
 */

import {
  selectPrimary,
  reconcilePrimary,
  primaryGapCents,
  type PrimaryCandidate,
} from "../lib/visitPrimary";

let fail = 0;
const ok = (cond: boolean, label: string, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `\n      ${detail}`}`);
};

type S = PrimaryCandidate & { name: string };

// Published figures as they stand today.
const CATALOG: S[] = [
  { slug: "new-ethernet-line",    name: "Ethernet line",       basePrice: 41500, whileWeThereBasePrice: 35500 },
  { slug: "new-coax-line",        name: "Coax line",           basePrice: 42000, whileWeThereBasePrice: 35500 },
  { slug: "new-wall-sconce",      name: "New wall sconce",     basePrice: 34000, whileWeThereBasePrice: 27500 },
  { slug: "replace-wall-sconce",  name: "Replace wall sconce", basePrice: 25500, whileWeThereBasePrice: 13000 },
];

const $ = (c: number) => "$" + (c / 100).toFixed(2);

/** What a visit costs with a given service as primary. */
function totalFor(set: S[], primary: S): number {
  return set.reduce(
    (t, s) => t + (s === primary ? s.basePrice! : s.whileWeThereBasePrice!),
    0
  );
}

function permutations<T>(arr: T[]): T[][] {
  if (arr.length <= 1) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i++) {
    const rest = [...arr.slice(0, i), ...arr.slice(i + 1)];
    for (const p of permutations(rest)) out.push([arr[i], ...p]);
  }
  return out;
}

function subsets<T>(arr: T[]): T[][] {
  return arr.reduce<T[][]>((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);
}

console.log("\nGAPS — standalone minus add-on\n");
for (const s of CATALOG) {
  console.log(
    `  ${s.name.padEnd(22)} ${$(s.basePrice!).padStart(8)} / ${$(s.whileWeThereBasePrice!).padStart(8)}` +
      `   gap ${$(primaryGapCents(s)!)}`
  );
}

// ---------------------------------------------------------------------------
console.log("\nORDER INDEPENDENCE — every permutation of every subset\n");

let permCount = 0;
let allStable = true;
let allOptimal = true;
let worstSpread = 0;

for (const set of subsets(CATALOG).filter((s) => s.length >= 2)) {
  const perms = permutations(set);
  permCount += perms.length;

  // Same primary whatever order the set arrives in.
  const picks = perms.map((p) => {
    const r = selectPrimary(p);
    return r.ok ? r.primary.slug : "CONFLICT";
  });
  if (new Set(picks).size !== 1) {
    allStable = false;
    console.log(`  ✗ ${set.map((s) => s.slug).join(" + ")} -> ${[...new Set(picks)].join(" / ")}`);
  }

  // And it's the cheapest arrangement available.
  const chosen = selectPrimary(set);
  if (chosen.ok) {
    const totals = set.map((s) => totalFor(set, s));
    const cheapest = Math.min(...totals);
    const spread = Math.max(...totals) - cheapest;
    worstSpread = Math.max(worstSpread, spread);
    if (totalFor(set, chosen.primary) !== cheapest) {
      allOptimal = false;
      console.log(
        `  ✗ ${set.map((s) => s.slug).join(" + ")} picked ${$(totalFor(set, chosen.primary))}, ` +
          `cheapest was ${$(cheapest)}`
      );
    }
  }
}

ok(allStable, `same primary across all ${permCount} permutations`);
ok(allOptimal, "always the cheapest arrangement for the customer");
console.log(
  `      worst spread between best and worst ordering: ${$(worstSpread)} — ` +
    `what order used to be worth`
);

// ---------------------------------------------------------------------------
console.log("\nCONSTRAINTS\n");

const noAddOnPrice: S = {
  slug: "panel-upgrade", name: "Panel upgrade", basePrice: 500000, whileWeThereBasePrice: null,
};
const alsoNoAddOn: S = {
  slug: "service-upgrade", name: "Service upgrade", basePrice: 450000, whileWeThereBasePrice: null,
};
const quoteOnly: S = {
  slug: "landscape-lighting", name: "Landscape lighting", basePrice: null, whileWeThereBasePrice: null,
};
const quoteOnlyAddOn: S = {
  slug: "odd-job", name: "Odd job", basePrice: null, whileWeThereBasePrice: 9900,
};

{
  // A service with no add-on price can only ever be the primary, even when
  // its gap is enormous — feasibility beats cost.
  const r = selectPrimary([CATALOG[0], noAddOnPrice]);
  ok(r.ok && r.primary.slug === "panel-upgrade", "a service with no add-on price is forced primary");
}
{
  const r = selectPrimary([noAddOnPrice, alsoNoAddOn]);
  ok(!r.ok, "two undemotable services is a conflict, not a guess",
     r.ok ? "it picked one anyway" : r.conflict);
}
{
  const r = selectPrimary([quoteOnly]);
  ok(!r.ok, "a service with neither price is a conflict");
}
{
  // Quote-only can ride along as an add-on; it just can't carry the visit.
  const r = selectPrimary([CATALOG[0], quoteOnlyAddOn]);
  ok(r.ok && r.primary.slug === "new-ethernet-line", "quote-only can be an add-on but not the primary");
}
{
  const r = selectPrimary([]);
  ok(!r.ok, "an empty visit is a conflict");
}
{
  const single = selectPrimary([CATALOG[3]]);
  ok(single.ok && single.primary.slug === "replace-wall-sconce" && single.addOns.length === 0,
     "a single service is the primary");
}
{
  // Equal gaps: deterministic by slug, and the same price either way.
  const a: S = { slug: "bbb", name: "B", basePrice: 30000, whileWeThereBasePrice: 24000 };
  const b: S = { slug: "aaa", name: "A", basePrice: 50000, whileWeThereBasePrice: 44000 };
  const r1 = selectPrimary([a, b]);
  const r2 = selectPrimary([b, a]);
  ok(r1.ok && r2.ok && r1.primary.slug === r2.primary.slug && r1.primary.slug === "aaa",
     "equal gaps break on slug, not arrival order");
  ok(totalFor([a, b], a) === totalFor([a, b], b), "equal gaps cost the customer the same either way");
}

// ---------------------------------------------------------------------------
console.log("\nRECONCILIATION — what an existing visit has to change\n");

{
  const items = [
    { ...CATALOG[3], isPrimary: true },   // sconce added first, wrongly primary
    { ...CATALOG[0], isPrimary: false },  // ethernet added second
  ];
  const r = reconcilePrimary(items);
  ok(r.ok && r.changes.length === 2, "a wrongly-ordered visit needs both flags flipped",
     r.ok ? `got ${r.changes.length}` : r.conflict);
  if (r.ok) {
    const promote = r.changes.find((c) => c.shouldBePrimary);
    ok(promote?.candidate.slug === "new-ethernet-line", "the ethernet is promoted");
  }
}
{
  const items = [
    { ...CATALOG[0], isPrimary: true },
    { ...CATALOG[3], isPrimary: false },
  ];
  const r = reconcilePrimary(items);
  ok(r.ok && r.changes.length === 0, "an already-correct visit changes nothing");
}
{
  // Idempotence: applying the changes and reconciling again is a no-op.
  const items = [
    { ...CATALOG[3], isPrimary: true },
    { ...CATALOG[0], isPrimary: false },
    { ...CATALOG[1], isPrimary: false },
  ];
  const first = reconcilePrimary(items);
  if (first.ok) {
    for (const c of first.changes) c.candidate.isPrimary = c.shouldBePrimary;
    const second = reconcilePrimary(items);
    ok(second.ok && second.changes.length === 0, "reconciling twice is a no-op");
    ok(items.filter((i) => i.isPrimary).length === 1, "exactly one primary afterwards");
  } else {
    ok(false, "reconciling twice is a no-op", first.conflict);
  }
}

console.log(fail === 0 ? "\nAll checks passed.\n" : `\n${fail} check(s) FAILED.\n`);
process.exit(fail === 0 ? 0 : 1);
