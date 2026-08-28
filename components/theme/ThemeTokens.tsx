import { resolveStorefrontTheme, themeCss, DEFAULT_CHOICE,
         type BrandInputs, type ThemeChoice } from "@/lib/theme/resolve";

/**
 * Emits the resolved storefront theme as CSS custom properties.
 *
 * In <head> so the tokens are set before first paint — a token block arriving
 * with the body would flash the browser's defaults through every `bg-canvas`
 * on the page.
 *
 * Nothing derived is stored: this resolves on each render from the
 * contractor's choices, which is what keeps a contractor from drifting out of
 * the theme they picked.
 */
/**
 * `base` marks the root layout's copy. Two blocks with the same id would be
 * invalid HTML, and the storefront genuinely needs both: the root block covers
 * admin and marketing pages that have no contractor, and the storefront
 * boundary's block overrides it for a contractor who has chosen a theme.
 * Later declaration wins, which is the order they render in.
 */
export default function ThemeTokens(
  { brand, choice, base = false }: { brand?: BrandInputs; choice?: ThemeChoice; base?: boolean },
) {
  return (
    <style id={base ? "storefront-theme-base" : "storefront-theme"}>
      {themeCss(resolveStorefrontTheme(brand, choice ?? DEFAULT_CHOICE))}
    </style>
  );
}
