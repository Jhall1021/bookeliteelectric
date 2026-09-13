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

export type LaborReference =
  | { kind: "NONE" }
  | { kind: "REFERENCE"; minutes: number; partial: boolean }
  | { kind: "VARIES" };

export type WizardLabor = {
  componentKey: string;
  label: string;
  explainer: string;
  per: "job" | "foot";
  quantity: number;
  /** The contractor's own figure, in hours. Null = not decided. */
  hours: number | null;
  reference: LaborReference;
};

export type WizardData =
  | { catalogInstalled: false }
  | {
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

const LABOR_LABELS: Record<string, { label: string; explainer: string; per: "job" | "foot" }> = {
  ELEC_ROUTE_SURFACE_MOUNTED: {
    label: "Planning the surface run",
    explainer: "Once per job — laying out where the channel goes. Choose “No extra time” if you count this in the per-foot time.",
    per: "job",
  },
  SURFACE_ROUTE_FT: {
    label: "Running surface raceway",
    explainer: "For each foot: mounting channel and pulling wire.",
    per: "foot",
  },
  OUTLET_EXTENSION_CORE: {
    label: "Outlet installation",
    explainer: "Tapping the existing outlet, wiring the new one and testing it.",
    per: "job",
  },
  SURFACE_DEVICE_BOX_OUTLET: {
    label: "Mounting the outlet box",
    explainer: "Fixing the surface box to the wall.",
    per: "job",
  },
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
  const service = await db.service.findFirst({
    where: { contractorId, slug: PILOT_SERVICE_SLUG },
    select: { id: true, name: true, active: true, isPrimaryEligible: true,
              materialMultiplier: true, permitAdminCents: true, otherDirectCostCents: true },
  });
  if (!service) return { catalogInstalled: false };

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
  const canon = await db.canonicalComponent.findMany({
    where: { key: { in: components.map((c) => c.key) } },
    select: { id: true, key: true, referenceLaborHours: true, referenceLaborStatus: true },
  });
  const own = await db.contractorComponent.findMany({
    where: { contractorId, canonicalComponentId: { in: canon.map((c) => c.id) } },
    select: { canonicalComponentId: true, addFieldLaborHours: true },
  });
  const ownById = new Map(own.map((o) => [o.canonicalComponentId, o.addFieldLaborHours]));
  const labor: WizardLabor[] = components.flatMap((c) => {
    const cc = canon.find((x) => x.key === c.key);
    const label = LABOR_LABELS[c.key];
    if (!cc || !label) return [];
    // Evidence is HELP, not an answer. Disputed evidence is described as
    // varying rather than handed over as a number to copy.
    const reference: LaborReference =
      cc.referenceLaborStatus === "DISPUTED" ? { kind: "VARIES" }
      : cc.referenceLaborHours !== null
        ? { kind: "REFERENCE", minutes: Math.round(cc.referenceLaborHours * 60), partial: cc.referenceLaborStatus !== "VERIFIED" }
        : { kind: "NONE" };
    return [{
      componentKey: c.key, label: label.label, explainer: label.explainer, per: label.per,
      quantity: c.quantity,
      hours: ownById.has(cc.id) ? (ownById.get(cc.id) as number | null) : null,
      reference,
    }];
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
