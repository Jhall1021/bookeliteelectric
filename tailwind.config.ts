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
