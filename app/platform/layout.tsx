import Link from "next/link";
import { redirect } from "next/navigation";
import {
  NotAuthenticatedError, NotPlatformStaffError, resolvePlatformActor,
} from "@/lib/platformContext";
import { SidebarShell, type NavItem } from "@/components/ui/SidebarShell";

export const dynamic = "force-dynamic";

/**
 * Price2Book's own staff surface — the platform shell.
 *
 * Gated on PLATFORM ACCESS, which is a different fact from being signed in
 * and a different fact from owning a contractor. A contractor OWNER with a
 * perfectly good active business is refused here — shown a refusal, not
 * quietly redirected to their dashboard, because "this is not yours" is the
 * true answer and a redirect would hide it.
 *
 * Signed-out goes to sign-in, as the portal does. Four views under this shell
 * read through lib/platformReadModel — overview, directory, control center,
 * attention. Onboarding is the one surface that changes anything, and it does
 * so only through lib/platformOnboarding's reviewed commands.
 */
const NAV: NavItem[] = [
  { href: "/platform", label: "Overview", icon: "home", exact: true },
  { href: "/platform/contractors", label: "Contractors", icon: "users" },
  { href: "/platform/onboarding", label: "Onboarding", icon: "clipboard" },
  { href: "/platform/attention", label: "Attention needed", icon: "attention" },
];

function roleLabel(role: string) {
  return role
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  let actor;
  try {
    actor = await resolvePlatformActor();
  } catch (e) {
    if (e instanceof NotAuthenticatedError) redirect("/sign-in");
    if (e instanceof NotPlatformStaffError) return <Refused />;
    throw e;
  }

  const staffRole = roleLabel(actor.role);

  return (
    <SidebarShell
      homeHref="/platform"
      switcherLabel={`Price2Book staff · ${staffRole}`}
      primary={NAV}
      notifications={{ href: "/platform/attention", label: "Attention needed" }}
      identity={{ name: actor.email, email: `${staffRole} · ${actor.email}` }}
    >
      {children}
    </SidebarShell>
  );
}

function Refused() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="rounded-card border border-cardline bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-electric">Price2Book staff</p>
        <h1 className="mt-2 font-display text-2xl font-bold text-navy">This area is restricted</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate">
          Your account is signed in, but it doesn&rsquo;t have active platform access. Owning or managing a
          contractor does not grant staff access &mdash; those permissions stay deliberately separate.
        </p>
        <Link
          href="/dashboard"
          className="mt-6 inline-flex items-center justify-center rounded-pill border border-cardline bg-white px-4 py-2.5 text-sm font-semibold text-navy transition hover:border-electric hover:text-electric"
        >
          Go to contractor dashboard
        </Link>
      </div>
    </div>
  );
}
