/**
 * Platform-authored starting quantities for policy-controlled electrical
 * recipe lines. These are editable catalog defaults, not observations copied
 * from any contractor. Route-resolved services may still calculate their
 * actual wire/support takeoff from homeowner answers; these values only make
 * the installed base recipe complete.
 */
export type PreparedMaterialAllowance = {
  service: string;
  role: string;
  quantity: number;
  source: string;
};

export const ELECTRICAL_PREPARED_MATERIAL_ALLOWANCES: readonly PreparedMaterialAllowance[] = [
  { service: "200a-service-upgrade", role: "SERVICE_ENTRANCE_CABLE_200A", quantity: 20, source: "seed-200a-service-upgrade FEEDER_FT" },
  { service: "200a-service-upgrade", role: "WIRE_SERVICE_AL_4_0", quantity: 20, source: "seed-200a-service-upgrade two 10-foot mast conductors" },
  { service: "200a-service-upgrade", role: "WIRE_SERVICE_AL_2_0_NEUTRAL", quantity: 10, source: "seed-200a-service-upgrade 10-foot mast neutral" },
  { service: "200a-service-upgrade", role: "WIRE_GROUND_6", quantity: 25, source: "seed-200a-service-upgrade bounded recipe" },
  { service: "200a-service-upgrade", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-200a-service-upgrade bounded recipe" },
  { service: "240v-garage-outlet", role: "WIRE_10_2", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },
  { service: "240v-garage-outlet-14-30", role: "WIRE_10_3", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet-14-30", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },
  { service: "240v-garage-outlet-6-50", role: "WIRE_6_2", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet-6-50", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },
  { service: "240v-garage-outlet-14-50", role: "WIRE_6_3", quantity: 25, source: "seed-240v-garage-outlet RUN_FT" },
  { service: "240v-garage-outlet-14-50", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-240v-garage-outlet shared recipe" },
  { service: "electrical-panel-replacement", role: "BREAKER_SINGLE_POLE", quantity: 17, source: "seed-panel-replacement current panel assumption" },
  { service: "electrical-panel-replacement", role: "BREAKER_DOUBLE_POLE", quantity: 3, source: "seed-panel-replacement current panel assumption" },
  { service: "electrical-panel-replacement", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-panel-replacement bounded recipe" },
  { service: "fan-replacing-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "generator-inlet-interlock", role: "WIRE_10_3", quantity: 10, source: "seed-generator-inlet INCLUDED_RUN_FT" },
  { service: "generator-inlet-interlock", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-generator-inlet bounded recipe" },
  { service: "hot-tub-spa-electrical", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-hot-tub-spa fixed reviewed package" },
  { service: "new-ceiling-fan", role: "WIRE_14_2", quantity: 25, source: "seed-materials new light point policy" },
  { service: "new-ceiling-fan", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "new-ceiling-light", role: "WIRE_14_2", quantity: 25, source: "seed-materials new light point policy" },
  { service: "new-ceiling-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "new-coax-line", role: "CABLE_RG6", quantity: 60, source: "seed-low-voltage-and-sconces accessible run" },
  { service: "new-coax-line", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces recipe" },
  { service: "new-ethernet-line", role: "CABLE_CAT6", quantity: 60, source: "seed-low-voltage-and-sconces accessible run" },
  { service: "new-ethernet-line", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces recipe" },
  { service: "new-exterior-flood-camera", role: "WIRE_12_2", quantity: 2, source: "seed-materials ordinary siding/soffit recipe" },
  { service: "new-exterior-flood-camera", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials ordinary siding/soffit recipe" },
  { service: "new-exterior-lighting-locations", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-new-exterior-light-location bounded one-light recipe" },
  { service: "new-video-doorbell-wiring", role: "WIRE_BELL_18_2", quantity: 25, source: "seed-video-doorbell-wiring INCLUDED_WIRE_FT" },
  { service: "new-video-doorbell-wiring", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-video-doorbell-wiring bounded recipe" },
  { service: "new-wall-sconce", role: "WIRE_14_2", quantity: 25, source: "seed-low-voltage-and-sconces recipe" },
  { service: "new-wall-sconce", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces recipe" },
  { service: "recessed-lighting", role: "WIRE_14_2", quantity: 25, source: "seed-materials first-light home run" },
  { service: "recessed-lighting", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials first-light recipe" },
  { service: "replace-bathroom-exhaust-fan", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-bathroom-fans replacement recipe" },
  { service: "replace-bathroom-exhaust-fan-with-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "bathroom fan replacement package" },
  { service: "replace-range-hood", role: "CONSUMABLES_SMALL", quantity: 1, source: "range hood replacement package" },
  { service: "replace-wall-sconce", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-low-voltage-and-sconces replacement recipe" },
  { service: "soundbar-installation", role: "CONSUMABLES_SMALL", quantity: 1, source: "soundbar installation package" },
  { service: "tv-installation", role: "WIRE_14_2", quantity: 8, source: "seed-materials TV power recipe" },
  { service: "under-cabinet-led-lighting", role: "WIRE_14_2", quantity: 25, source: "seed-under-cabinet-lighting bounded recipe" },
  { service: "under-cabinet-led-lighting", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-under-cabinet-lighting bounded recipe" },
  { service: "bidet-smart-toilet-outlet", role: "WIRE_14_2", quantity: 25, source: "seed-materials bounded outlet recipe" },
  { service: "bidet-smart-toilet-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials bounded outlet recipe" },
  { service: "customer-supplied-smart-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "dedicated-120v-circuit-outlet", role: "WIRE_14_2", quantity: 50, source: "derived circuit-family policy allowance" },
  { service: "dedicated-120v-circuit-outlet", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived circuit-family policy allowance" },
  { service: "dishwasher-electrical", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance connection recipe" },
  { service: "doorbell-transformer-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "double-pole-breaker-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials breaker recipe" },
  { service: "dryer-receptacle-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "electric-fireplace-circuit", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived circuit-family policy allowance" },
  { service: "exterior-gfci-other-routing", role: "WIRE_12_2", quantity: 15, source: "seed-exterior-gfci-routing bounded legacy package" },
  { service: "exterior-gfci-other-routing", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-exterior-gfci-routing bounded recipe" },
  { service: "exterior-gfci-standard", role: "WIRE_12_2", quantity: 2, source: "seed-materials back-to-back GFCI recipe" },
  { service: "exterior-gfci-standard", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials back-to-back GFCI recipe" },
  { service: "floodlight-camera-existing", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "garage-door-opener-outlet", role: "WIRE_14_2", quantity: 25, source: "seed-materials bounded outlet recipe" },
  { service: "garage-door-opener-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials bounded outlet recipe" },
  { service: "garage-door-opener-outlet-ev", role: "WIRE_14_2", quantity: 25, source: "seed-materials bounded outlet recipe" },
  { service: "garage-door-opener-outlet-ev", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials bounded outlet recipe" },
  { service: "garbage-disposal-install", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance connection recipe" },
  { service: "hardwired-smoke-detector", role: "SMOKE_DETECTOR_HARDWIRED", quantity: 1, source: "seed-materials detector recipe" },
  { service: "hardwired-smoke-detector", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials detector recipe" },
  { service: "install-new-microwave", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance recipe" },
  { service: "level-2-ev-charger", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived EV route package" },
  { service: "new-240v-appliance-circuit", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "derived circuit-family policy allowance" },
  { service: "occupancy-motion-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials control recipe" },
  { service: "otr-microwave-install", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials appliance recipe" },
  { service: "outdoor-landscape-lighting", role: "CONSUMABLES_MEDIUM", quantity: 1, source: "seed-materials landscape-lighting recipe" },
  { service: "range-receptacle-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-3-way-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-ceiling-fan", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-exterior-light-fixture", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-gfci-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-interior-light-fixture", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-led-dimmer", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials control recipe" },
  { service: "replace-motion-flood-light", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials fixture recipe" },
  { service: "replace-standard-outlet", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "replace-standard-switch", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "single-pole-breaker-replacement", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials breaker recipe" },
  { service: "smart-outlet-upgrade", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "smoke-co-detector", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials detector recipe" },
  { service: "timer-switch-install", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials control recipe" },
  { service: "tv-install-existing-location", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials TV recipe" },
  { service: "usb-outlet-upgrade", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
  { service: "video-doorbell-existing-wiring", role: "CONSUMABLES_SMALL", quantity: 1, source: "seed-materials device recipe" },
];

const allowanceByServiceAndRole = new Map(
  ELECTRICAL_PREPARED_MATERIAL_ALLOWANCES.map((allowance) => [
    `${allowance.service}\u0000${allowance.role}`,
    allowance,
  ]),
);
if (allowanceByServiceAndRole.size !== ELECTRICAL_PREPARED_MATERIAL_ALLOWANCES.length) {
  throw new Error("Electrical prepared material allowances contain a duplicate service/role pair.");
}
for (const allowance of ELECTRICAL_PREPARED_MATERIAL_ALLOWANCES) {
  if (!Number.isFinite(allowance.quantity) || allowance.quantity <= 0) {
    throw new Error(`Electrical prepared material allowance is invalid for ${allowance.service}/${allowance.role}.`);
  }
}

export function preparedMaterialAllowance(
  trade: string,
  serviceSlug: string,
  roleKey: string,
): PreparedMaterialAllowance | null {
  if (trade !== "electrical") return null;
  return allowanceByServiceAndRole.get(`${serviceSlug}\u0000${roleKey}`) ?? null;
}
