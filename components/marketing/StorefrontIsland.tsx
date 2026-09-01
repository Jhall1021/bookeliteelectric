"use client";

import { useId } from "react";
import { resolveStorefrontTheme, themeCss } from "@/lib/theme/resolve";
import { StorefrontProvider } from "@/components/theme/StorefrontContext";
import { ThemeStructureProvider } from "@/components/theme/ThemeContext";
import { ANONYMOUS_IDENTITY } from "@/lib/storefrontIdentity";
import { pricingCopy } from "@/lib/pricingCopy";
import { HERO_FLOW } from "./heroFlow";

/**
 * A contractor's storefront, rendered inside Price2Book's marketing page.
 *
 * WHY AN ISLAND AND NOT A MOCK-UP
 *
 * The hero's whole claim is that a homeowner meets the CONTRACTOR's brand
 * while Price2Book is the engine underneath. A Price2Book-colored drawing of
 * a storefront makes the opposite point, and it drifts: the real components
 * gain a state or lose a label and the drawing keeps showing last quarter's
 * product. So the walkthrough renders the actual guided-flow components — the
 * same QuestionStep and PriceConfirmationCard a live storefront renders —
 * against a fixture captured from a live catalog.
 *
 * WHY THE TOKENS CANNOT LEAK
 *
 * Storefront components are painted by `--t-*` custom properties, and the
 * marketing page has none: every `bg-canvas` and `text-navy` inside them would
 * fall back to nothing. Emitting the theme at `:root` would fix that and
 * repaint the entire marketing page in a contractor's colors, which is exactly
 * what `scripts/verify-marketing-homepage.ts` has always refused.
 *
 * `themeCss` takes a selector for precisely this reason — its own comment
 * describes several previews on one page that must not repaint the page around
 * them. The tokens are scoped to this island's generated class, so the theme
 * stops at the frame's edge. Nothing in components/theme or lib/theme was
 * modified to make this work.
 *
 * WHOSE BRAND THIS IS
 *
 * The demonstration identity from scripts/demo-contractor.ts, never the tenant
 * the fixture was captured from. Prices, prompts and routing are that
 * contractor's and are the point; their NAME on Price2Book's homepage would
 * make the platform read as one electrician's product demo, which
 * POSITIONING.md has ruled out since the screenshots pass.
 */
export default function StorefrontIsland({ children }: { children: React.ReactNode }) {
  // Unique per instance, so two islands on one page cannot fight over tokens.
  const raw = useId();
  const scope = `p2b-island-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;

  const theme = resolveStorefrontTheme(undefined, {
    family: HERO_FLOW.identity.themeFamily,
    variant: HERO_FLOW.identity.themeVariant,
    version: HERO_FLOW.identity.themeVersion,
  });

  const identity = {
    ...ANONYMOUS_IDENTITY,
    name: HERO_FLOW.identity.name,
    shortName: HERO_FLOW.identity.shortName,
  };

  return (
    <>
      {/* Scoped, not :root. See the note above — this is the whole reason the
          island is safe on a page that is not a storefront. */}
      <style>{themeCss(theme, `.${scope}`)}</style>
      <div className={`${scope} font-body h-full bg-canvas`}>
        <ThemeStructureProvider structure={theme.structure}>
          <StorefrontProvider
            value={{
              identity,
              // The captured contractor's pricing strategy decided this copy.
              // "We'll confirm your price after a quick look" is true for a
              // flat-rate business and a promise a time-and-materials one
              // cannot keep, which is why it travels with the fixture rather
              // than being chosen here.
              copy: { ...pricingCopy(null), confirmAfterLookNotice: HERO_FLOW.copy.confirmAfterLook },
            }}
          >
            {children}
          </StorefrontProvider>
        </ThemeStructureProvider>
      </div>
    </>
  );
}
