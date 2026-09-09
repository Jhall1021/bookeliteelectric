import { redirect } from "next/navigation";
import { SidebarShell, type NavItem } from "@/components/ui/SidebarShell";
import { AmbiguousContractorError, NoMembershipError, resolveAdminContractor, withAdminContractor } from "@/lib/adminContext";
import { prisma } from "@/lib/prisma";

const PRIMARY: NavItem[] = [
  { href: "/dashboard", label: "Overview", icon: "home", exact: true },
  { href: "/dashboard/setup", label: "Guided setup", icon: "checklist" },
  { href: "/dashboard/services", label: "Services & Pricing", icon: "wrench" },
  { href: "/dashboard/quotes", label: "Photo Review", icon: "camera" },
  { href: "/dashboard/bookings", label: "Bookings", icon: "calendar" },
  { href: "/dashboard/design", label: "Storefront", icon: "storefront" },
];

const FOOTER: NavItem[] = [
  { href: "/dashboard/settings", label: "Settings", icon: "settings" },
];

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

  // ONE READ, THROUGH THE GUARDED CLIENT — `Contractor` itself carries no
  // contractorId FK (it IS the tenant), but `ContractorOnboarding` and
  // `Quote` do, and reading them to decide the sidebar's labels must go
  // through the same guarded door every other contractor-scoped read does,
  // not a bare `prisma` call keyed off ctx.contractorId by hand.
  const { name, awaitingReview } = await withAdminContractor(async (db) => {
    const c = await db.contractor.findUnique({ where: { id: ctx.contractorId }, select: { name: true } });
    const awaiting = await db.quote.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } });
    return { name: c?.name ?? ctx.contractorSlug, awaitingReview: awaiting };
  }, { contractorId: ctx.contractorId });

  // Whether "Switch business" goes anywhere — an identity-level question
  // (which businesses does this SIGNED-IN PERSON belong to), so it reads the
  // unguarded membership table the same way resolveAdminContractor() itself
  // does, never the guarded per-tenant client scoped to just this one.
  const membershipCount = await prisma.contractorMembership.count({
    where: { userId: ctx.userId, active: true },
  });

  return (
    <SidebarShell
      homeHref="/dashboard"
      switcherLabel={name}
      switcherHref={membershipCount > 1 ? "/choose" : undefined}
      primary={PRIMARY}
      footerLinks={FOOTER}
      tagline="Build. Price. Book. Grow."
      notifications={{ href: "/dashboard/quotes", count: awaitingReview, label: "Quotes awaiting your review" }}
      identity={{ name, email: ctx.email }}
    >
      {children}
    </SidebarShell>
  );
}
