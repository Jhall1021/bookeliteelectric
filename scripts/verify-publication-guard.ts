/**
 * Guard tests for prisma/publish-low-voltage-sconces-2026-08-24.ts
 *
 *   npx tsx scripts/verify-publication-guard.ts
 *
 * The safety of that script rests entirely on refusing to write over a price
 * somebody else set. That refusal is one branch of one function, so it gets
 * tested rather than trusted — no database needed.
 */
import { decide } from "../prisma/publish-low-voltage-sconces-2026-08-24";

const target = { slug: "new-ethernet-line", name: "Ethernet", basePriceCents: 41500, wwtPriceCents: 35500 };
let fail = 0;
function t(label: string, current: { basePrice: number | null; whileWeThereBasePrice: number | null }, expected: string) {
  const got = decide(current, target).action;
  const ok = got === expected;
  if (!ok) fail++;
  console.log(`  ${ok ? "✓" : "✗"} ${label}${ok ? "" : `  (expected ${expected}, got ${got})`}`);
}

console.log("\nPUBLICATION GUARD\n");
t("both null -> publishes", { basePrice: null, whileWeThereBasePrice: null }, "publish");
t("both already set -> no-op (rerun is safe)", { basePrice: 41500, whileWeThereBasePrice: 35500 }, "already-published");
t("both set to DIFFERENT values -> still refuses (owner edit wins)", { basePrice: 44900, whileWeThereBasePrice: 39900 }, "already-published");
t("standalone set, same-visit null -> refuses", { basePrice: 41500, whileWeThereBasePrice: null }, "partial-conflict");
t("same-visit set, standalone null -> refuses", { basePrice: null, whileWeThereBasePrice: 35500 }, "partial-conflict");
t("zero is a real price, not absent", { basePrice: 0, whileWeThereBasePrice: null }, "partial-conflict");

const d = decide({ basePrice: null, whileWeThereBasePrice: null }, target);
const fields = d.action === "publish" ? d.fields : [];
const onlyPrices = fields.every((f) => f === "basePrice" || f === "whileWeThereBasePrice");
if (!onlyPrices) fail++;
console.log(`  ${onlyPrices ? "✓" : "✗"} writes only the two price fields`);

console.log(fail === 0 ? "\nAll checks passed.\n" : `\n${fail} check(s) FAILED.\n`);
process.exit(fail === 0 ? 0 : 1);
