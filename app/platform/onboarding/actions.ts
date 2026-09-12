"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PlatformContractorNotFoundError, resolvePlatformActor } from "@/lib/platformContext";
import { hasPlatformCapability, type PlatformCapability } from "@/lib/platformCapabilities";
import {
  platformBeginContractor, platformAttachOwner, platformInviteOwner, platformRevokeInvitation, platformEnrolTrade, platformInstallTemplate, platformLaunchContractor, platformRetireContractor,
} from "@/lib/platformOnboarding";

/**
 * The wizard's server actions. Each one reads its form fields, checks the
 * platform capability required for THAT mutation, then hands the operation to
 * the existing command in lib/platformOnboarding. Capability checks live here
 * at the product mutation boundary; the command still owns contractor scoping,
 * validation and domain rules.
 *
 * The contractor id in every redirect is the one the COMMAND returned after
 * validating it, never the one the form supplied.
 */

/** A form value as a string, or empty. Fields are read from `formData` in place; the FormData object itself never leaves the action. */
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

async function can(capability: PlatformCapability): Promise<boolean> {
  const actor = await resolvePlatformActor();
  return hasPlatformCapability(actor.role, capability);
}

function backTo(contractorId: string, notice: string): never {
  revalidatePath(`/platform/onboarding/${contractorId}`);
  revalidatePath("/platform/onboarding");
  revalidatePath("/platform/contractors");
  revalidatePath("/platform");
  redirect(`/platform/onboarding/${contractorId}?notice=${notice}`);
}

function notFound(): never {
  redirect("/platform/onboarding?notice=NOT_FOUND");
}

export async function startContractorAction(formData: FormData) {
  if (!(await can("CONTRACTOR_ONBOARD"))) redirect("/platform/onboarding?notice=STAFF_PERMISSION_REQUIRED");
  const r = await platformBeginContractor({ name: str(formData.get("name")), slug: str(formData.get("slug")) || undefined });
  if (r.ok) backTo(r.contractorId, "CREATED");
  if (r.existingContractorId) backTo(r.existingContractorId, "EXISTS");
  redirect(`/platform/onboarding?notice=${r.refusal.code}`);
}

export async function attachOwnerAction(formData: FormData) {
  try {
    const contractorId = str(formData.get("contractorId"));
    if (!(await can("CONTRACTOR_ONBOARD"))) backTo(contractorId, "STAFF_PERMISSION_REQUIRED");
    const r = await platformAttachOwner(contractorId, str(formData.get("email")));
    if (r.ok) backTo(r.contractorId, r.already ? "OWNER_ALREADY" : "OWNER_ATTACHED");
    backTo(contractorId, r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function inviteOwnerAction(formData: FormData) {
  try {
    const contractorId = str(formData.get("contractorId"));
    if (!(await can("CONTRACTOR_ONBOARD"))) backTo(contractorId, "STAFF_PERMISSION_REQUIRED");
    const ownerName = str(formData.get("ownerName")).trim() || undefined;
    const r = await platformInviteOwner(contractorId, str(formData.get("email")), ownerName);
    if (r.ok) {
      if (!r.delivered) backTo(contractorId, "OWNER_INVITE_UNDELIVERED");
      backTo(contractorId, r.resent ? "OWNER_REINVITED" : "OWNER_INVITED");
    }
    backTo(contractorId, r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function revokeInvitationAction(formData: FormData) {
  try {
    const contractorId = str(formData.get("contractorId"));
    if (!(await can("CONTRACTOR_ONBOARD"))) backTo(contractorId, "STAFF_PERMISSION_REQUIRED");
    const r = await platformRevokeInvitation(contractorId, str(formData.get("invitationId")));
    if (r.ok) backTo(contractorId, r.already ? "INVITATION_ALREADY_REVOKED" : "INVITATION_REVOKED_OK");
    backTo(contractorId, r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function enrolTradeAction(formData: FormData) {
  try {
    const contractorId = str(formData.get("contractorId"));
    if (!(await can("CONTRACTOR_ONBOARD"))) backTo(contractorId, "STAFF_PERMISSION_REQUIRED");
    const r = await platformEnrolTrade(contractorId, str(formData.get("tradeKey")));
    if (r.ok) backTo(r.contractorId, "TRADE_ENROLLED");
    backTo(contractorId, r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function installTemplateAction(formData: FormData) {
  try {
    const contractorId = str(formData.get("contractorId"));
    if (!(await can("CONTRACTOR_ONBOARD"))) backTo(contractorId, "STAFF_PERMISSION_REQUIRED");
    const r = await platformInstallTemplate(contractorId);
    if (r.ok) backTo(r.contractorId, r.already ? "CATALOG_ALREADY" : "CATALOG_INSTALLED");
    backTo(contractorId, r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function launchAction(formData: FormData) {
  try {
    const contractorId = str(formData.get("contractorId"));
    if (!(await can("CONTRACTOR_LAUNCH"))) backTo(contractorId, "STAFF_PERMISSION_REQUIRED");
    // Launch is the one step that changes what homeowners can reach, so the
    // form carries an explicit confirmation and the action insists on it.
    if (str(formData.get("confirm")) !== "yes") backTo(contractorId, "CONFIRMATION_REQUIRED");
    const r = await platformLaunchContractor(contractorId);
    if (!("contractorId" in r)) backTo(contractorId, r.refusal.code);
    backTo(r.contractorId, r.ok ? "LAUNCHED" : "LAUNCH_PARTIAL");
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function retireAction(formData: FormData) {
  try {
    const contractorId = str(formData.get("contractorId"));
    if (!(await can("CONTRACTOR_RETIRE"))) backTo(contractorId, "STAFF_PERMISSION_REQUIRED");
    // Retiring takes a storefront down within the minute, so the form carries
    // both a ticked confirmation and the slug typed back; the command checks
    // the slug against the contractor the door resolved.
    if (str(formData.get("confirm")) !== "yes") backTo(contractorId, "CONFIRMATION_REQUIRED");
    const r = await platformRetireContractor(contractorId, str(formData.get("confirmSlug")));
    if (r.ok) backTo(r.contractorId, r.already ? "RETIRED_ALREADY" : "RETIRED");
    backTo(contractorId, r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}
