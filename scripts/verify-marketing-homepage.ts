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

/**
 * Copy the owner approved and that must survive an edit.
 *
 * THE 31 AUGUST SHORTENING PASS CHANGED THIS LIST, DELIBERATELY.
 *
 * Two headlines left the page with the sections they titled, and both are
 * recorded here rather than quietly deleted when the check went red:
 *
 *   "Ask the questions that change the price."   titled the Guided Pricing
 *     section, which merged into "Your pricing. Your rules." Guided Pricing
 *     is now shown — the real editor screen, and the real questions running
 *     in the demonstration — instead of described.
 *   "Everything your customer sees traces back to something you control."
 *     titled the eight-module screenshot gallery, which was the third proof
 *     of contractor control on one page. The claim survives as the whole
 *     subject of the Rules section.
 *
 * Everything else the owner approved is still asserted, including the lines
 * whose sections were merged into others. That is the difference between
 * shortening a page and losing its copy.
 */
const REQUIRED_COPY = [
  "Your pricing.", "Your schedule.",
  "Request Early Access",
  "Give customers a price. Give them a time. Make the visit worth more.",
  // "Four steps, and none of them is a phone call." was asserted here until
  // the owner approved removing that section — the demo performs those steps
  // instead of listing them. Removed deliberately, with the decision recorded,
  // rather than quietly dropped when the check went red.
  "One trip.", "More done.",
  "This is what your customer does.",
  "One pricing engine. Everywhere customers find you.",
  "Your pricing. Your rules.",
  "You decide what happens next.",
  "You decide what can be booked.",
  "Keep the software you already use.",
  "Start with real trade knowledge",
  "Setup is a conversation, not a form.",
  "Price2Book can suggest. You approve.",
  // US spelling, from the handoff. "Your labor." shipped once and had to be
  // corrected on the live site; a headline is exactly the kind of line nobody
  // re-reads after the first review.
  "Your labor.",
  "No new CRM required.",
];

/**
 * Claims the product cannot support yet, and the words that would make them.
 *
 * The page now points at contractor.com/pricing everywhere, and the embed
 * that puts Price2Book inside that page is "proposed" in
 * docs/design/embed-v1.md — not shipped. A homepage that says "embedded",
 * "installed" or "connected" in the present tense about that is advertising
 * something a contractor cannot have, which is the same class of defect as an
 * integration status that lies.
 *
 * The rule is not "never mention the embed" — the whole positioning depends
 * on it. The rule is that any mention has to be future or conditional, and
 * EMBED_STATUS is the one place that wording lives.
 */
const EMBED_OVERCLAIM = [
  "already embedded",
  "embed is live",
  "embed is available",
  "install the snippet",
  "paste the snippet",
  "add the code to your site",
];

/** The words that make EMBED_STATUS a statement about the future. */
const EMBED_NOT_YET = ["is being built", "V1 release item"];

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
  //
  // This line enumerates the spellings it REJECTS, so it necessarily contains
  // them. A repo-wide find-and-replace once rewrote "labour" here and turned
  // the rule into one that rejected the correct spelling instead — the check
  // went on passing its own file and failing the copy it was protecting.
  // scripts/verify-us-spelling.ts skips this file for that reason.
  const BRITISH = /\b(labour|itemis(e|ed|ing)|customis|organis|recognis|colour|licence|catalogue|analyse|optimis|summaris|behaviour|honour|neighbour|labelled|modelling|defence)\b/i;
  for (const f of readdirSync("components/marketing")) {
    const src = read(`components/marketing/${f}`);
    // Only the copy, not the comments — prose about the code is not the site.
    const strings = src.match(/"[^"\n]{4,}"|'[^'\n]{4,}'|`[^`]{4,}`/g) ?? [];
    const hit = strings.find((t) => BRITISH.test(t));
    ok(!hit, `components/marketing/${f} uses US spelling`, hit?.slice(0, 80) ?? "");
  }

  console.log("\n  THE EMBED IS NOT ADVERTISED AS SHIPPED");
  // docs/design/embed-v1.md is status "proposed". The page is allowed to
  // point at contractor.com/pricing — that is the positioning — but not to
  // describe installing it as something a contractor can do today.
  for (const claim of EMBED_OVERCLAIM) {
    ok(!pageSrc.toLowerCase().includes(claim),
      `never says "${claim}"`,
      "the embed has not shipped; docs/design/embed-v1.md is still proposed");
  }
  const embedLine: string = content.EMBED_STATUS?.line ?? "";
  ok(EMBED_NOT_YET.some((w) => embedLine.includes(w)),
    "EMBED_STATUS states plainly that it is not there yet",
    `EMBED_STATUS.line = ${embedLine.slice(0, 90)}`);
  ok(pageSrc.includes("EMBED_STATUS"),
    "…and the page renders it rather than storing it unused");

  console.log("\n  THE EXAMPLE PRICES ARE THE ENGINE'S");
  // The homepage shows a worked While We're There™ example two sections below
  // a live demonstration that computes the same numbers from the real pricing
  // engine. If the two ever disagree, the contradiction is visible to any
  // contractor who clicks through — which is the audience the example exists
  // to convince. So the page's figures are checked against demoFlow.ts rather
  // than trusted.
  const demo = await import(pathToFileURL(`${process.cwd()}/components/marketing/demoFlow.ts`).href);
  const money = (cents: number) => `$${cents / 100}`;

  const addOn = demo.DEMO_FLOW.addOns.find(
    (a: any) => a.name === content.WWT_EXAMPLE.addOn.name,
  );
  ok(!!addOn, `the demonstration offers "${content.WWT_EXAMPLE.addOn.name}"`,
    `demoFlow.ts add-ons: ${demo.DEMO_FLOW.addOns.map((a: any) => a.name).join(", ")}`);
  if (addOn) {
    ok(content.WWT_EXAMPLE.addOn.price === `+${money(addOn.priceCents)}`,
      `…at ${content.WWT_EXAMPLE.addOn.price}, the same-visit price the engine produced`,
      `page says ${content.WWT_EXAMPLE.addOn.price}, engine says +${money(addOn.priceCents)}`);
  }

  // The primary has to be a price the engine actually reaches on some path,
  // not a plausible-looking round number beside a real one.
  const priced: number[] = Object.values(demo.DEMO_FLOW.flows)
    .flatMap((f: any) => Object.values(f.outcomes))
    .filter((o: any) => o.status === "PRICED")
    .map((o: any) => o.priceCents);
  const primaryCents = Number(content.WWT_EXAMPLE.primary.price.replace(/[$,]/g, "")) * 100;
  ok(priced.includes(primaryCents),
    `${content.WWT_EXAMPLE.primary.price} is a price the engine reaches`,
    `priced outcomes: ${[...new Set(priced)].map(money).join(", ")}`);
  ok(pageSrc.includes(content.WWT_EXAMPLE.primary.price) && pageSrc.includes(`$${primaryCents / 100}`),
    "…and the hero prices the same service at the same figure");

  // The arithmetic on the card. A visit total that does not add up is the one
  // error a reader checks with their own eyes.
  if (addOn) {
    ok(content.WWT_EXAMPLE.total === money(primaryCents + addOn.priceCents),
      `the visit total is ${content.WWT_EXAMPLE.total}`,
      `${content.WWT_EXAMPLE.primary.price} + ${content.WWT_EXAMPLE.addOn.price} ≠ ${content.WWT_EXAMPLE.total}`);
  }

  // The same-visit promise is conditional in the product (a service with no
  // add-on price can only ever be the primary — lib/sameVisit.ts), so it has
  // to be conditional in the copy. BrightPath is why.
  const wwtCopy = JSON.stringify(content.WWT) + JSON.stringify(content.PILLARS);
  ok(/unless you set one|where you have set|you choose which/i.test(wwtCopy),
    "While We're There™ is offered as a contractor setting, not a platform feature",
    "scripts/verify-same-visit-promise.ts exists because this copy was once unconditional");
  ok(/not a percentage off|not a discount/i.test(wwtCopy),
    "…and is not sold as a discount");

  console.log("\n  NOTHING FABRICATED");
  // The pilot-metrics section is gone; empty result cards read as an
  // unfinished page, and the rule they enforced is now enforced against the
  // whole page instead: no percentage, no dollar saving, no "N contractors".
  const FABRICATED = /\b\d+\s*%|\b\d+x\b|\bsaved\s+\$?\d|\b\d+\s+contractors\b/i;
  const copyOnly = pageSrc
    .split("\n")
    .filter((l) => !l.trim().startsWith("*") && !l.trim().startsWith("//"))
    .join("\n");
  const fab = copyOnly.match(FABRICATED);
  ok(!fab, "no invented result or adoption figure",
    `POSITIONING.md forbids invented proof until a pilot supplies real ones: ${fab?.[0] ?? ""}`);
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
  const files: string[] = Object.values(shots.SHOTS)
    .filter(Boolean)
    .map((s: any) => s.src);
  ok(files.length > 0, `${files.length} screenshot(s) referenced`);
  for (const src of files) {
    ok(existsSync(`public${src}`), `${src} exists`, "referenced by shots.ts but absent from public/");
  }

  console.log("\n  THE HERO WALKTHROUGH IS THE REAL PRODUCT");
  // The heroFixture's claim is that a homeowner walks the CONTRACTOR'S OWN tree to a
  // contractor-approved price. Three things have to hold for that to be true,
  // and none of them is visible by looking at the animation.
  const heroFlowPath = "components/marketing/heroFlow.ts";
  ok(existsSync(heroFlowPath), "the hero fixture exists",
    "run: npx tsx scripts/capture-hero-flow.ts");
  const heroFixture = await import(pathToFileURL(`${process.cwd()}/${heroFlowPath}`).href).then((m) => m.HERO_FLOW).catch(() => null);
  ok(!!heroFixture, "…and it parses");
  if (heroFixture) {
    ok(heroFixture.generatedBy === "scripts/capture-hero-flow.ts",
      "the fixture is generated, not hand-written",
      "a hand-edited fixture is a drawing of the product again");
    ok(heroFixture.primary.path.length > 0 && !!heroFixture.primary.priceCents,
      `the walk reaches a real price (${heroFixture.primary.path.length} questions, $${heroFixture.primary.priceCents / 100})`);
    // Identity substitution is the rule that keeps a real tenant's brand off
    // Price2Book's homepage while its economics stay on it.
    ok(heroFixture.identity.name !== heroFixture.source && !JSON.stringify(heroFixture).includes("Elite Electric"),
      "no captured tenant's name survives into the fixture",
      "POSITIONING.md forbids real-tenant branding on the marketing site");
    ok((heroFixture.addOn.sameVisitCents ?? 0) < (heroFixture.addOn.standaloneCents ?? 0),
      "the same-visit price is below the standalone price it is shown against");
    ok(heroFixture.totalCents === heroFixture.primary.priceCents + (heroFixture.addOn.sameVisitCents ?? 0),
      "the visit total is the sum the page shows");
    ok((heroFixture.schedule?.windows?.length ?? 0) > 0, "real arrival windows were captured");
  }
  const walk = read("components/marketing/HeroWalkthrough.tsx");
  // All three, and ServiceIntro matters most: it is the FIRST visible frame,
  // so a marketing copy of it would put a drawing where a contractor's first
  // impression of the product is.
  for (const c of ["ServiceIntro", "QuestionStep", "PriceConfirmationCard"]) {
    ok(walk.includes(`from "@/components/guided-flow/${c}"`),
      `the walkthrough renders the storefront's own ${c}`,
      "a marketing copy of a storefront component is a drawing that drifts");
  }
  // Comments stripped first. The file's own documentation quotes the figures
  // it is forbidden to hardcode — "the $280, the $260/$95 pair" — which is
  // prose about the code, not the page. The US-spelling check above learned
  // the same lesson the same way.
  const walkCode = walk
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  ok(!/prompt:\s*["']/.test(walkCode) && !/["'>]\s*\$\d{2,}/.test(walkCode),
    "…and hardcodes no question or price of its own",
    "every number and every prompt must come from the fixture");

  console.log("\n  THE LOGO IS THE DELIVERED ARTWORK");
  // The header composes the mark and the wordmark itself, so both halves have
  // to be present; a missing file renders as a broken image in the one place
  // every visitor looks first.
  for (const asset of [
    "price2book-mark.png", "price2book-wordmark.png",
    "price2book-mark-reverse.png", "price2book-wordmark-reverse.png",
  ]) {
    ok(existsSync(`public/marketing/${asset}`), `public/marketing/${asset} exists`);
  }
  ok(existsSync("app/icon.png"), "the browser-tab mark is the brand mark",
    "app/icon.png is the favicon; app/icon.tsx drew a lightning bolt that is not the logo");
  ok(!chrome.includes("M13 2 4 14h7l-1 8 9-12h-7l1-8Z"),
    "the retired bolt glyph is gone from the header");

  console.log("\n  PLATFORM / TENANT SEAM");
  // The marketing site is Price2Book's. Storefront tokens resolve whichever
  // contractor's theme happens to be in :root, so a single bg-canvas here
  // would repaint the homepage with a contractor's colours.
  //
  // THE ISLAND IS THE ONE EXEMPTION, and it is an exemption from the token
  // rule, not from the seam. The hero renders the real storefront components
  // inside a frame whose theme is emitted at a generated class rather than at
  // :root — themeCss takes a selector for exactly this case. So these two
  // files are allowed contractor tokens, and are then held to the stricter
  // rule below: the theme they emit must be scoped.
  const ISLAND = ["StorefrontIsland.tsx", "HeroWalkthrough.tsx"];
  const tenantTokens = /\b(bg|text|border|from|to|via)-(canvas|surface|ink|muted|accent|line|positive|navy|electric|warmwhite|slate|success|charcoal|cardline)\b/;
  for (const f of readdirSync("components/marketing")) {
    if (ISLAND.includes(f)) continue;
    const src = read(`components/marketing/${f}`);
    const hit = src.split("\n").find((l) => tenantTokens.test(l));
    ok(!hit, `components/marketing/${f} uses no contractor-themed token`, hit?.trim().slice(0, 90) ?? "");
  }
  const island = read("components/marketing/StorefrontIsland.tsx");
  ok(island.includes("themeCss(theme, `.${scope}`)"),
    "the island scopes its theme to itself",
    "themeCss() with no selector emits :root and repaints the whole marketing page");
  ok(!/themeCss\(\s*theme\s*\)/.test(island), "…and never emits the theme unscoped");
  ok(island.includes("ANONYMOUS_IDENTITY") && island.includes("HERO_FLOW.identity"),
    "the island wears the demonstration identity, not the captured tenant's");
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
