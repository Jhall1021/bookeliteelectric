import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "../styles/globals.css";
import ThemeTokens from "@/components/theme/ThemeTokens";

// Self-hosted by Next.js at build time (no external request from the
// browser, no layout shift) — this is what actually loads Inter. Before
// this, --font-display/--font-body in globals.css named "Inter" but
// nothing ever fetched it, so every visitor was silently seeing their
// device's default system font instead. Weights match exactly what's
// used across the site (checked: font-normal, font-medium, font-semibold,
// font-bold — no others), so nothing extra ships.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

/**
 * The PLATFORM's metadata, not a contractor's — ADR-016. This layout serves
 * /admin and the not-found path, which belong to nobody in particular. A
 * storefront overrides it at the [site] boundary, where the contractor is
 * known.
 */
export const metadata: Metadata = {
  title: "Price2Book",
  // Was "Online booking for home-services contractors", which describes the
  // homeowner's side of a product whose buyer is the contractor — and makes
  // it sound like one more booking tool, which is the exact category
  // POSITIONING.md says the product must not be read as.
  description:
    "The pricing and booking layer in front of a residential service contractor's business.",
};

/**
 * The storefront's header and footer used to live here. They moved to the
 * [site] layout in Phase 3 for two reasons.
 *
 * They have to vary: a variant that cannot change the shape of the header is
 * not a variant. And they were rendering on /admin, which has its own
 * navigation, so every admin page carried two.
 *
 * It also fixes a quiet bug. Header called useSiteOptional() and was a SIBLING
 * of the [site] layout that provides it, so the context was always null and
 * the cart badge could never populate on a storefront page. The comment
 * explaining the optionality described the symptom.
 */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* The base theme, for admin and marketing pages that belong to no
            contractor. A storefront overrides it at the [site] boundary,
            where the contractor is already resolved. */}
        <ThemeTokens base />
      </head>
      <body>{children}</body>
    </html>
  );
}
