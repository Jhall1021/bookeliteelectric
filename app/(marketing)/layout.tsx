import type { Metadata } from "next";
import { Archivo } from "next/font/google";

/**
 * Archivo is the marketing site's typeface and nothing else's.
 *
 * It loads here rather than in the root layout so a storefront never pays for
 * a font it does not use — storefronts resolve their own faces through
 * --t-font-display/--t-font-body at the [site] boundary.
 */
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Price2Book — Your pricing. Your schedule.",
  description:
    "Give homeowners upfront prices and let them book the work you choose — using your pricing, your availability, and the software you already use to run your business.",
};

/**
 * A route group, so this adds a shell without adding a path segment: the page
 * inside it still serves "/".
 *
 * Reaching this layout at all means the request was NOT caught by the legacy
 * Elite redirects in next.config.mjs, which fire on every host except
 * price2book.com. That host scoping is the only thing separating the marketing
 * homepage from Elite's storefront root, and it is verified by
 * scripts/verify-legacy-redirect-scope.ts rather than assumed.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${archivo.variable} font-marketing bg-p2b-canvas text-p2b-ink antialiased`}>
      {children}
    </div>
  );
}
