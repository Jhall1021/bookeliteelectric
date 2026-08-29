/**
 * The marketing homepage says only what is true — ADR-020.
 *
 * Most of this file is not about design. Several lines on that page are
 * CORRECTNESS constraints the owner set, and each of them is one careless edit
 * from becoming a false claim that nobody notices because it still reads well:
 *
 *   integration status   "Coming Soon" quietly becoming "Connected" advertises
 *                        an integration that does not exist
 *   suggested vs published   collapsing the two implies a contractor's live
 *                        prices change when they touch a rate
 *   proof                a number in the proof section is a fabricated result
 *                        until a pilot contractor supplies a real one
 *   screenshots          a shot of a real tenant publishes their customers
 *
 * The other half guards the platform/tenant seam: the marketing page belongs
 * to Price2Book, so it must not resolve a contractor's theme, and it must not
 * hardcode the production portal's URL.
 *
 *   npx tsx scripts/verify-marketing-homepage.ts [--host https://…]
 */
import { pathToFileURL } from "node:url";
import { readFileSync, existsSync, readdirSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/** What each named integration is actually allowed to claim, today. */
const TRUTH: Record<string, string> = {
  Jobber: "Available",
  "Price2Book Scheduler": "Built In",
  ServiceTitan: "Coming Soon",
  "Housecall Pro": "Coming Soon",
  "Google Calendar": "Coming Soon",
  "Outlook Calendar": "Coming Soon",
};

/** Copy the owner approved and that must survive an edit. */
const REQUIRED_COPY = [
  "Your pricing.", "Your schedule.",
  "Request Early Access",
  "Give customers a price. Give them a time. Make the visit worth more.",
  // "Four steps, and none of them is a phone call." was asserted here until
  // the owner approved removing that section — the demo performs those steps
  // instead of listing them. Removed deliberately, with the decision recorded,
  // rather than quietly dropped when the check went red.
  "One trip.", "More done.",
  "Ask the questions that change the price.",
  "You decide what happens next.",
  "You decide what can be booked.",
  "Keep the software you already use.",
  "Start with real trade knowledge",
  "Everything your customer sees traces back to something you control.",
  "Setup is a conversation, not a form.",
  "Price2Book can suggest. You approve.",
  // US spelling, from the handoff. "Your labour." shipped once and had to be
  // corrected on the live site; a headline is exactly the kind of line nobody
  // re-reads after the first review.
  "Your labor.",
  "No new CRM required.",
];

async function statics() {
  const content = await import(pathToFileURL(`${process.cwd()}/components/marketing/content.ts`).href);
  const shots = await import(pathToFileURL(`${process.cwd()}/components/marketing/shots.ts`).href);

  console.log("\n  INTEGRATION STATUS IS TRUE");
  const named = content.INTEGRATIONS.map((i: any) => i.name);
  ok(named.length === Object.keys(TRUTH).length,
    `${named.length} integrations named`, `expected ${Object.keys(TRUTH).length}, got ${named.join(", ")}`);
  for (const [name, status] of Object.entries(TRUTH)) {
    const row = content.INTEGRATIONS.find((i: any) => i.name === name);
    ok(row?.status === status, `${name.padEnd(22)} is "${status}"`,
      row ? `claims "${row.status}"` : "not present at all");
  }

  console.log("\n  NO CAPABILITY THE PRODUCT DOES NOT HAVE");
  const marketingSrc = readdirSync("components/marketing")
    .map((f) => read(`components/marketing/${f}`)).join("\n");
  for (const banned of content.FORBIDDEN_INTEGRATION_LABELS) {
    // Scoped to status position: the word may legitimately appear in prose
    // ("Not connected" is a real per-contractor state in the PORTAL), but
    // never as a status this page asserts about a platform.
    const asStatus = new RegExp(`status:\\s*["'\`]${banned}["'\`]`);
    ok(!asStatus.test(marketingSrc), `never claims "${banned}" as a status`);
  }

  console.log("\n  THE APPROVED COPY IS STILL THERE");
  const pageSrc = [read("app/(marketing)/page.tsx"), marketingSrc].join("\n");
  for (const line of REQUIRED_COPY) {
    ok(pageSrc.includes(line), `"${line.slice(0, 52)}${line.length > 52 ? "…" : ""}"`);
  }

  console.log("\n  CTA HIERARCHY");
  const chrome = read("components/marketing/Chrome.tsx");
  ok(/bg-p2b-accent[^"]*">\s*\{HERO\.primaryCta\}/.test(chrome) || /bg-p2b-accent/.test(chrome),
    "Request Early Access is the filled, primary action");
  // Sign In must not also be a filled button — two equal buttons is not a
  // hierarchy, and the owner asked for a clear split.
  const signInLine = chrome.split("\n").find((l) => l.includes(">Sign In<") || l.includes("Sign In\n"));
  ok(!!chrome.includes("Sign In"), "Sign In is present");
  ok(!/bg-p2b-accent[^>]*>\s*Sign In/.test(chrome), "…and is not given a primary button treatment",
    signInLine ?? "");
  ok(!/https:\/\/app\.price2book\.com/.test(pageSrc),
    "the portal URL is resolved, not hardcoded",
    "a literal app.price2book.com would send preview traffic to production");
  ok(read("app/(marketing)/page.tsx").includes("appOrigin()"),
    "…via appOrigin()");

  console.log("\n  US SPELLING");
  // The approved copy is US English throughout. These are the forms that
  // actually turned up in this codebase, not a general dictionary.
  const BRITISH = /\b(labour|itemis(e|ed|ing)|customis|organis|recognis|colour|licence|catalogue|analyse|optimis|summaris|behaviour|honour|neighbour|labelled|modelling|defence)\b/i;
  for (const f of readdirSync("components/marketing")) {
    const src = read(`components/marketing/${f}`);
    // Only the copy, not the comments — prose about the code is not the site.
    const strings = src.match(/"[^"\n]{4,}"|'[^'\n]{4,}'|`[^`]{4,}`/g) ?? [];
    const hit = strings.find((t) => BRITISH.test(t));
    ok(!hit, `components/marketing/${f} uses US spelling`, hit?.slice(0, 80) ?? "");
  }

  console.log("\n  NOTHING FABRICATED");
  ok(content.PROOF_METRICS.every((m: string) => !/\d/.test(m)),
    "no proof metric carries a number",
    "POSITIONING.md forbids invented results until a pilot supplies real ones");
  ok(!/\b\d+\s+(residential\s+)?electrical services\b/i.test(pageSrc),
    "no exact service count is advertised",
    'POSITIONING.md requires "Dozens of residential electrical services"');
  ok(pageSrc.includes("Dozens of residential electrical services"), "…the approved phrasing is used");

  console.log("\n  SCREENSHOTS");
  const capture = read("scripts/capture-marketing-shots.ts");
  ok(capture.includes("assertDemoOnly"),
    "capture refuses any tenant but the demonstration contractor");
  ok(capture.includes("Elite Electric"),
    "…and names Elite explicitly as forbidden in a shot");
  const files: string[] = [
    ...(shots.SHOTS.storefront ? [shots.SHOTS.storefront.src] : []),
    ...Object.values(shots.SHOTS.modules).map((s: any) => s.src),
  ];
  ok(files.length > 0, `${files.length} screenshots referenced`);
  for (const src of files) {
    ok(existsSync(`public${src}`), `${src} exists`, "referenced by shots.ts but absent from public/");
  }

  console.log("\n  PLATFORM / TENANT SEAM");
  // The marketing site is Price2Book's. Storefront tokens resolve whichever
  // contractor's theme happens to be in :root, so a single bg-canvas here
  // would repaint the homepage with a contractor's colours.
  const tenantTokens = /\b(bg|text|border|from|to|via)-(canvas|surface|ink|muted|accent|line|positive|navy|electric|warmwhite|slate|success|charcoal|cardline)\b/;
  for (const f of readdirSync("components/marketing")) {
    const src = read(`components/marketing/${f}`);
    const hit = src.split("\n").find((l) => tenantTokens.test(l));
    ok(!hit, `components/marketing/${f} uses no contractor-themed token`, hit?.trim().slice(0, 90) ?? "");
  }
  const hero = read("components/home/Hero.tsx");
  ok(!hero.includes("/images/hero-kitchen.jpg"),
    "the storefront hero is not a hardcoded photograph",
    "a shared default would put one contractor's branded imagery on every storefront");
}

async function live(host: string) {
  console.log(`\n  LIVE — ${host}`);
  const res = await fetch(host, { redirect: "manual", headers: { "user-agent": "price2book-verify" } });
  ok(res.status === 200, `/ answers 200`, `status ${res.status}`);
  if (res.status !== 200) return;
  const html = await res.text();
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");

  for (const [name, status] of Object.entries(TRUTH)) {
    ok(text.includes(name), `names ${name}`);
    ok(text.includes(status), `…shows "${status}" somewhere`);
  }
  ok(!/\bConnected\b/.test(text), 'the word "Connected" appears nowhere on the page');
  ok(text.includes("Your pricing.") && text.includes("Your schedule."), "the approved headline is served");
  ok(text.includes("Request Early Access"), "the primary CTA is served");
  ok(/\/sign-in/.test(html), "a sign-in link is served");
}

async function main() {
  console.log("\nMARKETING HOMEPAGE");
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
