/** Offline contract test for the labor coverage ledger. No database or network. */
import { buildLaborCoverageLedger, renderLaborCoverageMarkdown, type AuditTask, type LaborComponent, type LaborService } from "../lib/laborCoverage";

let pass = 0;
const ok = (label: string, condition: boolean, detail = "") => {
  if (!condition) throw new Error(`${label}${detail ? ` — ${detail}` : ""}`);
  pass++;
  console.log(`  ✓ ${label}`);
};

const component = (overrides: Partial<LaborComponent> = {}): LaborComponent => ({
  key: "ROUTE_FT",
  name: "Accessible route per foot",
  referenceLaborHours: 0.03,
  referenceLaborUnit: "ft",
  referenceLaborStatus: "VERIFIED",
  evidenceCount: 2,
  contractorLaborHours: 0.025,
  contractorComponentPresent: true,
  contractorComponentActive: true,
  ...overrides,
});

const atomic: LaborService = {
  slug: "replace-device", name: "Replace device", tradeKey: "electrical",
  active: true, offered: true, bookingType: "INSTANT", pricingMethod: "LEGACY_PUBLISHED",
  fieldLaborHours: 0.4, questions: [],
};

const routed: LaborService = {
  slug: "new-device", name: "New device", tradeKey: "electrical",
  active: true, offered: true, bookingType: "ADJUSTED", pricingMethod: "DERIVED_RESOLVED_SCOPE",
  fieldLaborHours: 0.5,
  questions: [
    {
      id: "q-access", key: "access", inputType: "SINGLE_SELECT", order: 1,
      numberMin: null, numberMax: null,
      options: [
        { id: "a-open", value: "open", routeAction: "CONTINUE", nextQuestionId: "q-feet", photosBlockBooking: true,
          overrideFieldLaborHours: null, addFieldLaborHours: null, accessClassification: "ACCESSIBLE", accessSlot: "PRIMARY", components: [] },
        { id: "a-finished", value: "finished", routeAction: "CONTINUE", nextQuestionId: "q-feet", photosBlockBooking: true,
          overrideFieldLaborHours: null, addFieldLaborHours: null, accessClassification: "FINISHED", accessSlot: "PRIMARY", components: [] },
      ],
    },
    {
      id: "q-feet", key: "feet", inputType: "NUMBER", order: 2,
      numberMin: 1, numberMax: 100,
      options: [
        {
          id: "a-done", value: "10", routeAction: "RESOLVE_ADJUSTED", nextQuestionId: null, photosBlockBooking: true,
          overrideFieldLaborHours: null, addFieldLaborHours: null, accessClassification: null, accessSlot: "PRIMARY",
          components: [
            { component: component(), quantity: 1, quantityAnswerKey: "feet", conditionAnswerKey: null, conditionAnswerValue: null,
              conditionAccessClass: "ACCESSIBLE", conditionAccessSlot: "PRIMARY" },
            { component: component({ key: "DRYWALL_ACCESS", name: "Drywall access", referenceLaborHours: null,
                referenceLaborUnit: null, referenceLaborStatus: "NONE", evidenceCount: 0, contractorLaborHours: null }),
              quantity: 1, quantityAnswerKey: null, conditionAnswerKey: null, conditionAnswerValue: null,
              conditionAccessClass: "FINISHED", conditionAccessSlot: "PRIMARY" },
          ],
        },
      ],
    },
  ],
};

const audit: AuditTask[] = [
  { taskRowId: "SVC:replace-device", identifier: "replace-device", name: "Replace device", kind: "service",
    classification: "A", atomicity: "ATOMIC-ENOUGH WHOLE SERVICE", evidenceStatus: "VERIFIED — PUBLISHED TASK EVIDENCE",
    confidence: "HIGH", publishedObservations: "0.4 hr", observationIds: "O1", scopeDifferences: "" },
  { taskRowId: "SVC:new-device", identifier: "new-device", name: "New device", kind: "service",
    classification: "G", atomicity: "COMPOSITE SERVICE", evidenceStatus: "UNVERIFIED", confidence: "UNVERIFIED",
    publishedObservations: "", observationIds: "", scopeDifferences: "requires decomposition" },
  { taskRowId: "CMP:ROUTE_FT", identifier: "ROUTE_FT", name: "Accessible route per foot", kind: "component",
    classification: "A", atomicity: "ATOMIC COMPONENT", evidenceStatus: "VERIFIED", confidence: "HIGH",
    publishedObservations: "0.03 hr/ft", observationIds: "O2; O3", scopeDifferences: "" },
];

const ledger = buildLaborCoverageLedger({
  contractorSlug: "fixture", trade: "electrical",
  services: [atomic, routed], canonicalComponents: [component(), component({ key: "DRYWALL_ACCESS", name: "Drywall access",
    referenceLaborHours: null, referenceLaborUnit: null, referenceLaborStatus: "NONE", evidenceCount: 0, contractorLaborHours: null })],
}, audit, 3, "2026-09-18T00:00:00.000Z");

console.log("\nLABOR COVERAGE LEDGER CONTRACT");
ok("1. every terminal path is examined", ledger.summary.pathsExamined === 3, String(ledger.summary.pathsExamined));
ok("2. equivalent route facts aggregate without dropping their path count",
  ledger.routes.filter((r) => r.serviceSlug === "new-device").reduce((n, r) => n + r.pathCount, 0) === 2);
const atomicRoute = ledger.routes.find((r) => r.serviceSlug === "replace-device")!;
ok("3. an evidenced atomic whole-service task can be structurally clean", atomicRoute.issues.length === 0, JSON.stringify(atomicRoute.issues));
const accessible = ledger.routes.find((r) => r.serviceSlug === "new-device" && r.sampleAnswers[0].access === "open")!;
ok("4. access conditions select only the accessible component", accessible.operations.some((o) => o.key === "ROUTE_FT") && !accessible.operations.some((o) => o.key === "DRYWALL_ACCESS"));
ok("5. a bounded number question provides a resolvable dynamic quantity",
  !accessible.issues.some((i) => i.code === "UNRESOLVED_QUANTITY_SOURCE" || i.code === "UNBOUNDED_QUANTITY_SOURCE"));
const finished = ledger.routes.find((r) => r.serviceSlug === "new-device" && r.sampleAnswers[0].access === "finished")!;
ok("6. finished access selects the drywall operation instead", finished.operations.some((o) => o.key === "DRYWALL_ACCESS") && !finished.operations.some((o) => o.key === "ROUTE_FT"));
ok("7. missing contractor component labor is reported", finished.issues.some((i) => i.code === "MISSING_COMPONENT_LABOR"));
ok("8. missing component evidence is independently reported", finished.issues.some((i) => i.code === "MISSING_COMPONENT_EVIDENCE"));
ok("9. a composite service base is reported as bundled on every priceable outcome",
  ledger.routes.filter((r) => r.serviceSlug === "new-device").every((r) => r.issues.some((i) => i.code === "BUNDLED_COMPOSITE_BASE")));
const markdown = renderLaborCoverageMarkdown(ledger);
ok("10. the human report contains summary, operation, and route sections",
  markdown.includes("## Summary") && markdown.includes("## Operations needing work") && markdown.includes("## Route groups with issues"));

const broken = structuredClone(routed);
broken.questions[1].numberMax = null;
const brokenLedger = buildLaborCoverageLedger({ contractorSlug: "fixture", trade: "electrical", services: [broken], canonicalComponents: [component()] }, audit, 3);
ok("11. an unbounded quantity source fails coverage explicitly",
  brokenLedger.routes.some((r) => r.issues.some((i) => i.code === "UNBOUNDED_QUANTITY_SOURCE")));

const directDelta = structuredClone(routed);
directDelta.questions[1].options[0].addFieldLaborHours = 0.25;
const deltaLedger = buildLaborCoverageLedger({ contractorSlug: "fixture", trade: "electrical", services: [directDelta], canonicalComponents: [component()] }, audit, 3);
ok("12. labor hidden directly on an answer is surfaced for canonicalization",
  deltaLedger.routes.some((r) => r.issues.some((i) => i.code === "DIRECT_ANSWER_LABOR")));

console.log(`\n${pass}/${pass} checks passed.`);
