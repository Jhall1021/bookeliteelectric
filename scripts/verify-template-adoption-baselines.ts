/**
 * Bounded per-change adoption baselines — the six proofs this design
 * requires, checked in as a durable regression rather than a deleted
 * scratch copy.
 *
 * Exercises `scripts/template-update.ts`'s B/L/T comparison and its
 * `TemplateAdoptionReceipt` bookkeeping against REAL published
 * `TemplateVersion` deltas and a real provisioned contractor — never a
 * mocked comparison. Every scratch `TemplateVersion` this script publishes
 * is deleted at the end; the throwaway contractors are destroyed via
 * `_throwaway.ts` the same way every other template suite in this repo
 * cleans up after itself.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { withThrowaway, provision, destroyContractor } from "./_throwaway";

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
async function receiptFor(serviceId: string, unitKind: string, unitKey: string) {
  return prisma.templateAdoptionReceipt.findFirst({ where: { serviceId, unitKind, unitKey }, orderBy: { createdAt: "desc" } });
}

let v1TsCache: { slug: string; name: string; shortDescription: string | null; icon: string | null; canonicalCategoryId: string; bookingType: string; photoState: string; isPrimaryEligible: boolean; requiresTechCount: number; pricingMethod: string } | null = null;
const publishedVersions: string[] = [];

/** Publishes a scratch DELTA revising `concealed_route_feet`'s two options and/or its wording — the same real fixture pattern used throughout this branch's own report (§0.28/§0.29). */
async function publishDelta(version: number, edits: { beyond?: number; within?: number; prompt?: string }) {
  const v1 = await prisma.templateVersion.findFirstOrThrow({ where: { version: 1, kind: "SNAPSHOT" } });
  if (!v1TsCache) {
    const t = await prisma.templateService.findFirstOrThrow({ where: { templateVersionId: v1.id, key: KEY } });
    v1TsCache = { slug: t.slug, name: t.name, shortDescription: t.shortDescription, icon: t.icon, canonicalCategoryId: t.canonicalCategoryId, bookingType: t.bookingType, photoState: t.photoState, isPrimaryEligible: t.isPrimaryEligible, requiresTechCount: t.requiresTechCount, pricingMethod: t.pricingMethod };
  }
  const tv = await prisma.templateVersion.create({ data: { trade: "electrical", version, kind: "DELTA", notes: "verify-template-adoption-baselines fixture — delete after use" } });
  publishedVersions.push(tv.id);
  await prisma.templateService.create({
    data: {
      templateVersionId: tv.id, key: KEY, slug: v1TsCache.slug, name: v1TsCache.name, shortDescription: v1TsCache.shortDescription, icon: v1TsCache.icon,
      canonicalCategoryId: v1TsCache.canonicalCategoryId, bookingType: v1TsCache.bookingType as never, photoState: v1TsCache.photoState as never,
      isPrimaryEligible: v1TsCache.isPrimaryEligible, requiresTechCount: v1TsCache.requiresTechCount, pricingMethod: v1TsCache.pricingMethod as never,
      questions: { create: [{
        key: QKEY, prompt: edits.prompt ?? "How far along the wall, in feet?",
        helpText: "Measure along the proposed wall path. Decimals are fine. This does not measure wiring hidden inside the wall; choose I’m not sure if you cannot establish the distance.",
        inputType: "NUMBER", order: 11, numberMin: 1, numberMax: 300, numberAllowsDecimal: true,
        options: { create: [
          { value: "within", label: "Within the supported range", routeAction: "CONTINUE", order: 0,
            nextQuestionKey: "concealed_wall_surface", requiredPhotoLabels: [], photosBlockBooking: true, illustrationUrls: [],
            numberAtLeast: edits.within ?? 1, numberAtMost: 20, numberAtLeastExclusive: false },
          { value: "beyond", label: "Beyond the supported range", routeAction: "PHOTO_REVIEW", order: 1,
            requiredPhotoLabels: ["A wide photo of the wall between the power source and the new location"],
            photosBlockBooking: true, illustrationUrls: [],
            numberAtLeast: edits.beyond ?? 20, numberAtMost: 300, numberAtLeastExclusive: true },
        ] },
      }] },
    },
  });
  return tv;
}

async function approvePricing(slug: string) {
  const s = await svcOf(slug);
  await prisma.service.update({ where: { id: s.id }, data: { materialCostResolved: true, publishedPriceApprovedAt: new Date(), basePrice: 44500 } });
}

async function main() {
  console.log("\nBOUNDED PER-CHANGE ADOPTION BASELINES\n");

  await withThrowaway(prisma, PROOF, "Adoption Baseline Proof Electric", async () => {
    provision(PROOF, ["--service", KEY, "--version", "1"]);
    const s0 = await svcOf(PROOF);
    ok((await optOf(PROOF, "beyond")).numberAtLeast === 20, "provisioned at v1: beyond starts at numberAtLeast 20");
    ok((await optOf(PROOF, "within")).numberAtLeast === 1, "provisioned at v1: within starts at numberAtLeast 1");

    // ── BLOCK A — proofs #1 and #2, the full lifecycle of ONE unit ────────
    console.log("\n  A. ADOPT v2 (BAD) THEN A CORRECTIVE v3 THAT EXACTLY RESTORES v1 — PROOF #2");
    await publishDelta(2, { beyond: 5 }); // v2: accidental bad publish
    run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    ok((await optOf(PROOF, "beyond")).numberAtLeast === 5, "v2's bad value (5) is now live");
    const receiptAfterV2 = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
    ok(!!receiptAfterV2, "an adoption receipt now exists for beyond");

    await publishDelta(3, { beyond: 20 }); // v3: corrective, EXACTLY restores v1's original 20
    const statusV3 = run(BASE, ...args(PROOF), "--status");
    ok(/beyond/.test(statusV3) && !/CONFLICT/.test(statusV3), "the exact-revert correction is OFFERED, not silently invisible and not a false conflict — B is v2, not v1");
    run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    ok((await optOf(PROOF, "beyond")).numberAtLeast === 20, "the exact-revert correction was actually applied — live is back to 20");
    const receiptAfterV3 = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
    ok(receiptAfterV3?.priorReceiptId === receiptAfterV2?.id, "the v3 receipt names the v2 receipt it superseded — append-only history, not an overwrite");

    console.log("\n  A. ADOPT A DISTINCT CORRECTIVE v4, THEN REPEAT THE SAME ADOPT — PROOF #1");
    await publishDelta(4, { beyond: 22 }); // v4: a further, distinct correction
    run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    ok((await optOf(PROOF, "beyond")).numberAtLeast === 22, "the distinct v4 correction was applied");
    const receiptAfterV4 = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
    ok(receiptAfterV4?.priorReceiptId === receiptAfterV3?.id, "the v4 receipt in turn names the v3 receipt it superseded");

    const beforeRepeat = await optOf(PROOF, "beyond");
    const beforeReceiptCount = await prisma.templateAdoptionReceipt.count({ where: { serviceId: s0.id, unitKind: "option", unitKey: `${QKEY}/beyond` } });
    const repeat = run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    ok(/no change matched/.test(repeat), "repeating the SAME adoption after it already landed is a true no-op");
    const afterRepeat = await optOf(PROOF, "beyond");
    ok(afterRepeat.numberAtLeast === beforeRepeat.numberAtLeast, "the repeat wrote nothing to the tree");
    const afterReceiptCount = await prisma.templateAdoptionReceipt.count({ where: { serviceId: s0.id, unitKind: "option", unitKey: `${QKEY}/beyond` } });
    ok(afterReceiptCount === beforeReceiptCount, "and created no new receipt");

    // ── BLOCK B — proof #3: a contractor edit after adoption conflicts ────
    console.log("\n  B. A CONTRACTOR EDIT AFTER ADOPTING v2 MAKES A LATER v3 A CONFLICT — PROOF #3");
    await publishDelta(5, { within: 3 }); // v5 (this fixture's "v2" for the `within` unit)
    run(BASE, ...args(PROOF), "--adopt", `${QKEY}/within`);
    ok((await optOf(PROOF, "within")).numberAtLeast === 3, "within's own v5 adoption landed");
    const withinReceiptBefore = await receiptFor(s0.id, "option", `${QKEY}/within`);

    // The contractor edits it themselves, bypassing this tool entirely.
    await prisma.answerOption.updateMany({ where: { question: { serviceId: s0.id, key: QKEY }, value: "within" }, data: { numberAtLeast: 7 } });

    await publishDelta(6, { within: 10 }); // a further template correction, distinct from both 3 and 7
    await approvePricing(PROOF);
    const beforeConflictPricing = await svcOf(PROOF);
    const statusConflict = run(BASE, ...args(PROOF), "--status");
    ok(/within/.test(statusConflict) && /CONFLICT/.test(statusConflict), "the later correction is reported as a CONFLICT, not silently offered");
    const adoptConflict = run(BASE, ...args(PROOF), "--adopt", `${QKEY}/within`);
    ok(/SKIPPED/.test(adoptConflict) && /Yours is kept/.test(adoptConflict), "adopting it is refused");
    const stillWithin = await optOf(PROOF, "within");
    ok(stillWithin.numberAtLeast === 7, "the contractor's own value (7) is untouched — not the template's 10, not reverted to 3");
    const afterConflictPricing = await svcOf(PROOF);
    ok(afterConflictPricing.materialCostResolved === beforeConflictPricing.materialCostResolved
       && afterConflictPricing.basePrice === beforeConflictPricing.basePrice, "the refusal touched no pricing state");
    const withinReceiptAfter = await receiptFor(s0.id, "option", `${QKEY}/within`);
    ok(withinReceiptAfter?.id === withinReceiptBefore?.id, "the refusal advanced no baseline — still the v5 receipt");

    // ── BLOCK C — proof #4: adopting one unit leaves an unrelated unit's own baseline alone, even within the SAME published version ──
    console.log("\n  C. ONE PUBLISHED VERSION TOUCHES TWO UNITS; ADOPTING ONLY ONE LEAVES THE OTHER'S OWN BASELINE UNTOUCHED — PROOF #4");
    await publishDelta(7, { beyond: 28, within: 12 }); // touches BOTH units at once
    const statusBoth = run(BASE, ...args(PROOF), "--status");
    ok(/beyond/.test(statusBoth) && !/beyond.*CONFLICT|CONFLICT.*beyond/.test(statusBoth), "beyond's change is offered cleanly (its own baseline, v4, still matches live)");
    ok(/within/.test(statusBoth) && /CONFLICT/.test(statusBoth), "within's change is STILL a conflict — completely independent of beyond, in the SAME version");
    run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    ok((await optOf(PROOF, "beyond")).numberAtLeast === 28, "beyond's v7 change was adopted");
    const statusAfterOne = run(BASE, ...args(PROOF), "--status");
    ok(!/\+ question.*beyond|~ option.*beyond/.test(statusAfterOne), "beyond now reports nothing further to adopt");
    ok(/within/.test(statusAfterOne) && /CONFLICT/.test(statusAfterOne), "within's conflict is reported EXACTLY as before — untouched by beyond's own adoption");
    ok((await optOf(PROOF, "within")).numberAtLeast === 7, "within's live value is still the contractor's own, unaffected by adopting beyond");

    // ── BLOCK D — proof #5: a fault between the tree write and the receipt/reset commits nothing ──
    console.log("\n  D. A FAULT BETWEEN THE TREE WRITE AND THE RECEIPT/PRICE-RESET COMMITS NOTHING — PROOF #5");
    await publishDelta(8, { beyond: 33 });
    const beforeFault = await optOf(PROOF, "beyond");
    const beforeFaultReceipt = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
    const beforeFaultPricing = await svcOf(PROOF);
    const fs = await import("node:fs");
    const faulty = "scripts/_verify-adoption-fault.ts";
    let src = fs.readFileSync(BASE, "utf8");
    const marker = "await tx.answerOptionComponent.deleteMany({ where: { answerOptionId: mine.id, canonicalComponentId: { not: null } } });";
    if (!src.includes(marker)) throw new Error("fault-injection marker not found — template-update.ts changed shape");
    src = src.replace(marker, `${marker}\n          throw new Error("INJECTED FAULT — verify-template-adoption-baselines");`);
    fs.writeFileSync(faulty, src);
    const faultResult = runMaybe(faulty, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    fs.unlinkSync(faulty);
    ok(faultResult.code !== 0, "the faulty run exits non-zero");
    ok(/INJECTED FAULT/.test(faultResult.out), "for the injected reason, not some other crash");
    const afterFault = await optOf(PROOF, "beyond");
    ok(afterFault.numberAtLeast === beforeFault.numberAtLeast, "the tree write rolled back completely — beyond is untouched");
    const afterFaultReceipt = await receiptFor(s0.id, "option", `${QKEY}/beyond`);
    ok(afterFaultReceipt?.id === beforeFaultReceipt?.id, "no new receipt was committed");
    const afterFaultPricing = await svcOf(PROOF);
    ok(afterFaultPricing.materialCostResolved === beforeFaultPricing.materialCostResolved
       && afterFaultPricing.basePrice === beforeFaultPricing.basePrice, "the price-reset never committed either");

    // Recover: adopt the same v8 change for real, cleanly, so block E has a stable, current state to book against.
    run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    ok((await optOf(PROOF, "beyond")).numberAtLeast === 33, "the same change adopts cleanly once the fault is gone");

    // ── BLOCK E — proof #6: booking safety across adoption AND correction; fresh install gets the corrected content ──
    console.log("\n  E. AN EXISTING BOOKING'S SNAPSHOT SURVIVES A LATER CORRECTION; A FRESH INSTALL GETS IT — PROOF #6");
    await approvePricing(PROOF);
    const svcForBooking = await svcOf(PROOF);
    const contractorId = (await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF }, select: { id: true } })).id;
    const area = await prisma.serviceArea.create({ data: { contractorId, name: "Proof Area", zipCodes: ["00000"] } });
    const window = await prisma.arrivalWindow.create({ data: { date: new Date("2026-10-01"), startTime: "08:00", endTime: "11:00", serviceAreaId: area.id, capacityTotal: 1 } });
    const customer = await prisma.customer.create({ data: { contractorId, name: "Proof Customer", email: "proof@example.com" } });
    const visit = await prisma.visit.create({ data: { contractorId, sessionId: "adoption-baseline-booked", status: "CHECKED_OUT" } });
    const lineItem = await prisma.lineItem.create({
      data: { visitId: visit.id, serviceId: svcForBooking.id, isPrimary: true,
        answersSnapshot: { concealed_route_feet: "beyond", concealed_route_feet_value: 34 },
        computedPriceCents: 62000, resolvedCrewHours: 3, resolvedCrewCount: 1, resolvedAccessClass: "ACCESSIBLE",
        resolvedComponentKeys: ["RECEPTACLE_STANDARD"], resolvedEconomicBasis: "adoption-baseline-basis",
        resolvedMaterialCostCents: 4500, floorPriceCents: 62000, estimatedMinutes: 180 },
    });
    const booking = await prisma.booking.create({
      data: { visitId: visit.id, customerId: customer.id, address: "1 Proof St", zipCode: "00000",
        arrivalWindowId: window.id, totalCents: 62000, paymentModel: "CARD_ON_FILE_CAPTURE_AFTER_COMPLETION" },
    });
    const lineItemSnapshot = { ...lineItem };
    const bookingSnapshot = { ...booking };

    await publishDelta(9, { beyond: 40 }); // a further, real correction, published AFTER the booking exists
    run(BASE, ...args(PROOF), "--adopt", `${QKEY}/beyond`);
    ok((await optOf(PROOF, "beyond")).numberAtLeast === 40, "the post-booking correction was adopted onto the live tree");

    const lineItemAfter = await prisma.lineItem.findUniqueOrThrow({ where: { id: lineItem.id } });
    ok(JSON.stringify(lineItemAfter.answersSnapshot) === JSON.stringify(lineItemSnapshot.answersSnapshot)
       && lineItemAfter.computedPriceCents === lineItemSnapshot.computedPriceCents
       && lineItemAfter.resolvedEconomicBasis === lineItemSnapshot.resolvedEconomicBasis
       && lineItemAfter.resolvedMaterialCostCents === lineItemSnapshot.resolvedMaterialCostCents,
       "the booked LineItem's snapshot is byte-for-byte unchanged by the adoption");
    const bookingAfter = await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });
    ok(bookingAfter.totalCents === bookingSnapshot.totalCents, "the linked Booking's totalCents is unchanged too");

    await prisma.booking.delete({ where: { id: booking.id } });
    await prisma.lineItem.delete({ where: { id: lineItem.id } });
    await prisma.visit.delete({ where: { id: visit.id } });
    await prisma.customer.delete({ where: { id: customer.id } });
    await prisma.arrivalWindow.delete({ where: { id: window.id } });
    await prisma.serviceArea.delete({ where: { id: area.id } });

    await withThrowaway(prisma, FRESH, "Adoption Baseline Fresh Install", async () => {
      provision(FRESH); // no --version pin: installs the CURRENT composed catalog, v9 folded in
      const freshBeyond = await optOf(FRESH, "beyond");
      ok(freshBeyond.numberAtLeast === 40, `a contractor installing TODAY receives the corrected v9 content (40), not any of the earlier values — got ${freshBeyond.numberAtLeast}`);
    });
  });

  // Clean up every scratch TemplateVersion this run published — global rows, not scoped to the throwaway contractor.
  for (const id of publishedVersions) await prisma.templateVersion.delete({ where: { id } }).catch(() => {});
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
