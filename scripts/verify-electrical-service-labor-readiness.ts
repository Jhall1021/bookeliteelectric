import { strict as assert } from "node:assert";
import { buildElectricalServiceLaborReadiness } from "../lib/electrical/serviceLaborReadiness";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const rows = buildElectricalServiceLaborReadiness();
ok(rows.length === 82, "all 82 catalog services have one readiness row");
ok(new Set(rows.map((row) => row.serviceSlug)).size === 82, "no service is duplicated across readiness families");
const priceable = rows.filter((row) => row.state !== "NON_PRICEABLE_REVIEW" && row.state !== "INTERNAL_FIXTURE");
ok(priceable.length === 76, "76 customer-priceable services are distinguished from two review services and four fixtures");
ok(priceable.every((row) => row.recipeKeys.length > 0), "every priceable service has at least one canonical atomic recipe");
ok(priceable.every((row) => row.operationKeys.length > 0), "every priceable service recipe contains explicit labor operations");
ok(priceable.every((row) => row.operationsNeedingCalibration.length > 0), "readiness honestly reports calibration still incomplete rather than treating a published-book suggestion as contractor approval");
ok(priceable.every((row) => row.operationsWithoutWizardPath.length === 0), "every operation in every priceable service has a direct-question or calibration-family path through the wizard");
ok(priceable.every((row) => row.calibrationGroupKeys.length > 0), "every priceable service is represented by at least one explicit labor calibration family");
ok(priceable.filter((row) => row.missingScopeFacts.length > 0).length === 36, "36 priceable services name unresolved physical scope facts rather than hiding them in flat hours");
ok(priceable.every((row) => row.scopeFactsWithoutCollectionPath.length === 0), "every missing physical fact has an explicit collection path");
ok(priceable.filter((row) => row.runtimeConnection === "CONNECTED").length === 52, "40 bounded services, six policy-bound connected-device packages, the new-outlet route pilot, three surface-route services, and two standard accessible low-voltage packages have atomic runtime pricing paths");

const recessed = rows.find((row) => row.serviceSlug === "recessed-lighting")!;
ok(recessed.missingScopeFacts.includes("interLightCableFeet") && recessed.missingScopeFacts.includes("perpendicularCeilingFeet"), "recessed lighting names its missing layout geometry");
ok(recessed.runtimeConnection === "NOT_CONNECTED", "recessed lighting is explicitly marked not yet connected to runtime pricing");
const newOutlet = rows.find((row) => row.serviceSlug === "new-120v-outlet")!;
ok(newOutlet.runtimeConnection === "CONNECTED", "new outlet reports the real DERIVED_RESOLVED_SCOPE atomic connection");
for (const slug of ["surface-mounted-outlet", "surface-mounted-switch", "surface-mounted-fixture-box"]) {
  const surface = rows.find((row) => row.serviceSlug === slug)!;
  ok(surface.runtimeConnection === "CONNECTED", `${slug} reports the shared surface takeoff and atomic labor runtime path`);
  ok(surface.runtimeConnectionReason.includes("Route Assist is not pricing authority"), `${slug} preserves the contractor-confirmation boundary for Route Assist evidence`);
}
for (const slug of ["replace-standard-outlet", "replace-standard-switch", "replace-gfci-outlet", "replace-3-way-switch", "replace-led-dimmer", "usb-outlet-upgrade"]) {
  ok(rows.find((row) => row.serviceSlug === slug)?.runtimeConnection === "CONNECTED", `${slug} reports the bounded atomic-duration runtime path`);
}
ok(rows.find((row) => row.serviceSlug === "customer-supplied-smart-switch")?.runtimeConnection === "CONNECTED", "smart switch reports its contractor-policy atomic runtime path");
ok(rows.find((row) => row.serviceSlug === "smart-outlet-upgrade")?.runtimeConnection === "CONNECTED", "smart outlet reports its contractor-policy atomic runtime path");
ok(rows.find((row) => row.serviceSlug === "video-doorbell-existing-wiring")?.runtimeConnection === "CONNECTED", "existing-wiring video doorbell reports its contractor-policy atomic runtime path");
ok(rows.find((row) => row.serviceSlug === "new-video-doorbell-wiring")?.runtimeConnection === "CONNECTED", "new-wiring video doorbell reports only its contractor-reviewed standard package as connected");
ok(rows.find((row) => row.serviceSlug === "floodlight-camera-existing")?.runtimeConnection === "CONNECTED", "existing-fixture camera reports its contractor-policy atomic runtime path");
ok(rows.find((row) => row.serviceSlug === "smart-thermostat-install")?.runtimeConnection === "CONNECTED", "smart thermostat connects only as a compatible-wiring package with contractor commissioning policy");
const microwave = rows.find((row) => row.serviceSlug === "otr-microwave-install")!;
ok(microwave.directCalibrationScenarioKeys.includes("otr-microwave-clean-swap"), "microwave replacement exposes its new direct specialty check in the catalog-wide ledger");
const newMicrowave = rows.find((row) => row.serviceSlug === "install-new-microwave")!;
ok(newMicrowave.runtimeConnection === "CONNECTED" && newMicrowave.missingScopeFacts.length === 0, "new microwave reports the bounded prepared/mount-only atomic runtime path");
const tvInstallation = rows.find((row) => row.serviceSlug === "tv-installation")!;
ok(tvInstallation.runtimeConnection === "CONNECTED" && tvInstallation.missingScopeFacts.length === 0, "TV installation reports one bounded parent-mount duration without duplicating referenced add-on labor");
const soundbar = rows.find((row) => row.serviceSlug === "soundbar-installation")!;
ok(soundbar.runtimeConnection === "CONNECTED" && soundbar.missingScopeFacts.length === 0, "soundbar reports only the prepared visible-cable branch as its bounded atomic runtime path");
for (const slug of ["new-ethernet-line", "new-coax-line"]) {
  const lowVoltage = rows.find((row) => row.serviceSlug === slug)!;
  ok(lowVoltage.runtimeConnection === "CONNECTED" && lowVoltage.runtimeConnectionReason.includes("approximate standard accessible range"), `${slug} reports only its contractor-reviewed standard accessible package as connected`);
}
const fanReplacingLight = rows.find((row) => row.serviceSlug === "fan-replacing-light")!;
ok(fanReplacingLight.runtimeConnection === "CONNECTED" && fanReplacingLight.missingScopeFacts.length === 0, "light-to-fan conversion reports the standard included fan-support package as its bounded atomic runtime path");
for (const slug of ["bathroom-fan-light-combo", "replace-bathroom-exhaust-fan", "replace-bathroom-exhaust-fan-with-light"]) {
  const bathFan = rows.find((row) => row.serviceSlug === slug)!;
  ok(bathFan.runtimeConnection === "CONNECTED" && bathFan.missingScopeFacts.length === 0, `${slug} reports only its compatible clean-swap package as the bounded atomic runtime path`);
}
const review = rows.find((row) => row.serviceSlug === "electrical-troubleshooting")!;
ok(review.state === "NON_PRICEABLE_REVIEW", "diagnostic work is not misreported as a missing fixed-price recipe");

console.log(`\nELECTRICAL SERVICE LABOR READINESS — ${checks}/${checks} checks passed`);
