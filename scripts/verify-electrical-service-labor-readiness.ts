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
ok(priceable.filter((row) => row.missingScopeFacts.length > 0).length === 43, "43 priceable services name unresolved physical scope facts rather than hiding them in flat hours");
ok(priceable.every((row) => row.scopeFactsWithoutCollectionPath.length === 0), "every missing physical fact has an explicit collection path");
ok(priceable.filter((row) => row.runtimeConnection === "CONNECTED").length === 36, "33 bounded services, two policy-bounded connected devices, and the new-outlet route pilot have atomic runtime pricing paths");

const recessed = rows.find((row) => row.serviceSlug === "recessed-lighting")!;
ok(recessed.missingScopeFacts.includes("interLightCableFeet") && recessed.missingScopeFacts.includes("perpendicularCeilingFeet"), "recessed lighting names its missing layout geometry");
ok(recessed.runtimeConnection === "NOT_CONNECTED", "recessed lighting is explicitly marked not yet connected to runtime pricing");
const newOutlet = rows.find((row) => row.serviceSlug === "new-120v-outlet")!;
ok(newOutlet.runtimeConnection === "CONNECTED", "new outlet reports the real DERIVED_RESOLVED_SCOPE atomic connection");
for (const slug of ["replace-standard-outlet", "replace-standard-switch", "replace-gfci-outlet", "replace-3-way-switch", "replace-led-dimmer", "usb-outlet-upgrade"]) {
  ok(rows.find((row) => row.serviceSlug === slug)?.runtimeConnection === "CONNECTED", `${slug} reports the bounded atomic-duration runtime path`);
}
ok(rows.find((row) => row.serviceSlug === "customer-supplied-smart-switch")?.runtimeConnection === "CONNECTED", "smart switch reports its contractor-policy atomic runtime path");
ok(rows.find((row) => row.serviceSlug === "smart-outlet-upgrade")?.runtimeConnection === "CONNECTED", "smart outlet reports its contractor-policy atomic runtime path");
ok(rows.find((row) => row.serviceSlug === "smart-thermostat-install")?.runtimeConnection === "NOT_CONNECTED", "smart thermostat remains blocked on guided remediation facts");
const microwave = rows.find((row) => row.serviceSlug === "otr-microwave-install")!;
ok(microwave.directCalibrationScenarioKeys.includes("otr-microwave-clean-swap"), "microwave replacement exposes its new direct specialty check in the catalog-wide ledger");
const review = rows.find((row) => row.serviceSlug === "electrical-troubleshooting")!;
ok(review.state === "NON_PRICEABLE_REVIEW", "diagnostic work is not misreported as a missing fixed-price recipe");

console.log(`\nELECTRICAL SERVICE LABOR READINESS — ${checks}/${checks} checks passed`);
