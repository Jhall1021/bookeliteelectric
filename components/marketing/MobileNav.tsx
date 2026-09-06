"use client";

import { useEffect, useRef, useState } from "react";
import { HERO, NAV, PRODUCT_PAGES, TRADES } from "./content";

/**
 * The navigation, below the desktop breakpoint.
 *
 * WHY THIS EXISTS. The header collapsed to Sign In and Request Early Access
 * on anything narrower than the desktop breakpoint, and there was nothing
 * behind that — no trigger, no panel, no disclosure state. That was survivable
 * when the marketing site was one page. It stopped being survivable the moment
 * the site grew ten routes: on a laptop window, a tablet or any phone, the
 * whole product and trade story became unreachable from the homepage, and
 * Guided Estimates was invisible on the day it launched.
 *
 * IT IS A CLIENT COMPONENT ON PURPOSE, and the only one in the header. The
 * desktop dropdowns are CSS — hover plus focus-within — which is right for a
 * pointer that can hover. A touch device has no hover, so the same trick
 * yields a menu that opens and never closes, or opens on the tap that was
 * meant to follow the link. A disclosure needs real state.
 *
 * The panel repeats the desktop menu's DATA, not its markup: NAV,
 * PRODUCT_PAGES and TRADES are the same constants, so a row that is a status
 * rather than a link there is a status rather than a link here. Website Embed
 * has no href and stays unclickable at every width; the same holds for any
 * trade that has not earned a page. Nothing here decides what may be claimed.
 */
export default function MobileNav({ signInHref }: { signInHref: string }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Escape closes and hands focus back, which is what a keyboard user expects
  // and what they otherwise lose — the trigger is above the panel in the DOM,
  // so without this the caret lands back at the top of the document.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /** Rows that are links close the panel; rows that are statuses do nothing. */
  const rows = (
    items: { name: string; href: string | null; status?: string }[],
    indent = true,
  ) =>
    items.map((i) =>
      i.href ? (
        <a
          key={i.name}
          href={i.href}
          onClick={() => setOpen(false)}
          className={`block py-2.5 text-[16px] text-p2b-ink ${indent ? "pl-4" : ""}`}
        >
          {i.name}
        </a>
      ) : (
        <div
          key={i.name}
          className={`flex items-center justify-between gap-3 py-2.5 text-[16px] text-p2b-faint ${
            indent ? "pl-4" : ""
          }`}
        >
          {i.name}
          {i.status && (
            <span className="rounded-sm bg-p2b-canvas-alt px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-p2b-muted-soft">
              {i.status}
            </span>
          )}
        </div>
      ),
    );

  return (
    <div className="lg:hidden">
      {/* SIGN IN LEFT THE BAR — 2 September. Logo, Sign In, Early Access and a
          menu toggle is one control too many at 390px: "Sign In" wrapped onto
          two lines beside the enlarged logo and made the header look broken.
          It is not gone from the phone, only from the bar — it is in the panel
          below, where a returning user looks anyway. */}
      <div className="flex items-center gap-4 text-[14px]">
        <a
          href="/#access"
          className="rounded-sm bg-p2b-accent px-3.5 py-2 font-semibold text-p2b-canvas"
        >
          Early Access
        </a>
        <button
          ref={triggerRef}
          type="button"
          aria-expanded={open}
          aria-controls="marketing-mobile-nav"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((v) => !v)}
          className="-mr-1 flex h-9 w-9 items-center justify-center rounded-sm text-p2b-ink"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            {open ? (
              <>
                <line x1="6" y1="6" x2="18" y2="18" />
                <line x1="18" y1="6" x2="6" y2="18" />
              </>
            ) : (
              <>
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </>
            )}
          </svg>
        </button>
      </div>

      {/* Rendered only when open, so its links are not reachable by tab while
          the panel is shut — a hidden-but-focusable menu is its own defect. */}
      {open && (
        <div
          id="marketing-mobile-nav"
          className="absolute left-0 right-0 z-30 border-b border-p2b-line bg-white px-5 pb-6 pt-2 shadow-[0_10px_28px_rgba(20,24,31,.10)]"
        >
          {NAV.map((item) => {
            const isProduct = item.label === "Product";
            const isTrades = item.label === "Trades";
            if (!isProduct && !isTrades) {
              return (
                <a
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="block border-t border-p2b-line py-3 text-[16px] font-semibold text-p2b-ink first:border-t-0"
                >
                  {item.label}
                </a>
              );
            }
            return (
              <div key={item.href} className="border-t border-p2b-line py-3 first:border-t-0">
                <div className="text-[11px] font-bold uppercase tracking-[0.06em] text-p2b-muted-soft">
                  {item.label}
                </div>
                <div className="mt-1">
                  {rows(
                    isProduct
                      ? PRODUCT_PAGES.map((p) => ({ name: p.name, href: p.href, status: p.status }))
                      : TRADES.map((t) => ({ name: t.name, href: t.href, status: t.status })),
                  )}
                </div>
              </div>
            );
          })}

          <div className="mt-4 flex flex-col gap-3 border-t border-p2b-line pt-4">
            <a
              href={signInHref}
              onClick={() => setOpen(false)}
              className="text-[16px] font-medium text-p2b-ink"
            >
              Sign In
            </a>
            <a
              href="/#access"
              onClick={() => setOpen(false)}
              className="rounded-sm bg-p2b-accent px-[18px] py-3 text-center text-[16px] font-semibold text-p2b-canvas"
            >
              {/* The CTA that goes to the access form must be LABELED the
                  access form. It read HERO.primaryCta, which became "See How
                  It Works" when the hero's CTAs were reordered — a button
                  promising one destination and delivering another. */}
              {HERO.secondaryCta}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
