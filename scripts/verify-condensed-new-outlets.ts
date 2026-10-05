import assert from "node:assert/strict";
import fs from "node:fs";

const internal = fs.readFileSync("lib/electrical/internalRecipeServices.ts", "utf8");
const directory = fs.readFileSync("app/[site]/services/page.tsx", "utf8");
const category = fs.readFileSync("app/[site]/services/[category]/page.tsx", "utf8");
const addOn = fs.readFileSync("app/api/visit/while-we-there/route.ts", "utf8");
const seed = fs.readFileSync("prisma/seed.ts", "utf8");
const marketing = fs.readFileSync("components/marketing/trades/electricalTemplate.ts", "utf8");

for (const slug of ["surface-mounted-outlet", "exterior-gfci-other-routing"]) {
  assert.match(internal, new RegExp(`"${slug}"`), `${slug} is internal-only`);
}
for (const storefront of [directory, category, addOn]) {
  assert.match(storefront, /INTERNAL_RECIPE_ONLY_SERVICE_SLUGS/, "customer catalog hides internal services");
}
for (const label of [
  "New Dedicated Outlet",
  "New Exterior GFCI Outlet",
  "New Garage Outlet",
  "New 120V Outlet — General Use",
]) {
  assert.match(seed, new RegExp(label), `${label} is in the canonical seed`);
  assert.match(marketing, new RegExp(label), `${label} is in the marketing catalog`);
}
assert.doesNotMatch(
  marketing.slice(marketing.indexOf('"slug": "new-outlets"'), marketing.indexOf('"slug": "panels-troubleshooting"')),
  /"key": "exterior-gfci-other-routing"/,
  "the customer-facing marketing list contains one exterior GFCI entry",
);
assert.equal(
  marketing.match(/"key": "dedicated-120v-circuit-outlet"/g)?.length,
  1,
  "the dedicated outlet appears in New Outlets only",
);

console.log("✓ New Outlets exposes four concise services and keeps implementation-only routes hidden");
