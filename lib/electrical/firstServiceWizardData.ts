/**
 * Everything the "first service" wizard shows, read from stored state.
 *
 * NOTHING HERE IS WIZARD STATE. There is no step counter, no draft table, no
 * "onboarding progress" row. Every value comes from the same records the
 * pricing engine and the future Materials & Costs screen read — so leaving
 * mid-step and coming back lands on exactly what is saved, and changing a cost
 * anywhere else in the product changes what the wizard shows.
 *
 * FRIENDLY NAMES ONLY. The labels below are presentation for this one pilot
 * service. Canonical keys travel to the client solely so a save can name what
 * it is saving; the client never renders them.
 */
import type { PrismaClient } from "@prisma/client";
import { activationMaterialRoles } from "../materialResolution";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../routeResolver";
import { requiredFields } from "../pricingSettingsState";
import { proposeDerivedScope, loadAndPriceDerivedScope } from "./loadDerivedScope";
import {
  loadPilotReadiness, PILOT_ANSWERS, PILOT_ROUTE, PILOT_SERVICE_SLUG,
  proposalRows, type PilotStepKey, type ProposalRows,
} from "./onboardingPilotReadiness";
import { POLICY_KEYS, SURFACE_RACEWAY_SYSTEM_KEY } from "./surfaceSystemConfiguration";
import { SURFACE_ROLES } from "./surfaceRacewayTakeoff";
import { loadPilotEligibility } from "./pilotEligibility";
import { pilotSetupCopy, type PilotSetupCopy } from "../pricingCopy";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS, ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";

export type PartGroup = "Raceway parts" | "Outlet box" | "Wire";

export type WizardPart = {
  roleKey: string;
  name: string;
  hint: string;
  group: PartGroup;
  /** How the contractor buys it, when they have said. */
  packageQuantity: number | null;
  packageUnit: string;
  packagePriceCents: number | null;
  configured: boolean;
};

export type WizardLabor = {
  operationKey: string;
  label: string;
  explainer: string;
  unit: "each" | "ft";
  /** The contractor's own figure, in hours. Null = not decided. */
  hours: number | null;
};

/**
 * Three shapes. `pilotAvailable: false` is checked FIRST: a contractor this
 * fixed-price pilot does not support gets the bounded explanation and nothing
 * else — no parts, labor, proposal, approval token or step list travels to the
 * page, so no step can be reached and no fixed-price copy is ever sent.
 */
export type WizardData =
  | {
      pilotAvailable: false;
      catalogInstalled: boolean;
      unavailable: { code: string; title: string; message: string };
      copy: PilotSetupCopy;
    }
  | { pilotAvailable: true; catalogInstalled: false; copy: PilotSetupCopy }
  | {
      pilotAvailable: true;
      copy: PilotSetupCopy;
      catalogInstalled: true;
      serviceId: string;
      serviceName: string;
      active: boolean;
      live: boolean;
      resumeAt: PilotStepKey | null;
      steps: { key: PilotStepKey; title: string; done: boolean }[];
      routeFeet: number;
      system: {
        groundingStrategy: string | null;
        supportSpacingFt: number | null;
        supportAtEachTerminus: boolean | null;
        sourceTermination: string | null;
        destinationTermination: string | null;
        conductorGauge: string | null;
        slackFt: number | null;
        slackDecided: boolean;
      };
      parts: WizardPart[];
      labor: WizardLabor[];
      pricing: {
        crewHourRateCents: number | null;
        primaryMinimumCents: number | null;
        roundingIncrementCents: number | null;
        defaultPermitAdminCents: number | null;
        permitAsked: boolean;
      };
      proposal: ProposalRows | null;
      needsReapproval: boolean;
      previouslyApprovedCents: number | null;
      approvalToken: string | null;
    };

const PART_LABELS: Record<string, { name: string; hint: string; group: PartGroup }> = {
  [SURFACE_ROLES.channel]: { name: "Raceway channel", hint: "The base and cover the wire runs in.", group: "Raceway parts" },
  [SURFACE_ROLES.joint]: { name: "Joint cover", hint: "Where two lengths of channel meet.", group: "Raceway parts" },
  [SURFACE_ROLES.insideElbow]: { name: "Inside corner", hint: "Only used on runs that turn a corner.", group: "Raceway parts" },
  [SURFACE_ROLES.outsideElbow]: { name: "Outside corner", hint: "Only used on runs that go around a corner.", group: "Raceway parts" },
  [SURFACE_ROLES.flatElbow]: { name: "Flat corner", hint: "Only used when a run changes direction on the wall.", group: "Raceway parts" },
  [SURFACE_ROLES.supportClip]: { name: "Support clip", hint: "Holds the channel to the wall.", group: "Raceway parts" },
  [SURFACE_ROLES.transition]: { name: "Entrance fitting", hint: "Where the channel meets a box.", group: "Raceway parts" },
  [SURFACE_ROLES.end]: { name: "End fitting", hint: "Closes off the end of a run.", group: "Raceway parts" },
  [SURFACE_ROLES.deviceBox]: { name: "Surface outlet box", hint: "The box the new outlet mounts in.", group: "Outlet box" },
};

const wireLabel = (key: string): { name: string; hint: string; group: PartGroup } | null => {
  const m = key.match(/^CONDUCTOR_THHN_(\d+)_(UNGROUNDED|GROUNDED|EQUIPMENT_GROUND)$/);
  if (!m) return null;
  const role = m[2] === "UNGROUNDED" ? "hot" : m[2] === "GROUNDED" ? "neutral" : "ground";
  return { name: `#${m[1]} ${role} wire`, hint: "Individual THHN conductor.", group: "Wire" };
};

const PART_ORDER = [
  SURFACE_ROLES.channel, SURFACE_ROLES.joint, SURFACE_ROLES.supportClip, SURFACE_ROLES.transition,
  SURFACE_ROLES.end, SURFACE_ROLES.insideElbow, SURFACE_ROLES.outsideElbow, SURFACE_ROLES.flatElbow,
  SURFACE_ROLES.deviceBox,
];
const partRank = (key: string) => {
  const i = PART_ORDER.indexOf(key as never);
  if (i >= 0) return i;
  return /UNGROUNDED$/.test(key) ? 100 : /_GROUNDED$/.test(key) ? 101 : 102;
};

export async function loadFirstServiceWizard(db: PrismaClient, contractorId: string): Promise<WizardData> {
  const eligibility = await loadPilotEligibility(db, contractorId);
  const copy = pilotSetupCopy(eligibility);
  const service = await db.service.findFirst({
    where: { contractorId, slug: PILOT_SERVICE_SLUG },
    select: { id: true, name: true, active: true, isPrimaryEligible: true,
              materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true },
  });
  if (!eligibility.eligible) {
    return {
      pilotAvailable: false,
      catalogInstalled: !!service,
      unavailable: { code: eligibility.code, title: copy.unavailableTitle, message: copy.unavailableMessage },
      copy,
    };
  }
  if (!service) return { pilotAvailable: true, catalogInstalled: false, copy };

  const loaded = await loadServiceForResolution(db, service.id);
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db, contractorId); } catch { settings = null; }
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const resolved = loaded ? (resolveRoute(loaded as never, PILOT_ANSWERS, true, settings as never) as any) : null;
  const components = (resolved?.config?.components ?? []) as { key: string; quantity: number }[];

  const context = { isPrimary: true, isPrimaryEligible: service.isPrimaryEligible,
                    servicePermitAdminEstablished: service.permitAdminCents !== null };
  const econ = { materialMultiplier: service.materialMultiplier, permitAdminCents: service.permitAdminCents,
                 otherDirectCostCents: service.otherDirectCostCents, isPrimaryEligible: service.isPrimaryEligible };

  const readiness = await loadPilotReadiness(db, contractorId, { components, context, service: econ });

  // ── how they run it ──
  const sys = await db.contractorMaterialSystem.findUnique({
    where: { contractorId_systemKey: { contractorId, systemKey: SURFACE_RACEWAY_SYSTEM_KEY } },
    select: { groundingStrategy: true, supportSpacingFt: true, supportAtEachTerminus: true,
              sourceTermination: true, destinationTermination: true,
              sourceTerminationMaterial: { select: { key: true } },
              destinationTerminationMaterial: { select: { key: true } } },
  });
  const policies = await db.contractorPolicyValue.findMany({
    where: { contractorId, key: { in: [POLICY_KEYS.conductorSpec, POLICY_KEYS.terminationSlack] } },
    select: { key: true, choice: true, measurement: true, resolvedAt: true },
  });
  const spec = policies.find((p) => p.key === POLICY_KEYS.conductorSpec);
  const slack = policies.find((p) => p.key === POLICY_KEYS.terminationSlack);
  const gauge = spec?.resolvedAt ? spec.choice : null;

  // ── which parts this service actually needs ──
  // Every part a REACHABLE route consumes (activation's own list) plus the
  // parts derived from how they run it. Wire appears once a size is chosen;
  // the ground wire only when they pull one; a fitting only where they said a
  // terminus needs one. Nothing is asked that the job does not use.
  const needed = new Set<string>((await activationMaterialRoles(db, service.id)).map((r) => r.key));
  needed.add(SURFACE_ROLES.channel);
  needed.add(SURFACE_ROLES.joint);
  needed.add(SURFACE_ROLES.supportClip);
  needed.add(SURFACE_ROLES.deviceBox);
  if (sys?.sourceTermination === "FITTING_REQUIRED" && sys.sourceTerminationMaterial) needed.add(sys.sourceTerminationMaterial.key);
  if (sys?.destinationTermination === "FITTING_REQUIRED" && sys.destinationTerminationMaterial) needed.add(sys.destinationTerminationMaterial.key);
  if (gauge) {
    needed.add(`CONDUCTOR_THHN_${gauge}_UNGROUNDED`);
    needed.add(`CONDUCTOR_THHN_${gauge}_GROUNDED`);
    if (sys?.groundingStrategy !== "SYSTEM_PROVIDES_GROUNDING_PATH") needed.add(`CONDUCTOR_THHN_${gauge}_EQUIPMENT_GROUND`);
  }

  const rows = await db.contractorMaterial.findMany({
    where: { contractorId, canonicalMaterial: { key: { in: [...needed] } } },
    select: { packageQuantity: true, packageUnit: true, packagePriceCents: true,
              canonicalMaterial: { select: { key: true, unit: true } } },
  });
  const byKey = new Map(rows.map((r) => [r.canonicalMaterial.key, r]));
  const roleUnits = new Map((await db.canonicalMaterial.findMany({
    where: { key: { in: [...needed] } }, select: { key: true, unit: true } })).map((r) => [r.key, r.unit]));

  const groupOrder: PartGroup[] = ["Raceway parts", "Outlet box", "Wire"];
  const parts: WizardPart[] = [...needed]
    .map((key) => {
      const label = PART_LABELS[key] ?? wireLabel(key);
      if (!label) return null;   // a role with no pilot label is not shown rather than shown as a key
      const row = byKey.get(key);
      return {
        roleKey: key, name: label.name, hint: label.hint, group: label.group,
        packageQuantity: row?.packageQuantity ?? null,
        packageUnit: row?.packageUnit ?? roleUnits.get(key) ?? "each",
        packagePriceCents: row?.packagePriceCents ?? null,
        configured: !!row && row.packageQuantity !== null && row.packagePriceCents !== null,
      };
    })
    .filter((p): p is WizardPart => p !== null)
    // The order a contractor thinks in — the run itself first, corners last —
    // not alphabetical, which put the channel fifth behind three corners.
    .sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group)
      || partRank(a.roleKey) - partRank(b.roleKey) || a.name.localeCompare(b.name));

  // ── labor ──
  // The pricing runtime consumes atomic decisions. The previous version read
  // four bundled ContractorComponent rows here, so the wizard could report
  // labor saved while the price engine still (correctly) refused it.
  const surfaceRecipe = ELECTRICAL_ATOMIC_LABOR_RECIPES.find((recipe) => recipe.key === "ELECTRICAL_SURFACE_RACEWAY_ROUTE");
  if (!surfaceRecipe) throw new Error("ELECTRICAL_SURFACE_RACEWAY_ROUTE is missing");
  const laborOperationKeys = [...new Set(surfaceRecipe.lines.map((line) => line.operationKey))];
  const decisions = await db.contractorLaborOperationDecision.findMany({
    where: { contractorId, trade: "electrical", operationKey: { in: laborOperationKeys } },
    select: { operationKey: true, hoursPerUnit: true },
  });
  const hoursByOperation = new Map(decisions.map((decision) => [decision.operationKey, decision.hoursPerUnit]));
  const operationByKey = new Map(ELECTRICAL_ATOMIC_LABOR_OPERATIONS.map((operation) => [operation.key, operation]));
  const labor: WizardLabor[] = laborOperationKeys.map((operationKey) => {
    const operation = operationByKey.get(operationKey);
    if (!operation) throw new Error(`Unknown atomic labor operation ${operationKey}`);
    return {
      operationKey,
      label: operation.name,
      explainer: `Includes: ${operation.includes} Excludes: ${operation.excludes}`,
      unit: operation.unit,
      hours: hoursByOperation.get(operationKey) ?? null,
    };
  });

  // ── pricing decisions ──
  const ps = await db.pricingSettings.findUnique({
    where: { contractorId },
    select: { crewHourRateCents: true, primaryMinimumCents: true, roundingIncrementCents: true, defaultPermitAdminCents: true },
  });

  // ── price ──
  const { proposal, basisFingerprint } = components.length
    ? await proposeDerivedScope(db, { contractorId, serviceId: service.id, components,
        routeFeet: PILOT_ROUTE.feet, turnCount: 0, context, service: econ })
    : { proposal: null, basisFingerprint: null };
  const verdict = components.length
    ? await loadAndPriceDerivedScope(db, { contractorId, serviceId: service.id, components,
        routeFeet: PILOT_ROUTE.feet, turnCount: 0, context, service: econ })
    : null;
  const approval = await db.contractorDerivedPricingApproval.findUnique({
    where: { contractorId_serviceId: { contractorId, serviceId: service.id } },
    select: { approvedTotalCents: true },
  });

  return {
    pilotAvailable: true,
    copy,
    catalogInstalled: true,
    serviceId: service.id,
    serviceName: service.name,
    active: service.active,
    live: readiness.live,
    resumeAt: readiness.resumeAt,
    steps: readiness.steps.map((s) => ({ key: s.key, title: s.title, done: s.done })),
    routeFeet: PILOT_ROUTE.feet,
    system: {
      groundingStrategy: sys?.groundingStrategy ?? null,
      supportSpacingFt: sys?.supportSpacingFt ?? null,
      supportAtEachTerminus: sys?.supportAtEachTerminus ?? null,
      sourceTermination: sys?.sourceTermination ?? null,
      destinationTermination: sys?.destinationTermination ?? null,
      conductorGauge: gauge,
      slackFt: slack?.resolvedAt ? slack.measurement : null,
      slackDecided: !!slack?.resolvedAt && slack.measurement !== null,
    },
    parts,
    labor,
    pricing: {
      crewHourRateCents: ps?.crewHourRateCents ?? null,
      primaryMinimumCents: ps?.primaryMinimumCents ?? null,
      roundingIncrementCents: ps?.roundingIncrementCents ?? null,
      defaultPermitAdminCents: ps?.defaultPermitAdminCents ?? null,
      permitAsked: requiredFields(context).includes("defaultPermitAdminCents"),
    },
    proposal: proposal && proposal.kind === "PRICED" ? proposalRows(proposal, ps?.crewHourRateCents ?? null) : null,
    needsReapproval: verdict?.kind === "REVIEW" && verdict.code === "DERIVED_PRICING_APPROVAL_STALE",
    previouslyApprovedCents: approval?.approvedTotalCents ?? null,
    approvalToken: basisFingerprint,
  };
}
