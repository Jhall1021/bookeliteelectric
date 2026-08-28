/**
 * Storefront design tokens — ADR-015, Phase 1.
 *
 * TWO LAYERS, deliberately.
 *
 *   semantic     what a theme definition emits: ink, canvas, accent, line…
 *   legacy name  the Tailwind colour names the Elite storefront already uses
 *                (navy, electric, warmwhite, cardline…), each resolving to a
 *                semantic token rather than to a hex
 *
 * The 786 existing `bg-navy` / `text-slate` / `border-cardline` class usages
 * keep working byte-for-byte, which is what makes the Phase 1 acceptance test
 * ("Elite looks pixel-for-pixel unchanged") a real proof rather than a hope.
 * New work should reach for the semantic names; the legacy names can be
 * retired gradually instead of in one flag day.
 *
 * Colours are stored as SPACE-SEPARATED RGB CHANNELS, not hex, because that is
 * the only form Tailwind's `<alpha-value>` placeholder can compose with. A hex
 * here silently breaks every `bg-navy/50` in the tree.
 */

/** Every semantic colour a theme definition must supply. */
export const SEMANTIC_COLORS = {
  canvas: "the page ground",
  surface: "cards and panels sitting on the canvas",
  ink: "primary headline and body text; the storefront's dominant dark",
  inkSoft: "a lighter tint of ink, for secondary headings",
  inkStrong: "the darkest ink, for footers and high-contrast blocks",
  muted: "secondary and supporting body text",
  mutedSoft: "the quietest readable text — captions, hints",
  accent: "primary calls to action and links",
  accentHover: "the pressed/hovered state of accent",
  accentInk: "text placed ON accent — usually white, but not always",
  line: "hairline borders on cards and dividers",
  positive: "price confirmations, success checks",
} as const;

export type SemanticColor = keyof typeof SEMANTIC_COLORS;

/** Non-colour values a theme controls. Phase 3 variants differ here, not just in palette. */
export const SEMANTIC_SHAPES = {
  radiusCard: "corner radius on cards and inputs",
  radiusPill: "corner radius on pills and primary buttons",
  shadowCard: "the full box-shadow for a resting card",
  shadowRaised: "the box-shadow for a hovered or emphasised card",
  fontDisplay: "headline typeface stack",
  fontBody: "body typeface stack",
} as const;

export type SemanticShape = keyof typeof SEMANTIC_SHAPES;

/** `canvas` -> `--t-canvas`. The one place the naming convention lives. */
export const cssVar = (name: SemanticColor | SemanticShape) =>
  `--t-${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;

/**
 * Elite's palette as it shipped, to the channel. Phase 1 changes how these
 * values reach the browser, never what they are.
 */
export const ELITE_V1_COLORS: Record<SemanticColor, string> = {
  canvas: "250 250 248", // #FAFAF8
  surface: "255 255 255", // #FFFFFF
  ink: "15 30 60", // #0F1E3C
  inkSoft: "27 46 84", // #1B2E54
  inkStrong: "17 24 39", // #111827
  muted: "100 116 139", // #64748B
  mutedSoft: "148 163 184", // #94A3B8
  accent: "36 82 217", // #2452D9
  accentHover: "30 68 189", // #1E44BD
  accentInk: "255 255 255", // #FFFFFF
  line: "231 229 224", // #E7E5E0
  positive: "22 163 74", // #16A34A
};

export const ELITE_V1_SHAPES: Record<SemanticShape, string> = {
  radiusCard: "12px",
  radiusPill: "999px",
  shadowCard: "0 1px 2px rgb(15 30 60 / 0.06), 0 1px 8px rgb(15 30 60 / 0.04)",
  shadowRaised: "0 2px 4px rgb(15 30 60 / 0.08), 0 8px 24px rgb(15 30 60 / 0.06)",
  fontDisplay: "var(--font-inter), system-ui, sans-serif",
  fontBody: "var(--font-inter), system-ui, sans-serif",
};

/**
 * Legacy Tailwind colour name -> semantic token.
 *
 * `slate` deliberately shadows Tailwind's built-in slate scale, exactly as it
 * did before this change; nothing in the storefront used the built-in one.
 */
export const LEGACY_COLOR_ALIASES: Record<string, SemanticColor> = {
  navy: "ink",
  "navy.light": "inkSoft",
  electric: "accent",
  "electric.hover": "accentHover",
  warmwhite: "canvas",
  slate: "muted",
  "slate.light": "mutedSoft",
  success: "positive",
  charcoal: "inkStrong",
  cardline: "line",
};
