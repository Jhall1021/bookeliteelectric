"use client";

import { useId } from "react";
import Header from "@/components/shared/Header";
import Hero from "@/components/home/Hero";
import FeaturedServices, { type FeaturedItem } from "@/components/home/FeaturedServices";
import { ThemeStructureProvider } from "@/components/theme/ThemeContext";
import { StorefrontProvider } from "@/components/theme/StorefrontContext";
import { SiteProvider } from "@/components/site/SiteContext";
import { resolveStorefrontTheme, themeCss, type BrandInputs, type ThemeChoice } from "@/lib/theme/resolve";
import { pricingCopy } from "@/lib/pricingCopy";
import type { StorefrontIdentity } from "@/lib/storefrontIdentity";
import type { PricingStrategy } from "@prisma/client";

/**
 * A design, rendered with the contractor's own company — Phase 4, ADR-015.
 *
 * This renders the REAL Header, Hero and FeaturedServices inside the real
 * providers, at a smaller scale. It is not a mock-up of the storefront: it IS
 * the storefront's components, which is the only version of a preview that
 * cannot quietly drift away from what applying the design would actually do.
 *
 * Three things make that safe to put on a settings page:
 *
 *   TOKENS ARE SCOPED. `themeCss` writes to this preview's own container
 *   selector rather than `:root`, so six previews can sit on one page without
 *   any of them repainting the page around them.
 *
 *   IT IS INERT. `pointer-events: none` and `inert` — nothing inside can be
 *   clicked, focused or tabbed into. A preview is a picture, and a picture
 *   that can navigate you away is a trap.
 *
 *   IT WRITES NOTHING. Previewing resolves a theme in memory. The contractor's
 *   stored choice changes only when they apply one.
 */
export type DesignPreviewProps = {
  choice: ThemeChoice;
  brand: BrandInputs;
  identity: StorefrontIdentity;
  strategy: PricingStrategy;
  /**
   * The contractor's OWN site. Real storefront components expect a storefront
   * around them — ServiceFinder requires the context outright — and giving the
   * preview the contractor's real one is more honest than a stub. Nothing
   * inside can act on it: the whole subtree is inert.
   */
  site: { publicId: string; hostedSlug: string };
  /** Rendered width in CSS pixels before scaling. */
  width?: number;
  /** Visible height of the window onto the preview. */
  height: number;
  scale: number;
};

/** Representative catalogue rows. Structure is the point, not the prices. */
const SAMPLE_SERVICES = (priceLead: string, noPrice: string): FeaturedItem[] => [
  { slug: "a", label: "Outlet Replacement", href: "#", price: `${priceLead} $189`, icon: "outlet", image: null },
  { slug: "b", label: "Ceiling Fan Install", href: "#", price: `${priceLead} $345`, icon: "fan", image: null },
  { slug: "c", label: "Recessed Lighting", href: "#", price: `${priceLead} $375`, icon: "lighting", image: null },
  { slug: "d", label: "TV Mounting", href: "#", price: `${priceLead} $279`, icon: "tv", image: null },
  { slug: "e", label: "EV Charger", href: "#", price: noPrice, icon: "ev", image: null },
  { slug: "f", label: "Panel Upgrade", href: "#", price: noPrice, icon: "panel", image: null },
];

const SAMPLE_LADDER = [
  { label: "First service", price: "Regular service price" },
  { label: "Additional services", price: "Same-visit price", muted: true },
];

export default function DesignPreview(
  { choice, brand, identity, strategy, site, width = 1280, height, scale }: DesignPreviewProps,
) {
  // useId gives a selector unique to this instance, so two previews of two
  // designs never fight over the same custom properties.
  const scope = `p${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const theme = resolveStorefrontTheme(brand, choice);
  const copy = pricingCopy(strategy);

  return (
    <div className="relative overflow-hidden rounded-card border border-cardline bg-white" style={{ height }}>
      <style>{themeCss(theme, `.${scope}`)}</style>
      <div
        className={`${scope} pointer-events-none absolute left-0 top-0 origin-top-left select-none bg-canvas`}
        style={{ width, transform: `scale(${scale})` }}
        // Belt and braces with pointer-events: `inert` also removes everything
        // inside from the tab order and the accessibility tree, so a keyboard
        // user cannot land inside a picture either.
        {...({ inert: "" } as Record<string, string>)}
        aria-hidden
      >
        <SiteProvider publicId={site.publicId} hostedSlug={site.hostedSlug}>
        <StorefrontProvider value={{ identity, copy }}>
          <ThemeStructureProvider structure={theme.structure}>
            <Header />
            <Hero
              base="#"
              ladder={SAMPLE_LADDER}
              differentiators={[copy.pricingDifferentiator, "Same-visit pricing on extra work", "Narrow arrival windows"]}
            />
            <section className="mx-auto max-w-6xl px-6 py-16">
              <h2 className="font-display text-2xl font-bold text-ink">Most Popular Services</h2>
              <FeaturedServices items={SAMPLE_SERVICES(copy.priceLead, copy.noPriceLabel)} />
            </section>
          </ThemeStructureProvider>
        </StorefrontProvider>
        </SiteProvider>
      </div>
    </div>
  );
}
