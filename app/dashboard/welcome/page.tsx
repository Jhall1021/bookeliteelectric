import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";

export const dynamic = "force-dynamic";

/**
 * Where an accepted invitation lands — the "reaches a basic contractor
 * onboarding landing page" requirement of Phase 3A, and deliberately nothing
 * more than that.
 *
 * TENANT-BOUND, not a generic welcome screen: withAdminContractor resolves
 * the contractor from the SIGNED-IN owner's own membership (the one
 * acceptInvitationFor just created), the same door every other page under
 * /dashboard uses, so this can never show — or link into — a different
 * business.
 *
 * NO LAUNCH, NO ACTIVATION, NO WIZARD HERE. Phase 3B is where the trade
 * enrolment, catalog installation and pricing walkthrough actually live for
 * an owner working alone; this page's only job is to confirm the account
 * worked and point at the real dashboard.
 */
export default async function WelcomePage() {
  const { name } = await withAdminContractor(async (db, ctx) => {
    const c = await db.contractor.findUniqueOrThrow({ where: { id: ctx.contractorId }, select: { name: true } });
    return { name: c.name };
  });

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-2xl font-bold text-navy">You&rsquo;re in.</h1>
      <p className="mt-3 text-sm leading-relaxed text-slate">
        Your account is set up for <span className="font-medium text-navy">{name}</span>. Setting up your
        trade, catalog and pricing is coming soon — for now, your dashboard is ready.
      </p>
      <Link href="/dashboard" className="mt-6 inline-block rounded-md bg-electric px-4 py-2 text-sm font-medium text-white hover:bg-electric/90">
        Go to your dashboard
      </Link>
    </div>
  );
}
