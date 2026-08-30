/**
 * A variant is a different page, not a different palette — ADR-015 Phase 3.
 *
 * The bar this enforces: remove color and logo, and two variants of the same
 * family are still obviously different. That cannot be checked by looking at
 * tokens, so it is checked on the STRUCTURE — the closed set of composition
 * choices a variant is allowed to make.
 *
 * Also enforces the thing that keeps this from rotting into per-customer
 * special cases: components branch on structure, never on contractor identity.
 *
 * Static. No database, no browser.
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { sourceFiles } from "./_sourceFiles";
import { DEFINITIONS, definitionKey } from "../lib/theme/definition";
import { STRUCTURE_AXES, STRUCTURE_DEFAULTS, MIN_VARIANT_DISTANCE, structureDistance, ELITE_V1_STRUCTURE } from "../lib/theme/structure";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

function main() {
  console.log("\nTHEME STRUCTURE\n");

  // Elite's pinned definition must keep Elite's composition, or the Phase 1
  // parity proof stops meaning anything.
  const baseline = DEFINITIONS.find((d) => !d.selectable)!;
  const moved = structureDistance(baseline.structure, ELITE_V1_STRUCTURE);
  ok(moved.length === 0, "the parity definition keeps Elite's composition", moved.join(", "));

  // Every family's variants must be structurally far apart.
  const families = new Map<string, typeof DEFINITIONS[number][]>();
  for (const d of DEFINITIONS) {
    if (!d.selectable) continue; // the anchor, not a customer choice
    families.set(d.family, [...(families.get(d.family) ?? []), d]);
  }
  for (const [family, defs] of families) {
    if (defs.length < 2) { console.log(`  --   ${family}: only ${defs.length} variant, nothing to compare`); continue; }
    for (let i = 0; i < defs.length; i++)
      for (let j = i + 1; j < defs.length; j++) {
        const diff = structureDistance(defs[i].structure, defs[j].structure);
        ok(diff.length >= MIN_VARIANT_DISTANCE,
          `${definitionKey(defs[i])} vs ${definitionKey(defs[j])}: ${diff.length} of ${STRUCTURE_AXES.length} axes differ`,
          `only [${diff.join(", ")}] — a variant pair this close is a recolor`);
      }
  }

  // Every axis must actually be exercised by something, or it is a knob
  // nobody turns pretending to be a design decision.
  for (const axis of STRUCTURE_AXES) {
    const values = new Set(DEFINITIONS.map((d) => String(d.structure[axis])));
    ok(values.size >= 2, `axis "${axis}" is used by more than one value`,
      `every definition sets it to ${[...values][0]}`);
  }

  // Structure, never identity. This is the rule that stops the theme system
  // becoming a pile of `if (contractor === ...)`.
  // -co --exclude-standard: tracked AND untracked-but-not-ignored. Plain
  // `ls-files` lists only tracked files, so a component added in this same
  // change reads as absent and every axis it introduced looks decorative.
  // The rule governs CUSTOMER-FACING components. Price2Book's own surfaces —
  // the contractor portal and the admin — are excluded, because identifying
  // which contractor is being acted for is precisely their job there.
  const OWN_SURFACE = [/\/admin\//, /^app\/dashboard\//, /^app\/api\/portal\//, /^components\/portal\//, /^app\/choose\//];
  const files = sourceFiles(["components", "app"]).join("\n")
    .split("\n").filter((f) => /\.tsx?$/.test(f) && !OWN_SURFACE.some((d) => d.test(f)));
  // `typeof contractorId !== "string"` is a shape guard, not a branch on which
  // contractor — excluded explicitly so the rule keeps meaning what it says.
  const IDENTITY = /(?<!typeof\s)\b(contractor|site|tenant)(Id|Slug|Name)?\s*(===|!==)\s*["'`]|slug\s*===\s*["'`]/;
  const offenders: string[] = [];
  for (const f of files) {
    readFileSync(f, "utf8").split("\n").forEach((line, i) => {
      if (IDENTITY.test(line) && !/^\s*(\/\/|\*)/.test(line)) offenders.push(`${f}:${i + 1}  ${line.trim().slice(0, 88)}`);
    });
  }
  ok(offenders.length === 0, `no customer-facing component branches on contractor identity (${files.length} files)`,
    offenders.slice(0, 5).join("\n         "));

  // A structure axis is only real if a component reads it.
  const componentSrc = files.filter((f) => f.startsWith("components/") || f.startsWith("app/"))
    .map((f) => readFileSync(f, "utf8")).join("\n");
  const unread = STRUCTURE_AXES.filter((a) => !new RegExp(`\\b${a}\\b`).test(componentSrc));
  ok(unread.length === 0, "every structure axis is read by at least one component",
    `never read: ${unread.join(", ")} — declared but decorative`);

  // Stronger, and the one that actually bites: a VALUE a definition selects
  // must be implemented. An axis can be read while one of its values silently
  // falls through to the default — a contractor picks "banner" and gets
  // "split", which nothing would have reported.
  const unimplemented: string[] = [];
  for (const axis of STRUCTURE_AXES) {
    for (const value of new Set(DEFINITIONS.map((d) => String(d.structure[axis])))) {
      // A value is implemented if a component branches on it, or if it is the
      // axis's DECLARED default — the else-branch, stated rather than assumed.
      if (value === String(STRUCTURE_DEFAULTS[axis])) continue;
      if (!new RegExp(`["'\`]${value}["'\`]`).test(componentSrc)) unimplemented.push(`${axis}="${value}"`);
    }
  }
  ok(unimplemented.length === 0,
    "every value any definition selects is implemented by a component",
    `no component tests for: ${unimplemented.join(", ")} — a contractor choosing it silently gets the default`);

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
