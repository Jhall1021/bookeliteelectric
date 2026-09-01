import type { Metadata } from "next";
import { Archivo } from "next/font/google";
import { appOrigin, platformOrigin } from "@/lib/origins";
import { MarketingHeader, MarketingFooter } from "@/components/marketing/Chrome";
import { SIGN_IN_PATH } from "@/components/marketing/content";

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

const TITLE = "Price2Book — Your pricing. Your schedule.";
const DESCRIPTION =
  "Turn homeowner requests into safely priced, bookable work. Customers describe what they need, " +
  "answer the questions that affect scope, and see your approved price and real availability — " +
  "without replacing the software you already use.";

/**
 * `metadataBase` is what makes every relative URL below resolve to an absolute
 * one. Without it Next emits relative og:image and canonical values, which
 * some crawlers and every chat preview simply drop — the page looks fine and
 * shares as a bare link.
 *
 * Resolved rather than hardcoded, so a preview deployment describes itself.
 */
const origin = platformOrigin();

export const metadata: Metadata = {
  ...(origin ? { metadataBase: new URL(origin) } : {}),
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: "Price2Book",
    title: TITLE,
    description: DESCRIPTION,
    ...(origin ? { url: origin } : {}),
  },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION },
  robots: { index: true, follow: true },
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
/**
 * THE CHROME LIVES HERE, not on the homepage — SITEMAP.md.
 *
 * It was on the page while the site was one page, which was fine and stopped
 * being fine the moment a second one existed: a trade page would either
 * repeat the header and footer or quietly ship without them. Everything every
 * marketing surface shares — the Price2Book header and navigation, the
 * footer, Archivo, the warm canvas — is the layout's job now.
 *
 * `signInHref` is resolved from APP_ORIGIN rather than hardcoded, so a preview
 * deployment links to its own portal instead of production's.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  const signInHref = `${appOrigin() ?? ""}${SIGN_IN_PATH}`;
  return (
    <div className={`${archivo.variable} font-marketing bg-p2b-canvas text-p2b-ink antialiased`}>
      <MarketingHeader signInHref={signInHref} />
      {children}
      <MarketingFooter />
    </div>
  );
}
