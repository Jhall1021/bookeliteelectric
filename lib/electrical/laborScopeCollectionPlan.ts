import { ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY, type LaborScopeFactCollectionPath } from "./laborScopeFactRegistry";
import { buildElectricalServiceLaborReadiness } from "./serviceLaborReadiness";

type CollectionGroupCopy = { title: string; instruction: string };

export const ELECTRICAL_LABOR_SCOPE_COLLECTION_GROUPS: Record<string, CollectionGroupCopy> = {
  ROUTE_ACCESS: { title: "Route access", instruction: "Ask once whether the proposed path has open access or must cross finished space." },
  ACCESSIBLE_ROUTE_MEASUREMENT: { title: "Accessible cable path", instruction: "Have the contractor confirm the actual attic, basement or crawlspace path. Route Assist is reserved for inaccessible finished-space or surface routes." },
  PANEL_CAPACITY_REVIEW: { title: "Panel capacity review", instruction: "Have the contractor confirm the existing panel can accept the specified new circuit; homeowner guesses are not authority." },
  GARAGE_PROTECTION_REVIEW: { title: "Garage protection review", instruction: "Have the contractor confirm the selected source already provides compliant upstream garage protection; any new or uncertain protection remains manual review." },
  LIGHTING_SOURCE_REVIEW: { title: "Existing lighting source review", instruction: "Have the contractor confirm the reported switched-light source is suitable for the proposed extension; homeowner observations do not establish technical suitability." },
  FINISHED_ROUTE_MEASUREMENT: { title: "Finished-space route", instruction: "Use a confirmed Route Assist path or contractor measurement, including the portion crossing framing." },
  FRAMING_POLICY: { title: "Framing spacing", instruction: "Use the contractor's setup default unless the job has a measured exception." },
  GENERAL_ROUTE_MEASUREMENT: { title: "General wiring route", instruction: "Confirm the end-to-end route length rather than using straight-line room distance." },
  RACEWAY_ROUTE_MEASUREMENT: { title: "Raceway route", instruction: "Confirm the physical raceway path." },
  RACEWAY_CONDUCTOR_TAKEOFF: { title: "Raceway conductor takeoff", instruction: "Derive conductor footage from the confirmed route, conductor count and approved slack." },
  SURFACE_RACEWAY_GEOMETRY: { title: "Surface-raceway geometry", instruction: "Capture route length and each observed corner or transition in one Route Assist pass." },
  SURFACE_RACEWAY_TAKEOFF: { title: "Surface-raceway takeoff", instruction: "Derive joints and supports from route geometry and the contractor's selected product rules." },
  LIGHTING_LAYOUT: { title: "Lighting count", instruction: "Collect the number of requested light locations from the chosen layout." },
  LIGHTING_LAYOUT_MEASUREMENT: { title: "Lighting route geometry", instruction: "Confirm inter-light cable paths and the distance crossing ceiling framing." },
  LANDSCAPE_LAYOUT: { title: "Landscape-lighting layout", instruction: "Collect fixture count and the actual outdoor cable route." },
  MEDIA_SCOPE: { title: "Media mounting choices", instruction: "Ask only the mount and concealment choices relevant to the selected service." },
  MEDIA_ROUTE_MEASUREMENT: { title: "Media concealment route", instruction: "Measure the selected concealed cable path." },
  CONNECTED_DEVICE_SCOPE: { title: "Connected-device setup", instruction: "Ask whether app or network commissioning is part of the selected package." },
  APPLIANCE_EXISTING_CONDITION: { title: "Existing appliance conditions", instruction: "Use homeowner-observable information plus photos; technical feed conversion comes from review." },
  EQUIPMENT_ADAPTATION_REVIEW: { title: "Equipment adaptation", instruction: "Determine support, housing and duct adaptations from guided photos; do not ask the homeowner to diagnose them." },
  DOORBELL_REMEDIATION_REVIEW: { title: "Doorbell remediation", instruction: "Determine transformer and penetration requirements from guided review." },
  CONNECTED_DEVICE_REMEDIATION_REVIEW: { title: "Connected-device power review", instruction: "Determine power remediation from guided review rather than homeowner diagnosis." },
  SPECIALTY_EQUIPMENT_TAKEOFF: { title: "Specialty-equipment takeoff", instruction: "Establish circuits, terminations, bonding points and measured route quantities from equipment review." },
  TRANSFER_SWITCH_TAKEOFF: { title: "Transfer-switch circuit scope", instruction: "Confirm the selected circuits and validate them during guided review." },
};

export type LaborScopeCollectionTask = {
  collectionGroupKey: string;
  collectionPath: LaborScopeFactCollectionPath;
  title: string;
  instruction: string;
  factKeys: string[];
  serviceSlugs: string[];
  asksUser: boolean;
};

const pathOrder: LaborScopeFactCollectionPath[] = [
  "CONTRACTOR_POLICY",
  "CUSTOMER_TREE",
  "ROUTE_ASSIST_CONFIRMED",
  "GUIDED_PHOTO_REVIEW",
  "CONTRACTOR_MEASUREMENT",
  "SYSTEM_DERIVED",
];

/**
 * Builds the smallest shared collection plan for the services a contractor
 * actually offers. A fact appears once even when dozens of services consume it.
 */
export function buildElectricalLaborScopeCollectionPlan(offeredServiceSlugs: Iterable<string>): LaborScopeCollectionTask[] {
  const offered = new Set(offeredServiceSlugs);
  const services = buildElectricalServiceLaborReadiness().filter((row) => offered.has(row.serviceSlug));
  const grouped = new Map<string, LaborScopeCollectionTask>();

  for (const service of services) {
    for (const factKey of service.missingScopeFacts) {
      const definition = ELECTRICAL_LABOR_SCOPE_FACT_BY_KEY.get(factKey);
      if (!definition) throw new Error(`missing labor scope fact definition: ${factKey}`);
      const collectionPath = definition.collectionPaths[0];
      const group = ELECTRICAL_LABOR_SCOPE_COLLECTION_GROUPS[definition.collectionGroupKey];
      if (!group) throw new Error(`missing labor scope collection group: ${definition.collectionGroupKey}`);
      const mapKey = `${collectionPath}:${definition.collectionGroupKey}`;
      const task = grouped.get(mapKey) ?? {
        collectionGroupKey: definition.collectionGroupKey,
        collectionPath,
        title: group.title,
        instruction: group.instruction,
        factKeys: [],
        serviceSlugs: [],
        asksUser: collectionPath !== "SYSTEM_DERIVED",
      };
      if (!task.factKeys.includes(factKey)) task.factKeys.push(factKey);
      if (!task.serviceSlugs.includes(service.serviceSlug)) task.serviceSlugs.push(service.serviceSlug);
      grouped.set(mapKey, task);
    }
  }

  return [...grouped.values()]
    .map((task) => ({ ...task, factKeys: task.factKeys.sort(), serviceSlugs: task.serviceSlugs.sort() }))
    .sort((a, b) => pathOrder.indexOf(a.collectionPath) - pathOrder.indexOf(b.collectionPath)
      || a.collectionGroupKey.localeCompare(b.collectionGroupKey));
}
