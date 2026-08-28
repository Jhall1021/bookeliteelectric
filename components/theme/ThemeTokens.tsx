import { resolveStorefrontTheme, themeCss, type BrandInputs } from "@/lib/theme/resolve";

/**
 * Emits the resolved storefront theme as CSS custom properties.
 *
 * Rendered in <head> so the tokens are set before first paint — a token block
 * that arrives with the body would flash the browser's defaults through every
 * `bg-canvas` on the page.
 */
export default function ThemeTokens({ brand }: { brand?: BrandInputs }) {
  return <style id="storefront-theme">{themeCss(resolveStorefrontTheme(brand))}</style>;
}
