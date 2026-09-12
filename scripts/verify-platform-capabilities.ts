import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hasPlatformCapability, platformCapabilitiesForRole, type PlatformCapability } from "../lib/platformCapabilities";

const ALL: PlatformCapability[] = [
  "PLATFORM_READ",
  "CONTRACTOR_ONBOARD",
  "CONTRACTOR_LAUNCH",
  "CONTRACTOR_RETIRE",
  "STAFF_ACCESS_MANAGE",
];

const expected: Record<string, PlatformCapability[]> = {
  PLATFORM_SUPPORT: ["PLATFORM_READ"],
  PLATFORM_ONBOARDING: ["PLATFORM_READ", "CONTRACTOR_ONBOARD"],
  PLATFORM_ADMIN: ALL,
};

for (const [role, capabilities] of Object.entries(expected)) {
  assert.deepEqual(platformCapabilitiesForRole(role), capabilities, `${role} capability matrix drifted`);
  for (const capability of ALL) {
    assert.equal(
      hasPlatformCapability(role, capability),
      capabilities.includes(capability),
      `${role} / ${capability} decision is wrong`,
    );
  }
}

assert.deepEqual(platformCapabilitiesForRole("UNKNOWN_ROLE"), [], "Unknown roles must fail closed");

// Product mutation entry points must name the capability they require. This
// does not replace behavioral tests; it prevents a future UI refactor from
// silently dropping the gate from one of the high-risk actions.
const actions = fs.readFileSync(path.join(process.cwd(), "app/platform/onboarding/actions.ts"), "utf8");
const requiredChecks = [
  ["startContractorAction", "CONTRACTOR_ONBOARD"],
  ["attachOwnerAction", "CONTRACTOR_ONBOARD"],
  ["inviteOwnerAction", "CONTRACTOR_ONBOARD"],
  ["revokeInvitationAction", "CONTRACTOR_ONBOARD"],
  ["enrolTradeAction", "CONTRACTOR_ONBOARD"],
  ["installTemplateAction", "CONTRACTOR_ONBOARD"],
  ["launchAction", "CONTRACTOR_LAUNCH"],
  ["retireAction", "CONTRACTOR_RETIRE"],
] as const;

for (const [fn, capability] of requiredChecks) {
  const start = actions.indexOf(`export async function ${fn}`);
  assert.ok(start >= 0, `${fn} is missing`);
  const next = actions.indexOf("\nexport async function ", start + 1);
  const body = actions.slice(start, next === -1 ? actions.length : next);
  assert.ok(body.includes(`can(\"${capability}\")`), `${fn} must require ${capability}`);
}

console.log("platform capabilities: verified");
