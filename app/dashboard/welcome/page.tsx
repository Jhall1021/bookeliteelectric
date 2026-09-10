import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { LinkButton } from "@/components/ui/Button";

export const dynamic = "force-dynamic";

/**
 * Where an accepted invitation lands — the "reaches a basic contractor
 * onboarding landing page" requirement of Phase 3A.
 *
 * TENANT-BOUND, not a generic welcome screen: withAdminContractor resolves
 * the contractor from the SIGNED-IN owner's own membership (the one
 * acceptInvitationFor just created), the same door every other page under
 * /dashboard uses, so this can never show — or link into — a different
 * business.
 *
 * POINTS AT GUIDED SETUP, NOT JUST THE DASHBOARD. Phase 3B (trade enrolment,
 * catalog installation, pricing) has since shipped as /dashboard/setup —
 * this page used to say that work was "coming soon" and link only to the
 * plain Overview page, which left a freshly joined owner with no visible
 * way back to the one thing they actually need to do next. It still does
 * nothing itself: the primary action is a link, not a wizard embedded here.
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
        Your account is set up for <span className="font-medium text-navy">{name}</span>. Next, Guided
        Setup walks you through your trade, catalog and pricing.
      </p>
      <div className="mt-6 flex items-center gap-4">
        <LinkButton href="/dashboard/setup" variant="primary">
          Start Guided Setup
        </LinkButton>
        <Link href="/dashboard" className="text-sm font-medium text-electric hover:underline">
          Go to your dashboard
        </Link>
      </div>
    </div>
  );
}
