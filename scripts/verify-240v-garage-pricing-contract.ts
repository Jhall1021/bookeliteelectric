import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { GARAGE_240V_CONFIG_BY_SLUG, reviewedGarage240vConfiguration } from "../lib/electrical/garage240vReviewPackage";

const expected = {
  "240v-garage-outlet": ["30", "3", "RECEPTACLE_6_30", "WIRE_10_2"],
  "240v-garage-outlet-14-30": ["30", "4", "RECEPTACLE_14_30", "WIRE_10_3"],
  "240v-garage-outlet-6-50": ["50", "3", "RECEPTACLE_6_50", "WIRE_6_2"],
  "240v-garage-outlet-14-50": ["50", "4", "RECEPTACLE_14_50", "WIRE_6_3"],
} as const;
for (const [slug, [amps, prongs, receptacle, wire]] of Object.entries(expected)) {
  const config = GARAGE_240V_CONFIG_BY_SLUG[slug]!;
  assert.deepEqual([config.amperage, config.prongs, config.receptacleRole, config.wireRole], [amps, prongs, receptacle, wire]);
  assert.ok(reviewedGarage240vConfiguration(slug, { garage_panel: "in_garage", garage_wall: "open", garage_spaces: "two_free", garage_amperage: `a${amps}`, [`garage_prongs_${amps}`]: `p${prongs}` }));
}
assert.equal(reviewedGarage240vConfiguration("240v-garage-outlet", { garage_panel: "in_garage", garage_wall: "finished", garage_spaces: "two_free", garage_amperage: "a30", garage_prongs_30: "p3" }), null);

const route = readFileSync("app/api/admin/quotes/[quoteId]/garage-240v-scope/route.ts", "utf8");
const page = readFileSync("app/dashboard/quotes/page.tsx", "utf8");
const form = readFileSync("components/admin/QuotePricingForm.tsx", "utf8");
assert.ok(route.includes("withAdminRoute") && route.includes("ctx.contractorId"));
for (const role of ["BOX_SURFACE_4S", "COVER_RAISED_4S", "CONSUMABLES_MEDIUM", "NM_CABLE_SUPPORT"]) assert.ok(route.includes(`"${role}"`));
assert.ok(route.includes("panelCapacityConfirmed: true") && route.includes("routeFeet > 300"));
assert.ok(route.includes("reviewSuggestedPriceCents: suggestion.totalCents") && !route.includes("quotedPriceCents:"));
assert.ok(route.includes("sent: false"));
assert.ok(page.includes("reviewedGarage240vConfiguration(q.service.slug, answerSnapshot)"));
assert.ok(form.includes("garage-240v-scope") && form.includes("homeowner&apos;s estimate") && form.includes("detached garages"));

console.log("240V garage pricing contract: exact configuration materials and contractor-confirmed scope derive only an editable unsent suggestion");
