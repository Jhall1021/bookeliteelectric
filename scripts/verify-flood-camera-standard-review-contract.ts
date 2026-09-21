import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/admin/quotes/[quoteId]/flood-camera-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");

assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
for (const [key, value] of [["flood_camera_connection", "hardwired"], ["flood_camera_location", "new_location"], ["flood_camera_power_source", "back_to_back"]]) {
  assert.ok(route.includes(`${key}: "${value}"`));
}
assert.ok(route.includes('new Set(["under_8", "9_12"])'));
assert.ok(route.includes('"WIRE_12_2"') && route.includes('"BOX_CEILING_STANDARD"'));
assert.ok(route.includes("loadConnectedDeviceLaborFacts"));
assert.ok(route.includes("backToBackRoute: true") && route.includes("accessibleRoute: false") && route.includes("finishedRoute: false"));
assert.ok(route.includes("projectElectricalServiceLabor") && route.includes("suggestPrimaryPrice"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes('backToBackRoute: { value: true, source: "GUIDED_PHOTO_REVIEW" }'));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("floodCameraStandardReview"));
assert.ok(form.includes("Confirm and calculate package") && form.includes("Plug-in cameras and routed attic, crawlspace or finished-wall work require separate review."));

console.log("flood-camera standard review contract: contractor-confirmed hardwired back-to-back scope produces an editable unsent atomic suggestion");
