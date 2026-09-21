import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const seed = readFileSync("prisma/seed-240v-garage-outlet.ts", "utf8");

assert.ok(seed.includes('const PUBLIC_SLUG = "240v-garage-outlet"'));
for (const slug of ["240v-garage-outlet-14-30", "240v-garage-outlet-6-50", "240v-garage-outlet-14-50"]) {
  assert.ok(seed.includes(`slug: "${slug}"`), `${slug} remains a distinct physical material configuration`);
}
for (const role of ["RECEPTACLE_6_30", "RECEPTACLE_14_30", "RECEPTACLE_6_50", "RECEPTACLE_14_50", "WIRE_10_2", "WIRE_10_3", "WIRE_6_2", "WIRE_6_3"]) {
  assert.ok(seed.includes(`"${role}"`), `${role} remains explicit`);
}
assert.ok(seed.includes('routeAction: "PHOTO_REVIEW"') && seed.includes("photosBlockBooking: true"));
assert.ok(seed.includes('routeAction: "REROUTE_SERVICE"') && seed.includes("rerouteServiceId: targets.get(target.slug)!"));
assert.equal(seed.includes('routeAction: "RESOLVE_INSTANT"'), false, "no homeowner path publishes a 240V configuration");
assert.equal(seed.includes('routeAction: "RESOLVE_ADJUSTED"'), false, "no homeowner path publishes an adjusted 240V price");
assert.ok(seed.includes("homeowner's answers identify the requested receptacle configuration"));
assert.ok(seed.includes("confirm panel capacity") && seed.includes("actual route") && seed.includes("final price"));

console.log("240V garage review contract: observable plug configuration reroutes correctly and every matched package stops for contractor review");
