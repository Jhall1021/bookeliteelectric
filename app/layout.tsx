import type { Metadata } from "next";
import { Inter, Inter_Tight } from "next/font/google";
import "../styles/globals.css";
import "../styles/admin.css";
import ThemeTokens from "@/components/theme/ThemeTokens";

// The approved Price2Book UI system uses Inter for body copy and Inter Tight
// for headings. Both are self-hosted by Next at build time. Contractor
// storefronts still resolve their own semantic theme at the [site] boundary;
// the admin shell opts into the Price2Book pairing separately.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["500", "600", "700", "800"],
  variable: "--font-inter-tight",
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${interTight.variable}`}>
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
