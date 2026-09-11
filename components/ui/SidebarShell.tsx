"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/authClient";
import { LogoMark, BellIcon, ChevronDownIcon, NAV_ICONS, type NavIconKey } from "./icons";

/**
 * The one navigation shell for both admin surfaces — Price2Book staff and
 * the contractor's own dashboard. The visual system belongs here so every
 * operational page inherits the same typography, spacing and navigation
 * language without each feature inventing its own chrome.
 *
 * EVERY HEADER CONTROL IS REAL. There is no decorative search box: the bell,
 * business switcher and account menu all point at capabilities that exist.
 */

export type NavItem = { href: string; label: string; icon: NavIconKey; exact?: boolean; badge?: number };

export function SidebarShell({
  homeHref, switcherLabel, switcherHref, primary, footerLinks, tagline,
  notifications, identity, children,
}: {
  homeHref: string;
  switcherLabel: string;
  switcherHref?: string;
  primary: NavItem[];
  footerLinks?: NavItem[];
  tagline?: string;
  notifications?: { href: string; count?: number; label: string };
  identity: { name: string; email: string };
  children: React.ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!mobileOpen) return;
    const drawer = drawerRef.current;
    if (!drawer) return;

    const focusable = () =>
      Array.from(
        drawer.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
      ).filter((el) => el.offsetParent !== null);

    (focusable()[0] ?? drawer).focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMobileOpen(false); return; }
      if (e.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      menuButtonRef.current?.focus();
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!avatarOpen) return;
    const onClick = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAvatarOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onClick); document.removeEventListener("keydown", onKey); };
  }, [avatarOpen]);

  useEffect(() => { setMobileOpen(false); }, [pathname]);

  const isActive = (item: NavItem) =>
    item.exact ? pathname === item.href : pathname === item.href || pathname.startsWith(`${item.href}/`);

  async function handleSignOut() {
    await signOut();
    router.push("/sign-in");
    router.refresh();
  }

  const initials = identity.name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

  const nav = (
    <nav className="flex h-full flex-col" aria-label="Primary">
      <div className="px-5 pb-5 pt-6">
        <Link href={homeHref} className="group flex items-center gap-3 font-display text-[17px] font-extrabold tracking-[-0.02em] text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-white/[0.08] ring-1 ring-inset ring-white/10 transition group-hover:bg-white/[0.12]">
            <LogoMark className="h-5 w-5 text-electric" />
          </span>
          Price2Book
        </Link>
      </div>

      <div className="px-4 pb-5">
        {switcherHref ? (
          <Link
            href={switcherHref}
            className="group block rounded-xl border border-white/10 bg-white/[0.055] px-3.5 py-3 transition hover:border-white/20 hover:bg-white/[0.08]"
          >
            <p className="truncate text-[13px] font-bold tracking-[-0.01em] text-white">{switcherLabel}</p>
            <p className="mt-0.5 text-[11px] font-medium text-white/45 transition group-hover:text-white/60">Switch business</p>
          </Link>
        ) : (
          <div className="rounded-xl border border-white/10 bg-white/[0.055] px-3.5 py-3">
            <p className="truncate text-[13px] font-bold tracking-[-0.01em] text-white">{switcherLabel}</p>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3">
        {primary.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item)} />
        ))}
      </div>

      <div className="mx-3 space-y-1 border-t border-white/[0.08] pb-2 pt-3">
        {(footerLinks ?? []).map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item)} />
        ))}
      </div>

      {tagline && <p className="px-5 pb-5 pt-1 text-[10px] font-medium tracking-[0.03em] text-white/30">{tagline}</p>}
    </nav>
  );

  return (
    <div className="p2b-app min-h-screen">
      <div className="lg:flex">
        <aside className="hidden lg:block lg:w-[260px] lg:shrink-0 lg:bg-navy">
          <div className="lg:sticky lg:top-0 lg:h-screen">{nav}</div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-line/80 bg-white/90 px-4 backdrop-blur-md lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-nav"
              className="rounded-[10px] border border-line bg-white p-2 text-ink shadow-sm transition hover:bg-canvas lg:hidden"
            >
              <span className="sr-only">Open navigation</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-display text-sm font-bold tracking-[-0.01em] text-ink lg:hidden">{switcherLabel}</span>

            <div className="ml-auto flex items-center gap-2">
              {notifications && (
                <Link
                  href={notifications.href}
                  aria-label={notifications.count ? `${notifications.label}: ${notifications.count}` : notifications.label}
                  className="relative rounded-[10px] p-2.5 text-ink-soft transition hover:bg-canvas hover:text-ink"
                >
                  <BellIcon className="h-[18px] w-[18px]" />
                  {!!notifications.count && notifications.count > 0 && (
                    <span className="absolute right-0 top-0 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
                      {notifications.count > 9 ? "9+" : notifications.count}
                    </span>
                  )}
                </Link>
              )}

              <div ref={avatarRef} className="relative">
                <button
                  type="button"
                  onClick={() => setAvatarOpen((v) => !v)}
                  aria-expanded={avatarOpen}
                  className="flex items-center gap-1 rounded-[12px] p-1.5 transition hover:bg-canvas"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-[11px] font-extrabold text-white shadow-sm">
                    {initials}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 text-muted" />
                </button>
                {avatarOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-60 rounded-card border border-line bg-white p-2 shadow-raised">
                    <div className="border-b border-line px-2 pb-2.5 pt-1.5">
                      <p className="truncate text-[13px] font-bold text-ink">{identity.name}</p>
                      <p className="mt-0.5 truncate text-[11px] text-muted">{identity.email}</p>
                    </div>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="mt-1 block w-full rounded-[10px] px-2.5 py-2 text-left text-[13px] font-semibold text-ink-soft transition hover:bg-canvas hover:text-ink"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Each admin route already owns its content measure and spacing.
              The shell supplies navigation, chrome and the application theme;
              it deliberately does not add a second layer of page padding. */}
          <main className="min-h-[calc(100vh-4rem)]">{children}</main>
        </div>
      </div>

      {mobileOpen && (
        <div id="admin-mobile-nav" className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy/55 backdrop-blur-[2px]" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Primary navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 w-[300px] max-w-[88vw] bg-navy shadow-raised"
          >
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-[10px] p-2 text-white/80 transition hover:bg-white/10 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
              >
                <span className="sr-only">Close navigation</span>
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {nav}
          </div>
        </div>
      )}
    </div>
  );
}

function SidebarLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = NAV_ICONS[item.icon];
  return (
    <Link
      href={item.href}
      aria-current={active ? "page" : undefined}
      className={`relative flex items-center gap-3 rounded-[11px] px-3 py-2.5 text-[13px] font-semibold transition-all duration-150 ${
        active
          ? "bg-white/[0.11] text-white ring-1 ring-inset ring-white/[0.04]"
          : "text-white/[0.62] hover:bg-white/[0.055] hover:text-white"
      }`}
    >
      {active && <span className="absolute inset-y-2 left-0 w-[3px] rounded-full bg-electric" aria-hidden="true" />}
      <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-white/70" : "text-white/50"}`} />
      <span className="flex-1">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500/90 px-1.5 text-[10px] font-extrabold text-white">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
