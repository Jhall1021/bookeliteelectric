/**
 * Legacy Elite redirects fire on Elite's host and nowhere else — ADR-019.
 *
 * `/` redirecting to Elite's storefront is CORRECT on bookeliteelectric.com and
 * catastrophic on price2book.com, where it would send anyone typing the
 * product's name into one contractor's booking flow instead of the marketing
 * site.
 *
 * Both directions are asserted, because the two failures are opposite and
 * equally bad:
 *
 *   too wide    Price2Book's marketing routes get swallowed by Elite
 *   too narrow  a customer's bookmarked link 404s
 *
 * Static half reads the config. Live half probes a running host, which is the
 * only place a Host-header rule can actually be observed.
 *
 *   npx tsx scripts/verify-legacy-redirect-scope.ts [--host https://…]
 */
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

/** Every bare path the legacy config claims. */
const LEGACY_PATHS = [
  "/", "/services", "/troubleshooting", "/my-visit", "/service-area",
  "/how-it-works", "/why-elite",
];

/** Paths Price2Book's marketing site needs, which legacy must not shadow. */
const MARKETING_PATHS = ["/", "/pricing", "/how-it-works"];

async function statics() {
  console.log("\n  THE CONFIG");
  const mod = await import(pathToFileURL(`${process.cwd()}/next.config.mjs`).href);
  const redirects = await mod.default.redirects();
  ok(redirects.length > 0, `${redirects.length} legacy redirects declared`);

  const unscoped = redirects.filter((r: { missing?: unknown[] }) => !r.missing?.length);
  ok(unscoped.length === 0,
    "EVERY legacy redirect carries a host condition",
    unscoped.map((r: { source: string }) => r.source).join(", "));

  const wrong = redirects.filter((r: { missing?: { type: string; value: string }[] }) =>
    !r.missing?.some((m) => m.type === "host" && /price2book/.test(m.value)));
  ok(wrong.length === 0,
    "…and every one excludes Price2Book hosts specifically",
    wrong.map((r: { source: string }) => r.source).join(", "));

  // An exclusion, not an allowlist. An allowlist would silently drop the
  // redirects on any host nobody remembered to add, and the symptom would be a
  // customer's bookmarked link 404ing.
  const usesHas = redirects.some((r: { has?: unknown[] }) => r.has?.length);
  ok(!usesHas, "scoped by exclusion (missing), not by an allowlist (has)");

  const rootRule = redirects.find((r: { source: string }) => r.source === "/");
  ok(!!rootRule, "the root path is still claimed for the Elite host");
  ok(rootRule?.permanent === false,
    "…and stays TEMPORARY, so it can be withdrawn when Price2Book takes /",
    `permanent=${rootRule?.permanent}`);
}

async function live(host: string) {
  const label = new URL(host).host;
  const isP2B = /(^|\.)price2book\.com$/.test(label);
  console.log(`\n  LIVE — ${label}  (${isP2B ? "Price2Book host" : "Elite/other host"})`);

  for (const path of LEGACY_PATHS) {
    const res = await fetch(`${host}${path}`, { redirect: "manual" });
    const loc = res.headers.get("location") ?? "";
    const toElite = /\/elite-electric/.test(loc);
    if (isP2B) {
      // On Price2Book, nothing may bounce to Elite. 200, 404 and a non-Elite
      // redirect are all acceptable; landing on Elite is not.
      ok(!toElite, `${path.padEnd(18)} does NOT redirect to Elite  [${res.status}${loc ? ` -> ${loc}` : ""}]`);
    } else {
      ok(res.status >= 300 && res.status < 400 && toElite,
        `${path.padEnd(18)} still redirects to Elite  [${res.status} -> ${loc}]`);
    }
  }

  if (isP2B) {
    console.log(`\n  MARKETING ROUTES ARE NOT SHADOWED — ${label}`);
    for (const path of MARKETING_PATHS) {
      const res = await fetch(`${host}${path}`, { redirect: "manual" });
      const loc = res.headers.get("location") ?? "";
      ok(!/\/elite-electric/.test(loc),
        `${path.padEnd(18)} is Price2Book's to serve  [${res.status}${loc ? ` -> ${loc}` : ""}]`);
    }

    console.log(`\n  THE PORTAL IS UNAFFECTED — ${label}`);
    for (const [path, expect] of [["/sign-in", 200], ["/dashboard", 307]] as const) {
      const res = await fetch(`${host}${path}`, { redirect: "manual" });
      const loc = res.headers.get("location") ?? "";
      ok(res.status === expect && !/\/elite-electric/.test(loc),
        `${path.padEnd(18)} answers ${expect}${loc ? ` -> ${loc}` : ""}`, `got ${res.status} ${loc}`);
    }
    // The tenant-addressed storefront is NOT legacy behavior and must survive.
    const store = await fetch(`${host}/elite-electric`, { redirect: "manual" });
    ok(store.status === 200, "…and /elite-electric still serves directly", `status ${store.status}`);
  }
}

async function main() {
  console.log("\nLEGACY REDIRECT SCOPE");
  await statics();
  const host = arg("host");
  if (host) await live(host);
  else console.log("\n  (pass --host https://… to probe a running deployment)");
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
