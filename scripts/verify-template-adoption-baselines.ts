/**
 * Bounded per-change adoption baselines — the six proofs this design
 * requires, checked in as a durable regression rather than a deleted
 * scratch copy — plus focused regressions for the component-encoding
 * defects two rounds of review found in the comparison itself.
 *
 * Exercises `scripts/template-update.ts`'s B/L/T comparison and its
 * `TemplateAdoptionReceipt` bookkeeping against REAL published
 * `TemplateVersion` deltas, a real provisioned contractor, and REAL
 * canonical component bindings — never a mocked comparison, and never an
 * empty component set standing in for a populated one. Every scratch
 * `TemplateVersion` this script publishes, and every booking fixture it
 * creates, is removed even if an assertion above it throws — see the
 * `finally` blocks below, and the per-id cleanup tracking in Block E.
 *
 * NEVER RUN AGAINST A SHARED OR PRODUCTION DATABASE — see
 * prisma/_assertDisposableLocalDatabase.ts, enforced below, not just
 * stated.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { assertDisposableLocalDatabase } from "../prisma/_assertDisposableLocalDatabase";
import { withThrowaway, provision } from "./_throwaway";

loadEnv();
const prisma = new PrismaClient();
const PROOF = "__adoption-baseline-proof__";
const FRESH = "__adoption-baseline-fresh-install__";
const KEY = "new-120v-outlet";
const QKEY = "concealed_route_feet";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string, d = "") => { c ? pass++ : fail++; console.log(`    ${c ? "ok  " : "FAIL"} ${l}${c ? "" : "\n           " + d}`); };
const run = (...a: string[]) => execFileSync("npx", ["tsx", ...a], { encoding: "utf8", stdio: "pipe" });
const runMaybe = (...a: string[]): { out: string; code: number } => {
  try { return { out: execFileSync("npx", ["tsx", ...a], { encoding: "utf8", stdio: "pipe" }), code: 0 }; }
  catch (e) { const err = e as { stdout?: string; stderr?: string; status?: number }; return { out: (err.stdout ?? "") + (err.stderr ?? ""), code: err.status ?? 1 }; }
};
const BASE = "scripts/template-update.ts";
const args = (slug: string) => ["--contractor", slug, "--service", KEY];

type Component = { canonicalComponentId: string; quantity: number; conditionAnswerKey: string | null; conditionAnswerValue: string | null; quantityAnswerKey: string | null };
/** Builds an EXPECTED component object with every canonical field explicit — never just id/quantity, so a mismatch on conditionAnswerKey/conditionAnswerValue/quantityAnswerKey fails loudly instead of being silently unchecked. */
const comp = (canonicalComponentId: string, quantity: number, extra: Partial<Pick<Component, "conditionAnswerKey" | "conditionAnswerValue" | "quantityAnswerKey">> = {}): Component =>
  ({ canonicalComponentId, quantity, conditionAnswerKey: null, conditionAnswerValue: null, quantityAnswerKey: null, ...extra });
/**
 * A component's comparable identity as a FIXED-ORDER JSON array — the same
 * encoding `template-update.ts`'s own `componentKey` uses, and for the
 * same reason: at least one side of every comparison this verifier makes
 * can be `finalReceipt.acceptedProjection.components`, read straight out
 * of a `jsonb` column with no guaranteed key order. Comparing raw objects
 * with a plain `JSON.stringify` — which THIS HELPER did until this
 * regression suite caught it on itself — would intermittently fail on
 * genuinely-equal components for the identical reason the production bug
 * did.
 */
const componentSortKey = (c: Component): string =>
  JSON.stringify([c.canonicalComponentId, c.quantity, c.conditionAnswerKey, c.conditionAnswerValue, c.quantityAnswerKey]);
const sameComponents = (a: Component[], b: Component[]): boolean => {
  const norm = (cs: Component[]) => cs.map(componentSortKey).sort();
  const na = norm(a), nb = norm(b);
  return na.length === nb.length && na.every((v, i) => v === nb[i]);
};

async function svcOf(slug: string) {
  const c = await prisma.contractor.findUniqueOrThrow({ where: { slug }, select: { id: true } });
  return prisma.service.findFirstOrThrow({
    where: { contractorId: c.id, templateKey: KEY },
    include: { questions: { include: { options: { include: { components: true } } } } },
  });
}
async function optOf(slug: string, value: string) {
  const s = await svcOf(slug);
  const q = s.questions.find((x) => x.key === QKEY)!;
  return q.options.find((o) => o.value === value)!;
}
/** The live option's component set, reduced to ALL FIVE canonical fields — a row's own database id is never part of what "the same binding" means, but conditionAnswerKey/conditionAnswerValue/quantityAnswerKey are just as much a part of it as canonicalComponentId/quantity. */
async function liveComponentsOf(slug: string, value: string): Promise<Component[]> {
  const o = await optOf(slug, value);
  return o.components
    .filter((c): c is typeof c & { canonicalComponentId: string } => c.canonicalComponentId !== null)
    .map((c) => comp(c.canonicalComponentId, c.quantity, { conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey }));
}
async function receiptFor(serviceId: string, unitKind: string, unitKey: string) {
  return prisma.templateAdoptionReceipt.findFirst({ where: { serviceId, unitKind, unitKey }, orderBy: { createdAt: "desc" } });
}
/** Does --status report NOTHING further to adopt for this exact unit? The direct proof that a component-bearing option is recognized as matching, not perpetually "different" because of a stray template row id or an unstable encoding. */
function reportsNothingFor(status: string, value: string): boolean {
  const line = new RegExp(`~ option\\s+${QKEY}/${value}\\b`);
  return !line.test(status);
}
/** Does --status report a REAL, offered (non-conflict) change for this unit? Used for the encoding-collision regressions below, where the interesting assertion is "this WAS detected as a difference," not any particular resulting value. `(?!.*CONFLICT)` only looks ahead within the SAME line (`.` does not match `\n`), so a conflict reported for a different option elsewhere in the same --status output never affects this check. */
function reportsOfferedChangeFor(status: string, value: string): boolean {
  return new RegExp(`~ option\\s+${QKEY}/${value}\\b(?!.*CONFLICT)`).test(status);
}

type ComponentEdit = Component[];
let v1TsCache: { slug: string; name: string; shortDescription: string | null; icon: string | null; canonicalCategoryId: string; bookingType: string; photoState: string; isPrimaryEligible: boolean; requiresTechCount: number; pricingMethod: string } | null = null;
const publishedVersions: string[] = [];

/** Publishes a scratch DELTA revising `concealed_route_feet`'s two options — numeric bounds AND, when given, a REAL canonical-component set (every one of its five fields, never just id/quantity) — never an empty stand-in. */
async function publishDelta(version: number, edits: { beyond?: number; within?: number; beyondComponents?: ComponentEdit; withinComponents?: ComponentEdit }) {
  const v1 = await prisma.templateVersion.findFirstOrThrow({ where: { version: 1, kind: "SNAPSHOT" } });
  if (!v1TsCache) {
    const t = await prisma.templateService.findFirstOrThrow({ where: { templateVersionId: v1.id, key: KEY } });
    v1TsCache = { slug: t.slug, name: t.name, shortDescription: t.shortDescription, icon: t.icon, canonicalCategoryId: t.canonicalCategoryId, bookingType: t.bookingType, photoState: t.photoState, isPrimaryEligible: t.isPrimaryEligible, requiresTechCount: t.requiresTechCount, pricingMethod: t.pricingMethod };
  }
  const tv = await prisma.templateVersion.create({ data: { trade: "electrical", version, kind: "DELTA", notes: "verify-template-adoption-baselines fixture — delete after use" } });
  publishedVersions.push(tv.id);
  const componentsFor = (cs: ComponentEdit | undefined) => ({ create: (cs ?? []).map((c) => ({
    canonicalComponentId: c.canonicalComponentId, quantity: c.quantity,
    conditionAnswerKey: c.conditionAnswerKey, conditionAnswerValue: c.conditionAnswerValue, quantityAnswerKey: c.quantityAnswerKey,
  })) });
  await prisma.templateService.create({
    data: {
      templateVersionId: tv.id, key: KEY, slug: v1TsCache.slug, name: v1TsCache.name, shortDescription: v1TsCache.shortDescription, icon: v1TsCache.icon,
      canonicalCategoryId: v1TsCache.canonicalCategoryId, bookingType: v1TsCache.bookingType as never, photoState: v1TsCache.photoState as never,
      isPrimaryEligible: v1TsCache.isPrimaryEligible, requiresTechCount: v1TsCache.requiresTechCount, pricingMethod: v1TsCache.pricingMethod as never,
      questions: { create: [{
        key: QKEY, prompt: "How far along the wall, in feet?",
        helpText: "Measure along the proposed wall path. Decimals are fine. This does not measure wiring hidden inside the wall; choose I’m not sure if you cannot establish the distance.",
        inputType: "NUMBER", order: 11, numberMin: 1, numberMax: 300, numberAllowsDecimal: true,
        options: { create: [
          { value: "within", label: "Within the supported range", routeAction: "CONTINUE", order: 0,
            nextQuestionKey: "concealed_wall_surface", requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [],
            numberAtLeast: edits.within ?? 1, numberAtMost: 20, numberAtLeastExclusive: false,
            components: componentsFor(edits.withinComponents) },
          { value: "beyond", label: "Beyond the supported range", routeAction: "PHOTO_REVIEW", order: 1,
            requiredPhotoLabels: ["A wide photo of the wall between the power source and the new location"],
            photosBlockBooking: true, illustrationUrls: [],
            numberAtLeast: edits.beyond ?? 20, numberAtMost: 300, numberAtLeastExclusive: true,
            components: componentsFor(edits.beyondComponents) },
        ] },
      }] },
    },
  });
  return tv;
}

async function approvePricing(slug: string, approvedAt: Date) {
  const s = await svcOf(slug);
  await prisma.service.update({ where: { id: s.id }, data: { materialCostResolved: true, publishedPriceApprovedAt: approvedAt, basePrice: 44500 } });
}

async function main() {
  console.log("\nBOUNDED PER-CHANGE ADOPTION BASELINES\n");
  await assertDisposableLocalDatabase(prisma);

  const canonical = await prisma.canonicalComponent.findMany({ orderBy: { key: "asc" }, take: 2, select: { id: true, key: true } });
  if (canonical.length < 2) throw new Error("need at least two seeded CanonicalComponent rows for this rehearsal");
  const [compA, compB] = canonical;
  console.log(`  using real canonical components: A=${compA.key}, B=${compB.key}\n`);

  try {
    await withThrowaway(prisma, PROOF, "Adoption Baseline Proof Electric", async () => {
      provision(PROOF, ["--service", KEY, "--version", "1"]);
      const s0 = await svcOf(PROOF);
      ok((await optOf(PROOF, "beyond")).numberAtLeast === 20, "provisioned at v1: beyond starts at numberAtLeast 20");
      ok((await optOf(PROOF, "within")).numberAtLeast === 1, "provisioned at v1: within starts at numberAtLeast 1");
      ok((await liveComponentsOf(PROOF, "beyond")).length === 0, "provisioned at v1: beyond starts with no canonical components");

      // ── BLOCK A — proofs #1 and #2, WITH a real component bound and revised at every step ──
      console.log("\n  A. ADOPT v2 (BAD, WITH A REAL COMPONENT) THEN A CORRECTIVE v3 THAT EXACTLY RESTORES v1 (NO COMPONENT) — PROOF #2");
      await publishDelta(2, { beyond: 5, beyondComponents: [comp(compA.id, 1)] }); // v2: accidental bad publish
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok((await optOf(PROOF, "beyond")).numberAtLeast === 5, "v2's bad numeric value (5) is now live");
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compA.id, 1)]), "v2's real component binding (A, qty 1) is now live");
      const statusRightAfterV2 = run(BASE, ...args(PROOF), "--status");
      ok(reportsNothingFor(statusRightAfterV2, "beyond"),
         "THE FIX: immediately after adopting a component-bearing option, --status reports NOTHING further for it — L now correctly equals T despite both carrying real component rows, not perpetually 'different' because of a stray template row id");
      const receiptAfterV2 = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
      ok(!!receiptAfterV2, "an adoption receipt now exists for beyond");

      await publishDelta(3, { beyond: 20 }); // v3: corrective, EXACTLY restores v1's original shape — numeric AND no components
      const statusV3 = run(BASE, ...args(PROOF), "--status");
      ok(/beyond/.test(statusV3) && !/CONFLICT/.test(statusV3), "the exact-revert correction is OFFERED, not silently invisible and not a false conflict — B is v2, not v1");
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok((await optOf(PROOF, "beyond")).numberAtLeast === 20, "the exact-revert correction was actually applied — live numeric is back to 20");
      ok((await liveComponentsOf(PROOF, "beyond")).length === 0, "and the component binding was actually REMOVED — reverted to v1's true original shape, not left behind");
      ok(reportsNothingFor(run(BASE, ...args(PROOF), "--status"), "beyond"), "and --status again reports nothing further for beyond");
      const receiptAfterV3 = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
      ok(receiptAfterV3?.priorReceiptId === receiptAfterV2?.id, "the v3 receipt names the v2 receipt it superseded — append-only history, not an overwrite");

      console.log("\n  A. ADOPT A DISTINCT CORRECTIVE v4 (A DIFFERENT REAL COMPONENT), THEN REPEAT THE SAME ADOPT — PROOF #1");
      await publishDelta(4, { beyond: 22, beyondComponents: [comp(compB.id, 2)] }); // v4: a further, distinct correction
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok((await optOf(PROOF, "beyond")).numberAtLeast === 22, "the distinct v4 correction was applied");
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compB.id, 2)]), "v4's distinct component binding (B, qty 2) is live");
      ok(reportsNothingFor(run(BASE, ...args(PROOF), "--status"), "beyond"), "and --status reports nothing further for beyond yet again");
      const receiptAfterV4 = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
      ok(receiptAfterV4?.priorReceiptId === receiptAfterV3?.id, "the v4 receipt in turn names the v3 receipt it superseded");

      const beforeRepeat = await optOf(PROOF, "beyond");
      const beforeRepeatComponents = await liveComponentsOf(PROOF, "beyond");
      const beforeReceiptCount = await prisma.templateAdoptionReceipt.count({ where: { serviceId: s0.id, unitKind: "option", unitKey: `${QKEY}/beyond` } });
      const repeat = run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok(/no change matched/.test(repeat), "repeating the SAME adoption after it already landed is a true no-op, even with a real component set involved");
      const afterRepeat = await optOf(PROOF, "beyond");
      ok(afterRepeat.numberAtLeast === beforeRepeat.numberAtLeast, "the repeat wrote nothing to the tree's numeric bound");
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), beforeRepeatComponents), "or to its component bindings");
      const afterReceiptCount = await prisma.templateAdoptionReceipt.count({ where: { serviceId: s0.id, unitKind: "option", unitKey: `${QKEY}/beyond` } });
      ok(afterReceiptCount === beforeReceiptCount, "and created no new receipt");

      // ── BLOCK B — proof #3: a contractor edit after adoption conflicts, on BOTH a scalar bound AND a component binding at once ──
      console.log("\n  B. A CONTRACTOR EDIT (NUMERIC AND COMPONENT QUANTITY) AFTER ADOPTING v5 MAKES A LATER v6 A CONFLICT — PROOF #3");
      await publishDelta(5, { within: 3, withinComponents: [comp(compA.id, 1)] });
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/within`);
      ok((await optOf(PROOF, "within")).numberAtLeast === 3, "within's own v5 adoption landed on the numeric bound");
      ok(sameComponents(await liveComponentsOf(PROOF, "within"), [comp(compA.id, 1)]), "and on its component binding");
      ok(reportsNothingFor(run(BASE, ...args(PROOF), "--status"), "within"), "and --status reports nothing further for within either, right after adopting its own component");
      const withinReceiptBefore = await receiptFor(s0.id, "option", `${QKEY}/within`);

      // The contractor edits it themselves, bypassing this tool entirely —
      // both the numeric bound AND the component's quantity, a realistic
      // "they made this option their own" edit.
      const withinOptId = (await optOf(PROOF, "within")).id;
      await prisma.answerOption.updateMany({ where: { id: withinOptId }, data: { numberAtLeast: 7 } });
      await prisma.answerOptionComponent.updateMany({ where: { answerOptionId: withinOptId, canonicalComponentId: compA.id }, data: { quantity: 9 } });

      await publishDelta(6, { within: 10, withinComponents: [comp(compB.id, 4)] }); // a further correction, distinct from both the original (3, A/1) and the contractor's own (7, A/9)
      const approvedAt = new Date("2026-10-05T12:00:00.000Z"); // a fixed, checkable approval timestamp — not just "some Date"
      await approvePricing(PROOF, approvedAt);
      const beforeConflictPricing = await svcOf(PROOF);
      const statusConflict = run(BASE, ...args(PROOF), "--status");
      ok(/within/.test(statusConflict) && /CONFLICT/.test(statusConflict), "the later correction is reported as a CONFLICT, not silently offered");
      const adoptConflict = run(BASE, ...args(PROOF), "--adopt", `${QKEY}/within`);
      ok(/SKIPPED/.test(adoptConflict) && /Yours is kept/.test(adoptConflict), "adopting it is refused");
      const stillWithin = await optOf(PROOF, "within");
      ok(stillWithin.numberAtLeast === 7, "the contractor's own numeric value (7) is untouched — not the template's 10, not reverted to 3");
      ok(sameComponents(await liveComponentsOf(PROOF, "within"), [comp(compA.id, 9)]),
         "and their own FULL canonical component binding (A, qty 9, no condition/quantityAnswerKey) is untouched too — not swapped to component B, not reverted to quantity 1");
      const afterConflictPricing = await svcOf(PROOF);
      ok(afterConflictPricing.materialCostResolved === beforeConflictPricing.materialCostResolved
         && afterConflictPricing.basePrice === beforeConflictPricing.basePrice
         && afterConflictPricing.publishedPriceApprovedAt?.getTime() === beforeConflictPricing.publishedPriceApprovedAt?.getTime(),
         "the refusal touched no pricing state — including the approval TIMESTAMP itself, not only whether an approval exists");
      const withinReceiptAfter = await receiptFor(s0.id, "option", `${QKEY}/within`);
      ok(withinReceiptAfter?.id === withinReceiptBefore?.id, "the refusal advanced no baseline — still the v5 receipt");

      // ── BLOCK C — proof #4: adopting one unit leaves an unrelated unit's own baseline alone, even within the SAME published version ──
      console.log("\n  C. ONE PUBLISHED VERSION TOUCHES TWO UNITS; ADOPTING ONLY ONE LEAVES THE OTHER'S OWN BASELINE UNTOUCHED — PROOF #4");
      await publishDelta(7, { beyond: 28, beyondComponents: [comp(compB.id, 2)], within: 12, withinComponents: [comp(compB.id, 4)] }); // touches BOTH units at once; beyond's component is UNCHANGED from v4 so only its numeric bound is a real diff
      const statusBoth = run(BASE, ...args(PROOF), "--status");
      ok(/beyond/.test(statusBoth) && !/beyond.*CONFLICT|CONFLICT.*beyond/.test(statusBoth), "beyond's change is offered cleanly (its own baseline, v4, still matches live — numeric bound AND component)");
      ok(/within/.test(statusBoth) && /CONFLICT/.test(statusBoth), "within's change is STILL a conflict — completely independent of beyond, in the SAME version");
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok((await optOf(PROOF, "beyond")).numberAtLeast === 28, "beyond's v7 change was adopted");
      const statusAfterOne = run(BASE, ...args(PROOF), "--status");
      ok(reportsNothingFor(statusAfterOne, "beyond"), "beyond now reports nothing further to adopt");
      ok(/within/.test(statusAfterOne) && /CONFLICT/.test(statusAfterOne), "within's conflict is reported EXACTLY as before — untouched by beyond's own adoption");
      ok(stillWithin.numberAtLeast === (await optOf(PROOF, "within")).numberAtLeast, "within's live value is still the contractor's own, unaffected by adopting beyond");

      // ── BLOCK D — proof #5: a fault between the tree write and the receipt/reset commits nothing — WITH a real, populated component set actually being deleted mid-transaction ──
      console.log("\n  D. A FAULT BETWEEN THE TREE WRITE AND THE RECEIPT/PRICE-RESET COMMITS NOTHING — WITH A REAL COMPONENT DELETE IN FLIGHT — PROOF #5");
      await publishDelta(8, { beyond: 33, beyondComponents: [comp(compA.id, 3)] }); // swaps component B -> A, so the option's existing (non-empty) component row is genuinely deleted mid-transaction
      const beforeFault = await optOf(PROOF, "beyond");
      const beforeFaultComponents = await liveComponentsOf(PROOF, "beyond");
      ok(beforeFaultComponents.length > 0, "sanity: beyond has a REAL, non-empty component set going into the fault test, not an empty one a deleteMany would no-op against");
      const beforeFaultReceipt = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
      const beforeFaultPricing = await svcOf(PROOF);
      const fs = await import("node:fs");
      const faulty = "scripts/_verify-adoption-fault.ts";
      let src = fs.readFileSync(BASE, "utf8");
      const marker = "await tx.answerOptionComponent.deleteMany({ where: { answerOptionId: mine.id, canonicalComponentId: { not: null } } });";
      if (!src.includes(marker)) throw new Error("fault-injection marker not found — template-update.ts changed shape");
      src = src.replace(marker, `${marker}\n          throw new Error("INJECTED FAULT — verify-template-adoption-baselines");`);
      fs.writeFileSync(faulty, src);
      let faultResult: { out: string; code: number };
      try {
        faultResult = runMaybe(faulty, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      } finally {
        fs.unlinkSync(faulty);
      }
      ok(faultResult.code !== 0, "the faulty run exits non-zero");
      ok(/INJECTED FAULT/.test(faultResult.out), "for the injected reason, not some other crash");
      const afterFault = await optOf(PROOF, "beyond");
      ok(afterFault.numberAtLeast === beforeFault.numberAtLeast, "the tree write rolled back completely — beyond's numeric bound is untouched");
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), beforeFaultComponents),
         "and its REAL, populated component row — genuinely deleted by the deleteMany that ran before the injected throw — is back, proving the rollback restores actual deleted data, not just a no-op against an empty set");
      const afterFaultReceipt = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
      ok(afterFaultReceipt?.id === beforeFaultReceipt?.id, "no new receipt was committed");
      const afterFaultPricing = await svcOf(PROOF);
      ok(afterFaultPricing.materialCostResolved === beforeFaultPricing.materialCostResolved
         && afterFaultPricing.basePrice === beforeFaultPricing.basePrice
         && afterFaultPricing.publishedPriceApprovedAt?.getTime() === beforeFaultPricing.publishedPriceApprovedAt?.getTime(),
         "the price-reset never committed either — including the approval timestamp");

      // Recover: adopt the same v8 change for real, cleanly, so later blocks have a stable, current state to build on.
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok((await optOf(PROOF, "beyond")).numberAtLeast === 33, "the same change adopts cleanly once the fault is gone");
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compA.id, 3)]), "and the component swap (B -> A) actually lands this time");

      // ── BLOCK E — proof #6: booking safety across adoption AND correction of a component-bearing option; fresh install gets the corrected content ──
      console.log("\n  E. AN EXISTING BOOKING FIXTURE'S TRACKED FIELDS SURVIVE A LATER CORRECTION; A FRESH INSTALL GETS IT — PROOF #6");
      await approvePricing(PROOF, new Date());
      const svcForBooking = await svcOf(PROOF);
      const contractorId = (await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF }, select: { id: true } })).id;

      // Every id is recorded THE INSTANT its row is created — not assembled
      // into one object only after every create succeeds. An exception
      // between two creates (this fixture makes five, sequentially) must
      // still leave every row created so far tracked for cleanup; assigning
      // one combined object only at the end would silently orphan whichever
      // rows were created before the exception.
      const fixture: Partial<{ areaId: string; windowId: string; customerId: string; visitId: string; lineItemId: string; bookingId: string }> = {};
      try {
        const area = await prisma.serviceArea.create({ data: { contractorId, name: "Proof Area", zipCodes: ["00000"] } });
        fixture.areaId = area.id;
        const window = await prisma.arrivalWindow.create({ data: { date: new Date("2026-10-01"), startTime: "08:00", endTime: "11:00", serviceAreaId: area.id, capacityTotal: 1 } });
        fixture.windowId = window.id;
        const customer = await prisma.customer.create({ data: { contractorId, name: "Proof Customer", email: "proof@example.com" } });
        fixture.customerId = customer.id;
        const visit = await prisma.visit.create({ data: { contractorId, sessionId: "adoption-baseline-booked", status: "CHECKED_OUT" } });
        fixture.visitId = visit.id;
        const lineItem = await prisma.lineItem.create({
          data: { visitId: visit.id, serviceId: svcForBooking.id, isPrimary: true,
            answersSnapshot: { concealed_route_feet: "beyond", concealed_route_feet_value: 34 },
            computedPriceCents: 62000, resolvedCrewHours: 3, resolvedCrewCount: 1, resolvedAccessClass: "ACCESSIBLE",
            resolvedComponentKeys: [compA.key], resolvedEconomicBasis: "adoption-baseline-basis",
            resolvedMaterialCostCents: 4500, floorPriceCents: 62000, estimatedMinutes: 180 },
        });
        fixture.lineItemId = lineItem.id;
        const booking = await prisma.booking.create({
          data: { visitId: visit.id, customerId: customer.id, address: "1 Proof St", zipCode: "00000",
            arrivalWindowId: window.id, totalCents: 62000, paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION" },
        });
        fixture.bookingId = booking.id;

        // These rows are DIRECTLY INSERTED FIXTURES standing in for a
        // booking — not a live checkout run and not proof that every column
        // on either row is preserved. The claim below is exactly the set of
        // fields actually read back and compared: a real snapshot value and
        // a real total, chosen because they are what a homeowner or an
        // auditor would trace, not "the whole row, byte for byte."
        const trackedLineItemFields = { answersSnapshot: lineItem.answersSnapshot, computedPriceCents: lineItem.computedPriceCents, resolvedEconomicBasis: lineItem.resolvedEconomicBasis, resolvedMaterialCostCents: lineItem.resolvedMaterialCostCents, resolvedComponentKeys: lineItem.resolvedComponentKeys };
        const trackedBookingFields = { totalCents: booking.totalCents };

        await publishDelta(9, { beyond: 40, beyondComponents: [comp(compA.id, 5)] }); // a further, real correction, published AFTER the booking exists — same component, different quantity
        run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
        ok((await optOf(PROOF, "beyond")).numberAtLeast === 40, "the post-booking correction was adopted onto the live tree");
        ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compA.id, 5)]), "including the component quantity change (3 -> 5)");

        const lineItemAfter = await prisma.lineItem.findUniqueOrThrow({ where: { id: lineItem.id } });
        ok(JSON.stringify({ answersSnapshot: lineItemAfter.answersSnapshot, computedPriceCents: lineItemAfter.computedPriceCents, resolvedEconomicBasis: lineItemAfter.resolvedEconomicBasis, resolvedMaterialCostCents: lineItemAfter.resolvedMaterialCostCents, resolvedComponentKeys: lineItemAfter.resolvedComponentKeys }) === JSON.stringify(trackedLineItemFields),
           "the booked LineItem fixture's tracked fields — answersSnapshot, computedPriceCents, resolvedEconomicBasis, resolvedMaterialCostCents, resolvedComponentKeys — are unchanged by the adoption");
        const bookingAfter = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
        ok(bookingAfter.totalCents === trackedBookingFields.totalCents, "the linked Booking fixture's tracked totalCents is unchanged too");
      } finally {
        // Delete whatever was actually created, in FK-safe order, REGARDLESS
        // of how far the try block got — and never swallow a failure here:
        // a delete that fails is reported as a FAILED check, not silently
        // absorbed while the run still claims exact restoration.
        if (fixture.bookingId) { try { await prisma.booking.delete({ where: { id: fixture.bookingId } }); } catch (e) { ok(false, "cleanup: delete booking fixture", String(e)); } }
        if (fixture.lineItemId) { try { await prisma.lineItem.delete({ where: { id: fixture.lineItemId } }); } catch (e) { ok(false, "cleanup: delete lineItem fixture", String(e)); } }
        if (fixture.visitId) { try { await prisma.visit.delete({ where: { id: fixture.visitId } }); } catch (e) { ok(false, "cleanup: delete visit fixture", String(e)); } }
        if (fixture.customerId) { try { await prisma.customer.delete({ where: { id: fixture.customerId } }); } catch (e) { ok(false, "cleanup: delete customer fixture", String(e)); } }
        if (fixture.windowId) { try { await prisma.arrivalWindow.delete({ where: { id: fixture.windowId } }); } catch (e) { ok(false, "cleanup: delete arrivalWindow fixture", String(e)); } }
        if (fixture.areaId) { try { await prisma.serviceArea.delete({ where: { id: fixture.areaId } }); } catch (e) { ok(false, "cleanup: delete serviceArea fixture", String(e)); } }
      }

      await withThrowaway(prisma, FRESH, "Adoption Baseline Fresh Install", async () => {
        provision(FRESH); // no --version pin: installs the CURRENT composed catalog, v9 folded in
        const freshBeyond = await optOf(FRESH, "beyond");
        ok(freshBeyond.numberAtLeast === 40, `a contractor installing TODAY receives the corrected v9 numeric bound (40), not any of the earlier values — got ${freshBeyond.numberAtLeast}`);
        ok(sameComponents(await liveComponentsOf(FRESH, "beyond"), [comp(compA.id, 5)]),
           "and the corrected v9 component binding (A, qty 5) too — a fresh install carries the same fix a correction offers an existing contractor");
      });

      // ── BLOCK F — focused component-ENCODING regressions: delimiter collision, null vs empty string, condition-only and quantityAnswerKey-only changes, and a direct receipt jsonb round-trip check ──
      console.log("\n  F. COMPONENT-ENCODING REGRESSIONS — DELIMITER COLLISION, NULL VS EMPTY STRING, CONDITION-ONLY AND quantityAnswerKey-ONLY CHANGES");
      // Continuing from block E's end state: beyond = numeric 40, component = [comp(compA, 5)], baseline = the v9 receipt.
      console.log("\n  F1. A CONDITION-ONLY CHANGE IS DETECTED AND SURVIVES A RECEIPT ROUND TRIP");
      await publishDelta(10, { beyond: 40, beyondComponents: [comp(compA.id, 5, { conditionAnswerKey: "collision|test", conditionAnswerValue: "c" })] });
      ok(reportsOfferedChangeFor(run(BASE, ...args(PROOF), "--status"), "beyond"), "adding condition fields to an otherwise-identical component is detected as a real, offered change");
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compA.id, 5, { conditionAnswerKey: "collision|test", conditionAnswerValue: "c" })]), "the condition-bearing component landed exactly as published");
      ok(reportsNothingFor(run(BASE, ...args(PROOF), "--status"), "beyond"), "and --status immediately reports nothing further — the condition-bearing projection survives its OWN receipt's jsonb round trip");

      console.log("\n  F2. DELIMITER COLLISION: A DIFFERENT BINDING THE OLD PIPE-JOINED ENCODING WOULD HAVE READ AS IDENTICAL");
      // Old buggy encoding: `${id}|${qty}|${conditionAnswerKey}|${conditionAnswerValue}|${quantityAnswerKey}`.
      // F1's live/baseline: conditionAnswerKey="collision|test", conditionAnswerValue="c"      -> old string ".../collision|test|c/" (segments: "collision|test", "c")
      // This version:       conditionAnswerKey="collision",      conditionAnswerValue="test|c" -> old string ".../collision|test|c/" (segments: "collision", "test|c") — IDENTICAL old encoding, genuinely different values.
      await publishDelta(11, { beyond: 40, beyondComponents: [comp(compA.id, 5, { conditionAnswerKey: "collision", conditionAnswerValue: "test|c" })] });
      ok(reportsOfferedChangeFor(run(BASE, ...args(PROOF), "--status"), "beyond"),
         "THE FIX: a component whose fields the OLD pipe-joined encoding would have concatenated to an IDENTICAL string as F1's is still correctly detected as a real, different, offered change — the fixed-order JSON array encoding does not collide on this boundary");
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compA.id, 5, { conditionAnswerKey: "collision", conditionAnswerValue: "test|c" })]), "the distinct (non-colliding) component landed correctly");

      console.log("\n  F3. condition-answer-key REVERTED TO null (an ordinary distinct change, sets up the null-vs-empty-string proof)");
      await publishDelta(12, { beyond: 40, beyondComponents: [comp(compA.id, 5, { conditionAnswerValue: "test|c" })] }); // conditionAnswerKey defaults to null via comp()
      ok(reportsOfferedChangeFor(run(BASE, ...args(PROOF), "--status"), "beyond"), "reverting conditionAnswerKey to null is detected as a real change");
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compA.id, 5, { conditionAnswerValue: "test|c" })]), "conditionAnswerKey is genuinely null again");

      console.log("\n  F4. null AND EMPTY STRING ARE NOT THE SAME VALUE");
      await publishDelta(13, { beyond: 40, beyondComponents: [comp(compA.id, 5, { conditionAnswerKey: "", conditionAnswerValue: "test|c" })] }); // ONLY difference from F3: conditionAnswerKey null -> ""
      ok(reportsOfferedChangeFor(run(BASE, ...args(PROOF), "--status"), "beyond"),
         "THE FIX: conditionAnswerKey changing from null to the EMPTY STRING — with every other field identical — is still detected as a real, offered change; the old `?? \"\"` encoding would have mapped both to the same segment and reported nothing to adopt");
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      ok(sameComponents(await liveComponentsOf(PROOF, "beyond"), [comp(compA.id, 5, { conditionAnswerKey: "", conditionAnswerValue: "test|c" })]), "the empty-string value landed exactly as published, not silently coerced to null");

      console.log("\n  F5. A quantityAnswerKey-ONLY CHANGE IS ALSO DETECTED, AND THE FULL FIVE-FIELD PROJECTION SURVIVES ITS OWN RECEIPT'S jsonb ROUND TRIP");
      await publishDelta(14, { beyond: 40, beyondComponents: [comp(compA.id, 5, { conditionAnswerKey: "", conditionAnswerValue: "test|c", quantityAnswerKey: QKEY })] }); // ONLY difference from F4: quantityAnswerKey null -> a real question key
      ok(reportsOfferedChangeFor(run(BASE, ...args(PROOF), "--status"), "beyond"), "adding quantityAnswerKey alone, all four other fields unchanged, is detected as a real change");
      run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
      const finalComponents = await liveComponentsOf(PROOF, "beyond");
      ok(sameComponents(finalComponents, [comp(compA.id, 5, { conditionAnswerKey: "", conditionAnswerValue: "test|c", quantityAnswerKey: QKEY })]), "quantityAnswerKey landed correctly, alongside the untouched other four fields");
      ok(reportsNothingFor(run(BASE, ...args(PROOF), "--status"), "beyond"), "and --status again reports nothing further");

      const finalReceipt = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
      const finalReceiptComponents = (finalReceipt?.acceptedProjection as unknown as { components: Component[] } | null)?.components ?? [];
      ok(sameComponents(finalReceiptComponents, finalComponents),
         "DIRECT RECEIPT CHECK: reading the receipt's OWN stored acceptedProjection.components back out of jsonb and comparing it against the live row's five-field projection — the exact round trip a receipt-backed baseline depends on — confirms canonicalComponentId, quantity, conditionAnswerKey (the empty string, not null), conditionAnswerValue and quantityAnswerKey all survive it intact");
    });
  } finally {
    // Clean up every scratch TemplateVersion this run published — global
    // rows, not scoped to either throwaway contractor, and not covered by
    // withThrowaway's own cleanup. Runs even if an assertion above threw,
    // so a failed run never leaves scratch TemplateVersion rows behind for
    // the next run — or a real one — to trip over. Failures are reported,
    // not swallowed: a version that fails to delete is a FAILED check.
    for (const id of publishedVersions) {
      try { await prisma.templateVersion.delete({ where: { id } }); }
      catch (e) { ok(false, `cleanup: delete scratch TemplateVersion ${id}`, String(e)); }
    }
  }

  const remaining = await prisma.templateVersion.count();
  ok(remaining === 1, `exactly the baseline TemplateVersion remains afterward (found ${remaining})`);

  console.log("\n" + "─".repeat(74));
  console.log(fail === 0 ? `\n  ${pass} checks passed.\n` : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
