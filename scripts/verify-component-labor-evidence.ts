/**
 * Labor evidence: disagreement survives, applicability is honoured, and
 * "nobody measured this" never prices as "this is free".
 *
 * Two facts forced this model. A surface-raceway flat elbow is 0.11 manhours
 * in one Wiremold family and 0.40 in a metal one — same canonical component,
 * four-fold apart, because the product differs. And NM 2/C #14 is 0.030 mh/ft
 * in the NECA MLU and 0.006 in the 2026 National Electrical Estimator — two
 * CURRENT references, five-fold apart, for the identical cable.
 *
 * A single `referenceLaborHours` column would have had to pick one, and
 * picking would have been an invention. So the evidence is kept whole and the
 * derived value is allowed to be absent.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { eliteService } from "../prisma/_serviceTargets";
import { ROUTING_V2_COMPONENTS } from "../prisma/seed-routing-v2-components";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function main() {
  console.log("\nCOMPONENT LABOR EVIDENCE\n");

  console.log("  A  DISAGREEMENT SURVIVES INGESTION\n");
  const concealed = await prisma.canonicalComponent.findUniqueOrThrow({
    where: { key: "CONCEALED_ROUTE_FT" },
    include: { laborEvidence: true },
  });
  const vals = concealed.laborEvidence.map((e) => e.normalizedLabor).sort();
  ok(concealed.laborEvidence.length >= 2,
    `A  CONCEALED_ROUTE_FT keeps ${concealed.laborEvidence.length} observations, not one`);
  ok(new Set(vals).size >= 2, "A  …and they genuinely disagree", JSON.stringify(vals));
  ok(vals.includes(0.03) && vals.includes(0.006),
    "A  both published figures are present verbatim — 0.030 and 0.006 mh/ft", JSON.stringify(vals));
  ok(concealed.referenceLaborStatus === "DISPUTED",
    "A  the component is DISPUTED", concealed.referenceLaborStatus);
  ok(concealed.referenceLaborHours === null,
    "A  …and carries NO derived value — no midpoint was invented",
    String(concealed.referenceLaborHours));
  const mid = (0.03 + 0.006) / 2;
  ok(concealed.referenceLaborHours !== mid, `A  specifically not the mean (${mid})`);

  console.log("\n  B  FAMILY-SPECIFIC EVIDENCE CANNOT PASS AS UNIVERSAL\n");
  const inside = await prisma.canonicalComponent.findUniqueOrThrow({
    where: { key: "SURFACE_ROUTE_INSIDE_CORNER" }, include: { laborEvidence: true } });
  ok(inside.laborEvidence.every((e) => e.materialSystem !== null),
    "B  every surface-raceway observation names the product family it applies to",
    JSON.stringify(inside.laborEvidence.map((e) => [e.observationId, e.materialSystem])));
  const families = new Set(inside.laborEvidence.map((e) => e.materialSystem));
  ok(families.size >= 2, `B  more than one family is represented (${[...families].join(", ")})`);
  const spread = inside.laborEvidence.map((e) => e.normalizedLabor);
  ok(Math.max(...spread) / Math.min(...spread) >= 3,
    "B  …and they differ by more than 3x, which is why no single value is stored",
    JSON.stringify(spread));
  ok(inside.referenceLaborHours === null && inside.referenceLaborStatus === "DISPUTED",
    "B  so the component stays DISPUTED with no derived value");

  console.log("\n  C  A REFUSAL TO QUANTIFY IS RECORDED AS ONE\n");
  const core = await prisma.canonicalComponent.findUniqueOrThrow({
    where: { key: "OUTLET_EXTENSION_CORE" }, include: { laborEvidence: true } });
  const blocked = core.laborEvidence.filter((e) => e.scopeMatch === "SCOPE_BLOCKED");
  ok(blocked.length === 1, "C  the unquantified old-work opening is present as SCOPE_BLOCKED");
  ok(/estimate separately/i.test(blocked[0]?.publishedValue ?? ""),
    "C  …carrying the reference's own words", blocked[0]?.publishedValue ?? "");
  ok(blocked[0]?.confidence === "NONE",
    "C  …and confidence NONE, so its 0 is not read as a measurement");
  ok(core.referenceLaborStatus === "PARTIAL" && core.referenceLaborHours === null,
    "C  the component is PARTIAL with no derived value — box + device are published, the opening is not");

  console.log("\n  D  UNKNOWN CONTRACTOR LABOR IS NOT ZERO\n");
  const nulls = await prisma.contractorComponent.count({ where: { addFieldLaborHours: null } });
  const zeros = await prisma.contractorComponent.count({ where: { addFieldLaborHours: 0 } });
  const pos = await prisma.contractorComponent.count({ where: { addFieldLaborHours: { gt: 0 } } });
  ok(nulls > 0 && zeros > 0,
    `D  both states exist in real data — ${nulls} null (never established), ${zeros} explicit zero (deliberate)`);
  ok(pos > 0, `D  …alongside ${pos} calibrated rows`);

  // The deliberate zeros are deliberate in their SOURCE, not merely in the data.
  const deliberate = await prisma.contractorComponent.findMany({
    where: { addFieldLaborHours: 0 },
    select: { canonicalComponent: { select: { key: true } } } });
  const seeds = ["prisma/seed-dedicated-circuit.ts", "prisma/seed-lighting-control.ts",
                 "prisma/seed-exterior-gfci-routing.ts", "prisma/seed-new-outlet.ts"]
    .map((f) => readFileSync(f, "utf8")).join("\n");
  const declared = deliberate.filter((d) =>
    new RegExp(`key: "${d.canonicalComponent.key}"[\\s\\S]{0,400}?addFieldLaborHours: 0`).test(seeds));
  ok(declared.length === deliberate.length,
    `D  every remaining zero is declared as zero IN ITS SEED (${declared.length}/${deliberate.length})`,
    deliberate.filter((d) => !declared.includes(d)).map((d) => d.canonicalComponent.key).join(", "));

  const v2Keys = ROUTING_V2_COMPONENTS.map((c) => c.key);
  const v2Rows = await prisma.contractorComponent.findMany({
    where: { canonicalComponent: { key: { in: v2Keys } } },
    select: { addFieldLaborHours: true, canonicalComponent: { select: { key: true } } } });
  ok(v2Rows.every((r) => r.addFieldLaborHours === null),
    "D  every Routing V2 component reads null — their seeds never mentioned labor",
    JSON.stringify(v2Rows.filter((r) => r.addFieldLaborHours !== null).map((r) => r.canonicalComponent.key)));

  console.log("\n  E  AN UNESTABLISHED COMPONENT CANNOT BECOME PRICEABLE\n");
  const svc = await eliteService(prisma, "new-120v-outlet");
  const loaded = await loadServiceForResolution(prisma, svc.id);
  if (!loaded) throw new Error("outlet not loadable");
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const r = resolveRoute(loaded, {
    outlet_load_type: "everyday", outlet_power_source: "tap_existing",
    below_above_access: "has_access", accessible_route_feet: "18",
  }, true, settings) as any;
  ok(r.status === "REVIEW", "E  the route reviews rather than pricing", String(r.status));
  ok(r.config?.awaitingComponentLabor === true,
    "E  …with awaitingComponentLabor set", String(r.config?.awaitingComponentLabor));
  ok(/established labor/i.test(String(r.reason ?? "")),
    "E  …and the reason names the missing LABOR, not a downstream symptom", String(r.reason));
  ok((r.config?.components ?? []).length > 0,
    "E  while the physical recipe is still built in full — routing succeeded, pricing waited");
  // The SERVICE's own base labor is a separate, established figure and still
  // counts. What must be zero is the COMPONENT contribution — measured as the
  // difference, so this cannot pass by the service happening to be zero too.
  const svcRow = await prisma.service.findUniqueOrThrow({
    where: { id: svc.id }, select: { fieldLaborHours: true } });
  const componentHours = (r.config?.fieldLaborHours ?? 0) - (svcRow.fieldLaborHours ?? 0);
  ok(componentHours === 0,
    "E  and the unestablished components contributed 0 hours — the service's own labor is untouched",
    `total ${r.config?.fieldLaborHours} - service ${svcRow.fieldLaborHours} = ${componentHours}`);
  ok((svcRow.fieldLaborHours ?? 0) > 0,
    "E  …and that difference is meaningful because the service DOES carry base labor",
    String(svcRow.fieldLaborHours));

  console.log("\n  F  RE-INGESTION IS IDEMPOTENT, NOT DESTRUCTIVE\n");
  const before = await prisma.componentLaborEvidence.count();
  const { seedComponentLaborEvidence } = await import("../prisma/seed-component-labor-evidence");
  await seedComponentLaborEvidence(prisma);
  const after = await prisma.componentLaborEvidence.count();
  ok(before === after, `F  re-running the seed neither duplicates nor loses rows (${before} -> ${after})`);
  const stillBoth = await prisma.componentLaborEvidence.findMany({
    where: { canonicalComponent: { key: "CONCEALED_ROUTE_FT" } }, select: { normalizedLabor: true } });
  ok(new Set(stillBoth.map((e) => e.normalizedLabor)).size >= 2,
    "F  …and the disagreement is still there afterwards",
    JSON.stringify(stillBoth.map((e) => e.normalizedLabor)));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
