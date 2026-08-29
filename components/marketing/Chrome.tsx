import { HERO, NAV, SIGN_IN_PATH } from "./content";

/** The Price2Book mark. Inline so the header never waits on a request. */
export function Bolt({ className, stroke }: { className?: string; stroke: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="1.9"
         strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
    </svg>
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
      <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-5 py-4 lg:px-[88px] lg:py-6">
        <a href="#top" className="flex items-center gap-2 text-p2b-ink">
          <Bolt className="h-[19px] w-[19px] lg:h-[22px] lg:w-[22px]" stroke="#1B4B8F" />
          <span className="text-base font-bold tracking-[-0.03em] lg:text-lg">Price2Book</span>
        </a>

        <nav className="hidden items-center gap-[30px] text-[15px] text-p2b-muted xl:flex">
          {NAV.map((item) => (
            <a key={item.href} href={item.href} className="hover:text-p2b-ink">
              {item.label}
            </a>
          ))}
          <span className="h-[18px] w-px bg-p2b-line" />
          <a href={signInHref} className="font-medium text-p2b-ink hover:text-p2b-accent">
            Sign In
          </a>
          <a href="#access"
             className="rounded-sm bg-p2b-accent px-[18px] py-2.5 font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
            {HERO.primaryCta}
          </a>
        </nav>

        {/* Below xl the nav collapses to the same two actions, same hierarchy. */}
        <div className="flex items-center gap-4 text-[14px] xl:hidden">
          <a href={signInHref} className="font-medium text-p2b-ink">Sign In</a>
          <a href="#access"
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
    <footer className="border-t border-[#1B2E4B] bg-p2b-navy-deep text-p2b-navy-muted">
      <div className="mx-auto flex max-w-[1440px] flex-col gap-3 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between lg:px-[88px] lg:py-[38px]">
        <div className="flex items-center gap-2.5">
          <Bolt className="h-4 w-4" stroke="#7E8EA6" />
          <span>Price2Book</span>
        </div>
        <span>While We’re There™ is a trademark of Price2Book.</span>
      </div>
    </footer>
  );
}
