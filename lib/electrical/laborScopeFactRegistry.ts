export type LaborScopeFactCollectionPath =
  | "CUSTOMER_TREE"
  | "ROUTE_ASSIST_CONFIRMED"
  | "GUIDED_PHOTO_REVIEW"
  | "CONTRACTOR_MEASUREMENT"
  | "CONTRACTOR_POLICY"
  | "SYSTEM_DERIVED";

export type LaborScopeFactDefinition = {
  key: string;
  collectionGroupKey: string;
  valueType: "BOOLEAN" | "COUNT" | "FEET" | "INCHES";
  collectionPaths: LaborScopeFactCollectionPath[];
  description: string;
  /** Explains when the value is derived instead of asked directly. */
  derivation?: string;
};

const fact = (
  key: string,
  collectionGroupKey: string,
  valueType: LaborScopeFactDefinition["valueType"],
  collectionPaths: LaborScopeFactCollectionPath[],
  description: string,
  derivation?: string,
): LaborScopeFactDefinition => ({ key, collectionGroupKey, valueType, collectionPaths, description, derivation });

/**
 * Collection design for every physical fact currently required by an electrical
 * atomic recipe. These are collection paths, not permission to price: facts,
 * contractor-approved labor units and runtime activation remain separate gates.
 */
export const ELECTRICAL_LABOR_SCOPE_FACTS: LaborScopeFactDefinition[] = [
  fact("backToBackRoute", "ROUTE_ACCESS", "BOOLEAN", ["GUIDED_PHOTO_REVIEW", "CONTRACTOR_MEASUREMENT"], "Whether source and destination are confirmed directly opposite on one ordinary wall with a suitable established source."),
  fact("accessibleRoute", "ROUTE_ACCESS", "BOOLEAN", ["CUSTOMER_TREE"], "Whether the route has usable attic, basement, crawlspace or other open access."),
  fact("finishedRoute", "ROUTE_ACCESS", "BOOLEAN", ["CUSTOMER_TREE"], "Whether the route must travel through finished walls or ceilings."),
  fact("accessibleRouteFeet", "ACCESSIBLE_ROUTE_MEASUREMENT", "FEET", ["CUSTOMER_TREE", "CONTRACTOR_MEASUREMENT"], "Approximate point-to-point cable distance through an accessible attic, basement or crawlspace. A contractor measurement may replace it for reviewed specialty packages; Route Assist remains reserved for inaccessible finished-space or surface routes."),
  fact("nmCableSupportCount", "ACCESSIBLE_ROUTE_MEASUREMENT", "COUNT", ["SYSTEM_DERIVED"], "NM cable supports required for an accessible route under the contractor's declared spacing and termination rules.", "Derive from accepted route footage plus the resolved concealed-branch support-spacing and termination policies."),
  fact("panelCapacityConfirmed", "PANEL_CAPACITY_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review confirms the existing panel can accept the specified new circuit without corrective or capacity work."),
  fact("applianceCircuitConfigurationConfirmed", "APPLIANCE_CIRCUIT_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review of the appliance instructions and plug confirms the exact four-wire dryer or range circuit package without hardwired, legacy three-wire, or remediation scope."),
  fact("evChargerConfigurationConfirmed", "EV_CHARGER_CONFIGURATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review confirms a customer-supplied hardwired charger with a 40A output on a 50A circuit, ordinary attached-garage mounting, and no load management, specialty endpoint, panel work, or commissioning scope."),
  fact("fireplaceEquipmentRatingConfirmed", "FIREPLACE_EQUIPMENT_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review of the fireplace label or manufacturer instructions confirms a standard plug-in 120V unit requiring the selected 15A or 20A dedicated circuit without hardwired or nonstandard connection scope."),
  fact("sumpPumpProtectionConfirmed", "SUMP_PUMP_PROTECTION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review confirms the selected 20A GFCI protection and receptacle arrangement is appropriate for the sump-pump location and requires no additional remediation."),
  fact("existingGarageProtectionConfirmed", "GARAGE_PROTECTION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review confirms the selected existing source already provides compliant upstream garage protection and requires no protection remediation."),
  fact("existingLightingSourceConfirmed", "LIGHTING_SOURCE_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review confirms the reported existing switched-light source is suitable for the bounded new-light extension without remediation."),
  fact("concealedRouteFeet", "FINISHED_ROUTE_MEASUREMENT", "FEET", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Confirmed cable path through finished walls or ceilings."),
  fact("perpendicularFramingFeet", "FINISHED_ROUTE_MEASUREMENT", "FEET", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Portion of a finished route that crosses framing rather than running within one bay."),
  fact("perpendicularCeilingFeet", "LIGHTING_LAYOUT_MEASUREMENT", "FEET", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Ceiling distance that crosses joists between lighting points."),
  fact("framingSpacingInches", "FRAMING_POLICY", "INCHES", ["CONTRACTOR_POLICY", "CONTRACTOR_MEASUREMENT"], "Contractor-declared or measured framing spacing used to count crossings."),
  fact("routeFeet", "GENERAL_ROUTE_MEASUREMENT", "FEET", ["CONTRACTOR_MEASUREMENT", "CONTRACTOR_POLICY"], "Contractor-confirmed end-to-end wiring route length or contractor-approved maximum footage for an explicitly bounded standard package."),
  fact("racewayFeet", "RACEWAY_ROUTE_MEASUREMENT", "FEET", ["CONTRACTOR_MEASUREMENT"], "Contractor-measured power-raceway path length; this is not Wiremold geometry."),
  fact("equipmentWhipFeet", "RACEWAY_ROUTE_MEASUREMENT", "FEET", ["CONTRACTOR_MEASUREMENT"], "Contractor-measured liquidtight raceway path from the spa disconnect to the equipment connection."),
  fact("conductorFeet", "RACEWAY_CONDUCTOR_TAKEOFF", "FEET", ["SYSTEM_DERIVED"], "Total conductor footage pulled through a raceway route.", "Derive from confirmed raceway geometry, conductor count and contractor-approved slack policy."),
  fact("surfaceRouteFeet", "SURFACE_RACEWAY_GEOMETRY", "FEET", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Measured surface-raceway path."),
  fact("insideCornerCount", "SURFACE_RACEWAY_GEOMETRY", "COUNT", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Observed inside corners on the surface route."),
  fact("outsideCornerCount", "SURFACE_RACEWAY_GEOMETRY", "COUNT", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Observed outside corners on the surface route."),
  fact("flatCornerCount", "SURFACE_RACEWAY_GEOMETRY", "COUNT", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Observed flat elbows on the surface route."),
  fact("transitionCount", "SURFACE_RACEWAY_GEOMETRY", "COUNT", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Observed transitions between raceway and another wiring method."),
  fact("straightJointCount", "SURFACE_RACEWAY_TAKEOFF", "COUNT", ["SYSTEM_DERIVED"], "Straight couplings required by the selected raceway sticks.", "Derive from measured route segments and the selected product's stick length."),
  fact("supportCount", "SURFACE_RACEWAY_TAKEOFF", "COUNT", ["SYSTEM_DERIVED"], "Raceway supports required by the contractor's fastening standard.", "Derive from route length, corners and contractor-approved support spacing."),
  fact("lightCount", "LIGHTING_LAYOUT", "COUNT", ["CUSTOMER_TREE"], "Number of new recessed lights requested by the customer."),
  fact("interLightCableFeet", "LIGHTING_LAYOUT_MEASUREMENT", "FEET", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Confirmed cable path connecting the light locations."),
  fact("exteriorLightCount", "LIGHTING_LAYOUT", "COUNT", ["CUSTOMER_TREE"], "Number of new exterior light locations requested by the customer."),
  fact("landscapeFixtureCount", "LANDSCAPE_LAYOUT", "COUNT", ["CUSTOMER_TREE", "CONTRACTOR_MEASUREMENT"], "Number of landscape fixtures in the selected layout."),
  fact("landscapeCableFeet", "LANDSCAPE_LAYOUT", "FEET", ["CONTRACTOR_MEASUREMENT"], "Contractor-measured outdoor landscape cable route."),
  fact("landscapeConfigurationConfirmed", "LANDSCAPE_CONFIGURATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review confirms compatible customer-supplied low-voltage equipment, a suitable existing outdoor GFCI source, and an ordinary softscape route without power remediation or specialty excavation."),
  fact("concealmentIncluded", "MEDIA_SCOPE", "BOOLEAN", ["CUSTOMER_TREE"], "Whether the customer selected concealed media cabling."),
  fact("concealedCableFeet", "MEDIA_ROUTE_MEASUREMENT", "FEET", ["ROUTE_ASSIST_CONFIRMED", "CONTRACTOR_MEASUREMENT"], "Confirmed concealed media-cable path."),
  fact("commissioningIncluded", "CONNECTED_DEVICE_SCOPE", "BOOLEAN", ["CUSTOMER_TREE", "CONTRACTOR_POLICY"], "Whether app or network commissioning is included in the selected package."),
  fact("existingHoodRemoval", "APPLIANCE_EXISTING_CONDITION", "BOOLEAN", ["CUSTOMER_TREE", "GUIDED_PHOTO_REVIEW"], "Whether an existing hood must be removed before microwave installation."),
  fact("convertHoodFeedToReceptacle", "APPLIANCE_EXISTING_CONDITION", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether the existing hood feed needs a receptacle conversion; determined from review, not homeowner diagnosis."),
  fact("ductAdaptationRequired", "EQUIPMENT_ADAPTATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether the replacement fan needs a duct transition or adaptation."),
  fact("housingAdaptationRequired", "EQUIPMENT_ADAPTATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether the replacement fan housing/opening needs adaptation; finish repair remains excluded."),
  fact("fanSupportRequired", "EQUIPMENT_ADAPTATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether listed fan support must be installed; never inferred from a homeowner's diagnosis."),
  fact("newTransformerRequired", "DOORBELL_REMEDIATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW", "SYSTEM_DERIVED"], "Whether doorbell transformer remediation is required; true is system-derived only for the explicit new-wiring/no-transformer service definition.", "Derive true only when the selected service and validated customer path explicitly establish that no usable doorbell wiring or transformer exists."),
  fact("platePenetrationRequired", "DOORBELL_REMEDIATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW", "CONTRACTOR_MEASUREMENT"], "Whether the route requires a top- or bottom-plate penetration."),
  fact("powerRemediationRequired", "CONNECTED_DEVICE_REMEDIATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether compatible power or control wiring must be added; never homeowner-diagnosed."),
  fact("bondingConnectionCount", "SPECIALTY_EQUIPMENT_TAKEOFF", "COUNT", ["GUIDED_PHOTO_REVIEW", "CONTRACTOR_MEASUREMENT"], "Count of equipment bonding connections established by review."),
  fact("bondingConductorFeet", "SPECIALTY_EQUIPMENT_TAKEOFF", "FEET", ["CONTRACTOR_MEASUREMENT"], "Measured bonding-conductor footage for the contractor-confirmed pool or spa bonding scope."),
  fact("spaBondingRequired", "SPECIALTY_EQUIPMENT_TAKEOFF", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether the reviewed spa installation requires included external bonding work; the homeowner is never asked to diagnose this."),
  fact("spaConfigurationConfirmed", "SPA_CONFIGURATION_REVIEW", "BOOLEAN", ["GUIDED_PHOTO_REVIEW"], "Whether contractor review confirms an exact 50A four-wire spa package, suitable panel capacity, compliant disconnect location, ordinary exterior-wall PVC route, liquidtight equipment connection and no remediation."),
];

export const ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY = new Map(ELECTRICAL_LABOR_SCOPE_FACTS.map((definition) => [definition.key, definition]));
