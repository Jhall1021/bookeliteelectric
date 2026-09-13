import { prisma } from "./prisma";
import { currentUser } from "./adminContext";
import { platformActorFor, type SignedInUser } from "./platformContext";
import { requirePlatformCapability, type PlatformCapability } from "./platformCapabilities";
import {
  beginContractorFor,
  attachOwnerFor,
  inviteOwnerFor,
  revokeInvitationFor,
  enrolTradeFor,
  installTradeTemplateFor,
  launchContractorFor,
  retireContractorFor,
} from "./platformOnboarding";

/**
 * Runtime mutation facade for Price2Book staff onboarding.
 *
 * The underlying `...For` functions remain injectable seams for verifier and
 * domain tests. Application code must enter through this facade: resolve the
 * signed-in staff actor, require the operation's capability, then delegate to
 * the existing onboarding command, which repeats staff authorization and owns
 * contractor validation, tenant scoping, locks, readiness and activation
 * guards. No capability check replaces any of those domain boundaries.
 */
async function authorizedUser(capability: PlatformCapability): Promise<SignedInUser> {
  const user = await currentUser();
  const actor = await platformActorFor(prisma, user);
  requirePlatformCapability(actor.role, capability);
  // platformActorFor only returns for a signed-in user.
  return user as SignedInUser;
}

export async function platformBeginContractor(input: { name: string; slug?: string }) {
  const user = await authorizedUser("CONTRACTOR_ONBOARD");
  return beginContractorFor(prisma, user, input);
}

export async function platformAttachOwner(contractorId: unknown, email: string) {
  const user = await authorizedUser("CONTRACTOR_ONBOARD");
  return attachOwnerFor(prisma, user, contractorId, email);
}

export async function platformInviteOwner(contractorId: unknown, email: string, ownerName?: string) {
  const user = await authorizedUser("CONTRACTOR_ONBOARD");
  return inviteOwnerFor(prisma, user, contractorId, email, { ownerName });
}

export async function platformRevokeInvitation(contractorId: unknown, invitationId: string) {
  const user = await authorizedUser("CONTRACTOR_ONBOARD");
  return revokeInvitationFor(prisma, user, contractorId, invitationId);
}

export async function platformEnrolTrade(contractorId: unknown, tradeKey: string) {
  const user = await authorizedUser("CONTRACTOR_ONBOARD");
  return enrolTradeFor(prisma, user, contractorId, tradeKey);
}

export async function platformInstallTemplate(contractorId: unknown) {
  const user = await authorizedUser("CONTRACTOR_ONBOARD");
  return installTradeTemplateFor(prisma, user, contractorId);
}

export async function platformLaunchContractor(contractorId: unknown) {
  const user = await authorizedUser("CONTRACTOR_LAUNCH");
  return launchContractorFor(prisma, user, contractorId);
}

export async function platformRetireContractor(contractorId: unknown, confirmSlug: string) {
  const user = await authorizedUser("CONTRACTOR_RETIRE");
  return retireContractorFor(prisma, user, contractorId, confirmSlug);
}
