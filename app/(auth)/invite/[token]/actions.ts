"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { currentUser } from "@/lib/adminContext";
import { acceptInvitationFor } from "@/lib/contractorInvitations";

/**
 * The ONLY thing that ever consumes an invitation — a POST server action,
 * never a GET. See lib/contractorInvitations.ts's header for why: an email
 * client's own link-prefetch, or a browser preview, issues a GET before a
 * human opens the page, and a token a GET could spend would be burned before
 * the real visit.
 */
export async function acceptInvitationAction(formData: FormData) {
  const token = String(formData.get("token") ?? "");
  const user = await currentUser();
  const r = await acceptInvitationFor(prisma, user, token);
  if (r.ok) {
    revalidatePath("/dashboard");
    redirect("/dashboard/welcome");
  }
  redirect(`/invite/${encodeURIComponent(token)}?error=${r.refusal.code}`);
}
