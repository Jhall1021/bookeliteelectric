/**
 * MATERIAL BASELINE PRICING — batch accept/override/skip of a platform
 * reference cost for a canonical role a contractor has not priced yet.
 *
 * What this proves, against the real database with run-unique fixtures it
 * creates and destroys itself, through the REAL guarded client
 * (`withContractor`) every admin route uses — not a hand-built shortcut:
 *
 *   server-side resolve   accepting a baseline never trusts a client-
 *                         supplied cost; the figure written is read back
 *                         from the exact MaterialBaselineVersion row
 *   tenant isolation      resolving a role for ONE contractor never
 *                         resolves, reads, or writes another's — even for
 *                         the SAME canonical role
 *   mixed batch           accept, override and skip in one pass settle to
 *                         exactly the state each action implies, and a
 *                         skipped role is untouched — no row, no event
 *   race safety           two simultaneous resolutions of the SAME
 *                         never-before-costed role settle to exactly one
 *                         winner, atomically
 *   preservation          resolving one role never touches another
 *                         contractor's cost, another role's cost, or a
 *                         figure already resolved
 *   reference immutability  a NEW baseline version for an ALREADY-accepted
 *                         role changes nothing already written — not the
 *                         cost, not the event, not the pointer
 *   audit trail           every accept/override writes one immutable
 *                         MaterialCostEvent, attributable to the right
 *                         contractor, carrying the exact baseline version
 *                         accepted (or none, for an override)
 *
 *   npx tsx scripts/verify-material-baseline-pricing.ts
 */
import { PrismaClient } from "@prisma/client";
import { withContractor } from "../lib/tenantRoute";
import {
  acceptMaterialBaselineVersion, overrideUnresolvedMaterialCost, latestBaselineVersionsFor,
  recomputeServiceMaterialCost, setContractorMaterialCost,
} from "../lib/materialCost";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-material-baseline";
const SLUG_A = `${SLUG_PREFIX}-${RUN}-a`;
const SLUG_B = `${SLUG_PREFIX}-${RUN}-b`;
const SLUG_C = `${SLUG_PREFIX}-${RUN}-c`;
const SLUG_D = `${SLUG_PREFIX}-${RUN}-d`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function removeContractor(slug: string) {
  const c = await raw.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  await raw.materialCostEvent.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractorMaterial.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}
async function teardown() {
  for (const s of [SLUG_A, SLUG_B, SLUG_C, SLUG_D]) await removeContractor(s);
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: { in: [SLUG_A, SLUG_B, SLUG_C, SLUG_D] } }, createdAt: { lt: cutoff } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

/** A minimal, real Service+ServiceMaterial referencing a canonical role — the same shape verify-pricing-strategy.ts uses, not a hand-invented one. */
async function serviceUsing(contractorId: string, slug: string, canonicalMaterialId: string, quantity = 10) {
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });
  const svc = await raw.service.create({
    data: {
      contractorId, categoryId: cat.id, slug, name: slug, bookingType: "INSTANT", photoState: "NONE",
      materials: { create: [{ canonicalMaterialId, quantity, order: 0 }] },
    },
    select: { id: true },
  });
  // The SAME recompute production uses to first discover a role is
  // unresolved — not a hand-set flag.
  await recomputeServiceMaterialCost(raw, svc.id);
  return svc.id;
}

async function stateOf(serviceId: string) {
  return raw.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: { materialCostResolved: true, unresolvedMaterialKeys: true, materialCostCents: true },
  });
}

async function main() {
  console.log(`\nMATERIAL BASELINE PRICING — batch accept, override, skip, and every guard around them\n`);
  await teardown();
  await sweepStale();

  const [wire122, gfci, bathFan] = await Promise.all([
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "GFCI_WEATHER_RESISTANT" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "BATH_FAN_STANDARD" }, select: { id: true } }),
  ]);
  const wire122Baseline = await raw.materialBaselineVersion.findFirstOrThrow({
    where: { canonicalMaterialId: wire122.id }, orderBy: { sourcedAt: "desc" },
  });
  ok(`0. the seeded WIRE_12_2 baseline exists and is what this run resolves against`, !!wire122Baseline.id);
  ok(`   BATH_FAN_STANDARD has no baseline offered — proves the override-only path`,
    (await raw.materialBaselineVersion.count({ where: { canonicalMaterialId: bathFan.id } })) === 0);

  const a = await raw.contractor.create({ data: { slug: SLUG_A, name: "Baseline Probe A", active: false }, select: { id: true } });
  const b = await raw.contractor.create({ data: { slug: SLUG_B, name: "Baseline Probe B", active: false }, select: { id: true } });
  const c = await raw.contractor.create({ data: { slug: SLUG_C, name: "Baseline Probe C", active: false }, select: { id: true } });

  const aWireService = await serviceUsing(a.id, "a-wire-service", wire122.id);
  const aGfciService = await serviceUsing(a.id, "a-gfci-service", gfci.id);
  const aFanService = await serviceUsing(a.id, "a-fan-service", bathFan.id);
  const bWireService = await serviceUsing(b.id, "b-wire-service", wire122.id);
  const cRaceService = await serviceUsing(c.id, "c-race-service", wire122.id);

  ok(`1. both A's and B's WIRE_12_2 services start unresolved`,
    !(await stateOf(aWireService)).materialCostResolved && !(await stateOf(bWireService)).materialCostResolved);

  // ── 2. server-side resolution — no client-supplied cost is trusted ─────
  const accepted = await withContractor(a.id, "admin-session", (db) =>
    acceptMaterialBaselineVersion(db, { contractorId: a.id, baselineVersionId: wire122Baseline.id }, { reason: "test accept", actor: "verifier" })
  );
  ok(`2. accepting a baseline succeeds and returns the version's OWN cost, not anything supplied`,
    accepted.ok && accepted.unitCostCents === wire122Baseline.unitCostCents);

  const aState = await stateOf(aWireService);
  ok(`   A's service is now resolved, at exactly the baseline's cost`,
    aState.materialCostResolved && aState.materialCostCents === wire122Baseline.unitCostCents * 10);

  const aMaterial = await raw.contractorMaterial.findUniqueOrThrow({
    where: { contractorId_canonicalMaterialId: { contractorId: a.id, canonicalMaterialId: wire122.id } },
    select: { costSource: true, costConfidence: true, acceptedBaselineVersionId: true, unitCostCents: true },
  });
  ok(`   costSource is BASELINE, confidence is ASSUMED — a reference, not a confirmed invoice`,
    aMaterial.costSource === "BASELINE" && aMaterial.costConfidence === "ASSUMED");
  ok(`   acceptedBaselineVersionId points at the EXACT version accepted`,
    aMaterial.acceptedBaselineVersionId === wire122Baseline.id);

  // ── 3. tenant isolation ──────────────────────────────────────────────
  const bStateAfterAAccepted = await stateOf(bWireService);
  ok(`3. B's WIRE_12_2 service is UNTOUCHED by A's accept — still unresolved`, !bStateAfterAAccepted.materialCostResolved);
  const bScopedSeesA = await withContractor(b.id, "admin-session", (db) =>
    db.contractorMaterial.findFirst({ where: { canonicalMaterialId: wire122.id } })
  );
  ok(`   B's own tenant context cannot see A's newly created ContractorMaterial row at all`, bScopedSeesA === null);

  // ── 4. override, on B — mixed batch: one accepts, one overrides ────────
  const overridden = await withContractor(b.id, "admin-session", (db) =>
    overrideUnresolvedMaterialCost(db, { contractorId: b.id, canonicalMaterialId: wire122.id, unitCostCents: 80 }, { reason: "test override", actor: "verifier" })
  );
  ok(`4. B overrides the SAME role with their own figure instead of the baseline`, overridden.ok && overridden.unitCostCents === 80);
  const bMaterial = await raw.contractorMaterial.findUniqueOrThrow({
    where: { contractorId_canonicalMaterialId: { contractorId: b.id, canonicalMaterialId: wire122.id } },
    select: { costSource: true, acceptedBaselineVersionId: true, unitCostCents: true },
  });
  ok(`   B's row is CUSTOM with no baseline pointer, and A's cost is unaffected by it`,
    bMaterial.costSource === "CUSTOM" && bMaterial.acceptedBaselineVersionId === null && bMaterial.unitCostCents === 80
      && (await raw.contractorMaterial.findUniqueOrThrow({ where: { contractorId_canonicalMaterialId: { contractorId: a.id, canonicalMaterialId: wire122.id } }, select: { unitCostCents: true } })).unitCostCents === wire122Baseline.unitCostCents);

  // ── 5. override on a role with NO baseline offered at all ──────────────
  const noBaselineOffered = (await latestBaselineVersionsFor(raw, [bathFan.id])).size === 0;
  ok(`5. BATH_FAN_STANDARD genuinely has no baseline offered`, noBaselineOffered);
  const fanOverride = await withContractor(a.id, "admin-session", (db) =>
    overrideUnresolvedMaterialCost(db, { contractorId: a.id, canonicalMaterialId: bathFan.id, unitCostCents: 4200 }, { reason: "no baseline offered", actor: "verifier" })
  );
  ok(`   it still resolves fine through the override path`, fanOverride.ok);
  ok(`   ...A's fan service is now resolved`, (await stateOf(aFanService)).materialCostResolved);

  // ── 6. skip — A's GFCI role, never acted on, stays exactly unresolved ──
  const aGfciState = await stateOf(aGfciService);
  ok(`6. a role nobody acted on (skip) stays unresolved — no row, no event`,
    !aGfciState.materialCostResolved &&
    (await raw.contractorMaterial.findUnique({ where: { contractorId_canonicalMaterialId: { contractorId: a.id, canonicalMaterialId: gfci.id } } })) === null);

  // ── 7. already-resolved refusal — preserves the existing cost ──────────
  const reaccept = await withContractor(a.id, "admin-session", (db) =>
    acceptMaterialBaselineVersion(db, { contractorId: a.id, baselineVersionId: wire122Baseline.id }, { reason: "duplicate accept", actor: "verifier" })
  );
  ok(`7. accepting an already-resolved role is refused ALREADY_RESOLVED`, !reaccept.ok && !("code" in reaccept ? reaccept.code !== "ALREADY_RESOLVED" : true));
  const aMaterialUnchanged = await raw.contractorMaterial.findUniqueOrThrow({
    where: { contractorId_canonicalMaterialId: { contractorId: a.id, canonicalMaterialId: wire122.id } }, select: { unitCostCents: true, updatedAt: true },
  });
  ok(`   ...and A's already-resolved cost is exactly preserved`, aMaterialUnchanged.unitCostCents === wire122Baseline.unitCostCents);

  // ── 8. a garbage baseline id is refused, nothing written ────────────────
  const garbage = await withContractor(c.id, "admin-session", (db) =>
    acceptMaterialBaselineVersion(db, { contractorId: c.id, baselineVersionId: "not-a-real-id" }, { reason: "garbage", actor: "verifier" })
  );
  ok(`8. an unknown baselineVersionId is refused BASELINE_NOT_FOUND`, !garbage.ok && "code" in garbage && garbage.code === "BASELINE_NOT_FOUND");
  ok(`   ...and created no ContractorMaterial row for C`,
    (await raw.contractorMaterial.count({ where: { contractorId: c.id } })) === 0);

  // ── 9. race: two simultaneous resolutions of ONE never-before-costed role ─
  const [raceAccept, raceOverride] = await Promise.all([
    withContractor(c.id, "admin-session", (db) =>
      acceptMaterialBaselineVersion(db, { contractorId: c.id, baselineVersionId: wire122Baseline.id }, { reason: "race - accept", actor: "verifier" })),
    withContractor(c.id, "admin-session", (db) =>
      overrideUnresolvedMaterialCost(db, { contractorId: c.id, canonicalMaterialId: wire122.id, unitCostCents: 99 }, { reason: "race - override", actor: "verifier" })),
  ]);
  const raceWinners = [raceAccept, raceOverride].filter((r) => r.ok);
  ok(`9. two simultaneous resolutions of the same role settle to EXACTLY ONE winner`, raceWinners.length === 1,
    JSON.stringify([raceAccept, raceOverride]));
  const cMaterialCount = await raw.contractorMaterial.count({ where: { contractorId: c.id, canonicalMaterialId: wire122.id } });
  ok(`   ...and exactly one ContractorMaterial row exists for it, never two`, cMaterialCount === 1);
  ok(`   ...and C's race service is resolved either way`, (await stateOf(cRaceService)).materialCostResolved);

  // ── 10. immutable acceptance history ────────────────────────────────────
  const aAcceptEvent = await raw.materialCostEvent.findFirstOrThrow({
    where: { contractorMaterial: { contractorId: a.id, canonicalMaterialId: wire122.id } },
    select: { contractorId: true, source: true, baselineVersionId: true, newUnitCostCents: true },
  });
  ok(`10. the accept wrote one immutable MaterialCostEvent, attributed to A`, aAcceptEvent.contractorId === a.id);
  ok(`    ...recording it came from BASELINE, pointing at the EXACT version accepted`,
    aAcceptEvent.source === "BASELINE" && aAcceptEvent.baselineVersionId === wire122Baseline.id);

  // ── 11. reference immutability — a NEW version never rewrites what A already accepted ─
  const newerVersion = await raw.materialBaselineVersion.create({
    data: {
      canonicalMaterialId: wire122.id, unitCostCents: wire122Baseline.unitCostCents + 500, unit: "ft",
      sourceLabel: "verifier — simulated later price rise", specNote: "test fixture, deleted at teardown",
      sourcedAt: new Date(),
    },
  });
  const aMaterialAfterNewVersion = await raw.contractorMaterial.findUniqueOrThrow({
    where: { contractorId_canonicalMaterialId: { contractorId: a.id, canonicalMaterialId: wire122.id } },
    select: { unitCostCents: true, acceptedBaselineVersionId: true },
  });
  ok(`11. a NEW baseline version changes nothing already accepted — cost is exactly the same`,
    aMaterialAfterNewVersion.unitCostCents === wire122Baseline.unitCostCents);
  ok(`    ...and still points at the OLD version, not the new one`,
    aMaterialAfterNewVersion.acceptedBaselineVersionId === wire122Baseline.id);
  const aAcceptEventAfterNewVersion = await raw.materialCostEvent.findFirstOrThrow({
    where: { contractorMaterial: { contractorId: a.id, canonicalMaterialId: wire122.id } },
    select: { baselineVersionId: true },
  });
  ok(`    ...and the ORIGINAL event's pointer is unchanged too — permanent history, not a live reference`,
    aAcceptEventAfterNewVersion.baselineVersionId === wire122Baseline.id);
  ok(`    ...and the offer for anyone NOT yet resolved is now the newer, later-sourced version`,
    (await latestBaselineVersionsFor(raw, [wire122.id])).get(wire122.id)?.id === newerVersion.id);
  await raw.materialBaselineVersion.delete({ where: { id: newerVersion.id } });

  // ── 12. editing an ACCEPTED baseline through the ordinary CUSTOM path ──
  // ContractorMaterial.acceptedBaselineVersionId's own doc comment promises
  // this: "an override to CUSTOM clears it ... an already-resolved role is
  // edited through the ordinary CUSTOM path, same as any other cost edit
  // today." setContractorMaterialCost didn't keep that promise — it left
  // costSource and the pointer untouched on an ordinary edit, so a BASELINE
  // row edited by hand kept reporting BASELINE provenance forever.
  const aMaterialForEdit = await raw.contractorMaterial.findUniqueOrThrow({
    where: { contractorId_canonicalMaterialId: { contractorId: a.id, canonicalMaterialId: wire122.id } },
    select: { id: true, costSource: true, acceptedBaselineVersionId: true },
  });
  ok(`12. A's wire material is still BASELINE-sourced, going into this edit`,
    aMaterialForEdit.costSource === "BASELINE" && aMaterialForEdit.acceptedBaselineVersionId === wire122Baseline.id);
  await withContractor(a.id, "admin-session", (db) =>
    setContractorMaterialCost(db, { contractorMaterialId: aMaterialForEdit.id, unitCostCents: 91 }, { reason: "ordinary edit of a baseline-sourced cost", actor: "verifier" })
  );
  const aMaterialAfterEdit = await raw.contractorMaterial.findUniqueOrThrow({
    where: { id: aMaterialForEdit.id },
    select: { costSource: true, acceptedBaselineVersionId: true, unitCostCents: true },
  });
  ok(`    ...the ordinary edit path transitions it to CUSTOM`, aMaterialAfterEdit.costSource === "CUSTOM");
  ok(`    ...and clears the baseline pointer — it is this contractor's own figure now`,
    aMaterialAfterEdit.acceptedBaselineVersionId === null && aMaterialAfterEdit.unitCostCents === 91);
  const editEvent = await raw.materialCostEvent.findFirstOrThrow({
    where: { contractorMaterialId: aMaterialForEdit.id }, orderBy: { createdAt: "desc" },
    select: { source: true, newUnitCostCents: true },
  });
  ok(`    ...and the event records CUSTOM provenance for the transition, not the source it left`,
    editEvent.source === "CUSTOM" && editEvent.newUnitCostCents === 91);

  // ── 13-18. ATOMICITY — a fault between create, recompute and event write
  // must roll back the whole resolution, for both the accept path and the
  // override path, at both points in the sequence. ─────────────────────────
  const d = await raw.contractor.create({ data: { slug: SLUG_D, name: "Baseline Probe D — atomicity", active: false }, select: { id: true } });
  const dWireService = await serviceUsing(d.id, "d-wire-service", wire122.id);
  const dFanService = await serviceUsing(d.id, "d-fan-service", bathFan.id);

  let acceptFaultAfterCreate: unknown = null;
  try {
    await withContractor(d.id, "admin-session", (db) =>
      acceptMaterialBaselineVersion(
        db, { contractorId: d.id, baselineVersionId: wire122Baseline.id },
        { reason: "atomicity - accept after create", actor: "verifier" },
        { afterCreate: async () => { throw new Error("injected fault — accept after create"); } }
      )
    );
  } catch (e) { acceptFaultAfterCreate = e; }
  ok(`13. accept: an injected fault right after create propagates`,
    acceptFaultAfterCreate instanceof Error && /injected fault/.test((acceptFaultAfterCreate as Error).message));
  ok(`    ...the create rolled back — no ContractorMaterial row exists at all`,
    (await raw.contractorMaterial.findUnique({ where: { contractorId_canonicalMaterialId: { contractorId: d.id, canonicalMaterialId: wire122.id } } })) === null);
  ok(`    ...no MaterialCostEvent either`, (await raw.materialCostEvent.count({ where: { contractorId: d.id } })) === 0);
  ok(`    ...and D's service is still unresolved — the recompute never ran`, !(await stateOf(dWireService)).materialCostResolved);

  let acceptFaultAfterRecompute: unknown = null;
  try {
    await withContractor(d.id, "admin-session", (db) =>
      acceptMaterialBaselineVersion(
        db, { contractorId: d.id, baselineVersionId: wire122Baseline.id },
        { reason: "atomicity - accept after recompute", actor: "verifier" },
        { afterRecompute: async () => { throw new Error("injected fault — accept after recompute"); } }
      )
    );
  } catch (e) { acceptFaultAfterRecompute = e; }
  ok(`14. accept: an injected fault right after the recompute cascade propagates`,
    acceptFaultAfterRecompute instanceof Error && /injected fault/.test((acceptFaultAfterRecompute as Error).message));
  ok(`    ...the create AND the recompute both rolled back — still no ContractorMaterial row`,
    (await raw.contractorMaterial.findUnique({ where: { contractorId_canonicalMaterialId: { contractorId: d.id, canonicalMaterialId: wire122.id } } })) === null);
  ok(`    ...D's service is STILL unresolved — the recompute's write never survived`, !(await stateOf(dWireService)).materialCostResolved);
  ok(`    ...and still no event`, (await raw.materialCostEvent.count({ where: { contractorId: d.id } })) === 0);

  const acceptRetry = await withContractor(d.id, "admin-session", (db) =>
    acceptMaterialBaselineVersion(db, { contractorId: d.id, baselineVersionId: wire122Baseline.id }, { reason: "atomicity - retry after faults", actor: "verifier" })
  );
  ok(`15. a real retry after both injected failures succeeds normally — no phantom ALREADY_RESOLVED`, acceptRetry.ok);
  ok(`    ...D's wire service is now genuinely resolved`, (await stateOf(dWireService)).materialCostResolved);

  let overrideFaultAfterCreate: unknown = null;
  try {
    await withContractor(d.id, "admin-session", (db) =>
      overrideUnresolvedMaterialCost(
        db, { contractorId: d.id, canonicalMaterialId: bathFan.id, unitCostCents: 5555 },
        { reason: "atomicity - override after create", actor: "verifier" },
        { afterCreate: async () => { throw new Error("injected fault — override after create"); } }
      )
    );
  } catch (e) { overrideFaultAfterCreate = e; }
  ok(`16. override: an injected fault right after create propagates`,
    overrideFaultAfterCreate instanceof Error && /injected fault/.test((overrideFaultAfterCreate as Error).message));
  ok(`    ...and rolled back — no row at all`,
    (await raw.contractorMaterial.findUnique({ where: { contractorId_canonicalMaterialId: { contractorId: d.id, canonicalMaterialId: bathFan.id } } })) === null);
  ok(`    ...D's fan service is still unresolved`, !(await stateOf(dFanService)).materialCostResolved);

  let overrideFaultAfterRecompute: unknown = null;
  try {
    await withContractor(d.id, "admin-session", (db) =>
      overrideUnresolvedMaterialCost(
        db, { contractorId: d.id, canonicalMaterialId: bathFan.id, unitCostCents: 5555 },
        { reason: "atomicity - override after recompute", actor: "verifier" },
        { afterRecompute: async () => { throw new Error("injected fault — override after recompute"); } }
      )
    );
  } catch (e) { overrideFaultAfterRecompute = e; }
  ok(`17. override: an injected fault right after the recompute cascade propagates`,
    overrideFaultAfterRecompute instanceof Error && /injected fault/.test((overrideFaultAfterRecompute as Error).message));
  ok(`    ...still rolled back completely — no row`,
    (await raw.contractorMaterial.findUnique({ where: { contractorId_canonicalMaterialId: { contractorId: d.id, canonicalMaterialId: bathFan.id } } })) === null);
  ok(`    ...and D's fan service is still unresolved`, !(await stateOf(dFanService)).materialCostResolved);

  const overrideRetry = await withContractor(d.id, "admin-session", (db) =>
    overrideUnresolvedMaterialCost(db, { contractorId: d.id, canonicalMaterialId: bathFan.id, unitCostCents: 5555 }, { reason: "atomicity - retry after faults", actor: "verifier" })
  );
  ok(`18. a real retry after both injected failures succeeds normally`, overrideRetry.ok && overrideRetry.unitCostCents === 5555);
  ok(`    ...D's fan service is now genuinely resolved`, (await stateOf(dFanService)).materialCostResolved);

  console.log(`\n  cleanup, then done\n`);
  await teardown();
  const residue = await raw.contractor.count({ where: { slug: { in: [SLUG_A, SLUG_B, SLUG_C, SLUG_D] } } });
  ok(`19. every fixture is gone at the end`, residue === 0);
  await raw.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
