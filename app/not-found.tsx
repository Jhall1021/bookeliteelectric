import Link from "next/link";
import { Archivo } from "next/font/google";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "600", "700"], variable: "--font-archivo" });

export const metadata = {
  title: "Page not found — Price2Book",
  description: "That page doesn’t exist.",
};

/**
 * The PLATFORM's 404 — ADR-020.
 *
 * Reached for any URL that matches nothing — including an unknown contractor
 * slug, which is correct: there is no contractor to brand the page as.
 *
 * TWO KNOWN GAPS, neither introduced here, both written down rather than
 * quietly left to be rediscovered:
 *
 * 1. A bad path under a REAL storefront (/elite-electric/typo) lands here, so
 *    a homeowner who mistypes their electrician's address sees Price2Book's
 *    masthead instead of their electrician's. A not-found file at the [site]
 *    segment cannot fix it: requireHostedSite() calls notFound() from the
 *    [site] LAYOUT, and a boundary inside a segment whose own layout just
 *    failed renders nothing at all. Tried, produced a blank page, reverted.
 *    It needs a catch-all route inside [site].
 *
 * 2. An UNKNOWN contractor slug (/not-a-contractor) never reaches this file
 *    at all — the same layout-level notFound() hands back Next's bare error
 *    shell. Verified as pre-existing against production before this page
 *    existed: 404, no title, no body. The status is right; the page is empty.
 *
 * Both are presentation, both need the tenancy path touched, and neither is
 * worth doing carelessly inside a marketing round.
 */
export default function NotFound() {
  return (
    <div className={`${archivo.variable} font-marketing flex min-h-screen flex-col bg-p2b-canvas text-p2b-ink antialiased`}>
      <header className="border-b border-p2b-line">
        <div className="mx-auto flex max-w-[1440px] items-center px-5 py-4 lg:px-[88px] lg:py-6">
          <Link href="/" className="flex items-center gap-2 text-p2b-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                 className="h-[19px] w-[19px] text-p2b-accent lg:h-[22px] lg:w-[22px]">
              <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
            </svg>
            <span className="text-base font-bold tracking-[-0.03em] lg:text-lg">Price2Book</span>
          </Link>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col justify-center px-5 py-24 lg:px-[88px]">
        <p className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
          404
        </p>
        <h1 className="mt-5 max-w-[18ch] text-[40px] font-bold leading-[1.05] tracking-[-0.022em] lg:text-[64px]">
          That page doesn’t exist.
        </h1>
        <p className="mt-6 max-w-[52ch] text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
          The link may be out of date, or the address may have a typo in it. Nothing is broken on
          your end.
        </p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
          <Link href="/"
                className="rounded-sm bg-p2b-accent px-[30px] py-4 text-center text-base font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
            Back to Price2Book
          </Link>
          <a href="mailto:admin@price2book.com" className="text-center text-base font-medium text-p2b-ink hover:text-p2b-accent">
            Tell us what you were looking for →
          </a>
        </div>
      </main>

      <footer className="border-t border-p2b-navy-hairline bg-p2b-navy-deep text-p2b-navy-muted">
        <div className="mx-auto max-w-[1440px] px-5 py-8 text-sm lg:px-[88px]">Price2Book</div>
      </footer>
    </div>
  );
}
