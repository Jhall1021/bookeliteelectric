/**
 * A generic storefront names nobody, and promises nothing it cannot keep.
 *
 * ADR-016. This exists because the same class of bug has now been found four
 * separate times: Elite's name in the header, their licence in the footer,
 * their phone in a safety escalation, their county in an image's alt text.
 * Each was invisible because the page looked right — on Elite, which is the
 * only storefront anyone opens.
 *
 * Two families of check:
 *
 *   IDENTITY  a specific business's name, logo, phone, address, licence or
 *             territory, written into a component every contractor renders.
 *
 *   PRICING   copy that assumes a fixed price. True for a flat-rate
 *             contractor, a promise a time-and-materials contractor cannot
 *             keep, and silently wrong rather than visibly broken.
 *
 * Static. No database. Runs in the deploy gate.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { FLAT_RATE_ASSUMPTIONS } from "../lib/pricingCopy";

/**
 * Known identity of the founding contractor. Grows if a second contractor's
 * details ever get written into a component — but the point is that they
 * should not, so a new entry here is a symptom.
 */
const IDENTITY_PATTERNS: { re: RegExp; what: string }[] = [
  { re: /\bElite\s+Electric\b/i, what: "a specific company name" },
  { re: /\bWhy\s+Elite\b/, what: "a company name in a link label (derive it from identity.shortName)" },
  // The route is a compatibility redirect, not a destination. A new link
  // pointing at it would send a Northgate customer to /northgate-electric/
  // why-elite, and it would work — which is why nothing reports it.
  { re: /["'`\/]why-elite\b/, what: "a link to the compatibility route (use /why-us)" },
  { re: /elite-logo/i, what: "a specific company's logo asset" },
  { re: /\b732[-.\s]?204[-.\s]?7003\b|\b7322047003\b/, what: "a specific company's phone number" },
  { re: /\b1309\s+Allaire\b|\bOcean,\s*NJ\b|\b07712\b/, what: "a specific company's address" },
  { re: /\bLicense\s*#\s*\d|\bNJ\s+Electrical\s+License\b/i, what: "a specific company's licence" },
  { re: /\bMonmouth\b|\bOcean\s+Count(y|ies)\b/i, what: "a specific company's service territory" },
  { re: /\bBookEliteElectric\b/i, what: "a specific company's domain" },
  { re: /nj-service-area-map/i, what: "a specific company's territory image" },
];

/**
 * Files where this content legitimately lives.
 *
 * `lib/theme/*` names Elite only in the parity definition's key and label,
 * which is internal. `prisma/` is data. Admin is Price2Book's own surface. The
 * linter itself and the identity resolver have to name the patterns to check
 * or supply the fallbacks.
 */
const ALLOWED = new Set([
  "scripts/lint-storefront-identity.ts",
  "app/[site]/why-elite/page.tsx", // the compatibility redirect itself
  "lib/siteRouting.ts",            // keeps the old slug reserved
  "scripts/audit-storefront-navigation.ts",
  "lib/theme/definition.ts",   // the elite-baseline parity anchor's key/label
  "lib/theme/tokens.ts",       // ELITE_V1_* palette constant names
  "lib/theme/structure.ts",    // ELITE_V1_STRUCTURE
  "lib/pricingCopy.ts",        // holds the flat-rate copy on purpose, keyed by strategy
  "scripts/_extractCore.ts",   // the template extractor's BRAND detector
]);
const SKIP_DIR = [/^components\/admin\//, /^app\/admin\//, /^scripts\//, /^prisma\//];

type Finding = { file: string; line: number; text: string; why: string };

function main() {
  const files = execSync("git ls-files -co --exclude-standard 'app' 'components' 'lib'", { encoding: "utf8" })
    .split("\n").filter((f) => /\.(ts|tsx)$/.test(f))
    .filter((f) => !ALLOWED.has(f) && !SKIP_DIR.some((d) => d.test(f)));

  const identity: Finding[] = [];
  const pricing: Finding[] = [];

  for (const file of files) {
    readFileSync(file, "utf8").split("\n").forEach((raw, i) => {
      // A comment explaining what was removed is not a regression, and neither
      // is one explaining WHY a distinction matters. Only shipped strings
      // count. `/**` openers need catching as well as `*` continuations —
      // missing them flags this file's own doc comments.
      const line = raw.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      if (/^\s*(\*|\/\*)/.test(raw) || !line.trim()) return;
      for (const p of IDENTITY_PATTERNS)
        if (p.re.test(line)) identity.push({ file, line: i + 1, text: raw.trim().slice(0, 92), why: p.what });
      for (const re of FLAT_RATE_ASSUMPTIONS)
        if (re.test(line)) pricing.push({ file, line: i + 1, text: raw.trim().slice(0, 92), why: "assumes a fixed price" });
    });
  }

  console.log(`\nSTOREFRONT IDENTITY\n  ${files.length} customer-facing file(s) scanned\n`);

  const report = (title: string, found: Finding[], remedy: string[]) => {
    if (!found.length) return;
    console.error(`  ${found.length} ${title}:\n`);
    for (const f of found) console.error(`    ${f.file}:${f.line}  ${f.why}\n      ${f.text}`);
    console.error("");
    for (const l of remedy) console.error(`  ${l}`);
    console.error("");
  };

  report("hardcoded identity", identity, [
    "Resolve these from contractor configuration at the [site] boundary:",
    "useIdentity() in a client component, resolveIdentity() in a server one.",
    "If a contractor has not supplied the value, OMIT the element — never fall",
    "back to another contractor's.",
  ]);
  report("fixed-price assumption(s)", pricing, [
    "This copy is true for FLAT_RATE and a promise TIME_AND_MATERIALS cannot",
    "keep. Move it into lib/pricingCopy.ts keyed by strategy, and read it with",
    "usePricingCopy(). A theme decides what a headline looks like; it must not",
    "decide what the headline claims.",
  ]);

  if (identity.length || pricing.length) process.exit(1);
  console.log(`  PASS — no contractor-specific identity, no fixed-price assumptions.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
