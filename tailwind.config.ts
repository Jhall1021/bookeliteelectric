import type { Config } from "tailwindcss";

/**
 * Storefront tokens — ADR-015.
 *
 * No colour is written here any more. Every name resolves to a CSS custom
 * property so a contractor's resolved theme can repaint the storefront at
 * request time without a second copy of the component tree.
 *
 * The legacy names (navy, electric, warmwhite, cardline…) are kept as aliases
 * onto semantic tokens so the storefront's existing ~790 class usages continue
 * to render exactly as they did. Elite's actual values now live in
 * lib/theme/tokens.ts and are emitted into :root by the theme resolver.
 *
 * `<alpha-value>` is what makes `bg-navy/50` keep working — which is why the
 * variables hold space-separated RGB channels rather than hex.
 */
const rgb = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Semantic layer — what theme definitions emit; prefer these in new work.
        canvas: rgb("--t-canvas"),
        surface: rgb("--t-surface"),
        ink: { DEFAULT: rgb("--t-ink"), soft: rgb("--t-ink-soft"), strong: rgb("--t-ink-strong") },
        muted: { DEFAULT: rgb("--t-muted"), soft: rgb("--t-muted-soft") },
        accent: { DEFAULT: rgb("--t-accent"), hover: rgb("--t-accent-hover"), ink: rgb("--t-accent-ink") },
        line: rgb("--t-line"),
        positive: rgb("--t-positive"),

        /**
         * Price2Book's OWN palette — the marketing site and nothing else.
         *
         * Literal hex, deliberately. Every other colour in this file resolves
         * to a CSS custom property so a contractor's theme can repaint the
         * storefront; the marketing site belongs to the platform, so a
         * contractor's choice must never reach it. Giving it real values in
         * its own namespace is what makes that impossible rather than merely
         * unlikely — `bg-canvas` on a marketing page would silently inherit
         * whichever contractor's theme happened to be resolved.
         *
         * Values are the approved homepage design, preserved verbatim in
         * docs/marketing/homepage-design/.
         */
        p2b: {
          ink: "#14181F",
          "ink-warm": "#3A3730",
          muted: "#57534A",
          "muted-soft": "#8A857A",
          faint: "#A8A296",
          canvas: "#FBFAF7",
          "canvas-alt": "#F5F2EC",
          surface: "#FFFFFF",
          "surface-warm": "#FAF8F3",
          line: "#E6E2D9",
          "line-soft": "#F3F0E9",
          "line-dash": "#D8D3C8",
          // Blue/navy — core product: pricing, scheduling, contractor control.
          accent: "#1B4B8F",
          "accent-hover": "#12356A",
          "accent-tint": "#F2F5FA",
          "accent-tint-strong": "#E8EEF7",
          "accent-line": "#DCE4EF",
          // Green — While We're There, availability, positive states.
          green: "#2E7D5B",
          "green-deep": "#1F5B41",
          "green-ink": "#14231C",
          "green-tint": "#EAF3EE",
          "green-line": "#D5E5DC",
          // Dark sections: integrations and the closing CTA.
          navy: "#0F2340",
          "navy-card": "#142B4C",
          "navy-line": "#23395C",
          "navy-deep": "#0B1A2F",
          "navy-text": "#B7C2D2",
          "navy-muted": "#7E8EA6",
          "navy-soft": "#8FA0B8",
          // Review / caution states inside Guided Pricing examples.
          "amber-tint": "#FDF3E4",
          "amber-ink": "#8A5A12",
        },

        // Legacy layer — the Elite storefront's existing names, now aliases.
        navy: { DEFAULT: rgb("--t-ink"), light: rgb("--t-ink-soft") },
        electric: { DEFAULT: rgb("--t-accent"), hover: rgb("--t-accent-hover") },
        warmwhite: rgb("--t-canvas"),
        slate: { DEFAULT: rgb("--t-muted"), light: rgb("--t-muted-soft") },
        success: rgb("--t-positive"),
        charcoal: rgb("--t-ink-strong"),
        cardline: rgb("--t-line"),
      },
      fontFamily: {
        display: ["var(--t-font-display)"],
        body: ["var(--t-font-body)"],
        // Archivo — the marketing site's typeface, loaded only by the
        // (marketing) layout. Storefronts keep --t-font-* .
        marketing: ["var(--font-archivo)", "Helvetica Neue", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "var(--t-radius-card)",
        pill: "var(--t-radius-pill)",
      },
      boxShadow: {
        card: "var(--t-shadow-card)",
        raised: "var(--t-shadow-raised)",
      },
    },
  },
  plugins: [],
} satisfies Config;
