/**
 * Material cost — verification.
 *
 *   npx tsx scripts/verify-material-cost.ts
 *
 * Exercises the pure arithmetic in lib/materialCost.ts against real catalog
 * figures. No database, no network — safe to run anywhere, including in CI
 * before a deploy.
 *
 * Reading the conversion and agreeing it looks right is how a rounding rule
 * ships wrong. These cases are the ones that actually bite: sub-cent unit
 * costs, package round-tripping, and the parity check that the extracted
 * summation still produces exactly what the old inline loop produced.
 */

import { readFileSync } from "node:fs";
import {
  deriveUnitCost,
  impliedPackagePriceCents,
  assembleMaterialCostCents,
  MaterialCostError,
} from "../lib/materialCost";
import { calculateMaterialSellCents } from "../lib/pricing";

let failures = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures++;
  console.log(
    `  ${ok ? "✓" : "✗"} ${label}` +
      (ok ? "" : `\n      expected ${JSON.stringify(expected)}\n      got      ${JSON.stringify(actual)}`)
  );
}

function throws(label: string, fn: () => unknown) {
  let threw = false;
  try {
    fn();
  } catch (e) {
    threw = e instanceof MaterialCostError;
  }
  if (!threw) failures++;
  console.log(`  ${threw ? "✓" : "✗"} ${label}`);
}

console.log("\nPACKAGE -> UNIT CONVERSION\n");

// The catalog's existing wire costs divide exactly. If the conversion can't
// reproduce these, it disagrees with prices already published.
check(
  "14/2 NM-B: $125.00 per 250 ft -> 50 c/ft",
  deriveUnitCost({ packagePriceCents: 12500, packageQuantity: 250 }),
  { unitCostMilliCents: 50000, unitCostCents: 50 }
);
check(
  "12/2 NM-B: $180.00 per 250 ft -> 72 c/ft",
  deriveUnitCost({ packagePriceCents: 18000, packageQuantity: 250 }),
  { unitCostMilliCents: 72000, unitCostCents: 72 }
);

// The docx worked example.
check(
  "1/2 EMT: $8.90 per 10 ft stick -> 89 c/ft",
  deriveUnitCost({ packagePriceCents: 890, packageQuantity: 10 }),
  { unitCostMilliCents: 89000, unitCostCents: 89 }
);

// The case the integer column can't hold.
check(
  "Cat6: $189.00 per 1000 ft -> 18.9 c/ft precise, 19 c/ft cached",
  deriveUnitCost({ packagePriceCents: 18900, packageQuantity: 1000 }),
  { unitCostMilliCents: 18900, unitCostCents: 19 }
);

// A single item is a package of one — no special case needed.
check(
  "WR GFCI: $25.00 each -> 2500 c",
  deriveUnitCost({ packagePriceCents: 2500, packageQuantity: 1 }),
  { unitCostMilliCents: 2500000, unitCostCents: 2500 }
);

console.log("\nFAIL CLOSED\n");
throws("zero package quantity is rejected, not treated as free", () =>
  deriveUnitCost({ packagePriceCents: 18900, packageQuantity: 0 })
);
throws("negative quantity is rejected", () =>
  deriveUnitCost({ packagePriceCents: 100, packageQuantity: -5 })
);
throws("negative price is rejected", () =>
  deriveUnitCost({ packagePriceCents: -100, packageQuantity: 10 })
);
throws("NaN quantity is rejected", () =>
  deriveUnitCost({ packagePriceCents: 100, packageQuantity: NaN })
);

console.log("\nROUND TRIP — what the cached integer implies the package cost\n");
for (const [label, price, qty] of [
  ["14/2, 250 ft", 12500, 250],
  ["12/2, 250 ft", 18000, 250],
  ["Cat6, 1000 ft", 18900, 1000],
  ["EMT, 10 ft", 890, 10],
] as [string, number, number][]) {
  const { unitCostCents } = deriveUnitCost({ packagePriceCents: price, packageQuantity: qty });
  const implied = impliedPackagePriceCents(unitCostCents, qty);
  const drift = implied - price;
  console.log(
    `  ${label.padEnd(16)} invoice $${(price / 100).toFixed(2).padStart(8)}` +
      `   implied $${(implied / 100).toFixed(2).padStart(8)}` +
      `   drift ${drift === 0 ? "none" : "$" + (drift / 100).toFixed(2)}`
  );
}
console.log(
  "\n  Drift is why the package figures are stored. The cached integer is\n" +
    "  what the engine prices from; the package is what the invoice says."
);

console.log("\nASSEMBLY PARITY — extracted summation vs the old inline loop\n");

// The exterior GFCI, from the seed: GFCI $25, bubble cover $15, FS box $8,
// 2 ft of 12/2 at $0.72, consumables $3.
const exteriorGfci = [
  { unitCostCents: 2500, quantity: 1 },
  { unitCostCents: 1500, quantity: 1 },
  { unitCostCents: 800, quantity: 1 },
  { unitCostCents: 72, quantity: 2 },
  { unitCostCents: 300, quantity: 1 },
];
check("exterior GFCI assembles to $52.44", assembleMaterialCostCents(exteriorGfci), 5244);

// TV installation: 2 rings, 2 covers, old-work box, receptacle, plate, 8 ft 14/2.
const tvInstall = [
  { unitCostCents: 400, quantity: 2 },
  { unitCostCents: 1000, quantity: 2 },
  { unitCostCents: 300, quantity: 1 },
  { unitCostCents: 200, quantity: 1 },
  { unitCostCents: 100, quantity: 1 },
  { unitCostCents: 50, quantity: 8 },
];
// 2x$4.00 rings + 2x$10.00 covers + $3.00 box + $2.00 receptacle + $1.00
// plate + 8ft x $0.50 = $38.00.
check("TV installation assembles to $38.00", assembleMaterialCostCents(tvInstall), 3800);

// Rounding must stay PER LINE, exactly as the old loop did it. Rounding once
// at the end would shift existing totals and make reconciled services look
// like they had drifted.
const fractional = [
  { unitCostCents: 19, quantity: 2.5 },
  { unitCostCents: 19, quantity: 2.5 },
];
check(
  "per-line rounding preserved (2 x round(19 x 2.5) = 96, not round(95) = 95)",
  assembleMaterialCostCents(fractional),
  96
);

check("empty assembly is zero", assembleMaterialCostCents([]), 0);

console.log("\nMARKUP — the retired banded tier must not reappear\n");
for (const total of [300, 999, 1000, 5244, 75000, 75100]) {
  const bandedTier = total < 1000 ? 3.0 : total <= 75000 ? 1.3 : 1.2;
  const banded = Math.round(total * bandedTier);
  const actual = calculateMaterialSellCents(total);
  const differs = banded !== actual;
  console.log(
    `  $${(total / 100).toFixed(2).padStart(8)} direct  ->  engine $${(actual / 100).toFixed(2).padStart(9)}` +
      (differs ? `   (retired tier would have printed $${(banded / 100).toFixed(2)})` : "")
  );
}

// Monotonic: the whole reason the bands were replaced. A cost rise must never
// lower the sell price, anywhere.
let monotonic = true;
let prev = -1;
for (let c = 0; c <= 200000; c += 7) {
  const sell = calculateMaterialSellCents(c);
  if (sell < prev) {
    monotonic = false;
    console.log(`  ✗ sell price FELL at direct cost ${c}`);
    break;
  }
  prev = sell;
}
if (!monotonic) failures++;
console.log(
  `  ${monotonic ? "✓" : "✗"} sell price rises monotonically with cost across $0–$2,000`
);

// ---------------------------------------------------------------------------
// Source-level invariants
//
// Two separations in lib/materialCost.ts are load-bearing and invisible to a
// unit test, because breaking either produces working code that does the
// wrong thing. Both have already gone wrong once in this codebase, so they
// are asserted against the source itself rather than trusted to review.
// ---------------------------------------------------------------------------

console.log("\nSOURCE INVARIANTS\n");

const src = readFileSync(
  new URL("../lib/materialCost.ts", import.meta.url),
  "utf8"
);

// Strip comments — the file discusses both of these at length, and the
// prohibition must not trip on its own explanation.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^\s*\/\/.*$/gm, "");

// 1. Cost propagation must never write a published customer price. Only the
//    admin and named dated migrations may. audit-price-writers.ts must keep
//    reporting zero files that can move a price outside the admin.
const priceFields = ["basePrice", "whileWeThereBasePrice", "approvedPriceCents"];
const writesPrice = priceFields.filter((f) => code.includes(f));
check("never writes a published customer price", writesPrice, []);

// 2. Recompute must never clear materialMultiplier. Fusing the two is the
//    defect that let a cost edit destroy a deliberate override and its
//    reason. Clearing belongs only in clearLegacyMultiplierOnItemize.
const recomputeBody = code.slice(
  code.indexOf("export async function recomputeServiceMaterialCost"),
  code.indexOf("export async function clearLegacyMultiplierOnItemize")
);
check(
  "recompute path never touches materialMultiplier",
  recomputeBody.includes("materialMultiplier"),
  false
);

// 3. The clearing function must clear the REASON too, or an orphaned
//    explanation outlives the override it explained.
const clearBody = code.slice(code.indexOf("export async function clearLegacyMultiplierOnItemize"));
check(
  "itemize-clear removes the reason alongside the multiplier",
  clearBody.includes("materialMultiplierReason"),
  true
);

console.log(
  failures === 0
    ? "\nAll checks passed.\n"
    : `\n${failures} check(s) FAILED.\n`
);
process.exit(failures === 0 ? 0 : 1);
