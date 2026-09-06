import Link from "next/link";
import { redirect } from "next/navigation";
import {
  NotAuthenticatedError, NotPlatformStaffError, resolvePlatformActor,
} from "@/lib/platformContext";

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
 * Signed-out goes to sign-in, as the portal does. Everything under this shell
 * is READ-ONLY in Phase 2: three views over lib/platformReadModel and nothing
 * that writes.
 */
const NAV = [
  { href: "/platform", label: "Overview" },
  { href: "/platform/contractors", label: "Contractors" },
  { href: "/platform/attention", label: "Attention needed" },
] as const;

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
    <div className="min-h-screen bg-warmwhite">
      <header className="border-b border-cardline bg-navy text-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-3 text-sm">
          <div className="flex items-center gap-6">
            <span className="font-display font-bold">Price2Book · Platform</span>
            <nav className="flex items-center gap-4" aria-label="Platform">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="text-white/80 hover:text-white hover:underline">{n.label}</Link>
              ))}
            </nav>
          </div>
          <span className="text-white/80">
            {actor.email} · {actor.role} · read-only
          </span>
        </div>
      </header>
      <div className="mx-auto max-w-6xl px-6 py-8">{children}</div>
    </div>
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
