import { strict as assert } from "node:assert";
import { resolveRecessedLightingRouteFacts, type RecessedLightingRouteFactInput } from "../lib/electrical/lightingRouteFacts";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks++; console.log(`  ✓ ${message}`); };
const fact = <T>(value: T | null, source: RecessedLightingRouteFactInput[keyof RecessedLightingRouteFactInput]["source"]) => ({ value, source });

const finished = resolveRecessedLightingRouteFacts({
  access: fact("FINISHED", "CUSTOMER_TREE"),
  lightCount: fact(4, "CUSTOMER_TREE"),
  existingLightingSourceConfirmed: fact(true, "GUIDED_PHOTO_REVIEW"),
  installedCablePathFeet: fact(32, "ROUTE_ASSIST_CONFIRMED"),
  nmCableSupportCount: fact(0, "SYSTEM_DERIVED"),
  perpendicularCeilingFeet: fact(8, "ROUTE_ASSIST_CONFIRMED"),
  framingSpacingInches: fact(16, "CONTRACTOR_POLICY"),
  totalCableSlackFeet: fact(8, "CONTRACTOR_POLICY"),
});
ok(finished.kind === "READY", "confirmed geometry plus contractor policy resolves a finished four-light layout");
if (finished.kind !== "READY") throw new Error("expected ready finished layout");
ok(finished.facts.installedCablePathFeet === 32 && finished.facts.perpendicularCeilingFeet === 8, "measured cable path and perpendicular distance remain separate facts");

const homeownerGuess = resolveRecessedLightingRouteFacts({
  access: fact("FINISHED", "CUSTOMER_TREE"), lightCount: fact(4, "CUSTOMER_TREE"),
  existingLightingSourceConfirmed: fact(true, "GUIDED_PHOTO_REVIEW"),
  installedCablePathFeet: fact(32, "CUSTOMER_TREE"), perpendicularCeilingFeet: fact(8, "CUSTOMER_TREE"),
  nmCableSupportCount: fact(0, "SYSTEM_DERIVED"),
  framingSpacingInches: fact(16, "CUSTOMER_TREE"), totalCableSlackFeet: fact(8, "CUSTOMER_TREE"),
});
ok(homeownerGuess.kind === "INCOMPLETE" && homeownerGuess.invalidFacts.length === 4, "customer answers cannot silently become route geometry or contractor policy");

const missingGeometry = resolveRecessedLightingRouteFacts({
  access: fact("FINISHED", "CUSTOMER_TREE"), lightCount: fact(4, "CUSTOMER_TREE"),
  existingLightingSourceConfirmed: fact(true, "GUIDED_PHOTO_REVIEW"),
  installedCablePathFeet: fact(null, "ROUTE_ASSIST_CONFIRMED"), perpendicularCeilingFeet: fact(null, "ROUTE_ASSIST_CONFIRMED"),
  nmCableSupportCount: fact(0, "SYSTEM_DERIVED"),
  framingSpacingInches: fact(16, "CONTRACTOR_POLICY"), totalCableSlackFeet: fact(8, "CONTRACTOR_POLICY"),
});
ok(missingGeometry.kind === "INCOMPLETE" && missingGeometry.missingFacts.includes("installedCablePathFeet") && missingGeometry.missingFacts.includes("perpendicularCeilingFeet"), "missing physical geometry fails closed instead of using ten feet per light");

const accessible = resolveRecessedLightingRouteFacts({
  access: fact("ACCESSIBLE", "CUSTOMER_TREE"), lightCount: fact(4, "CUSTOMER_TREE"),
  existingLightingSourceConfirmed: fact(true, "GUIDED_PHOTO_REVIEW"),
  installedCablePathFeet: fact(32, "CONTRACTOR_MEASUREMENT"), perpendicularCeilingFeet: fact(null, "CONTRACTOR_MEASUREMENT"),
  nmCableSupportCount: fact(9, "SYSTEM_DERIVED"),
  framingSpacingInches: fact(null, "CONTRACTOR_POLICY"), totalCableSlackFeet: fact(8, "CONTRACTOR_POLICY"),
});
ok(accessible.kind === "READY", "accessible layout needs measured cable footage but no concealed-ceiling framing inference");
if (accessible.kind !== "READY") throw new Error("expected ready accessible layout");
ok(accessible.facts.perpendicularCeilingFeet === 0, "accessible layout produces zero concealed framing distance explicitly");

const scannedAccessible = resolveRecessedLightingRouteFacts({
  access: fact("ACCESSIBLE", "CUSTOMER_TREE"), lightCount: fact(4, "CUSTOMER_TREE"),
  existingLightingSourceConfirmed: fact(true, "GUIDED_PHOTO_REVIEW"),
  installedCablePathFeet: fact(32, "ROUTE_ASSIST_CONFIRMED"), perpendicularCeilingFeet: fact(null, "ROUTE_ASSIST_CONFIRMED"),
  nmCableSupportCount: fact(9, "SYSTEM_DERIVED"),
  framingSpacingInches: fact(null, "CONTRACTOR_POLICY"), totalCableSlackFeet: fact(8, "CONTRACTOR_POLICY"),
});
ok(scannedAccessible.kind === "INCOMPLETE" && scannedAccessible.invalidFacts.some((item) => item.includes("hidden accessible route")), "a room scan cannot claim the hidden attic or basement path");

const missingSlack = resolveRecessedLightingRouteFacts({
  access: fact("ACCESSIBLE", "CUSTOMER_TREE"), lightCount: fact(4, "CUSTOMER_TREE"),
  existingLightingSourceConfirmed: fact(true, "GUIDED_PHOTO_REVIEW"),
  installedCablePathFeet: fact(32, "CONTRACTOR_MEASUREMENT"), perpendicularCeilingFeet: fact(null, "CONTRACTOR_MEASUREMENT"),
  nmCableSupportCount: fact(9, "SYSTEM_DERIVED"),
  framingSpacingInches: fact(null, "CONTRACTOR_POLICY"), totalCableSlackFeet: fact(null, "CONTRACTOR_POLICY"),
});
ok(missingSlack.kind === "INCOMPLETE" && missingSlack.missingFacts.includes("totalCableSlackFeet"), "missing cable allowance fails closed instead of hiding slack in a per-light factor");

const homeownerSupports = resolveRecessedLightingRouteFacts({
  access: fact("ACCESSIBLE", "CUSTOMER_TREE"), lightCount: fact(4, "CUSTOMER_TREE"),
  existingLightingSourceConfirmed: fact(true, "GUIDED_PHOTO_REVIEW"),
  installedCablePathFeet: fact(32, "CONTRACTOR_MEASUREMENT"), perpendicularCeilingFeet: fact(null, "CONTRACTOR_MEASUREMENT"),
  nmCableSupportCount: fact(9, "CUSTOMER_TREE"), framingSpacingInches: fact(null, "CONTRACTOR_POLICY"), totalCableSlackFeet: fact(8, "CONTRACTOR_POLICY"),
});
ok(homeownerSupports.kind === "INCOMPLETE" && homeownerSupports.invalidFacts.some((item) => item.includes("system-derived")), "homeowner support guesses cannot become takeoff authority");

console.log(`\nLIGHTING ROUTE FACTS — ${checks}/${checks} checks passed`);
