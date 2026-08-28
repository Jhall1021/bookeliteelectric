/**
 * Storefront theme resolver — ADR-015.
 *
 *   contractor brand inputs + pinned theme definition -> resolved storefront theme
 *
 * The contractor stores CHOICES ONLY (their brand colours, and later their
 * theme family + variant + pinned version). Everything a browser needs —
 * button shape, card treatment, spacing, type — is DERIVED here from the
 * pinned definition. None of it is persisted on the contractor, so a
 * contractor cannot drift out of the theme they chose, and a theme's v2 cannot
 * reach a contractor who has not adopted it.
 *
 * Phase 1 scope: one definition (Elite v1), no derivation yet. The resolver
 * exists so there is exactly ONE path from brand configuration to rendered
 * pixels, before a second one can grow.
 */
import {
  ELITE_V1_COLORS, ELITE_V1_SHAPES, cssVar,
  type SemanticColor, type SemanticShape,
} from "./tokens";

export type ResolvedTheme = {
  themeKey: string;
  version: number;
  colors: Record<SemanticColor, string>;
  shapes: Record<SemanticShape, string>;
};

/**
 * A contractor's stored brand configuration. This is `Contractor.brandColors`
 * — the field the schema has always had — read through one shape so a second
 * competing brand-colour source cannot appear.
 */
export type BrandInputs = {
  /** The contractor's own brand colour, as they gave it. Never rewritten. */
  primary?: string | null;
  accent?: string | null;
};

export function readBrandInputs(brandColors: unknown): BrandInputs {
  if (!brandColors || typeof brandColors !== "object") return {};
  const b = brandColors as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  return { primary: str(b.primary), accent: str(b.accent) };
}

/**
 * Phase 1 resolves to the Elite v1 definition unchanged, whatever the brand
 * inputs say. Deriving safe UI shades from a contractor's brand colour —
 * with enforced contrast — is Phase 2, and lands with its own validation.
 * Returning Elite's palette here is what makes the Phase 1 acceptance test
 * meaningful: nothing about Elite's rendering may move.
 */
export function resolveStorefrontTheme(_brand: BrandInputs = {}): ResolvedTheme {
  return {
    themeKey: "elite-v1",
    version: 1,
    colors: { ...ELITE_V1_COLORS },
    shapes: { ...ELITE_V1_SHAPES },
  };
}

/** The resolved theme as a `:root` declaration block. */
export function themeCss(theme: ResolvedTheme): string {
  const decls = [
    ...Object.entries(theme.colors).map(([k, v]) => `${cssVar(k as SemanticColor)}:${v}`),
    ...Object.entries(theme.shapes).map(([k, v]) => `${cssVar(k as SemanticShape)}:${v}`),
  ];
  return `:root{${decls.join(";")}}`;
}
