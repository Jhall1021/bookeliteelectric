import type { Metadata } from "next";
import { Inter, Manrope } from "next/font/google";
import "../styles/globals.css";
import ThemeTokens from "@/components/theme/ThemeTokens";

// Inter remains the storefront/base face. Contractor storefronts resolve their
// own theme tokens against it, so the product-wide admin refresh must not
// silently repaint a contractor's customer-facing site.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

// Manrope is Price2Book's application face. The contractor and staff portals
// opt into it through `.p2b-app`; storefronts keep Inter and the marketing site
// keeps its own explicitly scoped face. This lets the admin product feel more
// deliberate without changing a contractor's branded storefront.
const manrope = Manrope({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-manrope",
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
    <html lang="en" className={`${inter.variable} ${manrope.variable}`}>
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
