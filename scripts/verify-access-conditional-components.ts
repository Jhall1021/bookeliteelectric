/**
 * Pure-logic proof that `applyBranch` (lib/pricing.ts) selects an
 * access-conditioned component correctly — no database, no browser.
 *
 * WHY THIS EXISTS
 *
 * `prisma/seed-lighting-control.ts` attaches TWO `AnswerOptionComponent`
 * rows to the SAME answer for mutually exclusive work — e.g. switched_outlet
 * carries both `CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE` (conditioned
 * `ACCESSIBLE`) and `..._FINISHED` (conditioned `FINISHED`). Until now,
 * `TemplateAnswerOptionComponent` had no `conditionAccessClass`/
 * `conditionAccessSlot` fields, so extraction and installCatalog dropped the
 * condition on every fresh install: BOTH components installed unconditioned,
 * and a route selected both pieces of mutually exclusive work regardless of
 * actual access.
 *
 *   npx tsx scripts/verify-access-conditional-components.ts
 *
 * NOT PART OF `npm run verify`. No database access at all — applyBranch is a
 * pure function over plain data, so this proves the RESOLVER's own
 * selection logic directly rather than through a fixture that could hide a
 * mismatch between the two.
 *
 * CORRECTED 19 Sep 2026 — the UNKNOWN case originally claimed "fails closed"
 * from selecting zero components alone, which is not evidence of anything: a
 * branch with no conditioned components ALSO selects zero, and prices fine.
 * It now asserts the actual signal (`awaitingComponentApproval`, driven by
 * applyBranch's own `declaredButUnmatched`) against `customerPrice` with an
 * otherwise-real published anchor, so the claim is "the customer-facing
 * price verdict refuses", not "an array happened to be empty".
 */
import { applyBranch, startDisplayConfiguration, customerPrice, type JobConfiguration, type BranchContribution } from "../lib/pricing";
import type { AccessClass, AccessSlot } from "../lib/accessSlots";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

const baseConfig = (): JobConfiguration => startDisplayConfiguration({ estimatedMinutes: 60 });

const component = (
  key: string,
  conditionAccessClass?: AccessClass | null,
  conditionAccessSlot?: AccessSlot | null
): NonNullable<BranchContribution["components"]>[number] => ({
  quantity: 1,
  conditionAccessClass: conditionAccessClass ?? null,
  conditionAccessSlot: conditionAccessSlot ?? null,
  component: { key, customerFacingLabel: key },
});

const selectedKeys = (cfg: JobConfiguration) => cfg.components.map((c) => c.key);

console.log(`\nACCESS-CONDITIONAL COMPONENT SELECTION — pure resolver proof\n`);

// ── Only the matching PRIMARY variant is ever selected ─────────────────────
for (const [accessValue, expected] of [
  ["ACCESSIBLE", "ACCESSIBLE_VARIANT"],
  ["FINISHED", "FINISHED_VARIANT"],
] as const) {
  let cfg = baseConfig();
  cfg = applyBranch(cfg, { accessClassification: accessValue }); // establishes PRIMARY
  cfg = applyBranch(cfg, {
    components: [component("ACCESSIBLE_VARIANT", "ACCESSIBLE"), component("FINISHED_VARIANT", "FINISHED")],
  });
  const keys = selectedKeys(cfg);
  ok(`${accessValue} established selects only ${expected}, never the other mutually-exclusive variant`,
    keys.length === 1 && keys[0] === expected, JSON.stringify(keys));
}

// ── UNKNOWN fails closed: the real signal, not just an empty selection ─────
//
// Zero selected components is NOT itself proof of anything — a branch that
// legitimately has no conditioned components ALSO selects zero, and prices
// fine. What actually distinguishes "nothing to match" from "something was
// declared and none of it matched" is applyBranch's own `declaredButUnmatched`
// (lib/pricing.ts): components WERE declared here, UNKNOWN matched neither,
// and that forces `awaitingComponentApproval` regardless of what else the
// branch would otherwise price. Asserted against customerPrice with an
// otherwise-real, non-null published anchor — proving the signal reaches the
// actual customer-facing verdict rather than an internal flag nothing reads.
{
  let cfg = baseConfig();
  cfg = applyBranch(cfg, { accessClassification: "UNKNOWN" });
  cfg = applyBranch(cfg, {
    components: [component("ACCESSIBLE_VARIANT", "ACCESSIBLE"), component("FINISHED_VARIANT", "FINISHED")],
  });
  ok("UNKNOWN established selects neither declared variant",
    selectedKeys(cfg).length === 0, JSON.stringify(selectedKeys(cfg)));
  ok("...and that specifically forces awaitingComponentApproval (declaredButUnmatched), not merely 'nothing to add'",
    cfg.awaitingComponentApproval === true, JSON.stringify({ awaitingComponentApproval: cfg.awaitingComponentApproval }));
  const priced = customerPrice(cfg, 25000); // a real, otherwise-sufficient published anchor
  ok("...and customerPrice actually refuses (mustReview, no total) rather than silently pricing the base alone",
    priced.mustReview === true && priced.totalCents === null, JSON.stringify(priced));
}

// ── A non-PRIMARY slot stays scoped to itself ──────────────────────────────
{
  let cfg = baseConfig();
  cfg = applyBranch(cfg, { accessClassification: "FINISHED" }); // PRIMARY = FINISHED
  cfg = applyBranch(cfg, { components: [component("INDOOR_VARIANT", "FINISHED", "INDOOR_EQUIPMENT")] });
  ok("a component conditioned on INDOOR_EQUIPMENT is NOT selected merely because PRIMARY happens to match",
    selectedKeys(cfg).length === 0, JSON.stringify(selectedKeys(cfg)));
}
{
  let cfg = baseConfig();
  cfg = applyBranch(cfg, { accessClassification: "FINISHED", accessSlot: "INDOOR_EQUIPMENT" }); // establish THAT slot specifically
  cfg = applyBranch(cfg, { components: [component("INDOOR_VARIANT", "FINISHED", "INDOOR_EQUIPMENT")] });
  ok("...and IS selected once the SAME slot is the one actually established",
    selectedKeys(cfg).length === 1 && selectedKeys(cfg)[0] === "INDOOR_VARIANT", JSON.stringify(selectedKeys(cfg)));
}

console.log(`\n${fail === 0 ? "ALL CHECKS PASSED" : `${fail} CHECK(S) FAILED`}\n`);
if (fail > 0) process.exit(1);
