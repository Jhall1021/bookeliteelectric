import Image from "next/image";
import { HERO, NAV, TRADES } from "./content";

/**
 * The Price2Book logo, as delivered by the designer.
 *
 * TWO PIECES, NOT ONE FILE. The brand lockup is icon + wordmark + the tagline
 * "Your Pricing. Your schedule." At header size that tagline renders about
 * seven pixels tall and turns to mush, and it would sit directly above an H1
 * that says the same two sentences at 78px. So the header composes the icon
 * and the wordmark itself and leaves the tagline to the hero, which is where
 * the line actually does its work.
 *
 * The reverse pair is the same art with the navy remapped to the page's light
 * ink, for the navy footer — a navy logo on a navy field is an invisible
 * logo, and tinting it with CSS would flatten the green out of the check.
 *
 * These are raster. The vector pack in hand (AI/EPS/PDF) contains three
 * earlier logo concepts, none of which is the revision that was approved, so
 * the assets are cut from the delivered 5000px artwork at 4× and cropped
 * tight. Swap in the vector when the designer sends the final one; nothing
 * outside this file and public/marketing/ has to change.
 */
const MARK = { w: 575, h: 576 };
const WORDMARK = { w: 1588, h: 244 };

export function Logo({ reverse = false, className = "" }: { reverse?: boolean; className?: string }) {
  const suffix = reverse ? "-reverse" : "";
  return (
    <span className={`flex items-center ${className}`}>
      <Image
        src={`/marketing/price2book-mark${suffix}.png`}
        alt="" aria-hidden="true"
        width={MARK.w} height={MARK.h} priority
        className="h-[26px] w-auto lg:h-[30px]"
      />
      <Image
        src={`/marketing/price2book-wordmark${suffix}.png`}
        alt="Price2Book"
        width={WORDMARK.w} height={WORDMARK.h} priority
        className="ml-2 h-[15px] w-auto lg:ml-2.5 lg:h-[17px]"
      />
    </span>
  );
}

/**
 * The header carries the CTA split the owner set: "Request Early Access" is
 * the primary marketing action and "Sign In" is the quieter action for people
 * who already have an account. Sign In is a plain link with no button
 * treatment precisely so it cannot compete — a second filled button here would
 * read as two equal offers.
 *
 * `signInHref` is resolved by the caller from APP_ORIGIN rather than hardcoded,
 * so a preview deployment links to its own portal instead of production's.
 */
export function MarketingHeader({ signInHref }: { signInHref: string }) {
  return (
    <header className="border-b border-p2b-line">
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-5 py-3.5 lg:px-[88px] lg:py-5">
        <a href="/" aria-label="Price2Book — home">
          <Logo />
        </a>

        <nav className="hidden items-center gap-[30px] text-[15px] text-p2b-muted xl:flex">
          {NAV.map((item) =>
            /* Trades opens; everything else is still a link, because the
               pages the other menus will hold do not exist yet and a menu
               pointing at nothing is worse than no menu. The dropdown is CSS
               only — hover and focus-within — so it needs no client component
               and works with a keyboard. */
            item.label === "Trades" ? (
              <div key={item.href} className="group relative">
                <a href={item.href} className="hover:text-p2b-ink">
                  {item.label} <span aria-hidden="true" className="text-[11px]">▾</span>
                </a>
                <div className="invisible absolute left-1/2 top-full z-20 w-[228px] -translate-x-1/2 pt-3 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <div className="rounded-[3px] border border-p2b-line bg-white py-1.5 shadow-[0_10px_28px_rgba(20,24,31,.10)]">
                    {TRADES.map((t) =>
                      t.href ? (
                        <a key={t.name} href={t.href}
                           className="flex items-center justify-between gap-3 px-4 py-2.5 text-[15px] text-p2b-ink hover:bg-p2b-canvas-alt">
                          {t.name}
                        </a>
                      ) : (
                        /* Not a link. There is no page behind it, and there
                           must not be one until the template is frozen. */
                        <div key={t.name}
                             className="flex cursor-default items-center justify-between gap-3 px-4 py-2.5 text-[15px] text-p2b-faint">
                          {t.name}
                          <span className="rounded-sm bg-p2b-canvas-alt px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em] text-p2b-muted-soft">
                            {t.status}
                          </span>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <a key={item.href} href={item.href} className="hover:text-p2b-ink">
                {item.label}
              </a>
            ),
          )}
          <span className="h-[18px] w-px bg-p2b-line" />
          <a href={signInHref} className="font-medium text-p2b-ink hover:text-p2b-accent">
            Sign In
          </a>
          <a href="/#access"
             className="rounded-sm bg-p2b-accent px-[18px] py-2.5 font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
            {HERO.primaryCta}
          </a>
        </nav>

        {/* Below xl the nav collapses to the same two actions, same hierarchy. */}
        <div className="flex items-center gap-4 text-[14px] xl:hidden">
          <a href={signInHref} className="font-medium text-p2b-ink">Sign In</a>
          <a href="/#access"
             className="rounded-sm bg-p2b-accent px-3.5 py-2 font-semibold text-p2b-canvas">
            Early Access
          </a>
        </div>
      </div>
    </header>
  );
}

export function MarketingFooter() {
  return (
    <footer className="border-t border-p2b-navy-hairline bg-p2b-navy-deep text-p2b-navy-muted">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-4 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-[88px] lg:py-[38px]">
        <Logo reverse />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-6">
          {/* A real, monitored address — the same one that sends sign-in
              links — rather than a form as the only way to reach anyone. */}
          <a href="mailto:admin@price2book.com" className="text-p2b-navy-text hover:text-[#F4F6F9]">
            admin@price2book.com
          </a>
          <span>While We’re There™ is a trademark of Price2Book.</span>
        </div>
      </div>
    </footer>
  );
}
