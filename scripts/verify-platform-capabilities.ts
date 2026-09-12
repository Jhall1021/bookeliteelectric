import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  hasPlatformCapability,
  platformCapabilitiesForRole,
  requirePlatformCapability,
  PlatformCapabilityError,
  type PlatformCapability,
} from "../lib/platformCapabilities";

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
    if (capabilities.includes(capability)) {
      assert.doesNotThrow(() => requirePlatformCapability(role, capability));
    } else {
      assert.throws(
        () => requirePlatformCapability(role, capability),
        (e: unknown) => e instanceof PlatformCapabilityError && e.capability === capability,
        `${role} must be refused ${capability}`,
      );
    }
  }
}

assert.deepEqual(platformCapabilitiesForRole("UNKNOWN_ROLE"), [], "Unknown roles must fail closed");
assert.throws(
  () => requirePlatformCapability("UNKNOWN_ROLE", "PLATFORM_READ"),
  PlatformCapabilityError,
  "Unknown roles must fail closed at the authoritative guard",
);

// The runtime command facade is the authoritative application mutation door.
// Each operation must name its capability before it delegates to the existing
// onboarding command, so a future non-page caller cannot bypass a UI check.
const facadePath = path.join(process.cwd(), "lib/platformOnboardingCommands.ts");
const facade = fs.readFileSync(facadePath, "utf8");
const runtimeChecks = [
  ["platformBeginContractor", "CONTRACTOR_ONBOARD"],
  ["platformAttachOwner", "CONTRACTOR_ONBOARD"],
  ["platformInviteOwner", "CONTRACTOR_ONBOARD"],
  ["platformRevokeInvitation", "CONTRACTOR_ONBOARD"],
  ["platformEnrolTrade", "CONTRACTOR_ONBOARD"],
  ["platformInstallTemplate", "CONTRACTOR_ONBOARD"],
  ["platformLaunchContractor", "CONTRACTOR_LAUNCH"],
  ["platformRetireContractor", "CONTRACTOR_RETIRE"],
] as const;

for (const [fn, capability] of runtimeChecks) {
  const start = facade.indexOf(`export async function ${fn}`);
  assert.ok(start >= 0, `${fn} runtime command is missing`);
  const next = facade.indexOf("\nexport async function ", start + 1);
  const body = facade.slice(start, next === -1 ? facade.length : next);
  assert.ok(body.includes(`authorizedUser(\"${capability}\")`), `${fn} must require ${capability} in the runtime command facade`);
}

// Server actions keep a presentation-level precheck for a friendly refusal,
// but must invoke the guarded facade rather than the raw mutation exports.
const actions = fs.readFileSync(path.join(process.cwd(), "app/platform/onboarding/actions.ts"), "utf8");
assert.ok(
  actions.includes('from "@/lib/platformOnboardingCommands"'),
  "Platform onboarding server actions must use the capability-guarded runtime facade",
);
assert.ok(
  !actions.includes('platformBeginContractor, platformAttachOwner') || !actions.includes('from "@/lib/platformOnboarding"'),
  "Platform onboarding server actions must not import raw mutation commands",
);

const uiChecks = [
  ["startContractorAction", "CONTRACTOR_ONBOARD"],
  ["attachOwnerAction", "CONTRACTOR_ONBOARD"],
  ["inviteOwnerAction", "CONTRACTOR_ONBOARD"],
  ["revokeInvitationAction", "CONTRACTOR_ONBOARD"],
  ["enrolTradeAction", "CONTRACTOR_ONBOARD"],
  ["installTemplateAction", "CONTRACTOR_ONBOARD"],
  ["launchAction", "CONTRACTOR_LAUNCH"],
  ["retireAction", "CONTRACTOR_RETIRE"],
] as const;

for (const [fn, capability] of uiChecks) {
  const start = actions.indexOf(`export async function ${fn}`);
  assert.ok(start >= 0, `${fn} is missing`);
  const next = actions.indexOf("\nexport async function ", start + 1);
  const body = actions.slice(start, next === -1 ? actions.length : next);
  assert.ok(body.includes(`can(\"${capability}\")`), `${fn} should keep a friendly ${capability} precheck`);
}

console.log("platform capabilities: verified");
