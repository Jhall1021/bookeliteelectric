/**
 * Storefront theme resolver — ADR-015 Phase 2.
 *
 *   contractor brand inputs + pinned theme definition -> resolved storefront theme
 *
 * The contractor stores CHOICES ONLY — family, variant, pinned version, and
 * their brand colors. Button style, card style, navigation variant, hero
 * treatment, spacing and typography are DERIVED here and never persisted on
 * the contractor, so the theme they chose and the theme they render cannot
 * drift apart, and a definition's next version reaches nobody until they adopt
 * it.
 *
 * The contractor's brand color is preserved as an INPUT. If it cannot be read
 * on the page the resolver derives a safe shade FROM it and says so; it does
 * not write a different color back over what they gave us.
 */
import {
  ELITE_V1_COLORS, ELITE_V1_SHAPES, cssVar,
  type SemanticColor, type SemanticShape,
} from "./tokens";
import {
  CONTRAST_PAIRS, ELITE_BASELINE, definitionKey, findDefinition,
  type Derivation, type ThemeDefinition,
} from "./definition";
import type { ThemeStructure } from "./structure";
import {
  contrast, ensureContrast, mostReadable, parseColor, shade, toChannels, toHex, type Rgb,
} from "./color";

export type ResolvedTheme = {
  /** Display/debug only. The identity is family + variant + version. */
  themeKey: string;
  family: string;
  variant: string;
  version: number;
  colors: Record<SemanticColor, string>;
  shapes: Record<SemanticShape, string>;
  /** What the page is shaped like. Derived, never stored on the contractor. */
  structure: ThemeStructure;
  /** What the resolver had to move, and why. Surfaced to the contractor. */
  notes: ThemeNote[];
};

export type ThemeNote =
  | { kind: "brand-adjusted"; token: SemanticColor; given: string; used: string; ratio: number; direction: string }
  | { kind: "brand-unusable"; token: SemanticColor; given: string; fellBackTo: string }
  | { kind: "brand-missing"; token: SemanticColor; fellBackTo: string };

/**
 * A contractor's stored brand configuration — `Contractor.brandColors`, the
 * field the schema has always had. Read through one shape so a second
 * competing brand-color source cannot grow beside it.
 */
export type BrandInputs = { primary?: string | null; accent?: string | null };

export function readBrandInputs(brandColors: unknown): BrandInputs {
  if (!brandColors || typeof brandColors !== "object") return {};
  const b = brandColors as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { primary: str(b.primary), accent: str(b.accent) };
}

/** What a contractor has chosen. Not what it looks like — that is derived. */
/**
 * What a contractor has chosen. All three parts, because all three are stored
 * and the definition is found by all three.
 */
export type ThemeChoice = { family: string; variant: string; version: number };

export const DEFAULT_CHOICE: ThemeChoice = {
  family: ELITE_BASELINE.family, variant: ELITE_BASELINE.variant, version: ELITE_BASELINE.version,
};

/**
 * Resolve in dependency order rather than declaration order: `accentHover` is
 * a shade of `accent`, and `accentInk` is chosen against whatever `accent`
 * ended up being, so a derived token must never be able to read a token that
 * has not been resolved yet.
 */
const ORDER: SemanticColor[] = [
  "canvas", "surface", "ink", "inkSoft", "inkStrong", "muted", "mutedSoft",
  "accent", "accentHover", "accentInk", "line", "positive",
];

export function resolveStorefrontTheme(
  brand: BrandInputs = {}, choice: ThemeChoice = DEFAULT_CHOICE,
): ResolvedTheme {
  const def = findDefinition(choice.family, choice.variant, choice.version) ?? ELITE_BASELINE;
  const out = {} as Record<SemanticColor, Rgb>;
  const notes: ThemeNote[] = [];

  for (const token of ORDER) {
    out[token] = resolveOne(token, def.colors[token], brand, out, notes);
  }

  return {
    themeKey: definitionKey(def), family: def.family, variant: def.variant,
    version: def.version, notes,
    colors: Object.fromEntries(ORDER.map((t) => [t, toChannels(out[t])])) as Record<SemanticColor, string>,
    shapes: { ...def.shapes },
    structure: { ...def.structure },
  };
}

function resolveOne(
  token: SemanticColor, d: Derivation, brand: BrandInputs,
  so_far: Record<SemanticColor, Rgb>, notes: ThemeNote[],
): Rgb {
  switch (d.kind) {
    case "fixed":
      return parseColor(d.value)!;

    case "brand": {
      const given = brand[d.input];
      const fallback = parseColor(d.fallback)!;
      if (!given) { notes.push({ kind: "brand-missing", token, fellBackTo: toHex(fallback) }); return fallback; }
      const parsed = parseColor(given);
      if (!parsed) {
        notes.push({ kind: "brand-unusable", token, given, fellBackTo: toHex(fallback) });
        return fallback;
      }
      const against = (d.readableOn ?? []).map((t) => so_far[t]).filter(Boolean);
      if (!against.length) return parsed;
      const adj = ensureContrast(parsed, against, d.min ?? 4.5);
      if (adj.moved)
        notes.push({ kind: "brand-adjusted", token, given: toHex(parsed), used: toHex(adj.color),
                     ratio: Number(adj.ratio.toFixed(2)), direction: adj.direction });
      // Nothing readable exists in this hue. Falling back preserves the page
      // rather than the palette, and the note says which happened.
      if (!adj.moved && adj.ratio < (d.min ?? 4.5)) {
        notes.push({ kind: "brand-unusable", token, given: toHex(parsed), fellBackTo: toHex(fallback) });
        return fallback;
      }
      return adj.color;
    }

    case "shadeOf":
      return shade(so_far[d.token], d.deltaL);

    case "readableOn":
      return mostReadable(so_far[d.bg], d.candidates.map((c) => so_far[c])).color;
  }
}

export type ContrastFailure = { fg: SemanticColor; bg: SemanticColor; min: number; got: number; note: string };

/** Every pair the theme can emit, measured. Empty means the theme is safe. */
export function checkContrast(theme: ResolvedTheme): ContrastFailure[] {
  const out: ContrastFailure[] = [];
  for (const p of CONTRAST_PAIRS) {
    const fg = parseColor(theme.colors[p.fg]), bg = parseColor(theme.colors[p.bg]);
    if (!fg || !bg) continue;
    const got = contrast(fg, bg);
    if (got + 1e-9 < p.min) out.push({ fg: p.fg, bg: p.bg, min: p.min, got: Number(got.toFixed(2)), note: p.note });
  }
  return out;
}

/**
 * The resolved theme as a declaration block.
 *
 * `selector` defaults to `:root`, which is what a storefront wants. A PREVIEW
 * passes its own container selector instead, so several themes can be shown on
 * one page without any of them repainting the page around them — the design
 * picker is itself a page, and a preview that leaked its tokens would restyle
 * the picker.
 */
export function themeCss(theme: ResolvedTheme, selector = ":root"): string {
  const decls = [
    ...Object.entries(theme.colors).map(([k, v]) => `${cssVar(k as SemanticColor)}:${v}`),
    ...Object.entries(theme.shapes).map(([k, v]) => `${cssVar(k as SemanticShape)}:${v}`),
  ];
  return `${selector}{${decls.join(";")}}`;
}

export { ELITE_V1_COLORS, ELITE_V1_SHAPES };
export type { ThemeDefinition };
