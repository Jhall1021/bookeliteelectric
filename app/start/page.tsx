import { redirect } from "next/navigation";
import { currentUser } from "@/lib/adminContext";
import { prisma } from "@/lib/prisma";
import CreateContractorForm from "@/components/portal/CreateContractorForm";

export const dynamic = "force-dynamic";

/**
 * A signed-in account that belongs to no business yet.
 *
 * This used to be a dead end: the portal layout caught NoMembershipError and
 * redirected to /sign-in, so a newly verified user was sent back to a form
 * they had already completed, with nothing telling them why. The only way
 * past it was a membership written by hand.
 *
 * Outside /dashboard for the same reason /choose is: the portal layout
 * redirects here, and a page under that layout would redirect to itself.
 */
export default async function StartPage() {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const membership = await prisma.contractorMembership.findFirst({
    where: { userId: user.id, active: true, contractor: { active: true } },
    select: { id: true },
  });
  if (membership) redirect("/dashboard");

  // An invitation waiting for this address is the other legitimate way in, and
  // it should be offered before we suggest creating a second business that
  // duplicates one they were already asked to join.
  const invited = await prisma.contractorInvitation.findFirst({
    where: { email: user.email.toLowerCase() },
    select: { contractor: { select: { name: true } } },
  });

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-2xl font-bold text-navy">Set up your business</h1>
      <p className="mt-2 text-sm text-slate">
        You&apos;re signed in as {user.email}. Tell us the business name and we&apos;ll
        take you through the rest.
      </p>

      {!user.emailVerified && (
        <p className="mt-4 rounded-card border border-p2b-amber-ink/30 bg-p2b-amber-tint p-4 text-sm text-p2b-amber-ink">
          Confirm your email address first — we&apos;ve sent you a link. It&apos;s what
          keeps your pricing and your customers&apos; details to your account alone.
        </p>
      )}

      {invited && (
        <p className="mt-4 rounded-card border border-cardline bg-white p-4 text-sm text-slate">
          You have an invitation to join <strong>{invited.contractor.name}</strong>. Open
          the link in that email to accept it instead of creating a new business.
        </p>
      )}

      <div className="mt-6">
        <CreateContractorForm disabled={!user.emailVerified} />
      </div>
    </div>
  );
}
