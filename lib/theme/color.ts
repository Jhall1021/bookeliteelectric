/**
 * Colour maths for the theme resolver — ADR-015 Phase 2.
 *
 * The contractor's brand colour is an INPUT and is never rewritten. What a
 * contractor gave us is what we show back to them and what we put on their
 * logo line. But a brand colour chosen for a van wrap is under no obligation
 * to be readable as button text on an off-white card, so the resolver derives
 * UI shades FROM it and proves those shades meet contrast.
 *
 * Ratios follow WCAG 2.1 relative luminance. Derivation walks lightness in
 * HSL, which is not perceptually even — but the search does not need to be
 * even, only to converge, and the ACCEPTANCE is a real contrast measurement
 * rather than a claim about the colour space.
 */

export type Rgb = { r: number; g: number; b: number };

const clamp = (n: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, n));

/** Accepts #rgb, #rrggbb, and "r g b" channel triples. */
export function parseColor(input: string): Rgb | null {
  const s = input.trim();
  const hex = s.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1];
    const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
    return { r: parseInt(full.slice(0, 2), 16), g: parseInt(full.slice(2, 4), 16), b: parseInt(full.slice(4, 6), 16) };
  }
  const chan = s.match(/^(\d{1,3})\s+(\d{1,3})\s+(\d{1,3})$/);
  if (chan) {
    const [r, g, b] = [chan[1], chan[2], chan[3]].map(Number);
    if ([r, g, b].every((n) => n >= 0 && n <= 255)) return { r, g, b };
  }
  return null;
}

/** The token layer stores space-separated channels, for Tailwind's alpha. */
export const toChannels = ({ r, g, b }: Rgb) => `${Math.round(r)} ${Math.round(g)} ${Math.round(b)}`;
export const toHex = ({ r, g, b }: Rgb) =>
  "#" + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, "0")).join("");

/** WCAG 2.1 relative luminance. */
export function luminance({ r, g, b }: Rgb): number {
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio, 1 to 21. Order-independent. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function toHsl({ r, g, b }: Rgb) {
  const [R, G, B] = [r / 255, g / 255, b / 255];
  const max = Math.max(R, G, B), min = Math.min(R, G, B), d = max - min;
  const l = (max + min) / 2;
  if (d === 0) return { h: 0, s: 0, l };
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === R ? ((G - B) / d + (G < B ? 6 : 0))
          : max === G ? (B - R) / d + 2
          : (R - G) / d + 4;
  return { h: h * 60, s, l };
}

export function fromHsl({ h, s, l }: { h: number; s: number; l: number }): Rgb {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x] :
    hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return { r: (r1 + m) * 255, g: (g1 + m) * 255, b: (b1 + m) * 255 };
}

/**
 * Snap to the 8-bit channels the browser will actually receive.
 *
 * Everything downstream measures the QUANTIZED colour, because the alternative
 * is validating a float and shipping its rounded neighbour — which is how a
 * derived accent measured at 4.50 reaches a page at 4.49.
 */
export const quantize = ({ r, g, b }: Rgb): Rgb =>
  ({ r: Math.round(clamp(r, 0, 255)), g: Math.round(clamp(g, 0, 255)), b: Math.round(clamp(b, 0, 255)) });

/** Shift lightness while holding hue and saturation. Negative darkens. */
export function shade(color: Rgb, deltaL: number): Rgb {
  const hsl = toHsl(color);
  return quantize(fromHsl({ ...hsl, l: clamp(hsl.l + deltaL) }));
}

export type Adjustment = { color: Rgb; ratio: number; moved: boolean; direction: "lighter" | "darker" | "none" };

/**
 * Return `color` if it already meets `min` against every background, otherwise
 * the nearest shade of it that does.
 *
 * Deliberately preserves hue and saturation: the result should still read as
 * the contractor's colour. It tries BOTH directions and keeps whichever moves
 * least, because darkening a pale brand and lightening a dark one both produce
 * something that no longer looks like the brand.
 *
 * Returns the original with `moved: false` when nothing could satisfy the
 * constraint — the caller decides whether that is a warning or a failure, and
 * silently returning an unreadable colour is not on the menu.
 */
export function ensureContrast(color: Rgb, backgrounds: Rgb[], min: number): Adjustment {
  // Quantized on the way in AND on the way through: what is measured here is
  // exactly what the stylesheet will carry.
  const bgs = backgrounds.map(quantize);
  const worst = (c: Rgb) => Math.min(...bgs.map((bg) => contrast(quantize(c), bg)));
  color = quantize(color);
  const start = worst(color);
  if (start >= min) return { color, ratio: start, moved: false, direction: "none" };

  let best: Adjustment | null = null;
  for (const dir of [-1, 1] as const) {
    // 1% steps: fine enough that the result still reads as the same colour,
    // coarse enough to terminate.
    for (let step = 1; step <= 100; step++) {
      const c = quantize(shade(color, dir * step * 0.01));
      const r = worst(c);
      if (r < min) continue;
      const cand: Adjustment = { color: c, ratio: r, moved: true, direction: dir < 0 ? "darker" : "lighter" };
      if (!best || step < Math.abs(toHsl(best.color).l - toHsl(color).l) * 100) best = cand;
      break;
    }
  }
  return best ?? { color, ratio: start, moved: false, direction: "none" };
}

/**
 * Pick the most readable of `candidates` against `bg`. Used for text placed ON
 * a brand colour, where the honest answer is usually white or the theme's ink
 * rather than a tint of the brand itself.
 */
export function mostReadable(bg: Rgb, candidates: Rgb[]): { color: Rgb; ratio: number } {
  const b = quantize(bg);
  candidates = candidates.map(quantize);
  let best = { color: candidates[0], ratio: contrast(b, candidates[0]) };
  for (const c of candidates.slice(1)) {
    const r = contrast(b, c);
    if (r > best.ratio) best = { color: c, ratio: r };
  }
  return best;
}
