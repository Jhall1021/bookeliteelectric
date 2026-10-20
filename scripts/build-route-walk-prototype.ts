/**
 * Builds the standalone Route Walk prototype page. The page bundles
 * lib/electrical/routeWalk.ts itself, so the prototype's questions and engine
 * mapping are the ones scripts/verify-route-walk-adapter.ts checks.
 *
 *   npx tsx scripts/build-route-walk-prototype.ts
 */
import { readFileSync, writeFileSync } from "node:fs";
import { buildSync } from "esbuild";

const bundle = buildSync({
  entryPoints: ["lib/electrical/routeWalk.ts"],
  bundle: true,
  format: "iife",
  globalName: "RouteWalk",
  platform: "browser",
  target: "es2019",
  minify: true,
  write: false,
});
const template = readFileSync("docs/design/route-walk-prototype/template.html", "utf8");
const marker = "/*__ROUTE_WALK_BUNDLE__*/";
if (!template.includes(marker)) throw new Error("template is missing the bundle marker");
const out = "docs/design/route-walk-prototype/route-walk.html";
writeFileSync(out, template.replace(marker, () => bundle.outputFiles[0].text));
console.log(`wrote ${out}`);
