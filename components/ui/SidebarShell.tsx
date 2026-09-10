"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { signOut } from "@/lib/authClient";
import { LogoMark, BellIcon, ChevronDownIcon, NAV_ICONS, type NavIconKey } from "./icons";

/**
 * The one navigation shell for both admin surfaces — Price2Book staff and
 * the contractor's own dashboard: a permanent navy sidebar, a white utility
 * header, a light canvas below. Neither surface had this before (both used
 * a horizontal top bar — see git history on PortalChrome.tsx and the
 * pre-redesign app/platform/layout.tsx).
 *
 * EVERY HEADER CONTROL IS REAL. There is no header search box: nothing in
 * either surface searches "services, settings, or help" as one index, and a
 * text field that goes nowhere is worse than no field. The contractor
 * directory keeps its own working, scoped search instead (see
 * ContractorDirectory.tsx). The bell and the business switcher below are
 * real for the same reason — each points at a capability that already
 * exists, never a decoration added to match a reference image.
 *
 * MOBILE DRAWER FOLLOWS components/marketing/MobileNav.tsx's OWN PATTERN —
 * the only prior art for a collapsing nav in this codebase: plain `useState`
 * (no headless-UI dependency), the panel conditionally RENDERED rather than
 * CSS-hidden (so it is not tab-reachable while closed), and an Escape
 * handler that closes the drawer and returns focus to the trigger button.
 */

export type NavItem = { href: string; label: string; icon: NavIconKey; exact?: boolean; badge?: number };

export function SidebarShell({
  homeHref, switcherLabel, switcherHref, primary, footerLinks, tagline,
  notifications, identity, children,
}: {
  /** Where the wordmark links — this surface's own home, never the marketing site. */
  homeHref: string;
  /** The contractor's own name, or "Platform admin" — always shown, never implied. */
  switcherLabel: string;
  /** A REAL place to change which business this account acts for (the existing /choose chooser). Omit when there's nothing to switch to. */
  switcherHref?: string;
  primary: NavItem[];
  /** Settings, and anything else real but secondary. Omit rather than link somewhere unbuilt. */
  footerLinks?: NavItem[];
  tagline?: string;
  /**
   * The bell — a real link, always. `count` is optional and left undefined
   * on pages that haven't already computed it (the layout wraps every
   * route, and re-running the count query on each navigation just to badge
   * a bell is the "expensive dashboard query" this shell is built to avoid);
   * a page that already has the number for its own content passes it
   * through, no separate fetch.
   */
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

  /**
   * Focus management for the drawer, all through one effect keyed on
   * `mobileOpen` so every way it closes — Escape, the backdrop, the close
   * button, or a nav link navigating away (the pathname effect below) —
   * runs the SAME cleanup and restores focus, rather than each dismiss path
   * needing its own `.focus()` call and one of them (previously all but
   * Escape) silently skipping it.
   *
   * Opening moves focus into the drawer (its first focusable element, which
   * is the close button) instead of leaving it on the trigger behind the
   * overlay, and Tab/Shift+Tab are trapped to the drawer's own focusable
   * elements while it is open — without this, a keyboard user tabbing
   * forward reaches the header's notification bell and avatar menu, then
   * the page content underneath, none of which is visible under the
   * backdrop.
   */
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

  // Close the drawer on navigation — otherwise a tapped link leaves a full
  // overlay standing over the page it just navigated to.
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
      <div className="px-5 pb-4 pt-6">
        <Link href={homeHref} className="flex items-center gap-2 font-display text-lg font-bold text-white">
          <LogoMark className="h-6 w-6 text-electric" />
          Price2Book
        </Link>
      </div>

      <div className="px-5 pb-4">
        {switcherHref ? (
          <Link href={switcherHref} className="block rounded-md border border-white/10 bg-white/5 px-3 py-2 hover:border-white/20">
            <p className="truncate text-sm font-semibold text-white">{switcherLabel}</p>
            <p className="text-xs text-white/60">Switch business</p>
          </Link>
        ) : (
          <div className="rounded-md border border-white/10 bg-white/5 px-3 py-2">
            <p className="truncate text-sm font-semibold text-white">{switcherLabel}</p>
          </div>
        )}
      </div>

      <div className="flex-1 space-y-1 overflow-y-auto px-3">
        {primary.map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item)} />
        ))}
      </div>

      <div className="space-y-1 border-t border-white/10 px-3 py-3">
        {(footerLinks ?? []).map((item) => (
          <SidebarLink key={item.href} item={item} active={isActive(item)} />
        ))}
      </div>

      {tagline && <p className="px-5 pb-5 text-[11px] text-white/40">{tagline}</p>}
    </nav>
  );

  return (
    <div className="min-h-screen bg-warmwhite">
      <div className="lg:flex">
        <aside className="hidden lg:block lg:w-64 lg:shrink-0 lg:bg-navy">
          <div className="lg:sticky lg:top-0 lg:h-screen">{nav}</div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Utility header — white, real controls only. */}
          <header className="flex items-center justify-between gap-4 border-b border-cardline bg-white px-4 py-3 lg:px-8">
            <button
              ref={menuButtonRef}
              type="button"
              onClick={() => setMobileOpen(true)}
              aria-expanded={mobileOpen}
              aria-controls="admin-mobile-nav"
              className="rounded-md p-2 text-navy hover:bg-warmwhite lg:hidden"
            >
              <span className="sr-only">Open navigation</span>
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-5 w-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            <span className="font-display text-sm font-semibold text-navy lg:hidden">{switcherLabel}</span>

            <div className="ml-auto flex items-center gap-3">
              {notifications && (
                <Link
                  href={notifications.href}
                  aria-label={notifications.count ? `${notifications.label}: ${notifications.count}` : notifications.label}
                  className="relative rounded-full p-2 text-navy hover:bg-warmwhite"
                >
                  <BellIcon className="h-5 w-5" />
                  {!!notifications.count && notifications.count > 0 && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
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
                  className="flex items-center gap-1.5 rounded-full p-1 hover:bg-warmwhite"
                >
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-electric text-xs font-bold text-white">
                    {initials}
                  </span>
                  <ChevronDownIcon className="h-4 w-4 text-slate" />
                </button>
                {avatarOpen && (
                  <div className="absolute right-0 top-full z-40 mt-2 w-56 rounded-card border border-cardline bg-white py-2 shadow-raised">
                    <p className="truncate px-3 pb-2 text-xs text-slate">{identity.email}</p>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      className="block w-full px-3 py-1.5 text-left text-sm text-navy hover:bg-warmwhite"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          <main className="mx-auto max-w-6xl px-4 py-6 lg:px-8 lg:py-8">{children}</main>
        </div>
      </div>

      {mobileOpen && (
        <div id="admin-mobile-nav" className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <div
            ref={drawerRef}
            role="dialog"
            aria-modal="true"
            aria-label="Primary navigation"
            tabIndex={-1}
            className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-navy shadow-raised"
          >
            <div className="flex justify-end px-3 pt-3">
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="rounded-md p-2 text-white hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
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
      className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition ${
        active ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="flex-1">{item.label}</span>
      {item.badge !== undefined && item.badge > 0 && (
        <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">
          {item.badge}
        </span>
      )}
    </Link>
  );
}
