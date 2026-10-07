import { createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { assembleMaterialCostCents } from "../materialCost";
import { fixtureHeightLaborMultiplier, laborRateForService, suggestConfigurationPrice } from "../pricing";
import { loadPricingSettings } from "../routeResolver";
import { concealedNmSupportCount, CONCEALED_ROUTE_POLICY_KEYS } from "./concealedRouteMaterialConfiguration";
import { projectElectricalServiceLabor } from "./laborServiceApproval";
import { elapsedMinutesFromCrewHours } from "./derivedScopePricing";
import { ELECTRICAL_ATOMIC_LABOR_RECIPES } from "./atomicLabor";
import { circuitPackageMaterialRoleKeysForService } from "./circuitPackageMaterialRoles";
import { GARAGE_240V_CONFIG_BY_SLUG, reviewedGarage240vConfiguration } from "./garage240vReviewPackage";
import { DOORWAY_DETOUR_FEET, measuredLegHasDoorway } from "./doorwayRouting";
import { reviewedEvChargerConfiguration } from "./evChargerReviewPackage";
import { isDedicatedCircuitAccessibleRoute, isDedicatedCircuitFinishedRoute } from "./dedicatedCircuitAccess";

type Answers = Record<string, string | undefined>;

type CircuitPackage = {
  routeFeet: number;
  laborServiceSlug: string;
  materialRoles: readonly string[];
  cableRole: string;
  facts: Record<string, number | boolean>;
  description: string;
  materialQuantities?: Record<string, number>;
  usesBranchCableSupportPolicy?: boolean;
};

const ACCESSIBLE = new Set(["unfinished_basement", "drop_ceiling", "accessible_attic", "combination"]);
const CIRCUIT_PACKAGE_SERVICE_SLUGS = new Set([
  "dedicated-120v-circuit-outlet", "electric-fireplace-circuit", "new-240v-appliance-circuit",
  "level-2-ev-charger",
  "new-ethernet-line", "new-coax-line", "new-video-doorbell-wiring",
  "new-ceiling-light", "new-wall-sconce", "recessed-lighting", "new-exterior-lighting-locations",
  ...Object.keys(GARAGE_240V_CONFIG_BY_SLUG),
]);

export const isCircuitPackageService = (serviceSlug: string) => CIRCUIT_PACKAGE_SERVICE_SLUGS.has(serviceSlug);

const bandFeet = (value: string | undefined, boundaries: readonly number[]): number | null =>
  value === "under_25" ? boundaries[0] : value === "25_to_50" ? boundaries[1] : null;

const dedicatedRouteFeet = (value: string | undefined, boundaries: readonly number[]): number | null => {
  const measured = Number(value);
  if (Number.isFinite(measured) && measured >= 1 && measured <= boundaries[1]) return measured;
  // Previously saved visits keep their conservative band ceiling.
  return bandFeet(value, boundaries);
};

const COMMON_120 = ["BOX_OLD_WORK", "WALL_PLATE", "CONSUMABLES_MEDIUM"] as const;
const COMMON_240 = ["BOX_SURFACE_4S", "COVER_RAISED_4S", "CONSUMABLES_MEDIUM"] as const;

function dedicatedPackage(answers: Answers, boundaries: readonly number[]): CircuitPackage | null {
  const accessible = isDedicatedCircuitAccessibleRoute(answers.dedicated_route_access);
  const finished = isDedicatedCircuitFinishedRoute(answers.dedicated_route_access);
  if ((!accessible && !finished) || answers.dedicated_finish_ack !== "accepted") return null;
  const measuredFeet = dedicatedRouteFeet(answers.dedicated_distance, boundaries);
  if (!measuredFeet) return null;
  const doorwayDetour = finished && measuredLegHasDoorway(answers, "dedicated_distance")
    ? DOORWAY_DETOUR_FEET
    : 0;
  const routeFeet = measuredFeet + doorwayDetour;
  if (routeFeet > boundaries[1]) return null;
  const equipment = answers.dedicated_equipment;
  let amps: 15 | 20;
  let laborServiceSlug = "dedicated-120v-circuit-outlet";
  let receptacle = "RECEPTACLE_STANDARD";
  if (equipment === "fridge_freezer" || equipment === "bidet") amps = 15;
  else if (equipment === "sump_pump") {
    amps = 20; laborServiceSlug = "sump-pump-dedicated-circuit"; receptacle = "GFCI_INTERIOR_20A";
  } else if (equipment === "microwave" || equipment === "window_ac") amps = 20;
  else if (equipment === "electric_fireplace") {
    if (answers.dedicated_fireplace_amperage !== "15a" && answers.dedicated_fireplace_amperage !== "20a") return null;
    amps = answers.dedicated_fireplace_amperage === "20a" ? 20 : 15;
    laborServiceSlug = "electric-fireplace-circuit";
  } else if (equipment === "knows_size") {
    if (answers.dedicated_amperage !== "15a_120v" && answers.dedicated_amperage !== "20a_120v") return null;
    amps = answers.dedicated_amperage === "20a_120v" ? 20 : 15;
  } else return null;
  const cableRole = amps === 20 ? "WIRE_12_2" : "WIRE_14_2";
  const breakerRole = amps === 20 ? "BREAKER_SINGLE_POLE_20A" : "BREAKER_SINGLE_POLE_15A";
  return {
    routeFeet, laborServiceSlug, cableRole,
    materialRoles: [breakerRole, receptacle, ...COMMON_120, cableRole, ...(accessible ? ["NM_CABLE_SUPPORT"] : [])],
    facts: {
      accessibleRoute: accessible,
      finishedRoute: finished,
      ...(accessible ? { accessibleRouteFeet: routeFeet } : {
        concealedRouteFeet: routeFeet,
        perpendicularFramingFeet: routeFeet,
        framingSpacingInches: 16,
      }),
      panelCapacityConfirmed: true,
      ...(equipment === "sump_pump" ? { sumpPumpProtectionConfirmed: true } : {}),
      ...(equipment === "electric_fireplace" ? { fireplaceEquipmentRatingConfirmed: true } : {}),
    },
    description: `${amps}A 120V dedicated circuit with a ${routeFeet}-foot ${accessible ? "accessible" : "finished-wall"} route${doorwayDetour ? ", including one doorway bypass" : ""}`,
  };
}

function fireplacePackage(answers: Answers, boundaries: readonly number[]): CircuitPackage | null {
  if (answers.fireplace_connection !== "standard_plug" || answers.fireplace_wall !== "ordinary_drywall"
    || !ACCESSIBLE.has(answers.fireplace_route_access ?? "")) return null;
  const routeFeet = bandFeet(answers.fireplace_distance, boundaries);
  const amps = answers.fireplace_amperage === "15a" ? 15 : answers.fireplace_amperage === "20a" ? 20 : null;
  if (!routeFeet || !amps) return null;
  const cableRole = amps === 20 ? "WIRE_12_2" : "WIRE_14_2";
  const breakerRole = amps === 20 ? "BREAKER_SINGLE_POLE_20A" : "BREAKER_SINGLE_POLE_15A";
  return {
    routeFeet, laborServiceSlug: "electric-fireplace-circuit", cableRole,
    materialRoles: [breakerRole, "RECEPTACLE_STANDARD", ...COMMON_120, cableRole, "NM_CABLE_SUPPORT"],
    facts: { accessibleRoute: true, finishedRoute: false, accessibleRouteFeet: routeFeet, panelCapacityConfirmed: true, fireplaceEquipmentRatingConfirmed: true },
    description: `${amps}A plug-in fireplace circuit with an accessible route up to ${routeFeet} feet`,
  };
}

function appliancePackage(answers: Answers, boundaries: readonly number[]): CircuitPackage | null {
  if (answers.appliance_240v_connection !== "four_prong_plug" || answers.appliance_240v_endpoint !== "surface_box"
    || !ACCESSIBLE.has(answers.appliance_240v_route_access ?? "")) return null;
  const routeFeet = bandFeet(answers.appliance_240v_distance, boundaries);
  if (!routeFeet) return null;
  const dryer = answers.appliance_240v_type === "dryer";
  const range = answers.appliance_240v_type === "range";
  if (!dryer && !range) return null;
  const cableRole = dryer ? "WIRE_10_3" : "WIRE_6_3";
  return {
    routeFeet, laborServiceSlug: "new-240v-appliance-circuit", cableRole,
    materialRoles: [dryer ? "BREAKER_DOUBLE_POLE_30A" : "BREAKER_DOUBLE_POLE_50A", dryer ? "RECEPTACLE_14_30" : "RECEPTACLE_14_50", ...COMMON_240, cableRole, "NM_CABLE_SUPPORT"],
    facts: { accessibleRoute: true, accessibleRouteFeet: routeFeet, panelCapacityConfirmed: true, applianceCircuitConfigurationConfirmed: true },
    description: `${dryer ? "30A dryer" : "50A range"} circuit with an accessible route up to ${routeFeet} feet`,
  };
}

function garage240vPackage(serviceSlug: string, answers: Answers): CircuitPackage | null {
  const config = reviewedGarage240vConfiguration(serviceSlug, answers as Record<string, string>);
  if (!config) return null;
  const routeFeet = 25;
  return {
    routeFeet, laborServiceSlug: serviceSlug, cableRole: config.wireRole,
    materialRoles: [config.breakerRole, config.receptacleRole, "BOX_SURFACE_4S", "COVER_RAISED_4S", "CONSUMABLES_MEDIUM", config.wireRole, "NM_CABLE_SUPPORT"],
    facts: { accessibleRoute: true, finishedRoute: false, accessibleRouteFeet: routeFeet, panelCapacityConfirmed: true },
    description: `${config.amperage}A ${config.prongs}-prong garage outlet with an open-framing route up to 25 feet`,
  };
}

function evChargerPackage(answers: Answers, boundaries: readonly number[]): CircuitPackage | null {
  const config = reviewedEvChargerConfiguration("level-2-ev-charger", answers);
  const routeFeet = bandFeet(answers.ev_charger_distance, boundaries);
  if (!config || !routeFeet) return null;
  return {
    routeFeet,
    laborServiceSlug: "level-2-ev-charger",
    cableRole: config.wireRole,
    materialRoles: [config.breakerRole, config.wireRole, "CONSUMABLES_MEDIUM", "NM_CABLE_SUPPORT"],
    facts: {
      accessibleRoute: true,
      finishedRoute: false,
      accessibleRouteFeet: routeFeet,
      panelCapacityConfirmed: true,
      evChargerConfigurationConfirmed: true,
    },
    description: `Customer-supplied hardwired Level 2 charger on a 50A circuit with an accessible same-garage route up to ${routeFeet} feet`,
  };
}

export function lowVoltagePackage(serviceSlug: string, answers: Answers): CircuitPackage | null {
  const access = answers[`${serviceSlug}_route_access`];
  if (access !== "accessible" && access !== "finished" && access !== "exposed_baseboard") return null;
  const exposedRouteFeet = measuredFeet(answers, `${serviceSlug}_exposed_route_feet`);
  const measuredRouteFeet = access === "exposed_baseboard"
    ? exposedRouteFeet !== null && exposedRouteFeet <= 75 ? exposedRouteFeet : null
    : (() => {
        const exact = measuredFeet(answers, `${serviceSlug}_distance`);
        if (exact !== null) return exact <= 75 ? exact : null;
        // Previously saved visits keep their conservative band ceiling.
        return answers[`${serviceSlug}_distance`] === "under_25" ? 25
          : answers[`${serviceSlug}_distance`] === "26_to_50" ? 50
            : answers[`${serviceSlug}_distance`] === "51_to_75" ? 75
              : null;
      })();
  if (!measuredRouteFeet) return null;
  const doorwayDetour = access === "finished" && measuredLegHasDoorway(answers, `${serviceSlug}_distance`)
    ? DOORWAY_DETOUR_FEET
    : 0;
  const routeFeet = measuredRouteFeet + doorwayDetour;
  const ethernet = serviceSlug === "new-ethernet-line";
  const cableRole = ethernet ? "CABLE_CAT6" : "CABLE_RG6";
  const jackRole = ethernet ? "JACK_KEYSTONE_RJ45" : "JACK_COAX_F";
  const clipCount = access === "exposed_baseboard" ? Math.ceil(routeFeet / 2) + 2 : 0;
  return {
    routeFeet,
    laborServiceSlug: serviceSlug,
    cableRole,
    materialRoles: [cableRole, jackRole, "LOW_VOLTAGE_RING", "WALL_PLATE", "CONSUMABLES_SMALL", ...(clipCount ? ["LOW_VOLTAGE_CABLE_CLIP"] : [])],
    materialQuantities: {
      [cableRole]: routeFeet + 6,
      [jackRole]: 2,
      LOW_VOLTAGE_RING: 1,
      WALL_PLATE: 1,
      CONSUMABLES_SMALL: 1,
      ...(clipCount ? { LOW_VOLTAGE_CABLE_CLIP: clipCount } : {}),
    },
    usesBranchCableSupportPolicy: false,
    facts: access === "accessible"
      ? { accessibleRoute: true, finishedRoute: false, exposedLowVoltageRoute: false, accessibleRouteFeet: routeFeet }
      : access === "finished" ? {
          accessibleRoute: false,
          finishedRoute: true,
          exposedLowVoltageRoute: false,
          concealedRouteFeet: routeFeet,
          perpendicularFramingFeet: routeFeet,
          framingSpacingInches: 16,
        } : {
          accessibleRoute: false,
          finishedRoute: false,
          exposedLowVoltageRoute: true,
          exposedLowVoltageRouteFeet: routeFeet,
          lowVoltageClipCount: clipCount,
        },
    description: `${ethernet ? "Cat6 network" : "coax"} line with a ${access === "accessible" ? "accessible" : access === "finished" ? "finished-wall" : "visible baseboard"} route up to ${routeFeet} feet${doorwayDetour ? ", including one doorway bypass" : ""}`,
  };
}

const measuredFeet = (answers: Answers, key: string): number | null => {
  const feet = Number(answers[key]);
  return Number.isFinite(feet) && feet >= 1 && feet <= 200 ? feet : null;
};

const lightingRouteFromAnswers = (answers: Answers): { routeFeet: number; newSwitchRequired: boolean; sourceLabel: string } | null => {
  if (answers.extension_control === "existing_switch") {
    const routeFeet = measuredFeet(answers, "extension_existing_switch_feet");
    return routeFeet === null ? null : { routeFeet, newSwitchRequired: false, sourceLabel: "an existing wall switch" };
  }
  if (answers.extension_control === "existing_fixture") {
    const routeFeet = measuredFeet(answers, "extension_existing_fixture_feet");
    return routeFeet === null ? null : { routeFeet, newSwitchRequired: false, sourceLabel: "an existing light fixture" };
  }
  if (answers.extension_control === "new_switch") {
    const powerToSwitchFeet = measuredFeet(answers, "extension_power_to_switch_feet");
    const switchToFixtureFeet = measuredFeet(answers, "extension_switch_to_fixture_feet");
    if (powerToSwitchFeet === null || switchToFixtureFeet === null || powerToSwitchFeet + switchToFixtureFeet > 400) return null;
    return { routeFeet: powerToSwitchFeet + switchToFixtureFeet, newSwitchRequired: true, sourceLabel: "a new wall switch" };
  }
  return null;
};

const lightingDoorwayCount = (answers: Answers): number => {
  if (answers.extension_control === "existing_switch") {
    return measuredLegHasDoorway(answers, "extension_existing_switch_feet") ? 1 : 0;
  }
  if (answers.extension_control === "existing_fixture") {
    return measuredLegHasDoorway(answers, "extension_existing_fixture_feet") ? 1 : 0;
  }
  if (answers.extension_control === "new_switch") {
    return Number(measuredLegHasDoorway(answers, "extension_power_to_switch_feet"))
      + Number(measuredLegHasDoorway(answers, "extension_switch_to_fixture_feet"));
  }
  return 0;
};

function lightingExtensionPackage(serviceSlug: string, answers: Answers): CircuitPackage | null {
  const access = answers.extension_route_access;
  const measuredRoute = lightingRouteFromAnswers(answers);
  if ((access !== "accessible" && access !== "finished") || !measuredRoute) return null;
  const { routeFeet, newSwitchRequired: newLightingSwitch, sourceLabel } = measuredRoute;
  const commonMaterials = ["WIRE_14_2", "CONSUMABLES_SMALL", ...(access === "accessible" ? ["NM_CABLE_SUPPORT"] : [])];
  const endpointMaterials = serviceSlug === "new-ceiling-light" ? ["BOX_CEILING_STANDARD"]
    : serviceSlug === "new-wall-sconce" ? ["BOX_OLD_WORK"]
      : serviceSlug === "new-exterior-lighting-locations" ? ["BOX_EXTERIOR_FIXTURE"]
        : [];
  const lightCount = serviceSlug === "recessed-lighting" ? Number(answers.recessed_light_count) : 1;
  if (!Number.isInteger(lightCount) || lightCount < 1 || lightCount > 8) return null;
  // The customer measures only to the first recessed light. The layout then
  // carries the same reviewed allowance as the compatibility component model:
  // ten feet of 14/2 for every light after the first. Keeping this in one
  // physical route figure makes labor, cable, supports and finished-ceiling
  // crossings all price from the same geometry instead of adding wire only.
  const additionalRecessedCableFeet = serviceSlug === "recessed-lighting" ? (lightCount - 1) * 10 : 0;
  const doorwayCount = access === "finished" ? lightingDoorwayCount(answers) : 0;
  const doorwayDetourFeet = doorwayCount * DOORWAY_DETOUR_FEET;
  const installedRouteFeet = routeFeet + additionalRecessedCableFeet + doorwayDetourFeet;
  const facts = {
    accessibleRoute: access === "accessible",
    finishedRoute: access === "finished",
    newSwitchRequired: newLightingSwitch,
    ...(access === "accessible" ? { accessibleRouteFeet: installedRouteFeet } : {
      concealedRouteFeet: installedRouteFeet,
      perpendicularFramingFeet: installedRouteFeet,
      perpendicularCeilingFeet: installedRouteFeet,
      framingSpacingInches: 16,
    }),
    existingLightingSourceConfirmed: true,
    ...(serviceSlug === "recessed-lighting" ? { lightCount, interLightCableFeet: installedRouteFeet } : {}),
    ...(serviceSlug === "new-exterior-lighting-locations" ? { exteriorLightCount: 1 } : {}),
  };
  const switchMaterials = newLightingSwitch ? ["BOX_OLD_WORK", "SWITCH_STANDARD", "WALL_PLATE"] : [];
  const materials = serviceSlug === "recessed-lighting" ? ["RECESSED_WAFER", ...switchMaterials, ...commonMaterials]
    : [...endpointMaterials, ...switchMaterials, ...commonMaterials];
  return {
    routeFeet: installedRouteFeet, laborServiceSlug: serviceSlug, cableRole: "WIRE_14_2", materialRoles: [...new Set(materials)], facts,
    materialQuantities: {
      WIRE_14_2: installedRouteFeet + 6,
      CONSUMABLES_SMALL: 1,
      ...(newLightingSwitch ? { BOX_OLD_WORK: serviceSlug === "new-wall-sconce" ? 2 : 1, SWITCH_STANDARD: 1, WALL_PLATE: 1 } : {}),
      ...(serviceSlug === "recessed-lighting" ? { RECESSED_WAFER: lightCount } : {}),
    },
    description: serviceSlug === "recessed-lighting"
      ? `${lightCount} recessed light${lightCount === 1 ? "" : "s"} fed from ${sourceLabel}: ${routeFeet} feet to the first light${additionalRecessedCableFeet > 0 ? ` plus ${additionalRecessedCableFeet} feet for the remaining lights` : ""}${doorwayDetourFeet ? ` plus ${doorwayDetourFeet} feet for ${doorwayCount} doorway bypass${doorwayCount === 1 ? "" : "es"}` : ""}, about ${installedRouteFeet} feet total`
      : `One new ${serviceSlug === "new-ceiling-light" ? "ceiling light" : serviceSlug === "new-wall-sconce" ? "wall sconce" : "exterior light"} fed from ${sourceLabel} with a ${access === "accessible" ? "accessible" : "finished-space"} wiring path of about ${installedRouteFeet} feet${doorwayDetourFeet ? ", including one doorway bypass" : ""}`,
  };
}

function doorbellPackage(answers: Answers): CircuitPackage | null {
  const access = answers.doorbell_route_access;
  const measuredRouteFeet = Number(answers.doorbell_route_feet);
  if ((access !== "accessible" && access !== "finished") || !Number.isFinite(measuredRouteFeet) || measuredRouteFeet < 1 || measuredRouteFeet > 200) return null;
  const doorwayDetour = access === "finished" && measuredLegHasDoorway(answers, "doorbell_route_feet")
    ? DOORWAY_DETOUR_FEET
    : 0;
  const routeFeet = measuredRouteFeet + doorwayDetour;
  if (answers.doorbell_existing !== "none" || answers.doorbell_surface !== "standard" || answers.doorbell_supply !== "customer" || answers.doorbell_chime !== "no_chime") return null;
  return {
    routeFeet, laborServiceSlug: "new-video-doorbell-wiring", cableRole: "WIRE_BELL_18_2",
    materialRoles: ["DOORBELL_TRANSFORMER", "WIRE_BELL_18_2", "CONSUMABLES_SMALL"],
    materialQuantities: { DOORBELL_TRANSFORMER: 1, WIRE_BELL_18_2: routeFeet + 6, CONSUMABLES_SMALL: 1 },
    usesBranchCableSupportPolicy: false,
    facts: {
      accessibleRoute: access === "accessible", finishedRoute: access === "finished", routeFeet,
      platePenetrationRequired: true, newTransformerRequired: true, commissioningIncluded: true,
      ...(access === "finished" ? { perpendicularFramingFeet: routeFeet, framingSpacingInches: 16 } : {}),
    },
    description: `New video-doorbell wiring with a ${access === "accessible" ? "reachable" : "finished-wall"} route of about ${routeFeet} feet${doorwayDetour ? ", including one doorway bypass" : ""}`,
  };
}

export function circuitPackageFor(serviceSlug: string, answers: Answers, dedicatedBoundaries: readonly number[] = [25, 50]): CircuitPackage | null {
  if (serviceSlug === "dedicated-120v-circuit-outlet") return dedicatedPackage(answers, dedicatedBoundaries);
  if (serviceSlug === "electric-fireplace-circuit") return fireplacePackage(answers, dedicatedBoundaries);
  if (serviceSlug === "new-240v-appliance-circuit") return appliancePackage(answers, dedicatedBoundaries);
  if (serviceSlug === "level-2-ev-charger") return evChargerPackage(answers, dedicatedBoundaries);
  if (serviceSlug === "new-ethernet-line" || serviceSlug === "new-coax-line") return lowVoltagePackage(serviceSlug, answers);
  if (serviceSlug === "new-video-doorbell-wiring") return doorbellPackage(answers);
  if (["new-ceiling-light", "new-wall-sconce", "recessed-lighting", "new-exterior-lighting-locations"].includes(serviceSlug)) return lightingExtensionPackage(serviceSlug, answers);
  if (serviceSlug in GARAGE_240V_CONFIG_BY_SLUG) return garage240vPackage(serviceSlug, answers);
  return null;
}

const laborSlugsFor = (slug: string) => slug === "dedicated-120v-circuit-outlet"
  ? new Set(["dedicated-120v-circuit-outlet", "sump-pump-dedicated-circuit", "electric-fireplace-circuit"])
  : new Set([slug]);

export async function calculateCircuitPackage(
  db: PrismaClient,
  service: any,
  answers: Answers,
  isPrimary: boolean,
  requireApproval: boolean,
) {
  const lowVoltage = service.slug === "new-ethernet-line" || service.slug === "new-coax-line";
  const breakpoint = lowVoltage ? null : await db.contractorPolicyValue.findFirst({ where: { contractorId: service.contractorId, key: "panel_circuit_run.breakpoints" }, select: { boundaries: true, resolvedAt: true } });
  if (!lowVoltage && (!breakpoint?.resolvedAt || breakpoint.boundaries.length !== 2
    || !Number.isSafeInteger(breakpoint.boundaries[0]) || breakpoint.boundaries[0] <= 0
    || !Number.isSafeInteger(breakpoint.boundaries[1]) || breakpoint.boundaries[1] <= breakpoint.boundaries[0])) {
    return { kind: "REVIEW" as const, code: "POLICY_UNRESOLVED", reason: "Complete the circuit distance bands before pricing this circuit." };
  }
  const pkg = circuitPackageFor(service.slug, answers, breakpoint?.boundaries ?? [25, 50]);
  if (!pkg) return { kind: "NOT_APPLICABLE" as const };
  const relevantRoles = [...new Set(circuitPackageMaterialRoleKeysForService(service.slug))];
  const [policies, materials, decisions, settings, approval] = await Promise.all([
    db.contractorPolicyValue.findMany({ where: { contractorId: service.contractorId, key: { in: [CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination, CONCEALED_ROUTE_POLICY_KEYS.supportSpacing, CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination] } }, select: { key: true, choice: true, measurement: true, resolvedAt: true } }),
    db.contractorMaterial.findMany({ where: { contractorId: service.contractorId, active: true, canonicalMaterial: { key: { in: relevantRoles } } }, select: { unitCostCents: true, canonicalMaterial: { select: { key: true } } } }),
    db.contractorLaborOperationDecision.findMany({ where: { contractorId: service.contractorId, trade: "electrical" }, select: { operationKey: true, hoursPerUnit: true, source: true } }),
    loadPricingSettings(db as never, service.contractorId).catch(() => null),
    db.contractorDerivedPricingApproval.findUnique({ where: { contractorId_serviceId: { contractorId: service.contractorId, serviceId: service.id } }, select: { approvedBasisFingerprint: true } }),
  ]);
  if (!settings) return { kind: "REVIEW" as const, code: "PRICING_SETTINGS_MISSING", reason: "Complete your pricing settings before pricing this circuit." };
  const policy = new Map(policies.filter((row) => row.resolvedAt !== null).map((row) => [row.key, row]));
  const slack = policy.get(CONCEALED_ROUTE_POLICY_KEYS.slackPerTermination)?.measurement ?? null;
  const spacing = policy.get(CONCEALED_ROUTE_POLICY_KEYS.supportSpacing)?.measurement ?? null;
  const supportChoice = policy.get(CONCEALED_ROUTE_POLICY_KEYS.supportAtEachTermination)?.choice ?? null;
  const terminalSupports = supportChoice === "YES" ? true : supportChoice === "NO" ? false : null;
  if (pkg.usesBranchCableSupportPolicy !== false && (slack === null || slack < 0 || spacing === null || spacing <= 0 || terminalSupports === null)) {
    return { kind: "REVIEW" as const, code: "POLICY_UNRESOLVED", reason: "Complete cable slack and support policies before pricing this circuit." };
  }
  const cost = new Map(materials.map((row) => [row.canonicalMaterial.key, row.unitCostCents]));
  const missing = pkg.materialRoles.filter((role) => !cost.has(role));
  if (missing.length) return { kind: "REVIEW" as const, code: "MATERIALS_UNRESOLVED", reason: `Enter costs for ${missing.join(", ")} before pricing this circuit.` };
  const supportCount = pkg.usesBranchCableSupportPolicy === false ? 0 : concealedNmSupportCount(pkg.routeFeet, spacing!, terminalSupports!);
  const cableFeet = pkg.usesBranchCableSupportPolicy === false
    ? (pkg.materialQuantities?.[pkg.cableRole] ?? pkg.routeFeet)
    : pkg.routeFeet + (2 * slack!);
  const materialCostCents = assembleMaterialCostCents(pkg.materialRoles.map((role) => ({
    unitCostCents: cost.get(role)!,
    quantity: pkg.materialQuantities?.[role] ?? (role === pkg.cableRole ? cableFeet : role === "NM_CABLE_SUPPORT" ? supportCount : 1),
  })));
  const labor = projectElectricalServiceLabor(pkg.laborServiceSlug, decisions, { ...pkg.facts, nmCableSupportCount: supportCount });
  if (labor.kind !== "READY_FOR_APPROVAL") return { kind: "REVIEW" as const, code: labor.kind, reason: "Approve every atomic labor operation used by this circuit package before pricing it." };
  const laborSlugs = laborSlugsFor(service.slug);
  const relevantOperations = new Set(ELECTRICAL_ATOMIC_LABOR_RECIPES
    .filter((recipe) => recipe.appliesTo.some((slug) => laborSlugs.has(slug)))
    .flatMap((recipe) => recipe.lines.map((line) => line.operationKey)));
  const relevantDecisions = decisions.filter((decision) => relevantOperations.has(decision.operationKey));
  const basisFingerprint = createHash("sha256").update(JSON.stringify({
    serviceId: service.id,
    dedicatedDistanceBoundaries: breakpoint?.boundaries ?? null,
    policies: policies.map((row) => ({ key: row.key, choice: row.choice, measurement: row.measurement, resolved: row.resolvedAt !== null })).sort((a, b) => a.key.localeCompare(b.key)),
    materials: materials.map((row) => [row.canonicalMaterial.key, row.unitCostCents]).sort(),
    labor: relevantDecisions.map((row) => [row.operationKey, row.hoursPerUnit, row.source]).sort(),
    settings,
    service: { materialMultiplier: service.materialMultiplier, permitAdminCents: service.permitAdminCents, otherDirectCostCents: service.otherDirectCostCents, isPrimaryEligible: service.isPrimaryEligible, laborCrewType: service.laborCrewType ?? "ELECTRICIAN" },
  })).digest("hex");
  if (requireApproval && approval?.approvedBasisFingerprint !== basisFingerprint) {
    return { kind: "REVIEW" as const, code: approval ? "DERIVED_PRICING_APPROVAL_STALE" : "DERIVED_PRICING_NOT_APPROVED", reason: approval ? "Circuit pricing inputs changed after approval." : "Circuit pricing is ready for contractor approval." };
  }
  const laborHours = labor.suggestedHours * fixtureHeightLaborMultiplier(answers.fixture_height, settings);
  const breakdown = suggestConfigurationPrice({
    accessClass: null, accessBySlot: {}, awaitingComponentMaterialCost: false, awaitingComponentLabor: false,
    awaitingComponentApproval: false, fieldLaborHours: laborHours, materialCostCents, estimatedMinutes: null,
    techCount: 1, components: [], addedCrewHours: 0, approvedIncrementCents: 0, legacyModifierCents: 0,
  } as never, service, settings, isPrimary);
  if (breakdown.totalCents === null) return { kind: "REVIEW" as const, code: "PRICING_INCOMPLETE", reason: breakdown.unavailableReason ?? "Circuit pricing is incomplete." };
  return {
    kind: "PRICED" as const, totalCents: breakdown.totalCents, breakdown, basisFingerprint,
    materialCostCents, laborHours, techCount: 1,
    estimatedMinutes: elapsedMinutesFromCrewHours(laborHours, 1), description: pkg.description,
    crewHourRateCents: laborRateForService(service, settings),
  };
}
