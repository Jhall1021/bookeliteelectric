/**
 * Every way a storefront is delivered is checked the same way.
 *
 *   npx tsx scripts/verify-storefront-surfaces.ts
 *
 * THE FAILURE THIS PREVENTS
 *
 * The storefront rules — the price promise, same-visit, empty categories,
 * cross-service references, storefront identity — are all checked against
 * `app/[site]`. That is correct today, when the hosted page is the only thing
 * delivered. It stops being correct the moment an embed or a custom domain
 * carries real customers: the gates would keep passing while nothing anyone
 * uses was checked.
 *
 * That is not hypothetical. The canonical catalog shipped "storey" for months
 * with a green spelling gate, because the gate read the copy that had already
 * been remediated rather than the source everyone installs from. A rule
 * checked against the wrong surface is a rule nobody is enforcing.
 *
 * So the surfaces are declared in lib/storefrontSurface and this asserts the
 * contract holds over the declared set: a surface may not be marked delivered
 * without a verifier that covers it, and no code may make behaviour depend on
 * which surface is rendering.
 */

import { readFileSync, readdirSync } from "node:fs";
import { pathToFileURL } from "node:url";
import {
  SURFACES,
  hostedSurface,
  embedSurface,
  customDomainSurface,
  surfaceHref,
} from "../lib/storefrontSurface";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const strip = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Which verifier covers which surface. Adding a surface means adding a row. */
const COVERAGE: Record<string, string[]> = {
  hosted: [
    "scripts/verify-storefront-price-promise.ts",
    "scripts/verify-same-visit-promise.ts",
    "scripts/lint-storefront-identity.ts",
    "scripts/audit-storefront-navigation.ts",
  ],
  // Deliberately empty until it ships. The check below turns that emptiness
  // into a build failure at exactly the moment it starts mattering.
  "custom-domain": [],
  embed: [
    "scripts/verify-embed-surface.ts",
    // The rules that are about WHAT a storefront may say hold on every
    // surface, because they are checked against the shared engine rather
    // than against a page — the embed renders the same components.
    "scripts/verify-same-visit-promise.ts",
    "scripts/verify-storefront-price-promise.ts",
  ],
};

function bases() {
  console.log(`\n  BASE PATHS\n`);

  ok(surfaceHref(hostedSurface("elite-electric"), "/my-visit") === "/elite-electric/my-visit",
    "hosted links carry the contractor's slug");
  ok(surfaceHref(embedSurface("site_abc"), "/my-visit") === "/embed/site_abc/my-visit",
    "embedded links carry the embed route and the publicId");
  ok(surfaceHref(customDomainSurface(), "/my-visit") === "/my-visit",
    "on a contractor's own domain the storefront is the root");

  // The defect this replaced: a bare "/my-visit" resolved against whichever
  // contractor the root serves, which sent a homeowner mid-booking to another
  // contractor's empty cart. No surface may produce an unprefixed link except
  // the one where the root genuinely IS the storefront.
  const prefixed = [hostedSurface("x"), embedSurface("site_x")]
    .every((s) => surfaceHref(s, "/services").startsWith(s.basePath) && s.basePath !== "");
  ok(prefixed, "every non-root surface prefixes its links");
}

function coverage() {
  console.log(`\n  VERIFICATION CONTRACT\n`);

  for (const s of SURFACES) {
    const verifiers = COVERAGE[s.kind] ?? [];
    if (!s.delivered) {
      console.log(`  --   ${s.kind}: not delivered yet — ${s.why}`);
      continue;
    }
    ok(verifiers.length > 0,
      `${s.kind} is delivered and has ${verifiers.length} verifier(s) covering it`,
      "a delivered surface with no verifier is a rule nobody is enforcing");
    for (const v of verifiers) {
      let exists = true;
      try { readFileSync(v, "utf8"); } catch { exists = false; }
      ok(exists, `   ${v} exists`);
    }
  }

  const undeclared = Object.keys(COVERAGE).filter(
    (k) => !SURFACES.some((s) => s.kind === k)
  );
  ok(undeclared.length === 0,
    "every covered surface is a declared one",
    undeclared.join(", "));
}

function oneEngine() {
  console.log(`\n  ONE ENGINE\n`);

  // A surface may change the shape of a URL and nothing else. If pricing,
  // scheduling, tax, deposits or booking ever read the surface, that is a
  // second storefront wearing the first one's name.
  const ENGINE = [
    "lib/pricing.ts",
    "lib/routeResolver.ts",
    "lib/schedulingAvailability.ts",
    "lib/nativeScheduling.ts",
    "lib/paymentLedger.ts",
    "lib/visitPrimary.ts",
    "lib/sameVisit.ts",
    "lib/serviceActivation.ts",
    "lib/pricePublication.ts",
  ];
  const branching = ENGINE.filter((f) => {
    let src = "";
    try { src = strip(readFileSync(f, "utf8")); } catch { return false; }
    return /\bsurface\b|isEmbed|embedded|customDomain/i.test(src);
  });
  ok(branching.length === 0,
    `no pricing, scheduling or payment rule branches on the surface (${ENGINE.length} checked)`,
    branching.join(", "));

  // And the base is declared rather than derived, which is what makes a second
  // surface possible without a second set of links.
  const ctx = strip(readFileSync("components/site/SiteContext.tsx", "utf8"));
  ok(/site\.surface\.basePath/.test(ctx),
    "useStorefrontBase reads the declared surface rather than the URL");
}

function noBareLinks() {
  console.log(`\n  NO UNPREFIXED CUSTOMER LINKS\n`);

  // router.push("/my-visit") is the defect that sent a homeowner to another
  // contractor's cart. Checked across the customer-facing components rather
  // than trusted to review.
  const roots = ["components/guided-flow", "components/checkout", "components/home"];
  const offenders: string[] = [];
  for (const root of roots) {
    let files: string[] = [];
    try { files = readdirSync(root).filter((f) => f.endsWith(".tsx")); } catch { continue; }
    for (const f of files) {
      const src = strip(readFileSync(`${root}/${f}`, "utf8"));
      // A push or an href to an absolute storefront route with no base in front.
      if (/(router\.push\(|href=)\s*["'`]\/(my-visit|services|checkout)\b/.test(src)) {
        offenders.push(`${root}/${f}`);
      }
    }
  }
  ok(offenders.length === 0,
    `no customer-facing component links to a storefront route without its base`,
    offenders.join(", "));
}

function main() {
  console.log("\nSTOREFRONT SURFACES");
  bases();
  coverage();
  oneEngine();
  noBareLinks();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
