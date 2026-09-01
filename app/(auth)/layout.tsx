import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { platformOrigin } from "@/lib/origins";

const archivo = Archivo({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-archivo" });

/**
 * The shell for every account page — ADR-020.
 *
 * Was /sign-in's own layout. Sign-up, password reset and choosing a new
 * password want the identical frame, and four copies of it is four places for
 * it to drift.
 *
 * The title stays account-side rather than homeowner-side: the root layout
 * describes booking to a homeowner, which undersells what a contractor is
 * signing in to. It is deliberately not per-page — these pages are client
 * components and cannot export their own metadata, and a shared honest title
 * beats a server wrapper per page whose only job is a string.
 *
 * noindex because an account form has nothing to offer a search result, and
 * robots.ts disallows it too — belt and braces, since the two are read by
 * different crawlers in different orders.
 */
export const metadata: Metadata = {
  title: "Your account — Price2Book",
  description:
    "Sign in to your Price2Book account to manage your services, pricing, Guided Pricing questions, availability and storefront.",
  robots: { index: false, follow: false },
};

/**
 * The platform's chrome, not a storefront's.
 *
 * The page inside used the storefront token names — navy, slate, electric —
 * which resolve to whichever contractor theme is in :root. On a platform page
 * that is the same mistake the marketing site avoids by owning a palette:
 * a contractor's color choice must not repaint Price2Book's own screens.
 */
export default function SignInLayout({ children }: { children: React.ReactNode }) {
  const home = platformOrigin() ?? "/";
  return (
    <div className={`${archivo.variable} font-marketing flex min-h-screen flex-col bg-p2b-canvas text-p2b-ink antialiased`}>
      <header className="border-b border-p2b-line">
        <div className="mx-auto flex max-w-[1440px] items-center justify-between gap-6 px-5 py-4 lg:px-[88px] lg:py-6">
          <a href={home} className="flex items-center gap-2 text-p2b-ink">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
                 className="h-[19px] w-[19px] text-p2b-accent lg:h-[22px] lg:w-[22px]">
              <path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" />
            </svg>
            <span className="text-base font-bold tracking-[-0.03em] lg:text-lg">Price2Book</span>
          </a>
          <a href={home} className="text-[14px] font-medium text-p2b-muted hover:text-p2b-ink">
            ← Back to price2book.com
          </a>
        </div>
      </header>

      <main className="flex flex-1 items-start justify-center px-5 py-16 lg:py-24">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>

      <footer className="border-t border-p2b-line">
        <div className="mx-auto flex max-w-[1440px] flex-col gap-2 px-5 py-6 text-[13px] text-p2b-muted sm:flex-row sm:items-center sm:justify-between lg:px-[88px]">
          <span>Price2Book</span>
          <a href="mailto:admin@price2book.com" className="hover:text-p2b-ink">admin@price2book.com</a>
        </div>
      </footer>
    </div>
  );
}
