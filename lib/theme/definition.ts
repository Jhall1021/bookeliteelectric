/**
 * Versioned theme definitions — ADR-015 Phase 2.
 *
 * A contractor stores CHOICES ONLY: family, variant, pinned version, and their
 * brand colours. Everything a browser needs is derived here. Nothing derived is
 * persisted on the contractor, so the theme they chose and the theme they are
 * rendering cannot drift apart, and a definition's v2 cannot reach anyone who
 * has not adopted it.
 *
 * Phase 2 ships the resolver and ONE definition — the Elite look, so the Phase
 * 1 parity proof keeps meaning something. Phase 3 adds the six real V1
 * storefronts, which must differ structurally and not only in palette.
 */
import { ELITE_V1_COLORS, ELITE_V1_SHAPES, type SemanticColor, type SemanticShape } from "./tokens";
import { ELITE_V1_STRUCTURE, type ThemeStructure } from "./structure";

/** How one token gets its value. */
export type Derivation =
  /** The theme owns it outright; brand has no say. */
  | { kind: "fixed"; value: string }
  /**
   * Taken from the contractor's brand, then moved as little as needed to be
   * readable. `fallback` applies when they have given us nothing.
   */
  | { kind: "brand"; input: "primary" | "accent"; fallback: string;
      readableOn?: SemanticColor[]; min?: number }
  /** A lighter or darker version of another token. */
  | { kind: "shadeOf"; token: SemanticColor; deltaL: number }
  /** Whichever candidate reads best on `bg` — usually white or the theme's ink. */
  | { kind: "readableOn"; bg: SemanticColor; candidates: SemanticColor[] };

export type ThemeDefinition = {
  key: string;
  family: "modern-clean" | "warm-welcoming" | "premium";
  variant: "a" | "b";
  version: number;
  label: string;
  colors: Record<SemanticColor, Derivation>;
  shapes: Record<SemanticShape, string>;
  /**
   * What the page is SHAPED like. This is what makes a variant a variant
   * rather than a palette: two definitions in the same family share a mood and
   * differ in composition.
   */
  structure: ThemeStructure;
};

/**
 * Foreground/background pairs a storefront can actually put together, and the
 * ratio each must meet.
 *
 * This list is the contract the contrast verifier holds the resolver to. It is
 * written out rather than computed from the token names because "which text
 * lands on which surface" is a fact about the DESIGN, and a computed cross
 * product would both miss real pairs and invent impossible ones.
 *
 * 4.5 is WCAG AA for body text. 3.0 applies to large text and to non-text
 * boundaries like a hairline against its surface, where AA's threshold is
 * lower and holding them to 4.5 would force borders no designer would draw.
 */
export const CONTRAST_PAIRS: readonly { fg: SemanticColor; bg: SemanticColor; min: number; note: string }[] = [
  { fg: "ink", bg: "canvas", min: 4.5, note: "body text on the page" },
  { fg: "ink", bg: "surface", min: 4.5, note: "body text on a card" },
  { fg: "inkSoft", bg: "canvas", min: 4.5, note: "secondary heading on the page" },
  { fg: "inkSoft", bg: "surface", min: 4.5, note: "secondary heading on a card" },
  { fg: "inkStrong", bg: "canvas", min: 4.5, note: "footer text" },
  { fg: "muted", bg: "canvas", min: 4.5, note: "supporting text on the page" },
  { fg: "muted", bg: "surface", min: 4.5, note: "supporting text on a card" },
  // mutedSoft is a DARK-SURFACE token, not a quiet grey for the light page.
  // Every use of it in the storefront sits on the navy hero or a dark-toned
  // block, where it measures 6.44:1. Asserting it against `canvas` invented a
  // pair the design never makes — the exact failure the note above warns
  // about — and the fix is to name the real ground, not to lower the bar.
  { fg: "mutedSoft", bg: "ink", min: 4.5, note: "supporting text on a dark hero" },
  { fg: "accent", bg: "canvas", min: 4.5, note: "a link in body copy" },
  { fg: "accent", bg: "surface", min: 4.5, note: "a link inside a card" },
  { fg: "accentHover", bg: "canvas", min: 4.5, note: "that link, hovered" },
  { fg: "accentInk", bg: "accent", min: 4.5, note: "the label on a primary button" },
  { fg: "accentInk", bg: "accentHover", min: 4.5, note: "that label, button hovered" },
  { fg: "positive", bg: "canvas", min: 3.0, note: "a confirmation check — an icon, not prose" },
  { fg: "positive", bg: "surface", min: 3.0, note: "that check on a card" },
  { fg: "line", bg: "surface", min: 1.2, note: "a hairline must be visible without being a rule" },
  // The storefront has two grounds, and a theme that only works on the light
  // one is half a theme.
  { fg: "surface", bg: "ink", min: 4.5, note: "headline text on a dark hero" },
  { fg: "surface", bg: "inkStrong", min: 4.5, note: "footer text on the dark footer" },
  { fg: "accentInk", bg: "ink", min: 3.0, note: "a button label against the dark hero behind it" },
];

/**
 * The Elite look as a definition.
 *
 * Every colour is `fixed`, which is what makes it the parity baseline: pinned
 * here with no brand input, Elite resolves to exactly the values Phase 1
 * proved unchanged. A contractor picking this family gets the brand-derived
 * behaviour instead — see MODERN_CLEAN_A below.
 */
export const ELITE_BASELINE: ThemeDefinition = {
  key: "elite-baseline", family: "modern-clean", variant: "a", version: 1,
  label: "Elite baseline (parity definition)",
  colors: Object.fromEntries(
    (Object.keys(ELITE_V1_COLORS) as SemanticColor[]).map((k) => [k, { kind: "fixed", value: ELITE_V1_COLORS[k] }]),
  ) as Record<SemanticColor, Derivation>,
  shapes: { ...ELITE_V1_SHAPES },
  structure: { ...ELITE_V1_STRUCTURE },
};

/**
 * The same look, but with the accent taken from the contractor's brand.
 *
 * The brand colour is preserved as the input and only moved if it cannot be
 * read on the page. Button text is chosen rather than assumed: white is right
 * for most brand colours and wrong for a bright yellow one.
 */
export const MODERN_CLEAN_A: ThemeDefinition = {
  key: "modern-clean-a", family: "modern-clean", variant: "a", version: 1,
  label: "Modern & Clean A",
  colors: {
    canvas: { kind: "fixed", value: ELITE_V1_COLORS.canvas },
    surface: { kind: "fixed", value: ELITE_V1_COLORS.surface },
    ink: { kind: "fixed", value: ELITE_V1_COLORS.ink },
    inkSoft: { kind: "fixed", value: ELITE_V1_COLORS.inkSoft },
    inkStrong: { kind: "fixed", value: ELITE_V1_COLORS.inkStrong },
    muted: { kind: "fixed", value: ELITE_V1_COLORS.muted },
    mutedSoft: { kind: "fixed", value: ELITE_V1_COLORS.mutedSoft },
    accent: { kind: "brand", input: "primary", fallback: ELITE_V1_COLORS.accent,
              readableOn: ["canvas", "surface"], min: 4.5 },
    accentHover: { kind: "shadeOf", token: "accent", deltaL: -0.06 },
    accentInk: { kind: "readableOn", bg: "accent", candidates: ["surface", "ink"] },
    line: { kind: "fixed", value: ELITE_V1_COLORS.line },
    positive: { kind: "fixed", value: ELITE_V1_COLORS.positive },
  },
  shapes: { ...ELITE_V1_SHAPES },
  structure: { ...ELITE_V1_STRUCTURE },
};

/**
 * Modern & Clean B — the same family, a different page.
 *
 * Not a recolour of A. The header centres and splits onto two rows, the hero
 * becomes a single centred column with the booking entry sitting directly in
 * the flow rather than in a panel, services become full-width rows instead of
 * tiles, sections are separated by space rather than rules, cards lift off the
 * page instead of being outlined, and the headline is light and spaced instead
 * of bold.
 *
 * Print it in greyscale beside A and they are still obviously different pages.
 * That is the bar.
 */
export const MODERN_CLEAN_B: ThemeDefinition = {
  key: "modern-clean-b", family: "modern-clean", variant: "b", version: 1,
  label: "Modern & Clean B",
  colors: { ...MODERN_CLEAN_A.colors },
  shapes: {
    ...ELITE_V1_SHAPES,
    // Softer corners and a real elevation, because B's cards are raised rather
    // than outlined and a 12px outlined radius reads wrong once the border goes.
    radiusCard: "16px",
    shadowCard: "0 1px 2px rgb(15 30 60 / 0.04), 0 8px 24px rgb(15 30 60 / 0.08)",
    shadowRaised: "0 2px 6px rgb(15 30 60 / 0.06), 0 16px 40px rgb(15 30 60 / 0.10)",
  },
  structure: {
    nav: "stacked",
    hero: "centered",
    heroAside: "strip",
    serviceList: "rows",
    sectionBreak: "space",
    card: "raised",
    density: "spacious",
    headline: "light-caps",
  },
};

/**
 * The accent derivation is identical across all six: take the contractor's
 * brand, move it only as far as readability demands, shade the hover from the
 * result, and CHOOSE the button text. Families differ in their ground and ink,
 * not in how they treat someone's brand.
 */
const brandAccent = (fallback: string): Record<"accent" | "accentHover" | "accentInk", Derivation> => ({
  accent: { kind: "brand", input: "primary", fallback, readableOn: ["canvas", "surface"], min: 4.5 },
  accentHover: { kind: "shadeOf", token: "accent", deltaL: -0.06 },
  accentInk: { kind: "readableOn", bg: "accent", candidates: ["surface", "ink"] },
});

const fixed = (v: string): Derivation => ({ kind: "fixed", value: v });

/**
 * Warm & Welcoming — a cream ground and a warm near-black instead of the cool
 * off-white and navy. Reads as a local business rather than a platform.
 */
const WARM_COLORS: Record<SemanticColor, Derivation> = {
  canvas: fixed("251 247 240"),
  surface: fixed("255 255 255"),
  ink: fixed("42 32 24"),
  inkSoft: fixed("74 58 45"),
  inkStrong: fixed("28 21 16"),
  muted: fixed("107 93 82"),
  mutedSoft: fixed("181 169 154"),
  line: fixed("232 223 211"),
  positive: fixed("22 132 74"),
  ...brandAccent("176 84 34"),
};

const WARM_SHAPES: Record<SemanticShape, string> = {
  ...ELITE_V1_SHAPES,
  radiusCard: "18px",
  shadowCard: "0 1px 2px rgb(42 32 24 / 0.05), 0 6px 20px rgb(42 32 24 / 0.07)",
  shadowRaised: "0 2px 6px rgb(42 32 24 / 0.07), 0 14px 36px rgb(42 32 24 / 0.10)",
};

export const WARM_WELCOMING_A: ThemeDefinition = {
  key: "warm-welcoming-a", family: "warm-welcoming", variant: "a", version: 1,
  label: "Warm & Welcoming A",
  colors: { ...WARM_COLORS }, shapes: { ...WARM_SHAPES },
  structure: {
    nav: "inline", hero: "banner", heroAside: "panel", serviceList: "grid",
    sectionBreak: "band", card: "raised", density: "comfortable", headline: "bold",
  },
};

export const WARM_WELCOMING_B: ThemeDefinition = {
  key: "warm-welcoming-b", family: "warm-welcoming", variant: "b", version: 1,
  label: "Warm & Welcoming B",
  colors: { ...WARM_COLORS },
  shapes: { ...WARM_SHAPES, radiusCard: "10px", radiusPill: "8px" },
  structure: {
    nav: "split", hero: "split", heroAside: "strip", serviceList: "rows",
    sectionBreak: "hairline", card: "outlined", density: "compact", headline: "light-caps",
  },
};

/**
 * Premium — a cooler, tighter palette with a near-black ink and very little
 * chroma outside the brand accent, so the contractor's colour is the only
 * thing on the page with any saturation.
 */
const PREMIUM_COLORS: Record<SemanticColor, Derivation> = {
  canvas: fixed("247 247 245"),
  surface: fixed("255 255 255"),
  ink: fixed("20 20 26"),
  inkSoft: fixed("44 44 54"),
  inkStrong: fixed("10 10 14"),
  muted: fixed("99 99 110"),
  mutedSoft: fixed("160 160 170"),
  line: fixed("228 228 230"),
  positive: fixed("21 128 61"),
  ...brandAccent("38 38 46"),
};

const PREMIUM_SHAPES: Record<SemanticShape, string> = {
  ...ELITE_V1_SHAPES,
  radiusCard: "2px",
  radiusPill: "2px",
  shadowCard: "0 1px 1px rgb(20 20 26 / 0.04)",
  shadowRaised: "0 1px 2px rgb(20 20 26 / 0.06), 0 12px 32px rgb(20 20 26 / 0.08)",
};

export const PREMIUM_A: ThemeDefinition = {
  key: "premium-a", family: "premium", variant: "a", version: 1,
  label: "Premium A",
  colors: { ...PREMIUM_COLORS }, shapes: { ...PREMIUM_SHAPES },
  structure: {
    nav: "split", hero: "banner", heroAside: "strip", serviceList: "rows",
    sectionBreak: "space", card: "outlined", density: "spacious", headline: "light-caps",
  },
};

export const PREMIUM_B: ThemeDefinition = {
  key: "premium-b", family: "premium", variant: "b", version: 1,
  label: "Premium B",
  colors: { ...PREMIUM_COLORS },
  shapes: { ...PREMIUM_SHAPES, radiusCard: "0px", radiusPill: "999px" },
  structure: {
    nav: "stacked", hero: "split", heroAside: "panel", serviceList: "grid",
    sectionBreak: "band", card: "raised", density: "comfortable", headline: "bold",
  },
};

export const DEFINITIONS: readonly ThemeDefinition[] = [
  ELITE_BASELINE,
  MODERN_CLEAN_A, MODERN_CLEAN_B,
  WARM_WELCOMING_A, WARM_WELCOMING_B,
  PREMIUM_A, PREMIUM_B,
];

export function findDefinition(key: string, version: number): ThemeDefinition | null {
  return DEFINITIONS.find((d) => d.key === key && d.version === version) ?? null;
}
