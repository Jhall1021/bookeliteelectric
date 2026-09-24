/**
 * Read-only, rehearsal-only audit of the complete electrical storefront.
 *
 * It walks every terminal answer combination up to a per-service safety cap,
 * adds low/middle/high probes for every bounded numeric answer on those paths,
 * and resolves each path through the same derived-pricing bridge used by the
 * storefront. The authored terminal promise is then compared with reality.
 *
 * Usage:
 *   REHEARSAL_DATABASE_URL=... DATABASE_URL=... npx tsx \
 *     scripts/audit-electrical-storefront-outcomes.ts \
 *     --contractor rv2-pilot-rehearsal-manual-0922
 *
 * Writes no database rows. The full result is written to /tmp so the console
 * can stay useful even when a catalog has many findings.
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync } from "node:fs";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { loadCatalogForResolution } from "../lib/catalogResolution";
import { loadPricingSettings } from "../lib/routeResolver";
import { resolveRouteWithDerivedPricing } from "../lib/electrical/resolveWithDerivedPricing";
import { NUMERIC_UNKNOWN, isNumericUnknownOption, selectNumericOption } from "../lib/numericRouteRanges";
import { classifyRehearsalTarget } from "./_lineage";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";
import type { ResolvedServiceTree } from "../lib/serviceTreeQuery";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";
import { indexedElectricalLaborFamilies } from "../lib/electrical/laborCoverageFamilies";

type Answers = Record<string, string>;
type Question = ResolvedServiceTree["questions"][number];
type Option = Question["options"][number];
type Expected = "PRICED" | "REVIEW" | "REROUTE" | "INVALID";
type WalkedPath = {
  answers: Answers;
  terminalQuestion: string;
  terminalAnswer: string;
  terminalLabel: string;
  terminalAction: string;
  expected: Expected;
};

const PATH_CAP = 10_000;
const OUTPUT = "/tmp/electrical-storefront-outcome-audit.json";
const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i < 0 ? null : process.argv[i + 1] ?? null;
};
const contractorSlug = arg("contractor") ?? "rv2-pilot-rehearsal-manual-0922";

const hasManualSurfaceTurns = (answers: Answers): boolean =>
  SURFACE_KEYS.feet in answers &&
  [SURFACE_KEYS.inside, SURFACE_KEYS.outside, SURFACE_KEYS.flat]
    .some((key) => Number(answers[key] ?? 0) > 0);

const expectedOf = (o: Option, answers: Answers): Expected => {
  // Aggregate turn counts do not establish the individual segment lengths or
  // the contractor's offcut policy, so these routes correctly stop for review
  // even when their final authored answer is otherwise an instant endpoint.
  if (
    (o.routeAction === "RESOLVE_INSTANT" || o.routeAction === "RESOLVE_ADJUSTED") &&
    hasManualSurfaceTurns(answers)
  ) return "REVIEW";
  if (o.routeAction === "RESOLVE_INSTANT" || o.routeAction === "RESOLVE_ADJUSTED") return "PRICED";
  if (o.routeAction === "PHOTO_REVIEW") return o.photosBlockBooking ? "REVIEW" : "PRICED";
  if (o.routeAction === "REMOTE_QUOTE") return "REVIEW";
  if (o.routeAction === "REROUTE_SERVICE" || o.routeAction === "REROUTE_TROUBLESHOOTING") return "REROUTE";
  return "INVALID";
};

const decimal = (n: number) => String(Number(n.toFixed(6)));

/** Values that select this exact authored option. */
function numericSamples(q: Question, o: Option): string[] {
  if (isNumericUnknownOption(o)) return [NUMERIC_UNKNOWN];
  if (q.numberMin == null || q.numberMax == null) return ["8 x 8"];
  const lo = o.numberAtLeast ?? q.numberMin;
  const hi = o.numberAtMost ?? q.numberMax;
  if (lo == null || hi == null) return [];
  const first = o.numberAtLeastExclusive
    ? q.numberAllowsDecimal ? lo + Math.min(0.5, (hi - lo) / 2) : lo + 1
    : lo;
  const middle = q.numberAllowsDecimal ? (first + hi) / 2 : Math.floor((first + hi) / 2);
  return [...new Set([decimal(first), decimal(middle), decimal(hi)])].filter((raw) => {
    const picked = selectNumericOption(q, raw);
    return picked.kind === "option" && picked.option.id === o.id;
  });
}

function representative(q: Question, o: Option): string {
  if (q.inputType === "TEXT") return "customer supplied description";
  if (q.inputType === "NUMBER") return numericSamples(q, o)[0] ?? o.value;
  return o.value;
}

/** All terminal option combinations, with one valid value per numeric edge. */
function enumerate(tree: ResolvedServiceTree): { paths: WalkedPath[]; capped: boolean; cycles: string[] } {
  const byId = new Map(tree.questions.map((q) => [q.id, q]));
  const out: WalkedPath[] = [];
  const cycles: string[] = [];
  let capped = false;
  const walk = (q: Question | undefined, answers: Answers, seen: Set<string>) => {
    if (out.length >= PATH_CAP) { capped = true; return; }
    if (!q) return;
    if (seen.has(q.id)) { cycles.push(q.key); return; }
    const nextSeen = new Set(seen).add(q.id);
    for (const o of q.options) {
      const raw = representative(q, o);
      const nextAnswers = { ...answers, [q.key]: raw };
      if (o.routeAction === "CONTINUE" && o.nextQuestionId) {
        walk(byId.get(o.nextQuestionId), nextAnswers, nextSeen);
      } else {
        out.push({
          answers: nextAnswers,
          terminalQuestion: q.key,
          terminalAnswer: raw,
          terminalLabel: o.label,
          terminalAction: o.routeAction,
          expected: expectedOf(o, nextAnswers),
        });
      }
      if (out.length >= PATH_CAP) { capped = true; return; }
    }
  };
  walk(tree.questions[0], {}, new Set());
  return { paths: out, capped, cycles: [...new Set(cycles)] };
}

/** Add boundary probes one numeric answer at a time without a cross-product explosion. */
function withNumericBoundaries(tree: ResolvedServiceTree, paths: WalkedPath[]): WalkedPath[] {
  const byKey = new Map(tree.questions.map((q) => [q.key, q]));
  const out: WalkedPath[] = [...paths];
  for (const path of paths) {
    for (const [key, raw] of Object.entries(path.answers)) {
      const q = byKey.get(key);
      if (!q || q.inputType !== "NUMBER") continue;
      const picked = selectNumericOption(q, raw);
      if (picked.kind !== "option") continue;
      for (const sample of numericSamples(q, picked.option)) {
        const answers = { ...path.answers, [key]: sample };
        const expected =
          (path.terminalAction === "RESOLVE_INSTANT" || path.terminalAction === "RESOLVE_ADJUSTED") &&
          hasManualSurfaceTurns(answers)
            ? "REVIEW"
            : path.expected;
        out.push({ ...path, answers, expected });
      }
    }
  }
  const unique = new Map<string, WalkedPath>();
  for (const p of out) unique.set(JSON.stringify(p.answers), p);
  return [...unique.values()];
}

const actualClass = (status: string): Expected =>
  status === "PRICED" ? "PRICED" : status === "REROUTE" ? "REROUTE" : status === "INVALID" ? "INVALID" : "REVIEW";

const REQUIRED_ENTRY_ALIASES = [
  { slug: "sump-pump-dedicated-circuit", equipmentValue: "sump_pump" },
  { slug: "freezer-fridge-dedicated-circuit", equipmentValue: "fridge_freezer" },
] as const;

async function main() {
  console.log("\nELECTRICAL STOREFRONT OUTCOME AUDIT — READ ONLY\n");
  const rehearsalUrl = process.env.REHEARSAL_DATABASE_URL;
  if (!rehearsalUrl) throw new Error("REHEARSAL_DATABASE_URL is required");
  if (!contractorSlug.startsWith("rv2-pilot-rehearsal-")) {
    throw new Error(`refusing non-rehearsal contractor ${contractorSlug}`);
  }
  const identity = await classifyRehearsalTarget(rehearsalUrl, process.env.DATABASE_URL);
  if (!identity.ok) throw new Error(`rehearsal target refused: ${identity.code} — ${identity.reason}`);
  console.log(`  target: ${identity.probe.endpoint} (${identity.reason})`);
  console.log(`  contractor: ${contractorSlug}\n`);

  const raw = new PrismaClient({ datasources: { db: { url: rehearsalUrl } } });
  const guarded = withTenantGuard(new PrismaClient({ datasources: { db: { url: rehearsalUrl } } })) as unknown as PrismaClient;
  try {
    const contractor = await raw.contractor.findUnique({ where: { slug: contractorSlug }, select: { id: true } });
    if (!contractor) throw new Error(`${contractorSlug} does not exist`);
    const report = await withTenant({ contractorId: contractor.id, source: "test" }, async () => {
      const [catalog, settings] = await Promise.all([
        loadCatalogForResolution(guarded, contractor.id),
        loadPricingSettings(guarded, contractor.id),
      ]);
      const services = [...catalog.values()].filter((s) => s.tradeKey === "electrical")
        .sort((a, b) => a.slug.localeCompare(b.slug));
      const laborFamilies = indexedElectricalLaborFamilies();
      const internalFixtureSlugs = new Set(
        services
          .filter((service) => laborFamilies.get(service.slug)?.status === "INTERNAL_FIXTURE")
          .map((service) => service.slug),
      );
      const storefrontServices = services.filter((service) => !internalFixtureSlugs.has(service.slug));
      const findings: Record<string, unknown>[] = [];
      const readinessBuckets = new Map<string, {
        service: string; context: string; actual: Expected; reason: string | null;
        derivedRefusalCode: string | null; pathCount: number;
      }>();
      const summary = {
        installedServices: services.length,
        storefrontServices: storefrontServices.length,
        internalFixtureServices: internalFixtureSlugs.size,
        activeServices: storefrontServices.filter((s) => s.active).length,
        inactiveServices: storefrontServices.filter((s) => !s.active).length,
        servicesWithQuestions: 0,
        servicesWithoutQuestions: 0,
        paths: 0, primaryChecks: 0, addOnChecks: 0,
        mismatches: 0, invalid: 0, inactiveReadinessPaths: 0,
        inactiveReadinessServices: 0, cappedServices: 0, cycles: 0,
        priceabilityContractViolations: 0,
      };

      // A green outcome comparison is not enough: an incorrectly authored
      // REMOTE_QUOTE endpoint compares REVIEW-to-REVIEW and would otherwise
      // pass. Assert the catalog's known bounded entry aliases and the
      // catalog-wide atomic labor contract independently of authored route
      // actions.
      const canonical = services.find((service) => service.slug === "dedicated-120v-circuit-outlet");
      for (const required of REQUIRED_ENTRY_ALIASES) {
        const service = services.find((candidate) => candidate.slug === required.slug);
        const question = service?.questions.find((candidate) => candidate.key === "dedicated_equipment");
        const option = question?.options.find((candidate) => candidate.value === required.equipmentValue);
        const valid = !!service && service.active && service.offered
          && service.pricingMethod === "DERIVED_RESOLVED_SCOPE"
          && service.questions.length === 1 && question?.options.length === 1
          && option?.routeAction === "REROUTE_SERVICE"
          && option.rerouteServiceId === canonical?.id;
        if (!valid) {
          summary.priceabilityContractViolations++;
          findings.push({
            kind: "PRICEABILITY_CONTRACT_VIOLATION",
            service: required.slug,
            contract: "bounded dedicated-circuit entry must reroute into the canonical priced package",
          });
        }
      }
      for (const readiness of buildElectricalServiceLaborReadiness()) {
        if (readiness.state === "NON_PRICEABLE_REVIEW" || readiness.state === "INTERNAL_FIXTURE") continue;
        if (readiness.recipeKeys.length > 0 && readiness.operationKeys.length > 0 && readiness.runtimeConnection === "CONNECTED") continue;
        summary.priceabilityContractViolations++;
        findings.push({
          kind: "PRICEABILITY_CONTRACT_VIOLATION",
          service: readiness.serviceSlug,
          contract: "priceable service must have an atomic labor recipe and a connected bounded runtime path",
          recipeKeys: readiness.recipeKeys,
          operationKeys: readiness.operationKeys,
          runtimeConnection: readiness.runtimeConnection,
        });
      }

      for (const service of storefrontServices) {
        if (!service.questions.length) {
          summary.servicesWithoutQuestions++;
          continue;
        }
        summary.servicesWithQuestions++;
        const walked = enumerate(service);
        const paths = withNumericBoundaries(service, walked.paths);
        summary.paths += paths.length;
        if (walked.capped) summary.cappedServices++;
        summary.cycles += walked.cycles.length;
        if (walked.capped || walked.cycles.length) {
          findings.push({ service: service.slug, kind: walked.capped ? "PATH_CAP" : "CYCLE", cycles: walked.cycles });
        }

        for (const path of paths) {
          for (const isPrimary of [true, false]) {
            isPrimary ? summary.primaryChecks++ : summary.addOnChecks++;
            let verdict;
            try {
              verdict = await resolveRouteWithDerivedPricing(guarded, service, path.answers, isPrimary, settings);
            } catch (error) {
              summary.mismatches++;
              findings.push({ service: service.slug, context: isPrimary ? "PRIMARY" : "ADD_ON", kind: "THREW", terminal: `${path.terminalQuestion}=${path.terminalLabel}`, answers: path.answers, error: error instanceof Error ? error.message : String(error) });
              continue;
            }
            const actual = actualClass(verdict.status);
            if (actual !== path.expected) {
              const reason = "reason" in verdict ? String(verdict.reason) : null;
              const derivedRefusalCode = "derivedRefusalCode" in verdict
                ? String(verdict.derivedRefusalCode ?? "") || null
                : null;
              const inactivePriceGap = path.expected === "PRICED" && (
                actual === "REVIEW" ||
                (actual === "INVALID" && /no published (base|add-on) price/.test(reason ?? ""))
              );
              const inactiveTroubleshootingDependency =
                path.expected === "REROUTE" && actual === "INVALID" &&
                /no active TROUBLESHOOT_ONLY service/.test(reason ?? "");
              const inactiveSetupGap = !service.active && (
                inactivePriceGap || inactiveTroubleshootingDependency
              );
              if (inactiveSetupGap) {
                summary.inactiveReadinessPaths++;
                const context = isPrimary ? "PRIMARY" : "ADD_ON";
                const key = JSON.stringify([service.slug, context, actual, reason, derivedRefusalCode]);
                const prior = readinessBuckets.get(key);
                readinessBuckets.set(key, prior
                  ? { ...prior, pathCount: prior.pathCount + 1 }
                  : { service: service.slug, context, actual, reason, derivedRefusalCode, pathCount: 1 });
                continue;
              }
              if (actual === "INVALID") summary.invalid++;
              summary.mismatches++;
              findings.push({
                service: service.slug,
                serviceActive: service.active,
                context: isPrimary ? "PRIMARY" : "ADD_ON",
                kind: "OUTCOME_MISMATCH",
                expected: path.expected,
                actual,
                terminalAction: path.terminalAction,
                terminal: `${path.terminalQuestion}=${path.terminalLabel}`,
                answers: path.answers,
                reason,
                derivedRefusalCode,
              });
            } else if (actual === "INVALID") {
              summary.invalid++;
            }
          }
        }
      }
      const readiness = [...readinessBuckets.values()];
      summary.inactiveReadinessServices = new Set(readiness.map((r) => r.service)).size;
      findings.push(...readiness.map((r) => ({ kind: "INACTIVE_READINESS_GAP", ...r })));
      return {
        generatedAt: new Date().toISOString(),
        contractor: contractorSlug,
        internalFixtures: [...internalFixtureSlugs].sort(),
        summary,
        findings,
      };
    });

    writeFileSync(OUTPUT, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`  installed services:   ${report.summary.installedServices}`);
    console.log(`  storefront services:  ${report.summary.storefrontServices}`);
    console.log(`  internal fixtures:    ${report.summary.internalFixtureServices}`);
    console.log(`  active services:      ${report.summary.activeServices}`);
    console.log(`  inactive services:    ${report.summary.inactiveServices}`);
    console.log(`  services with trees:  ${report.summary.servicesWithQuestions}`);
    console.log(`  services without:     ${report.summary.servicesWithoutQuestions}`);
    console.log(`  distinct path probes: ${report.summary.paths}`);
    console.log(`  primary checks:       ${report.summary.primaryChecks}`);
    console.log(`  add-on checks:        ${report.summary.addOnChecks}`);
    console.log(`  outcome mismatches:   ${report.summary.mismatches}`);
    console.log(`  invalid verdicts:     ${report.summary.invalid}`);
    console.log(`  inactive setup paths: ${report.summary.inactiveReadinessPaths}`);
    console.log(`  inactive setup svcs:  ${report.summary.inactiveReadinessServices}`);
    console.log(`  capped services:      ${report.summary.cappedServices}`);
    console.log(`  cycles:               ${report.summary.cycles}`);
    console.log(`  priceability gaps:    ${report.summary.priceabilityContractViolations}`);
    console.log(`\n  full report: ${OUTPUT}`);
    for (const f of report.findings.slice(0, 30)) console.log(`  - ${JSON.stringify(f)}`);
    if (report.findings.length > 30) console.log(`  ... ${report.findings.length - 30} more finding(s) in ${OUTPUT}`);
    console.log();
    process.exitCode = report.summary.mismatches || report.summary.cappedServices || report.summary.cycles || report.summary.priceabilityContractViolations ? 1 : 0;
  } finally {
    await raw.$disconnect();
    await guarded.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
