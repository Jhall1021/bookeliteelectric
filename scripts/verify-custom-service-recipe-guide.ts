import assert from "node:assert/strict";
import { customServiceRecipeReadiness } from "../lib/customServiceRecipeReadiness";
import { serviceWorkspaceTab } from "../lib/serviceWorkspaceTab";

assert.equal(serviceWorkspaceTab("recipe"), "recipe");
assert.equal(serviceWorkspaceTab("unknown"), "overview");

const empty = customServiceRecipeReadiness({
  fieldLaborHours: null,
  estimatedMinutes: null,
  estimatedMinutesReviewed: false,
  materialRoleCount: 0,
  materialCostCents: null,
  materialCostResolved: true,
  publishedPriceApprovedAt: null,
});
assert.deepEqual(empty, {
  labor: "NEEDS_INPUT",
  duration: "NEEDS_INPUT",
  materials: "NEEDS_INPUT",
  price: "BLOCKED",
  readyToPublish: false,
});

const unresolvedMaterial = customServiceRecipeReadiness({
  fieldLaborHours: 1.5,
  estimatedMinutes: 90,
  estimatedMinutesReviewed: true,
  materialRoleCount: 2,
  materialCostCents: 500,
  materialCostResolved: false,
  publishedPriceApprovedAt: new Date(),
});
assert.equal(unresolvedMaterial.materials, "BLOCKED");
assert.equal(unresolvedMaterial.price, "BLOCKED");
assert.equal(unresolvedMaterial.readyToPublish, false);

const laborOnly = customServiceRecipeReadiness({
  fieldLaborHours: 1,
  estimatedMinutes: 60,
  estimatedMinutesReviewed: true,
  materialRoleCount: 0,
  materialCostCents: 0,
  materialCostResolved: true,
  publishedPriceApprovedAt: "2026-09-21T00:00:00.000Z",
});
assert.equal(laborOnly.materials, "COMPLETE");
assert.equal(laborOnly.price, "COMPLETE");
assert.equal(laborOnly.readyToPublish, true);

const unreviewedDuration = customServiceRecipeReadiness({
  fieldLaborHours: 1,
  estimatedMinutes: 60,
  estimatedMinutesReviewed: false,
  materialRoleCount: 0,
  materialCostCents: 0,
  materialCostResolved: true,
  publishedPriceApprovedAt: null,
});
assert.equal(unreviewedDuration.duration, "BLOCKED");
assert.equal(unreviewedDuration.price, "BLOCKED");

console.log("custom service recipe guide: 4 readiness cases and tab routing passed");
