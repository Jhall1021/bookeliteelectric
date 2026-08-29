/**
 * The storefront has exactly one source of colour — ADR-015.
 *
 * A brand colour written directly into a component is invisible to the theme
 * resolver, so a contractor's chosen theme repaints everything around it and
 * leaves that one element wearing Elite's blue. Worse, it is silent: the page
 * looks fine on Elite, which is the only place anyone checks.
 *
 * So: no colour literals in the rendered storefront. Colour enters through the
 * semantic tokens in lib/theme/tokens.ts and nowhere else.
 */
import { readFileSync } from "node:fs";
import { sourceFiles } from "./_sourceFiles";

const ROOTS = ["app", "components", "styles"];

/**
 * The admin is Price2Book's own product surface, not a contractor storefront.
 * It should keep looking like Price2Book whoever is signed in, so it is
 * deliberately outside the theme system rather than lagging behind it.
 */
/**
 * Directories this linter deliberately does not police.
 *
 * The admin was never themed. The MARKETING site is a stronger case: a
 * storefront token resolves whichever contractor's theme is in :root, so using
 * one on Price2Book's own homepage would let a contractor's colour choice
 * repaint the product's marketing. Those pages use the p2b.* palette in
 * tailwind.config.ts instead, and scripts/verify-marketing-homepage.ts asserts
 * the opposite rule there — that no contractor-themed token appears in them.
 */
const SKIP_DIRS = [
  /^components\/admin\//,
  /^app\/admin\//,
  /^components\/marketing\//,
  /^app\/\(marketing\)\//,
];

/**
 * Two files legitimately hold colour literals.
 *
 * lib/theme/tokens.ts is the definition site — the values have to live
 * somewhere. lib/email.ts renders HTML email, where custom properties are not
 * reliably supported; those colours are resolved server-side and inlined, and
 * making that theme-aware is its own piece of work.
 */
const ALLOWED = new Set([
  "lib/theme/tokens.ts", // the definition site — the values live somewhere
  "lib/email.ts", // HTML email; custom properties are not reliable in clients
  "tailwind.config.ts", // the mapping layer; its rgb() is a helper, not CSS
  // Rendered by next/og in the edge runtime, not by a browser: there is no
  // :root and no custom properties to resolve, so the platform's own colours
  // have to be written out. Both are Price2Book's marks, never a contractor's.
  "app/icon.tsx",
]);

const HEX = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/;
const FUNC = /\b(rgba?|hsla?|oklch|color-mix)\(/;

const files = sourceFiles(ROOTS, /\.(ts|tsx|css)$/);

const problems: string[] = [];
for (const file of files) {
  if (ALLOWED.has(file) || SKIP_DIRS.some((d) => d.test(file))) continue;
  readFileSync(file, "utf8").split("\n").forEach((line, i) => {
    // `rgb(var(--t-…))` is the token indirection itself, not a literal.
    const stripped = line.replace(/rgba?\(\s*var\(--[a-z-]+\)[^)]*\)/g, "");
    if (!HEX.test(stripped) && !FUNC.test(stripped)) return;
    if (/^\s*(\/\/|\*|\/\*)/.test(line)) return; // a comment recording a value
    problems.push(`${file}:${i + 1}  ${line.trim().slice(0, 96)}`);
  });
}

console.log(`\nSTOREFRONT COLOUR SOURCE\n  ${files.length} file(s) scanned`);
if (problems.length) {
  console.error(`\n  ${problems.length} colour literal(s) outside the token layer:\n`);
  for (const p of problems) console.error(`    ${p}`);
  console.error(`\n  Add a semantic token in lib/theme/tokens.ts and use it, or — if this`);
  console.error(`  genuinely cannot go through CSS custom properties — add the file to`);
  console.error(`  ALLOWED in this script with a comment saying why.\n`);
  process.exit(1);
}
const BUILTIN = /\b(bg|text|border|from|to|via|ring|divide|placeholder)-(white|black|gray|zinc|neutral|stone|red|amber|emerald|blue|indigo)\b/g;
let builtin = 0;
for (const file of files) {
  if (ALLOWED.has(file) || SKIP_DIRS.some((d) => d.test(file))) continue;
  builtin += (readFileSync(file, "utf8").match(BUILTIN) ?? []).length;
}
console.log(`  PASS — no colour literals outside the token layer.`);
console.log(`  ${builtin} use(s) of Tailwind's built-in palette (white/black/gray/…).`);
console.log(`  Those bypass the theme too, but they are Phase 3 work: a dark variant`);
console.log(`  needs text-accent-ink where the page currently says text-white. Not a`);
console.log(`  regression, so not a failure — just the size of the remaining job.\n`);
