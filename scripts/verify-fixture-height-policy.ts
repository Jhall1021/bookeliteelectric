import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fixtureHeightLaborMultiplier } from "../lib/pricing";

const settings = { fixtureHeight12Percent: 15, fixtureHeight14Percent: 30 };

assert.equal(fixtureHeightLaborMultiplier("under_8", settings), 1);
assert.equal(fixtureHeightLaborMultiplier("9_10", settings), 1);
assert.equal(fixtureHeightLaborMultiplier("under_10", settings), 1);
assert.equal(fixtureHeightLaborMultiplier("11_12", settings), 1.15);
assert.equal(fixtureHeightLaborMultiplier("13_14", settings), 1.30);
assert.equal(fixtureHeightLaborMultiplier("over_14", settings), 1);
assert.equal(fixtureHeightLaborMultiplier("over_14_or_unsure", settings), 1);
assert.equal(fixtureHeightLaborMultiplier("11_12", { fixtureHeight12Percent: 20, fixtureHeight14Percent: 35 }), 1.20);
assert.equal(fixtureHeightLaborMultiplier("13_14", { fixtureHeight12Percent: 20, fixtureHeight14Percent: 35 }), 1.35);

const seed = readFileSync("prisma/seed-height-access.ts", "utf8");
const expectedServices = [
  "garage-door-opener-outlet",
  "garage-door-opener-outlet-ev",
  "replace-interior-light-fixture",
  "remove-and-replace-existing-chandelier",
  "new-ceiling-light",
  "replace-exterior-light-fixture",
  "replace-motion-flood-light",
  "replace-ceiling-fan",
  "fan-replacing-light",
  "new-ceiling-fan",
  "recessed-lighting",
  "replace-bathroom-exhaust-fan",
  "replace-bathroom-exhaust-fan-with-light",
  "bathroom-fan-light-combo",
  "hardwired-smoke-detector",
  "smoke-co-detector",
  "floodlight-camera-existing",
  "new-exterior-flood-camera",
  "new-exterior-lighting-locations",
];
for (const slug of expectedServices) assert.ok(seed.includes(`"${slug}"`), `${slug} receives the shared module`);
assert.ok(seed.includes('label: "10 feet or under", value: "under_10"'));
assert.ok(seed.includes('label: "11 to 12 feet", value: "11_12"'));
assert.ok(seed.includes('label: "13 to 14 feet", value: "13_14"'));
assert.ok(seed.includes('value: "over_14_or_unsure", routeAction: "REMOTE_QUOTE"'));
assert.ok(seed.includes("A wide photo of the whole room or exterior work area"));

const chandelier = readFileSync("prisma/seed-chandelier.ts", "utf8");
const floodCamera = readFileSync("prisma/seed-flood-camera.ts", "utf8");
const exteriorLight = readFileSync("prisma/seed-new-exterior-light-location.ts", "utf8");
const fanPackages = readFileSync("scripts/build-fan-packages.ts", "utf8");
assert.ok(!chandelier.includes('key: "chandelier_access"'), "chandelier has no duplicate height question");
assert.ok(!floodCamera.includes('key: "flood_camera_height"'), "new flood camera has no duplicate height question");
assert.ok(!exteriorLight.includes('key: "exterior_light_height"'), "new exterior light has no duplicate height question");
assert.ok(!fanPackages.includes('key: "fan_access"'), "bath fan packages have no duplicate height question");

console.log(`FIXTURE HEIGHT POLICY — ${expectedServices.length} elevated-work services; 10 ft base, 12 ft +15%, 14 ft +30%, contractor-adjustable; >14/unsure remote quote`);
