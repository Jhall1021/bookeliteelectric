import { requireHostedSite } from "@/lib/siteRouting";
import { SiteProvider } from "@/components/site/SiteContext";
import ThemeTokens from "@/components/theme/ThemeTokens";
import { ThemeStructureProvider } from "@/components/theme/ThemeContext";
import Header from "@/components/shared/Header";
import Footer from "@/components/shared/Footer";
import { readBrandInputs, resolveStorefrontTheme } from "@/lib/theme/resolve";
import { prisma } from "@/lib/prisma";

/**
 * The storefront boundary — ADR §2.2.
 *
 * Resolves the site once, for every page beneath it, and renders nothing if it
 * does not resolve. `requireHostedSite` calls `notFound()`, so an unknown,
 * inactive or misspelled storefront is indistinguishable from a URL that never
 * existed.
 *
 * Pages still resolve the site themselves rather than relying on this. A
 * layout runs before its children, but nothing in the type system says a page
 * may not be rendered another way, and "the layout already checked" is the
 * kind of assumption that is true until someone adds a route. This is the
 * boundary for the CLIENT half: it provides the identifier that customer-facing
 * fetches attach.
 *
 * It is also where the STOREFRONT THEME resolves (ADR-015). The site is
 * already resolved here, so the contractor's brand inputs and pinned theme are
 * one read away, and emitting the tokens at the boundary means every page
 * beneath renders in that contractor's theme without any page knowing a theme
 * exists.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { site: string };
}) {
  const site = await requireHostedSite(params.site);
  // Routing data only, same as requireHostedSite: the choices, never a
  // derived value. There is nothing derived stored to read.
  const c = await prisma.contractor.findUnique({
    where: { id: site.contractorId },
    select: { brandColors: true, themeKey: true, themeVersion: true },
  });
  const brand = readBrandInputs(c?.brandColors);
  const choice = c ? { themeKey: c.themeKey, version: c.themeVersion } : undefined;
  const theme = resolveStorefrontTheme(brand, choice);
  return (
    <SiteProvider publicId={site.publicId} hostedSlug={site.hostedSlug}>
      <ThemeTokens brand={brand} choice={choice} />
      <ThemeStructureProvider structure={theme.structure}>
        <Header />
        {children}
        <Footer />
      </ThemeStructureProvider>
    </SiteProvider>
  );
}
