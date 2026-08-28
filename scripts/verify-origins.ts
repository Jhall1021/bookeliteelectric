/**
 * Three origins stay three origins — ADR-019.
 *
 *   PLATFORM    price2book.com        marketing
 *   APP         app.price2book.com    the contractor's application
 *   STOREFRONT  price2book.com/<slug> the homeowner's experience, and later a
 *                                     contractor's own domain
 *
 * The failure this prevents is quiet: both hosts serve the same Next.js app,
 * so a homeowner sent to the contractor application would get a page, not an
 * error — and a contractor sent to a storefront likewise. Nothing would break
 * loudly enough to notice.
 *
 * The other failure is a HARDCODED host. `jobberRedirectUri` used to fall back
 * to `bookeliteelectric.vercel.app`, so a deployment with the variable unset
 * pointed contractors at a DIFFERENT DEPLOYMENT'S callback.
 *
 * Static. Runs in the deploy gate.
 */
import { readFileSync, existsSync } from "node:fs";
import { sourceFiles } from "./_sourceFiles";
import { pathToFileURL } from "node:url";
import { storefrontUrl, storefrontOrigin, appOrigin } from "../lib/origins";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

function behaviour() {
  console.log("\n  RESOLUTION");
  const prev = { ...process.env };
  process.env.APP_ORIGIN = "https://app.price2book.com";
  process.env.STOREFRONT_ORIGIN = "https://price2book.com";

  ok(appOrigin() === "https://app.price2book.com", "the app origin resolves to the app host");
  ok(storefrontOrigin() === "https://price2book.com", "the storefront origin resolves to the public host");
  ok(appOrigin() !== storefrontOrigin(),
    "…and they are NOT the same host", `both are ${appOrigin()}`);

  ok(storefrontUrl({ hostedSlug: "elite-electric" }, "quote/abc")
       === "https://price2book.com/elite-electric/quote/abc",
     "a shared-origin storefront URL carries the contractor's slug",
     String(storefrontUrl({ hostedSlug: "elite-electric" }, "quote/abc")));

  // A contractor on their own domain is at its ROOT. Keeping the slug would
  // produce acme.com/acme/quote/abc, which looks like a bug because it is one.
  ok(storefrontUrl({ hostedSlug: "elite-electric", customDomain: "book.elite-electric.com" }, "quote/abc")
       === "https://book.elite-electric.com/quote/abc",
     "a custom-domain storefront drops the slug",
     String(storefrontUrl({ hostedSlug: "elite-electric", customDomain: "book.elite-electric.com" }, "quote/abc")));

  ok(storefrontOrigin({ customDomain: "book.acme.com" }) === "https://book.acme.com",
    "a site's own domain wins over the configured storefront origin");

  // Trailing slashes and missing schemes are normalised rather than trusted:
  // "price2book.com/" would otherwise build "…com//elite-electric".
  process.env.STOREFRONT_ORIGIN = "price2book.com/";
  ok(storefrontOrigin() === "https://price2book.com",
    "a scheme-less, trailing-slash value is normalised", String(storefrontOrigin()));

  process.env = prev;
}

function noHardcodedHosts() {
  console.log("\n  NO HOST IS WRITTEN INTO THE CODE");
  const files = sourceFiles(["lib", "app", "components"]).join("\n")
    .split("\n").filter((f) => /\.tsx?$/.test(f) && existsSync(f));

  // Hosts belonging to this product. A third party's URL is not the problem.
  const OURS = /https?:\/\/[^"'`\s)]*\b(bookeliteelectric|price2book)\b[^"'`\s)]*/gi;
  const ALLOWED = new Set([
    "lib/origins.ts",            // documents the target hosts in comments
    "scripts/verify-origins.ts",
  ]);
  const found: string[] = [];
  for (const f of files) {
    if (ALLOWED.has(f)) continue;
    readFileSync(f, "utf8").split("\n").forEach((raw, i) => {
      if (/^\s*(\*|\/\*|\/\/)/.test(raw)) return; // a comment naming a host is documentation
      const m = raw.match(OURS);
      if (m) found.push(`${f}:${i + 1}  ${m[0]}`);
    });
  }
  ok(found.length === 0,
    `no shipped code hardcodes one of our hosts (${files.length} files)`,
    found.slice(0, 6).join("\n         "));
}

/**
 * Comments are documentation, not behaviour. A note explaining that a file
 * USED to read NEXT_PUBLIC_SITE_URL is exactly the comment worth keeping, and
 * matching against it flagged the fix as the bug.
 */
const code = (f: string) =>
  readFileSync(f, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !/^\s*(\/\/|\*)/.test(l)).join("\n");

function correctOriginPerAudience() {
  console.log("\n  EACH LINK USES THE ORIGIN FOR ITS AUDIENCE");
  const jobber = code("lib/jobber.ts");
  ok(/appOrigin\(\)/.test(jobber) && !/NEXT_PUBLIC_SITE_URL/.test(jobber),
    "the Jobber callback uses the APP origin — connecting Jobber is a contractor action");

  const email = code("lib/email.ts");
  ok(/storefrontUrl\(/.test(email) && !/NEXT_PUBLIC_SITE_URL/.test(email),
    "a quote link uses the STOREFRONT origin — a homeowner follows it");
  ok(!/appUrl\(|appOrigin\(/.test(email),
    "…and no customer email is built from the contractor application's origin");

  // One shared variable is what conflated them in the first place.
  const all = sourceFiles(["lib", "app", "components"]).join("\n")
    .split("\n").filter((f) => /\.tsx?$/.test(f) && existsSync(f) && f !== "app/api/deployment-identity/route.ts");
  const legacy = all.filter((f) => /process\.env\.NEXT_PUBLIC_SITE_URL/.test(code(f)));
  ok(legacy.length === 0,
    "nothing derives an absolute URL from the single legacy site variable",
    legacy.join(", "));
}

function main() {
  console.log("\nORIGINS");
  behaviour();
  noHardcodedHosts();
  correctOriginPerAudience();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
