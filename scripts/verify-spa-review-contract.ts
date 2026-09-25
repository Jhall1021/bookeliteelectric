import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { REVIEWED_SPA_PACKAGE, reviewedSpaPackage } from "../lib/electrical/spaReviewPackage";

const eligible = {
  spa_placed: "placed",
  spa_requirements: "label_available",
  spa_panel_location: "exterior_same_wall",
  spa_route: "ordinary_exterior_wall",
  spa_distance: "within_25",
};

assert.deepEqual(REVIEWED_SPA_PACKAGE, {
  circuitAmps: 50,
  conductorCount: 4,
  ungroundedConductorRole: "CONDUCTOR_THHN_6_UNGROUNDED",
  groundedConductorRole: "CONDUCTOR_THHN_6_GROUNDED",
  equipmentGroundRole: "CONDUCTOR_THHN_10_EQUIPMENT_GROUND",
});
assert.deepEqual(reviewedSpaPackage("hot-tub-spa-electrical", eligible), REVIEWED_SPA_PACKAGE);
for (const [key, value] of [
  ["spa_placed", "not_placed_or_unsure"],
  ["spa_requirements", "requirements_unavailable"],
  ["spa_panel_location", "other_or_unsure"],
  ["spa_route", "nonstandard_or_unsure"],
  ["spa_distance", "over_25_or_unsure"],
] as const) assert.equal(reviewedSpaPackage("hot-tub-spa-electrical", { ...eligible, [key]: value }), null);
assert.equal(reviewedSpaPackage("some-other-service", eligible), null);

const seed = readFileSync("prisma/seed-hot-tub-spa.ts", "utf8");
const route = readFileSync("app/api/admin/quotes/[quoteId]/spa-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
const recipe = readFileSync("lib/electrical/atomicLabor.ts", "utf8");
const laborSeed = readFileSync("prisma/seed-labor-hours.ts", "utf8");
const packageSource = readFileSync("lib/electrical/spaReviewPackage.ts", "utf8");

assert.ok(seed.includes("A rough range is enough") && seed.includes("measures the PVC, liquidtight, conductors, and bonding separately"));
assert.ok(seed.includes('routeAction: "PHOTO_REVIEW"') && seed.includes("photosBlockBooking: true"));
assert.ok(seed.includes("NM-B cable is not used") && !seed.includes('"WIRE_6_3"'));
assert.ok(!seed.includes("STANDARD_HOURS") && seed.includes("fieldLaborHours: null"));
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
assert.ok(route.includes("racewayFeet > 25") && route.includes("equipmentWhipFeet > 15") && route.includes("conductorRunFeet < racewayFeet + equipmentWhipFeet"));
for (const role of [
  "CONDUIT_PVC_1",
  "CONDUIT_LFNC_1",
  "CONDUCTOR_THHN_6_UNGROUNDED",
  "CONDUCTOR_THHN_6_GROUNDED",
  "CONDUCTOR_THHN_10_EQUIPMENT_GROUND",
  "SPA_BONDING_CONDUCTOR_8_BARE",
  "SPA_BONDING_LUG_CLAMP",
]) assert.ok(`${route}\n${packageSource}`.includes(role), `runtime includes ${role}`);
assert.ok(route.includes("conductorRunFeet * 2") && route.includes("conductorRunFeet * config.conductorCount"));
assert.ok(route.includes("Number.isSafeInteger(bondConnections)") && route.includes("spaConfigurationConfirmed: true"));
assert.ok(route.includes('source: "CONTRACTOR_MEASUREMENT"') && !route.includes("ROUTE_ASSIST"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("reviewedSpaPackage(q.service.slug, answerSnapshot)"));
assert.ok(form.includes("spa-scope") && form.includes("homeowner&apos;s rough distance"));
assert.ok(form.includes("individual wet-location conductors") && form.includes("not NM-B cable"));
const spaRecipe = recipe.slice(recipe.indexOf('key: "ELECTRICAL_HOT_TUB_SPA"'), recipe.indexOf('key: "ELECTRICAL_LANDSCAPE_LIGHTING"'));
assert.ok(spaRecipe.includes("ELEC_INSTALL_NEW_SINGLE_POLE_BREAKER") && spaRecipe.includes("ELEC_PULL_POWER_CONDUCTORS"));
assert.ok(!spaRecipe.includes("ELEC_PULL_FEEDER_CABLE"));
assert.ok(laborSeed.includes('"hot-tub-spa-electrical"'));

console.log("spa review contract: contractor-confirmed 50A four-wire wet-location package derives an editable unsent suggestion; NM-B, 60A, underground, interior, remediation and uncertain bonding stay review-only");
