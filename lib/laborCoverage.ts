export type AuditTask = {
  taskRowId: string;
  identifier: string;
  name: string;
  kind: "service" | "component" | string;
  classification: string;
  atomicity: string;
  evidenceStatus: string;
  confidence: string;
  publishedObservations: string;
  observationIds: string;
  scopeDifferences: string;
};

export type LaborComponent = {
  key: string;
  name: string;
  referenceLaborHours: number | null;
  referenceLaborUnit: string | null;
  referenceLaborStatus: string;
  evidenceCount: number;
  contractorLaborHours: number | null;
  contractorComponentPresent: boolean;
  contractorComponentActive: boolean;
};

export type LaborBinding = {
  component: LaborComponent;
  quantity: number;
  quantityAnswerKey: string | null;
  conditionAnswerKey: string | null;
  conditionAnswerValue: string | null;
  conditionAccessClass: string | null;
  conditionAccessSlot: string;
};

export type LaborOption = {
  id: string;
  value: string;
  routeAction: string;
  nextQuestionId: string | null;
  photosBlockBooking: boolean;
  overrideFieldLaborHours: number | null;
  addFieldLaborHours: number | null;
  accessClassification: string | null;
  accessSlot: string;
  components: LaborBinding[];
};

export type LaborQuestion = {
  id: string;
  key: string;
  inputType: string;
  order: number;
  numberMin: number | null;
  numberMax: number | null;
  options: LaborOption[];
};

export type LaborService = {
  slug: string;
  name: string;
  tradeKey: string | null;
  active: boolean;
  offered: boolean;
  bookingType: string;
  pricingMethod: string;
  fieldLaborHours: number | null;
  questions: LaborQuestion[];
};

export type LaborSnapshot = {
  contractorSlug: string;
  trade: string;
  services: LaborService[];
  canonicalComponents: LaborComponent[];
};

export type CoverageIssueCode =
  | "BUNDLED_COMPOSITE_BASE"
  | "DIRECT_ANSWER_LABOR"
  | "MISSING_BASE_LABOR"
  | "MISSING_COMPONENT_CONTRACTOR_ROW"
  | "MISSING_COMPONENT_LABOR"
  | "MISSING_COMPONENT_EVIDENCE"
  | "EVIDENCE_NOT_IMPORTED"
  | "PARTIAL_COMPONENT_EVIDENCE"
  | "MISSING_SERVICE_EVIDENCE"
  | "PARTIAL_SERVICE_EVIDENCE"
  | "UNRESOLVED_QUANTITY_SOURCE"
  | "UNBOUNDED_QUANTITY_SOURCE"
  | "COMPOSITE_ROUTE_WITHOUT_COMPONENTS"
  | "DEAD_ROUTE"
  | "PATH_ENUMERATION_CAPPED";

export type CoverageIssue = { code: CoverageIssueCode; detail: string };

export type RouteOperation = {
  key: string;
  name: string;
  source: "SERVICE_BASE" | "CANONICAL_COMPONENT" | "ANSWER_DELTA" | "ANSWER_OVERRIDE";
  quantity: number | { answerKey: string };
};

type AnalyzedRouteOperation = RouteOperation & {
  contractorLaborHours: number | null;
  referenceLaborHours: number | null;
  referenceLaborUnit: string | null;
  referenceLaborStatus: string;
  evidenceCount: number;
};

export type RouteGroup = {
  serviceSlug: string;
  serviceName: string;
  serviceActive: boolean;
  serviceOffered: boolean;
  priceable: boolean;
  terminalAction: string;
  pathCount: number;
  sampleAnswers: Record<string, string>[];
  operations: RouteOperation[];
  issues: CoverageIssue[];
};

export type OperationLedgerRow = {
  key: string;
  name: string;
  kind: "service-base" | "canonical-component";
  usedByPriceableRouteGroups: number;
  usedByPriceablePaths: number;
  usedByActivePriceableRouteGroups: number;
  usedByActivePriceablePaths: number;
  contractorLaborHours: number | null;
  referenceLaborHours: number | null;
  referenceLaborUnit: string | null;
  referenceLaborStatus: string;
  evidenceCount: number;
  audit: AuditTask | null;
};

export type LaborCoverageLedger = {
  schemaVersion: 1;
  contractorSlug: string;
  trade: string;
  generatedAt: string;
  summary: {
    services: number;
    activeServices: number;
    offeredServices: number;
    pathsExamined: number;
    priceablePaths: number;
    routeGroups: number;
    priceableRouteGroups: number;
    cleanPriceableRouteGroups: number;
    activePriceableRouteGroups: number;
    cleanActivePriceableRouteGroups: number;
    issueCounts: Record<string, number>;
    allCatalogIssueCounts: Record<string, number>;
    auditTasks: number;
    auditObservations: number;
  };
  operations: OperationLedgerRow[];
  routes: RouteGroup[];
};

type WalkedPath = {
  answers: Record<string, string>;
  selected: { question: LaborQuestion; option: LaborOption }[];
  terminalAction: string;
  photosBlockBooking: boolean;
  deadReason: string | null;
};

const PATH_CAP = 100_000;

function enumeratePaths(service: LaborService): { paths: WalkedPath[]; capped: boolean } {
  const questions = [...service.questions].sort((a, b) => a.order - b.order || a.key.localeCompare(b.key));
  if (questions.length === 0) {
    return {
      paths: [{
        answers: {}, selected: [],
        terminalAction: service.bookingType === "REMOTE_QUOTE" ? "REMOTE_QUOTE" : "DIRECT_BOOK",
        photosBlockBooking: service.bookingType === "REMOTE_QUOTE",
        deadReason: null,
      }],
      capped: false,
    };
  }
  const byId = new Map(questions.map((q) => [q.id, q]));
  const paths: WalkedPath[] = [];
  let capped = false;
  const walk = (
    question: LaborQuestion | undefined,
    answers: Record<string, string>,
    selected: { question: LaborQuestion; option: LaborOption }[],
    seen: Set<string>,
  ) => {
    if (paths.length >= PATH_CAP) { capped = true; return; }
    if (!question) {
      paths.push({ answers, selected, terminalAction: "DEAD", photosBlockBooking: true, deadReason: "missing next question" });
      return;
    }
    if (seen.has(question.id)) {
      paths.push({ answers, selected, terminalAction: "DEAD", photosBlockBooking: true, deadReason: `cycle at ${question.key}` });
      return;
    }
    if (question.options.length === 0) {
      paths.push({ answers, selected, terminalAction: "DEAD", photosBlockBooking: true, deadReason: `question ${question.key} has no options` });
      return;
    }
    for (const option of question.options) {
      const nextAnswers = { ...answers, [question.key]: option.value };
      const nextSelected = [...selected, { question, option }];
      if (option.routeAction === "CONTINUE") {
        if (!option.nextQuestionId) {
          paths.push({ answers: nextAnswers, selected: nextSelected, terminalAction: "DEAD", photosBlockBooking: true, deadReason: `${question.key}=${option.value} continues without a next question` });
        } else {
          walk(byId.get(option.nextQuestionId), nextAnswers, nextSelected, new Set([...seen, question.id]));
        }
      } else {
        paths.push({
          answers: nextAnswers,
          selected: nextSelected,
          terminalAction: option.routeAction,
          photosBlockBooking: option.photosBlockBooking,
          deadReason: null,
        });
      }
    }
  };
  walk(questions[0], {}, [], new Set());
  return { paths, capped };
}

const isPriceable = (p: WalkedPath) =>
  p.terminalAction === "DIRECT_BOOK" ||
  p.terminalAction === "RESOLVE_INSTANT" ||
  p.terminalAction === "RESOLVE_ADJUSTED" ||
  (p.terminalAction === "PHOTO_REVIEW" && !p.photosBlockBooking);

const accessBySlot = (path: WalkedPath) => {
  const values = new Map<string, string>();
  for (const { option } of path.selected) {
    if (option.accessClassification) values.set(option.accessSlot || "PRIMARY", option.accessClassification);
  }
  return values;
};

function bindingApplies(binding: LaborBinding, path: WalkedPath, access: Map<string, string>): boolean {
  if (binding.conditionAnswerKey && path.answers[binding.conditionAnswerKey] !== binding.conditionAnswerValue) return false;
  if (binding.conditionAccessClass && access.get(binding.conditionAccessSlot || "PRIMARY") !== binding.conditionAccessClass) return false;
  return true;
}

const auditFor = (audit: AuditTask[], prefix: "SVC" | "CMP", identifier: string) =>
  audit.find((t) => t.taskRowId === `${prefix}:${identifier}`) ?? null;

function operationsAndIssues(service: LaborService, path: WalkedPath, audit: AuditTask[]) {
  const operations: AnalyzedRouteOperation[] = [];
  const issues: CoverageIssue[] = [];
  const priceable = isPriceable(path);
  const serviceAudit = auditFor(audit, "SVC", service.slug);
  let baseHours = service.fieldLaborHours;
  let hasOverride = false;
  for (const { question, option } of path.selected) {
    if (option.overrideFieldLaborHours !== null) {
      baseHours = option.overrideFieldLaborHours;
      hasOverride = true;
      operations.push({
        key: `ANSWER_OVERRIDE:${service.slug}:${question.key}:${option.value}`,
        name: `${service.name}: ${question.key}=${option.value} labor override`,
        source: "ANSWER_OVERRIDE", quantity: 1,
        contractorLaborHours: option.overrideFieldLaborHours,
        referenceLaborHours: null, referenceLaborUnit: null, referenceLaborStatus: "NONE", evidenceCount: 0,
      });
      issues.push({ code: "DIRECT_ANSWER_LABOR", detail: `${question.key}=${option.value} overrides labor without a canonical operation` });
    }
  }
  if (!hasOverride) {
    operations.push({
      key: `SERVICE_BASE:${service.slug}`, name: `${service.name} base labor`, source: "SERVICE_BASE", quantity: 1,
      contractorLaborHours: baseHours, referenceLaborHours: null, referenceLaborUnit: null,
      referenceLaborStatus: serviceAudit?.evidenceStatus ?? "NONE",
      evidenceCount: serviceAudit?.observationIds ? serviceAudit.observationIds.split(";").filter(Boolean).length : 0,
    });
  }
  if (priceable && baseHours === null) issues.push({ code: "MISSING_BASE_LABOR", detail: "priceable route has no established service labor" });
  const serviceObservationCount = serviceAudit?.observationIds
    ? serviceAudit.observationIds.split(";").filter(Boolean).length
    : 0;
  if (priceable && (baseHours ?? 0) > 0) {
    if (!serviceAudit || serviceObservationCount === 0) {
      issues.push({ code: "MISSING_SERVICE_EVIDENCE", detail: "service base labor has no mapped published observation" });
    } else if (serviceAudit.classification !== "A" || !serviceAudit.evidenceStatus.toUpperCase().includes("VERIFIED")) {
      issues.push({ code: "PARTIAL_SERVICE_EVIDENCE", detail: `service evidence is class ${serviceAudit.classification}: ${serviceAudit.evidenceStatus}` });
    }
  }
  if (priceable && serviceAudit?.atomicity.toUpperCase().includes("COMPOSITE") && (baseHours ?? 0) > 0) {
    issues.push({ code: "BUNDLED_COMPOSITE_BASE", detail: `service audit classifies the base as ${serviceAudit.atomicity}` });
  }

  const access = accessBySlot(path);
  let componentCount = 0;
  for (const { question, option } of path.selected) {
    if (option.addFieldLaborHours !== null && option.addFieldLaborHours !== 0) {
      operations.push({
        key: `ANSWER_DELTA:${service.slug}:${question.key}:${option.value}`,
        name: `${service.name}: ${question.key}=${option.value} labor increment`,
        source: "ANSWER_DELTA", quantity: 1, contractorLaborHours: option.addFieldLaborHours,
        referenceLaborHours: null, referenceLaborUnit: null, referenceLaborStatus: "NONE", evidenceCount: 0,
      });
      issues.push({ code: "DIRECT_ANSWER_LABOR", detail: `${question.key}=${option.value} adds labor without a canonical operation` });
    }
    for (const binding of option.components) {
      if (!bindingApplies(binding, path, access)) continue;
      componentCount++;
      const c = binding.component;
      let quantity: RouteOperation["quantity"] = binding.quantity;
      if (binding.quantityAnswerKey) {
        quantity = { answerKey: binding.quantityAnswerKey };
        const q = service.questions.find((candidate) => candidate.key === binding.quantityAnswerKey);
        if (!q || !Object.hasOwn(path.answers, binding.quantityAnswerKey)) {
          issues.push({ code: "UNRESOLVED_QUANTITY_SOURCE", detail: `${c.key} binds to ${binding.quantityAnswerKey}, which this path does not resolve` });
        } else if (q.inputType !== "NUMBER" || q.numberMin === null || q.numberMax === null) {
          issues.push({ code: "UNBOUNDED_QUANTITY_SOURCE", detail: `${c.key} binds to ${binding.quantityAnswerKey}, which is not a bounded NUMBER question` });
        }
      }
      operations.push({
        key: c.key, name: c.name, source: "CANONICAL_COMPONENT", quantity,
        contractorLaborHours: c.contractorLaborHours,
        referenceLaborHours: c.referenceLaborHours,
        referenceLaborUnit: c.referenceLaborUnit,
        referenceLaborStatus: c.referenceLaborStatus,
        evidenceCount: c.evidenceCount,
      });
      if (!c.contractorComponentPresent) issues.push({ code: "MISSING_COMPONENT_CONTRACTOR_ROW", detail: `${c.key} is selected but has no contractor component row` });
      else if (c.contractorLaborHours === null) issues.push({ code: "MISSING_COMPONENT_LABOR", detail: `${c.key} has no contractor labor decision` });
      const componentAudit = auditFor(audit, "CMP", c.key);
      const auditEvidenceCount = componentAudit?.observationIds
        ? componentAudit.observationIds.split(";").filter(Boolean).length
        : 0;
      if (c.evidenceCount === 0 && auditEvidenceCount === 0) {
        issues.push({ code: "MISSING_COMPONENT_EVIDENCE", detail: `${c.key} has no mapped published observation` });
      } else {
        if (c.evidenceCount === 0 && auditEvidenceCount > 0) {
          issues.push({ code: "EVIDENCE_NOT_IMPORTED", detail: `${c.key} has ${auditEvidenceCount} audit observation(s) but none in the runtime evidence table` });
        }
        if (c.referenceLaborStatus !== "VERIFIED" || (componentAudit && componentAudit.classification !== "A")) {
          issues.push({ code: "PARTIAL_COMPONENT_EVIDENCE", detail: `${c.key} evidence is not a verified single labor unit` });
        }
      }
    }
  }
  if (priceable && serviceAudit?.atomicity.toUpperCase().includes("COMPOSITE") && componentCount === 0) {
    issues.push({ code: "COMPOSITE_ROUTE_WITHOUT_COMPONENTS", detail: "composite priceable route selects no canonical labor components" });
  }
  if (path.deadReason) issues.push({ code: "DEAD_ROUTE", detail: path.deadReason });
  return { operations, issues };
}

function routeSignature(route: Omit<RouteGroup, "pathCount" | "sampleAnswers">): string {
  return JSON.stringify({
    serviceSlug: route.serviceSlug,
    priceable: route.priceable,
    terminalAction: route.terminalAction,
    operations: route.operations.map((o) => ({ key: o.key, source: o.source, quantity: o.quantity })),
    issues: route.issues.map((i) => ({ code: i.code, detail: i.detail })),
  });
}

export function buildLaborCoverageLedger(
  snapshot: LaborSnapshot,
  auditTasks: AuditTask[],
  auditObservationCount: number,
  generatedAt = new Date().toISOString(),
): LaborCoverageLedger {
  const groups = new Map<string, RouteGroup>();
  let pathsExamined = 0;
  let priceablePaths = 0;
  for (const service of snapshot.services) {
    const enumerated = enumeratePaths(service);
    for (const path of enumerated.paths) {
      pathsExamined++;
      const priceable = isPriceable(path);
      if (priceable) priceablePaths++;
      const analyzed = operationsAndIssues(service, path, auditTasks);
      const operations: RouteOperation[] = analyzed.operations.map(({ key, name, source, quantity }) => ({ key, name, source, quantity }));
      const issues = analyzed.issues;
      if (enumerated.capped) issues.push({ code: "PATH_ENUMERATION_CAPPED", detail: `service exceeded ${PATH_CAP} paths` });
      const candidate = {
        serviceSlug: service.slug, serviceName: service.name, priceable,
        serviceActive: service.active, serviceOffered: service.offered,
        terminalAction: path.terminalAction, operations, issues,
      };
      const signature = routeSignature(candidate);
      const existing = groups.get(signature);
      if (existing) {
        existing.pathCount++;
        if (existing.sampleAnswers.length < 1) existing.sampleAnswers.push(path.answers);
      } else {
        groups.set(signature, { ...candidate, pathCount: 1, sampleAnswers: [path.answers] });
      }
    }
  }
  const routes = [...groups.values()].sort((a, b) =>
    a.serviceSlug.localeCompare(b.serviceSlug) || a.terminalAction.localeCompare(b.terminalAction));

  const usage = new Map<string, { groups: number; paths: number }>();
  const activeUsage = new Map<string, { groups: number; paths: number }>();
  for (const route of routes.filter((r) => r.priceable)) {
    for (const key of new Set(route.operations.map((o) => o.key))) {
      const now = usage.get(key) ?? { groups: 0, paths: 0 };
      now.groups++;
      now.paths += route.pathCount;
      usage.set(key, now);
      if (route.serviceActive) {
        const active = activeUsage.get(key) ?? { groups: 0, paths: 0 };
        active.groups++;
        active.paths += route.pathCount;
        activeUsage.set(key, active);
      }
    }
  }
  const operations: OperationLedgerRow[] = [];
  for (const service of snapshot.services) {
    const key = `SERVICE_BASE:${service.slug}`;
    const task = auditFor(auditTasks, "SVC", service.slug);
    operations.push({
      key, name: `${service.name} base labor`, kind: "service-base",
      usedByPriceableRouteGroups: usage.get(key)?.groups ?? 0,
      usedByPriceablePaths: usage.get(key)?.paths ?? 0,
      usedByActivePriceableRouteGroups: activeUsage.get(key)?.groups ?? 0,
      usedByActivePriceablePaths: activeUsage.get(key)?.paths ?? 0,
      contractorLaborHours: service.fieldLaborHours,
      referenceLaborHours: null, referenceLaborUnit: null,
      referenceLaborStatus: task?.evidenceStatus ?? "NONE",
      evidenceCount: task?.observationIds ? task.observationIds.split(";").filter(Boolean).length : 0,
      audit: task,
    });
  }
  for (const c of snapshot.canonicalComponents) {
    operations.push({
      key: c.key, name: c.name, kind: "canonical-component",
      usedByPriceableRouteGroups: usage.get(c.key)?.groups ?? 0,
      usedByPriceablePaths: usage.get(c.key)?.paths ?? 0,
      usedByActivePriceableRouteGroups: activeUsage.get(c.key)?.groups ?? 0,
      usedByActivePriceablePaths: activeUsage.get(c.key)?.paths ?? 0,
      contractorLaborHours: c.contractorLaborHours,
      referenceLaborHours: c.referenceLaborHours,
      referenceLaborUnit: c.referenceLaborUnit,
      referenceLaborStatus: c.referenceLaborStatus,
      evidenceCount: c.evidenceCount,
      audit: auditFor(auditTasks, "CMP", c.key),
    });
  }
  operations.sort((a, b) => a.kind.localeCompare(b.kind) || a.key.localeCompare(b.key));

  const countIssues = (selected: RouteGroup[]) => {
    const counts: Record<string, number> = {};
    for (const route of selected) for (const issue of new Set(route.issues.map((i) => i.code))) counts[issue] = (counts[issue] ?? 0) + 1;
    return counts;
  };
  const priceableRoutes = routes.filter((r) => r.priceable);
  const activePriceableRoutes = priceableRoutes.filter((r) => r.serviceActive);
  return {
    schemaVersion: 1,
    contractorSlug: snapshot.contractorSlug,
    trade: snapshot.trade,
    generatedAt,
    summary: {
      services: snapshot.services.length,
      activeServices: snapshot.services.filter((s) => s.active).length,
      offeredServices: snapshot.services.filter((s) => s.offered).length,
      pathsExamined,
      priceablePaths,
      routeGroups: routes.length,
      priceableRouteGroups: priceableRoutes.length,
      cleanPriceableRouteGroups: priceableRoutes.filter((r) => r.issues.length === 0).length,
      activePriceableRouteGroups: activePriceableRoutes.length,
      cleanActivePriceableRouteGroups: activePriceableRoutes.filter((r) => r.issues.length === 0).length,
      issueCounts: countIssues(activePriceableRoutes),
      allCatalogIssueCounts: countIssues(priceableRoutes),
      auditTasks: auditTasks.length,
      auditObservations: auditObservationCount,
    },
    operations,
    routes,
  };
}

export function renderLaborCoverageMarkdown(ledger: LaborCoverageLedger): string {
  const s = ledger.summary;
  const lines = [
    `# ${ledger.trade[0].toUpperCase()}${ledger.trade.slice(1)} labor coverage ledger`,
    "",
    `Generated from contractor \`${ledger.contractorSlug}\` at ${ledger.generatedAt}.`,
    "",
    "This is a diagnostic ledger, not an approval file. A clean row means the current runtime data is structurally complete; it does not make an unapproved contractor estimate publishable.",
    "",
    "## Summary",
    "",
    `- ${s.services} services (${s.activeServices} active, ${s.offeredServices} explicitly offered)`,
    `- ${s.pathsExamined} terminal paths examined; ${s.priceablePaths} can reach a price`,
    `- ${s.activePriceableRouteGroups} distinct priceable labor outcomes on active services; ${s.cleanActivePriceableRouteGroups} have no detected coverage issue`,
    `- ${s.priceableRouteGroups} distinct priceable labor outcomes across the full catalog; ${s.cleanPriceableRouteGroups} have no detected coverage issue`,
    `- ${s.auditTasks} labor-audit tasks and ${s.auditObservations} published observations loaded`,
    "",
    "> Active services define the current launch-coverage headline. The explicit `offered` count is informational because the legacy Elite source catalog predates that field; future freshly provisioned contractors use it directly.",
    "",
    "## Priceable-route issues",
    "",
    "| Issue | Distinct route groups |",
    "|---|---:|",
    ...Object.entries(s.issueCounts).sort((a, b) => b[1] - a[1]).map(([key, value]) => `| ${key} | ${value} |`),
    "",
    "## Operations needing work",
    "",
    "| Operation | Kind | Used by groups | Contractor hours | Evidence | Audit classification |",
    "|---|---|---:|---:|---|---|",
  ];
  for (const o of ledger.operations.filter((row) => row.usedByActivePriceableRouteGroups > 0 && (
    row.contractorLaborHours === null || row.referenceLaborStatus !== "VERIFIED" || row.audit?.atomicity.toUpperCase().includes("COMPOSITE")
  ))) {
    lines.push(`| ${o.key} | ${o.kind} | ${o.usedByActivePriceableRouteGroups} | ${o.contractorLaborHours ?? "—"} | ${o.referenceLaborStatus} (${o.evidenceCount}) | ${o.audit?.classification ?? "—"} |`);
  }
  lines.push("", "## Route groups with issues", "", "| Service | Terminal | Paths | Operations | Issues |", "|---|---|---:|---:|---|");
  for (const r of ledger.routes.filter((route) => route.priceable && route.serviceActive && route.issues.length > 0)) {
    const issueNames = [...new Set(r.issues.map((i) => i.code))].join(", ");
    lines.push(`| ${r.serviceSlug} | ${r.terminalAction} | ${r.pathCount} | ${r.operations.length} | ${issueNames} |`);
  }
  return `${lines.join("\n")}\n`;
}
