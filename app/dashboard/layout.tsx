import { redirect } from "next/navigation";
import PortalChrome from "@/components/portal/PortalChrome";
import { AmbiguousContractorError, NoMembershipError, resolveAdminContractor } from "@/lib/adminContext";
import { prisma } from "@/lib/prisma";

/**
 * The contractor portal — Price2Book's own product surface.
 *
 * Everything beneath this is contractor-facing configuration, and it is gated
 * on an authenticated CONTRACTOR MEMBERSHIP rather than on being signed in. A
 * valid session with no membership is refused here, not waved through: the
 * membership is the tenant boundary, and identity alone grants nothing.
 *
 * NOTHING IS SELECTED IMPLICITLY. An account belonging to two contractors is
 * sent to a chooser rather than defaulting to the first — quietly editing the
 * wrong company's prices is the failure this design exists to prevent, and it
 * would look like success.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  let ctx;
  try {
    ctx = await resolveAdminContractor();
  } catch (e) {
    if (e instanceof AmbiguousContractorError) redirect("/choose");
    // SIGNED IN BUT BELONGING TO NOBODY IS NOT A SIGN-IN PROBLEM.
    //
    // This sent them back to a form they had just completed, with nothing
    // saying why — the dead end that made a hand-written membership the only
    // way to reach setup.
    if (e instanceof NoMembershipError) redirect("/start");
    redirect("/sign-in");
  }

  const c = await prisma.contractor.findUnique({
    where: { id: ctx.contractorId },
    select: { name: true, sites: { where: { active: true }, select: { hostedSlug: true }, take: 1 } },
  });

  return (
    <div className="min-h-screen bg-warmwhite">
      <PortalChrome
        contractorName={c?.name ?? ctx.contractorSlug}
        storefrontHref={c?.sites[0] ? `/${c.sites[0].hostedSlug}` : null}
      />
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
  );
}
