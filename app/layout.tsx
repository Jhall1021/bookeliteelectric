import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
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

export const metadata: Metadata = {
  title: "Elite Electric & Lighting | Home Services",
  description: "See your price. Pick your time. Book your electrician.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        {/* Phase 1 emits the Elite v1 definition. Passing the resolved
            site's brand inputs here is the Phase 2 change. */}
        <ThemeTokens />
      </head>
      <body>
        <Header />
        {children}
        <Footer />
      </body>
    </html>
  );
}
