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

export default async function PlatformLayout({ children }: { children: React.ReactNode }) {
  let actor;
  try {
    actor = await resolvePlatformActor();
  } catch (e) {
    if (e instanceof NotAuthenticatedError) redirect("/sign-in");
    if (e instanceof NotPlatformStaffError) return <Refused />;
    throw e;
  }

  return (
    <SidebarShell
      homeHref="/platform"
      switcherLabel="Platform admin"
      primary={NAV}
      notifications={{ href: "/platform/attention", label: "Attention needed" }}
      identity={{ name: actor.email, email: actor.email }}
    >
      {children}
    </SidebarShell>
  );
}

function Refused() {
  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <h1 className="font-display text-2xl font-bold text-navy">This area is for Price2Book staff</h1>
      <p className="mt-2 text-sm text-slate">
        Your account is signed in, but it isn&rsquo;t platform staff. Owning or managing a
        contractor doesn&rsquo;t open this door &mdash; that&rsquo;s deliberate.
      </p>
      <p className="mt-6 text-sm">
        <Link href="/dashboard" className="font-medium text-electric hover:underline">
          Go to your dashboard
        </Link>
      </p>
    </div>
  );
}
