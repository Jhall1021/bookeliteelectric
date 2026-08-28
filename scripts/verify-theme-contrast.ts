/**
 * Every theme a contractor can produce is readable — ADR-015 Phase 2.
 *
 * A theme system that only works for the brand colours we happened to try is
 * not a theme system. So every definition is resolved against a SWEEP of brand
 * colours — the full hue circle at several lightnesses, plus the awkward cases
 * (pure white, pure black, a fluorescent yellow, a colour one step off the
 * page background) — and every semantic foreground/background pair the theme
 * can emit is measured.
 *
 * Static: no database, no browser. Runs in the deploy gate.
 */
import { pathToFileURL } from "node:url";
import { DEFINITIONS, CONTRAST_PAIRS } from "../lib/theme/definition";
import { resolveStorefrontTheme, checkContrast, readBrandInputs, themeCss } from "../lib/theme/resolve";
import { ELITE_V1_COLORS } from "../lib/theme/tokens";
import { contrast, parseColor, toHex, fromHsl } from "../lib/theme/color";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** The hue circle at four lightnesses, plus the colours that break things. */
function brandSweep(): string[] {
  const out: string[] = [];
  for (let h = 0; h < 360; h += 15)
    for (const l of [0.2, 0.4, 0.6, 0.8])
      for (const s of [0.35, 0.9]) out.push(toHex(fromHsl({ h, s, l })));
  return [...out,
    "#ffffff", "#000000", "#fafaf8", // white, black, and the page ground itself
    "#ffff00", "#00ff00", "#00ffff", // the fluorescents that defeat white text
    "#7f7f7f", "#f8f8f6",            // mid grey, and one step off the background
  ];
}

function main() {
  console.log("\nTHEME CONTRAST\n");
  const brands = brandSweep();
  console.log(`  ${DEFINITIONS.length} definition(s) x ${brands.length} brand colour(s) x ${CONTRAST_PAIRS.length} pairs\n`);

  // The parity definition must still emit exactly what Phase 1 proved.
  const baseline = resolveStorefrontTheme({}, { themeKey: "elite-baseline", version: 1 });
  const drift = (Object.keys(ELITE_V1_COLORS) as (keyof typeof ELITE_V1_COLORS)[])
    .filter((k) => baseline.colors[k] !== ELITE_V1_COLORS[k]);
  ok(drift.length === 0, "the parity definition still emits Elite's exact values",
    drift.map((k) => `${k}: ${ELITE_V1_COLORS[k]} -> ${baseline.colors[k]}`).join(", "));
  ok(themeCss(baseline).startsWith(":root{--t-canvas:250 250 248"), "and renders as a :root block");

  // Elite's own palette must pass the contrast contract. If it does not, the
  // contract is describing a storefront nobody is running.
  const eliteFails = checkContrast(baseline);
  ok(eliteFails.length === 0, "Elite's shipped palette meets every pair in the contract",
    eliteFails.map((f) => `${f.fg} on ${f.bg}: ${f.got} < ${f.min} (${f.note})`).join(" | "));

  // The sweep.
  const failures: string[] = [];
  const adjusted: string[] = [];
  const unusable: string[] = [];
  for (const def of DEFINITIONS) {
    for (const hex of brands) {
      const theme = resolveStorefrontTheme(readBrandInputs({ primary: hex }), { themeKey: def.key, version: def.version });
      const bad = checkContrast(theme);
      if (bad.length) failures.push(`${def.key} + ${hex}: ` +
        bad.map((f) => `${f.fg}/${f.bg} ${f.got}<${f.min}`).join(", "));
      for (const n of theme.notes) {
        if (n.kind === "brand-adjusted") adjusted.push(`${hex} -> ${n.used}`);
        if (n.kind === "brand-unusable") unusable.push(hex);
      }
    }
  }
  ok(failures.length === 0, `every resolved theme meets the contract (${DEFINITIONS.length * brands.length} resolutions)`,
    `${failures.length} failing:\n         ` + failures.slice(0, 6).join("\n         "));

  console.log(`\n  ${adjusted.length} brand colour(s) needed a derived shade; ` +
    `${unusable.length} could not be used at all and fell back.`);

  // The contractor's brand is an INPUT. Adjusting it must not be silent, and
  // must not be mistaken for having changed what they stored.
  const pale = resolveStorefrontTheme(readBrandInputs({ primary: "#fdfdfb" }), { themeKey: "modern-clean-a", version: 1 });
  const note = pale.notes.find((n) => n.kind === "brand-adjusted" || n.kind === "brand-unusable");
  ok(note !== undefined, "a brand colour too pale to read is reported, not silently used");
  ok(pale.colors.accent !== "253 253 251", "and the derived accent is not the unreadable original");

  const dark = resolveStorefrontTheme(readBrandInputs({ primary: "#123499" }), { themeKey: "modern-clean-a", version: 1 });
  ok(dark.notes.length === 0 && dark.colors.accent === "18 52 153",
    "a brand colour that already reads is used exactly as given",
    `got ${dark.colors.accent} with ${dark.notes.length} note(s)`);

  // Button text is chosen, not assumed. White is right for most brands and
  // wrong for a fluorescent yellow.
  const yellow = resolveStorefrontTheme(readBrandInputs({ primary: "#ffff00" }), { themeKey: "modern-clean-a", version: 1 });
  const ink = parseColor(yellow.colors.accentInk)!, acc = parseColor(yellow.colors.accent)!;
  ok(contrast(ink, acc) >= 4.5, `button text on a yellow brand is readable (${contrast(ink, acc).toFixed(2)}:1)`);

  const blue = resolveStorefrontTheme(readBrandInputs({ primary: "#1b3a8f" }), { themeKey: "modern-clean-a", version: 1 });
  ok(blue.colors.accentInk === "255 255 255", "and stays white on a dark brand", blue.colors.accentInk);

  // An unknown or unpinned choice must not produce a blank page.
  const missing = resolveStorefrontTheme({}, { themeKey: "no-such-theme", version: 99 });
  ok(missing.themeKey === "elite-baseline", "an unknown theme falls back to a real one rather than nothing");

  // Nothing derived is persisted: resolving twice from the same inputs is the
  // same answer, and resolving is the only way to get one.
  const a = resolveStorefrontTheme(readBrandInputs({ primary: "#2452d9" }), { themeKey: "modern-clean-a", version: 1 });
  const b = resolveStorefrontTheme(readBrandInputs({ primary: "#2452d9" }), { themeKey: "modern-clean-a", version: 1 });
  ok(JSON.stringify(a) === JSON.stringify(b), "resolution is deterministic");

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
