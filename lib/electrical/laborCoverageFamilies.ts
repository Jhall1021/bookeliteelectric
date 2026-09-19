/**
 * Catalog-wide decomposition queue. Every service in the generated Electrical
 * labor ledger must occur exactly once here, active or inactive.
 */
export type LaborFamilyStatus = "ATOMIC_STARTED" | "QUEUED" | "NON_PRICEABLE_REVIEW" | "INTERNAL_FIXTURE";

export type ElectricalLaborFamily = {
  key: string;
  name: string;
  status: LaborFamilyStatus;
  serviceSlugs: string[];
};

export const ELECTRICAL_LABOR_FAMILIES: ElectricalLaborFamily[] = [
  {
    key: "branch-routing", name: "Branch circuits, outlets and physical routing", status: "ATOMIC_STARTED",
    serviceSlugs: [
      "240v-garage-outlet", "240v-garage-outlet-14-30", "240v-garage-outlet-14-50", "240v-garage-outlet-6-50",
      "bidet-smart-toilet-outlet", "dedicated-120v-circuit-outlet", "electric-fireplace-circuit",
      "exterior-gfci-other-routing", "exterior-gfci-standard", "freezer-fridge-dedicated-circuit",
      "garage-door-opener-outlet", "garage-door-opener-outlet-ev", "level-2-ev-charger", "new-120v-outlet",
      "new-240v-appliance-circuit", "sump-pump-dedicated-circuit", "surface-mounted-fixture-box",
      "surface-mounted-outlet", "surface-mounted-switch",
    ],
  },
  {
    key: "devices-controls", name: "Device replacement and controls", status: "ATOMIC_STARTED",
    serviceSlugs: [
      "customer-supplied-smart-switch", "hardwired-smoke-detector", "occupancy-motion-switch",
      "range-receptacle-replacement", "dryer-receptacle-replacement", "replace-3-way-switch",
      "replace-gfci-outlet", "replace-led-dimmer", "replace-standard-outlet", "replace-standard-switch",
      "smart-outlet-upgrade", "smart-thermostat-install", "smoke-co-detector", "timer-switch-install",
      "usb-outlet-upgrade",
    ],
  },
  {
    key: "lighting-fans", name: "Lighting, fans and lighting controls", status: "ATOMIC_STARTED",
    serviceSlugs: [
      "bathroom-fan-light-combo", "fan-replacing-light", "new-ceiling-fan", "new-ceiling-light",
      "new-wall-sconce", "recessed-lighting", "replace-bathroom-exhaust-fan",
      "replace-bathroom-exhaust-fan-with-light", "replace-ceiling-fan", "replace-exterior-light-fixture",
      "replace-interior-light-fixture", "replace-motion-flood-light", "replace-wall-sconce",
      "under-cabinet-led-lighting",
    ],
  },
  {
    key: "appliances", name: "Appliance electrical connections", status: "ATOMIC_STARTED",
    serviceSlugs: [
      "dishwasher-electrical", "garbage-disposal-install", "install-new-microwave", "otr-microwave-install",
      "replace-range-hood",
    ],
  },
  {
    key: "media-low-voltage-security", name: "TV, data, doorbell and camera work", status: "ATOMIC_STARTED",
    serviceSlugs: [
      "doorbell-transformer-replacement", "elite-articulating-mount", "elite-tilt-mount",
      "floodlight-camera-existing", "new-coax-line", "new-ethernet-line", "new-exterior-flood-camera",
      "new-video-doorbell-wiring", "soundbar-installation", "tv-install-existing-location", "tv-installation",
      "video-doorbell-existing-wiring",
    ],
  },
  {
    key: "panels-protection", name: "Breakers, panels and service equipment", status: "ATOMIC_STARTED",
    serviceSlugs: [
      "200a-service-upgrade", "double-pole-breaker-replacement", "electrical-panel-replacement",
      "single-pole-breaker-replacement", "whole-house-surge-protection",
    ],
  },
  {
    key: "outdoor-generation-specialty", name: "Outdoor, generator, pool and spa", status: "ATOMIC_STARTED",
    serviceSlugs: [
      "generator-inlet-interlock", "hot-tub-spa-electrical", "new-exterior-lighting-locations",
      "outdoor-landscape-lighting", "pool-equipment-electrical", "transfer-switch",
    ],
  },
  {
    key: "diagnostic-review", name: "Diagnostics, inspection and review-led work", status: "NON_PRICEABLE_REVIEW",
    serviceSlugs: ["electrical-troubleshooting", "home-electrical-safety-inspection"],
  },
  {
    key: "routing-fixtures", name: "Internal Routing V2 proof fixtures", status: "INTERNAL_FIXTURE",
    serviceSlugs: [
      "rv2-fixture-accessible-outlet", "rv2-fixture-accessible-switch", "rv2-fixture-back-to-back-outlet",
      "rv2-fixture-finished-wall-outlet",
    ],
  },
];

export function indexedElectricalLaborFamilies(): Map<string, ElectricalLaborFamily> {
  const result = new Map<string, ElectricalLaborFamily>();
  for (const family of ELECTRICAL_LABOR_FAMILIES) {
    for (const slug of family.serviceSlugs) {
      if (result.has(slug)) throw new Error(`Electrical service appears in more than one labor family: ${slug}`);
      result.set(slug, family);
    }
  }
  return result;
}
