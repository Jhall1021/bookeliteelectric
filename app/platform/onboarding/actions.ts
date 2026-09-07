"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PlatformContractorNotFoundError } from "@/lib/platformContext";
import {
  platformBeginContractor, platformAttachOwner, platformEnrolTrade, platformInstallTemplate, platformLaunchContractor, platformRetireContractor,
} from "@/lib/platformOnboarding";

/**
 * The wizard's server actions. Each one reads its form fields, hands them to
 * ONE command in lib/platformOnboarding — which authorizes the staff member,
 * validates the contractor id and delegates the decision — and then sends the
 * browser back to the wizard with a short notice code. No Prisma client is in
 * scope here; nothing on this file can write.
 *
 * The contractor id in every redirect is the one the COMMAND returned after
 * validating it, never the one the form supplied.
 */

/** A form value as a string, or empty. Fields are read from `formData` in place; the FormData object itself never leaves the action. */
const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

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
  const r = await platformBeginContractor({ name: str(formData.get("name")), slug: str(formData.get("slug")) || undefined });
  if (r.ok) backTo(r.contractorId, "CREATED");
  if (r.existingContractorId) backTo(r.existingContractorId, "EXISTS");
  redirect(`/platform/onboarding?notice=${r.refusal.code}`);
}

export async function attachOwnerAction(formData: FormData) {
  try {
    const r = await platformAttachOwner(str(formData.get("contractorId")), str(formData.get("email")));
    if (r.ok) backTo(r.contractorId, r.already ? "OWNER_ALREADY" : "OWNER_ATTACHED");
    backTo(str(formData.get("contractorId")), r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function enrolTradeAction(formData: FormData) {
  try {
    const r = await platformEnrolTrade(str(formData.get("contractorId")), str(formData.get("tradeKey")));
    if (r.ok) backTo(r.contractorId, "TRADE_ENROLLED");
    backTo(str(formData.get("contractorId")), r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function installTemplateAction(formData: FormData) {
  try {
    const r = await platformInstallTemplate(str(formData.get("contractorId")));
    if (r.ok) backTo(r.contractorId, r.already ? "CATALOG_ALREADY" : "CATALOG_INSTALLED");
    backTo(str(formData.get("contractorId")), r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function launchAction(formData: FormData) {
  try {
    // Launch is the one step that changes what homeowners can reach, so the
    // form carries an explicit confirmation and the action insists on it.
    if (str(formData.get("confirm")) !== "yes") backTo(str(formData.get("contractorId")), "CONFIRMATION_REQUIRED");
    const r = await platformLaunchContractor(str(formData.get("contractorId")));
    if (!("contractorId" in r)) backTo(str(formData.get("contractorId")), r.refusal.code);
    backTo(r.contractorId, r.ok ? "LAUNCHED" : "LAUNCH_PARTIAL");
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}

export async function retireAction(formData: FormData) {
  try {
    // Retiring takes a storefront down within the minute, so the form carries
    // both a ticked confirmation and the slug typed back; the command checks
    // the slug against the contractor the door resolved.
    if (str(formData.get("confirm")) !== "yes") backTo(str(formData.get("contractorId")), "CONFIRMATION_REQUIRED");
    const r = await platformRetireContractor(str(formData.get("contractorId")), str(formData.get("confirmSlug")));
    if (r.ok) backTo(r.contractorId, r.already ? "RETIRED_ALREADY" : "RETIRED");
    backTo(str(formData.get("contractorId")), r.refusal.code);
  } catch (e) {
    if (e instanceof PlatformContractorNotFoundError) notFound();
    throw e;
  }
}
