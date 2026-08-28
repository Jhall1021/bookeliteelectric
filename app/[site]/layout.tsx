import type { Metadata } from "next";
import { requireHostedSite } from "@/lib/siteRouting";
import { SiteProvider } from "@/components/site/SiteContext";
import ThemeTokens from "@/components/theme/ThemeTokens";
import { ThemeStructureProvider } from "@/components/theme/ThemeContext";
import { StorefrontProvider } from "@/components/theme/StorefrontContext";
import { ANONYMOUS_IDENTITY, IDENTITY_SELECT, resolveIdentity } from "@/lib/storefrontIdentity";
import { pricingCopy } from "@/lib/pricingCopy";
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
 * It is also where the contractor's IDENTITY, their PRICING MODEL and their
 * STOREFRONT THEME all resolve (ADR-015, ADR-016) — the three layers, read
 * once, in the one place that already knows which contractor this is. The site is
 * already resolved here, so the contractor's brand inputs and pinned theme are
 * one read away, and emitting the tokens at the boundary means every page
 * beneath renders in that contractor's theme without any page knowing a theme
 * exists.
 */
/**
 * The browser tab belongs to the contractor, not the platform — ADR-016.
 *
 * The root layout's metadata names Price2Book, because it also serves /admin
 * and the not-found path. Leaving it at that gave every storefront the
 * platform's name in the tab and the share card, which is precisely the
 * "generic template with a logo pasted on" failure this pass exists to remove.
 */
export async function generateMetadata({ params }: { params: { site: string } }): Promise<Metadata> {
  const site = await requireHostedSite(params.site);
  const c = await prisma.contractor.findUnique({
    where: { id: site.contractorId },
    select: { name: true, pricingStrategy: true },
  });
  if (!c) return {};
  return {
    title: `${c.name} | Home Services`,
    description: pricingCopy(c.pricingStrategy).metaDescription,
  };
}

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
    select: { ...IDENTITY_SELECT, brandColors: true, themeKey: true, themeVersion: true,
              pricingStrategy: true },
  });
  const brand = readBrandInputs(c?.brandColors);
  const choice = c ? { themeKey: c.themeKey, version: c.themeVersion } : undefined;
  const theme = resolveStorefrontTheme(brand, choice);
  return (
    <SiteProvider publicId={site.publicId} hostedSlug={site.hostedSlug}>
      <ThemeTokens brand={brand} choice={choice} />
      <StorefrontProvider value={{
        identity: c ? resolveIdentity(c) : ANONYMOUS_IDENTITY,
        copy: pricingCopy(c?.pricingStrategy),
      }}>
        <ThemeStructureProvider structure={theme.structure}>
          <Header />
          {children}
          <Footer />
        </ThemeStructureProvider>
      </StorefrontProvider>
    </SiteProvider>
  );
}
