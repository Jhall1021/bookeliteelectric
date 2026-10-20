/**
 * Builds the standalone Stair Walk prototype page. The page bundles
 * lib/electrical/stairWalk.ts itself, so the prototype's questions and engine
 * mapping are the ones scripts/verify-stair-walk-adapter.ts checks.
 *
 *   npx tsx scripts/build-stair-walk-prototype.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["lib/electrical/stairWalk.ts"],
  bundle: true,
  format: "iife",
  globalName: "StairWalk",
  platform: "browser",
  target: "es2019",
  minify: true,
  write: false,
});
const template = readFileSync("docs/design/stair-walk-prototype/template.html", "utf8");
const marker = "/*__STAIR_WALK_BUNDLE__*/";
if (!template.includes(marker)) throw new Error("template is missing the bundle marker");
const out = "docs/design/stair-walk-prototype/stair-walk.html";
writeFileSync(out, template.replace(marker, () => bundle.outputFiles[0].text));
console.log(`wrote ${out}`);
