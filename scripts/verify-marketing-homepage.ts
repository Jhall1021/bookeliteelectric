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
import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

const read = (p: string) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/**
 * Every source file under components/marketing, at any depth.
 *
 * Was readdirSync of one directory, which broke the moment trade pages needed
 * a subdirectory — and the interesting half of that failure is that it broke
 * LOUDLY. Had it silently skipped the folder, the spelling, tenant-token and
 * hardcoded-price rules would have stopped covering the newest files on the
 * site, which is exactly where they are most needed.
 */
/** Every page under the marketing route group, at any depth. */
function marketingRoutes(dir = "app/(marketing)"): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    return statSync(full).isDirectory() ? marketingRoutes(full) : [full];
  });
}

function marketingFiles(dir = "components/marketing"): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = `${dir}/${entry}`;
    return statSync(full).isDirectory() ? marketingFiles(full) : [full];
  });
}

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
  // The adoption objection, in the owner's own words. The second line is the
  // whole positioning in nine words and is the last thing the section says.
  "You don\u2019t have to flat-rate your whole business.",
  "Price2Book fits your business",
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
  const marketingSrc = marketingFiles().map(read).join("\n");
  for (const banned of content.FORBIDDEN_INTEGRATION_LABELS) {
    // Scoped to status position: the word may legitimately appear in prose
    // ("Not connected" is a real per-contractor state in the PORTAL), but
    // never as a status this page asserts about a platform.
    const asStatus = new RegExp(`status:\\s*["'\`]${banned}["'\`]`);
    ok(!asStatus.test(marketingSrc), `never claims "${banned}" as a status`);
  }

  console.log("\n  THE APPROVED COPY IS STILL THERE");
  /**
   * Scanned across every marketing route, not just the homepage.
   *
   * The restructure moved whole arguments to the pages that own them — "You
   * decide what can be booked." is on /product/online-booking now, "One trip.
   * More done." on /product/while-were-there. The rule was never "this line is
   * on the homepage"; it is "this line the owner approved still exists on the
   * site". Scanning one file would have made a correct move look like a
   * deletion, and the pressure would have been to paste the copy back.
   */
  const pageSrc = [...marketingRoutes(), ...marketingFiles()].map(read).join("\n");
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
  // The sign-in href moved to the route group's layout when the chrome did,
  // so the check follows it. The rule is unchanged: resolved, never hardcoded.
  ok(read("app/(marketing)/layout.tsx").includes("appOrigin()"),
    "…via appOrigin() in the marketing layout");
  ok(!/https:\/\/app\.price2book\.com/.test(marketingFiles().map(read).join("\n")),
    "…and no marketing component hardcodes it either");

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
  for (const f of marketingFiles()) {
    const src = read(f);
    // Only the copy, not the comments — prose about the code is not the site.
    const strings = src.match(/"[^"\n]{4,}"|'[^'\n]{4,}'|`[^`]{4,}`/g) ?? [];
    const hit = strings.find((t) => BRITISH.test(t));
    ok(!hit, `${f} uses US spelling`, hit?.slice(0, 80) ?? "");
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
    .join("\n")
    // A bare quoted percentage is a CSS length — width: "100%" in the OG
    // image — not an invented statistic. Real prose says "40% fewer calls"
    // unquoted, and that still trips.
    .replace(/["'`]\d+%["'`]/g, "");
  const fab = copyOnly.match(FABRICATED);
  ok(!fab, "no invented result or adoption figure",
    `POSITIONING.md forbids invented proof until a pilot supplies real ones: ${fab?.[0] ?? ""}`);
  ok(!/\b\d+\s+(residential\s+)?electrical services\b/i.test(pageSrc),
    "no exact service count is advertised",
    'POSITIONING.md requires "Dozens of residential electrical services"');
  ok(pageSrc.includes("Dozens of residential electrical services"), "…the approved phrasing is used");

  console.log("\n  THE CATALOG GRID IS THE TEMPLATE");
  // The grid's whole claim is that it shows the catalog a contractor is
  // actually provisioned from. That only stays true if the template drives it
  // — so a category the template gains, and this map has not been told about,
  // is a silently photo-less tile and a gate failure.
  const template = await import(pathToFileURL(`${process.cwd()}/components/marketing/trades/electricalTemplate.ts`).href)
    .then((m) => m.ELECTRICAL_TEMPLATE).catch(() => null);
  ok(!!template, "the electrical template fixture loads");
  if (template) {
    const images = content.CATEGORY_IMAGES as Record<string, string>;
    const missing = template.categories.filter((c: any) => !images[c.slug]).map((c: any) => c.slug);
    ok(missing.length === 0, `all ${template.categories.length} template categories have a photograph`,
      `no image for: ${missing.join(", ")}`);
    const stale = Object.keys(images).filter((k) => !template.categories.some((c: any) => c.slug === k));
    ok(stale.length === 0, "…and none is mapped that the template no longer has",
      `stale: ${stale.join(", ")}`);
    for (const [slug, src] of Object.entries(images)) {
      ok(existsSync(`public${src}`), `${slug.padEnd(24)} → ${src}`, "mapped but absent from public/");
    }
    // The reason this grid may be published at all: no economics in the
    // capture. Checked as MONEY, not as the word — "resolution": "priced" is a
    // routing label and says nothing about what anything costs.
    const catalogBlob = JSON.stringify(template.categories);
    const priceKeys = /"(basePrice|priceCents|whileWeThereBasePrice|computedPrice[A-Za-z]*|amountCents)"/;
    ok(!/\$\s?\d/.test(catalogBlob) && !priceKeys.test(catalogBlob),
      "the published catalog carries no money",
      "the capture is publishable precisely because it has no economics");
  }

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
  /**
   * NO PRICE IS TYPED BY HAND, ANYWHERE ON THIS PAGE.
   *
   * Generalized from the walkthrough to every marketing component, because the
   * defects keep coming from the same place. Three so far: a header asserting
   * "1 service in your visit" above a cart holding two; a standalone price
   * guessed at $185 that made a captured $115 look wrong; and a suggested /
   * published card still saying $280 after the capture had moved on. Each was
   * a hand-typed claim about product state sitting next to captured ones.
   *
   * Prices belong in heroFlow.ts, which is generated, or in content.ts, which
   * derives from it. A dollar figure in JSX is the bug.
   */
  const priceScanned = [...marketingFiles(), ...marketingRoutes()];
  for (const f of priceScanned) {
    if (!f.endsWith(".tsx")) continue;
    const src = read(f)
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    const hit = src.match(/[>"'\s]\$\d[\d,.]*/);
    ok(!hit, `${f} hardcodes no price`,
      `found ${hit?.[0].trim()} — take it from the capture instead`);
  }

  const walkCode = walk
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
  ok(!/prompt:\s*["']/.test(walkCode) && !/["'>]\s*\$\d{2,}/.test(walkCode),
    "…and hardcodes no question or price of its own",
    "every number and every prompt must come from the fixture");

  console.log("\n  TRADES CLAIM ONLY WHAT SHIPS");
  /**
   * A trade in the navigation is a capability claim, exactly like an
   * integration status — and a stronger one, because a menu item implies a
   * destination. Only a trade with a committed canonical template may have a
   * page, and only a trade with a page may be a link.
   *
   * The strongest half of this is not the assertion below but the routing
   * decision it guards: trade routes are explicit files, not a [trade]
   * segment, so a config value cannot resolve one into existence.
   */
  const trades: ReadonlyArray<{ name: string; status: string; href: string | null }> = content.TRADES;
  ok(trades.length > 0, `${trades.length} trade(s) named`);
  for (const t of trades) {
    if (t.href) {
      const route = `app/(marketing)${t.href}/page.tsx`;
      ok(existsSync(route), `${t.name} is a link and ${route} exists`,
        "a trade may only be clickable when its page is a real file");
      ok(t.status === "Available now", `…and claims "Available now"`,
        `claims "${t.status}" while being clickable`);
    } else {
      ok(t.status !== "Available now", `${t.name} is not a link, and does not claim to be available`,
        "an available trade should have a page; an unavailable one must not be clickable");
    }
  }
  // HVAC belongs in the list — the homepage has to show the breadth — but a
  // link would be a claim there is a product behind it.
  const hvac = trades.find((t) => /hvac/i.test(t.name));
  ok(!hvac || hvac.href === null, "HVAC is named but not clickable",
    "there is no canonical HVAC product behind the claim");
  ok(!existsSync("app/(marketing)/trades/hvac/page.tsx") &&
     !existsSync("app/(marketing)/trades/plumbing/page.tsx"),
    "no trade page exists ahead of its template",
    "freeze first, market second — SITEMAP.md");
  ok(!existsSync("app/(marketing)/trades/[trade]"),
    "trade routes are explicit files, not a dynamic segment",
    "a [trade] segment can resolve an unshipped trade into a public page");

  console.log("\n  SCHEDULING CLAIMS DO NOT OUTRUN THE SCHEDULER");
  /**
   * Crew size is not an input to availability — see
   * docs/debt/crew-size-not-in-availability-2026-09-01.md. techCount appears
   * nowhere in schedulingAvailability, nativeScheduling or jobber, so a
   * two-technician job consumes one job's worth of capacity.
   *
   * The marketing site may say the scheduler accounts for the whole visit, its
   * duration, answer- and quantity-driven duration changes, operating hours
   * and declared capacity — all true today. It may NOT imply that staffing is
   * counted. These phrases have no other use on a marketing page right now, so
   * their presence is the claim.
   *
   * "crew" on its own is deliberately not here: "your crews start at 8" is
   * true and useful, and banning the word would push copy into worse English
   * for no gain.
   */
  const CAPACITY_OVERCLAIM = [
    "technician count", "crew size", "staffing capacity", "crew capacity",
    "number of technicians", "how many technicians", "two technicians\u2019 worth",
    "technicians available", "crew availability",
  ];
  // Comments stripped: EarlyAccess documents its "crew size" FORM FIELD, which
  // asks a contractor how big their business is and has nothing to do with
  // scheduling. Prose about the code is not the site — the same distinction
  // the spelling and price checks make.
  const schedulingCopy = [...marketingFiles(), ...marketingRoutes()]
    .map((f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"))
    .join("\n")
    .toLowerCase();
  for (const phrase of CAPACITY_OVERCLAIM) {
    ok(!schedulingCopy.includes(phrase.toLowerCase()),
      `never claims "${phrase}"`,
      "the native scheduler does not count technicians — docs/debt/crew-size-not-in-availability-2026-09-01.md");
  }

  console.log("\n  VISUAL ASSIST IS NOT MARKETED YET");
  /**
   * There is no homeowner-reachable Visual Assist flow — the implementation is
   * uncommitted and nothing in app/ or components/ reaches it. Photos are
   * COLLECTED today; nothing reads them. So the marketing site may say a
   * customer needs no trade terminology, which is true and shipped, and may
   * not say a photograph is identified, which is not.
   *
   * Naming the feature is included: a section, a nav item or an "In build"
   * card is a claim, and the owner's instruction is that none of them appears
   * until the real flow is reachable and stable enough to capture without
   * staging. Lifting this is a deliberate act, like every other status gate.
   */
  const PHOTO_OVERCLAIM = [
    "visual assist", "identifies what", "identify the equipment", "identifies the equipment",
    "from a photo", "photo identification", "recognizes the equipment", "knows what it is looking at",
    "tell us what it sees", "reads the photo",
  ];
  const marketingCopy = [...marketingFiles(), ...marketingRoutes()]
    .map((f) => read(f).replace(/\/\*[\s\S]*?\*\//g, "").split("\n").filter((l) => !l.trim().startsWith("//")).join("\n"))
    .join("\n")
    .toLowerCase();
  for (const phrase of PHOTO_OVERCLAIM) {
    ok(!marketingCopy.includes(phrase),
      `never claims "${phrase}"`,
      "Visual Assist is not customer-reachable — docs/marketing/POSITIONING.md holds the boundary");
  }

  console.log("\n  PRODUCT PAGES CLAIM ONLY WHAT EXISTS");
  const productPages: ReadonlyArray<{ name: string; href: string | null }> = content.PRODUCT_PAGES;
  for (const p of productPages) {
    if (!p.href) { ok(true, `${p.name} is listed without a link`); continue; }
    ok(existsSync(`app/(marketing)${p.href}/page.tsx`), `${p.name} links to a page that exists`,
      "a menu item implies a destination; build the page or leave it off the list");
  }
  // PriceSight is a design document in another workstream. A nav item for it
  // would be the same defect as a "Connected" integration.
  ok(!productPages.some((p) => /pricesight/i.test(p.name)),
    "PriceSight is not in the product menu",
    "it has not shipped — SITEMAP.md holds it out of navigation");

  console.log("\n  GUIDED ESTIMATES IS A SIBLING, NOT A FALLBACK");
  const gePath = "app/(marketing)/product/guided-estimates/page.tsx";
  const ge = read(gePath);
  ok(existsSync(gePath), "the page exists",
    "PRODUCT_PAGES links to it, so it has to be a real file");

  const geFixture = await import(pathToFileURL(`${process.cwd()}/components/marketing/guidedEstimates.ts`).href)
    .then((m) => m.GUIDED_ESTIMATES).catch(() => null);
  ok(!!geFixture, "the capture fixture exists and parses",
    "run: npx tsx scripts/capture-guided-estimates.ts");

  if (geFixture) {
    ok(geFixture.generatedBy === "scripts/capture-guided-estimates.ts",
      "the fixture is generated, not hand-written",
      "a hand-edited fixture is an invented workflow wearing a number");
    // The page's whole claim. If the product stops having quote-only services
    // that publish no price, the claim stops being true and this fails.
    ok(geFixture.remoteQuote.services > 0 && geFixture.remoteQuote.withoutPublishedPrice > 0,
      `${geFixture.remoteQuote.withoutPublishedPrice} quote-only service(s) publish no price`,
      "the page says a contractor need not display prices — that has to be true in the product");
    // A gating answer is what separates an estimate from a price with photos.
    ok(geFixture.example?.blocksBooking === true,
      "the worked example is an answer that HOLDS the price back",
      "a photosBlockBooking:false answer is instant pricing with a camera, not an estimate");
    ok(geFixture.photos.blocking > 0, `${geFixture.photos.blocking} answers gate on photographs`);
    // No customer data may reach a marketing fixture.
    const raw = JSON.stringify(geFixture);
    ok(!/@|\bphone\b|quotedPriceCents|"url"/i.test(raw),
      "the fixture carries no customer identity, contact or amount",
      "a quote is a real homeowner's job — the capture must not publish it");
  }

  // GUIDED ESTIMATE IS NOT A LESSER MODE. A contractor running entirely on
  // estimates is using the product as designed, and copy implying otherwise
  // is the failure this page exists to prevent.
  const GE_DEMOTION = [
    "fall back to", "falls back to", "fallback", "lesser", "downgrade",
    "if instant pricing isn't", "when instant pricing fails", "second best",
    "consolation", "at least you can still",
  ];
  const geCopy = ge.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n").toLowerCase();
  for (const phrase of GE_DEMOTION) {
    ok(!geCopy.includes(phrase), `Guided Estimates never calls itself "${phrase}"`,
      "it is a sibling of Guided Pricing — SITEMAP.md");
  }

  // The page must not promise remote quoting for everything.
  ok(/not every job/i.test(ge) || /has to be seen/i.test(ge),
    "…and it says out loud that some jobs must be seen in person",
    "without the limit the page overpromises remote quoting");

  // The estimate-trip pillar must stay qualitative. A percentage here would
  // be a fabricated measurement.
  const allMarketing = [...marketingFiles(), ...marketingRoutes()].map(read).join("\n");
  const TRIP_NUMBERS = /(\d{1,3})\s*%\s*(of\s+)?(estimates|trips|truck rolls|visits)/i;
  ok(!TRIP_NUMBERS.test(allMarketing),
    "no percentage claim about estimates eliminated",
    "there is no measurement behind such a number");

  console.log("\n  GUIDED PRICING ARGUES FROM COUNTED EVIDENCE");
  const gp = read("app/(marketing)/product/guided-pricing/page.tsx");
  ok(existsSync("app/(marketing)/product/guided-pricing/page.tsx"), "the page exists");
  // The page's central claim is a measurement. If it were ever typed as a
  // literal it could go stale silently, which is the whole failure this
  // codebase keeps rediscovering.
  ok(gp.includes("T.unsure.total") && gp.includes("T.unsure.pricedAutomatically"),
    "the \u201cI\u2019m not sure\u201d evidence is read from the capture");
  ok(!/\b\d{2,}\s+answers\b/.test(gp.replace(/\/\*[\s\S]*?\*\//g, "")),
    "…and no count is typed into the copy");

  console.log("\n  THE ELECTRICAL TRADE PAGE IS CAPTURED, NOT WRITTEN");
  const tradeFixture = "components/marketing/trades/electricalTemplate.ts";
  ok(existsSync(tradeFixture), "the electrical template fixture exists");
  const et = await import(pathToFileURL(`${process.cwd()}/${tradeFixture}`).href)
    .then((m) => m.ELECTRICAL_TEMPLATE).catch(() => null);
  ok(!!et, "…and it parses");
  if (et) {
    ok(et.generatedBy === "scripts/capture-trade-electrical.ts", "it is generated, not hand-written");
    // The page asserts that saying "I'm not sure" never buys a price. That is
    // the objection it exists to kill, so it is checked rather than trusted.
    ok(et.unsure.total > 0, `${et.unsure.total} "I'm not sure" answers ship in the template`,
      "the escape hatch is the evidence that homeowners are not asked to diagnose");
    ok(et.unsure.pricedAutomatically === 0,
      "…and none of them resolves to a price",
      `${et.unsure.pricedAutomatically} do — the Guided Pricing page's central claim is now false`);
    ok(Object.keys(et.routing).length > 1, "more than one route action is in real use");
    ok(et.categories.length > 0 && et.serviceCount > 0,
      `${et.categories.length} categories, ${et.serviceCount} services`);
    // The counter-example is the honest half of the page and the half a
    // marketer would be tempted to drop. If the catalog ever stops carrying
    // work it refuses to price, the page's central claim is gone.
    ok((et.counts.quoted ?? 0) > 0,
      `${et.counts.quoted} services are never auto-priced`,
      "a trade page showing only priceable work implies everything is priceable");
    ok(et.example?.options?.length > 1 &&
       new Set(et.example.options.map((o: any) => o.routeAction)).size > 1,
      "the Guided Pricing example's answers do different things",
      "a question whose answers all do the same thing proves nothing about routing");
  }
  const tradePage = read("components/marketing/trades/TradePage.tsx");
  ok(!/\bconst [A-Z_]*(SERVICES|CATALOG)\b/.test(tradePage),
    "the trade page keeps no catalog of its own");

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
  const ISLAND = ["components/marketing/StorefrontIsland.tsx", "components/marketing/HeroWalkthrough.tsx"];
  const tenantTokens = /\b(bg|text|border|from|to|via)-(canvas|surface|ink|muted|accent|line|positive|navy|electric|warmwhite|slate|success|charcoal|cardline)\b/;
  for (const f of marketingFiles()) {
    if (ISLAND.includes(f)) continue;
    const src = read(f);
    const hit = src.split("\n").find((l) => tenantTokens.test(l));
    ok(!hit, `${f} uses no contractor-themed token`, hit?.trim().slice(0, 90) ?? "");
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

/**
 * Fetch a route and return its markup plus a tag-stripped reading of it.
 */
async function probe(host: string, path: string) {
  const res = await fetch(`${host}${path}`, {
    redirect: "manual",
    headers: { "user-agent": "price2book-verify" },
  });
  const html = res.status === 200 ? await res.text() : "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/g, " ").replace(/\s+/g, " ");
  return { status: res.status, html, text };
}

async function live(host: string) {
  console.log(`\n  LIVE — ${host}`);

  const home = await probe(host, "/");
  ok(home.status === 200, `/ answers 200`, `status ${home.status}`);
  if (home.status !== 200) return;

  ok(home.text.includes("Your pricing.") && home.text.includes("Your schedule."),
    "the approved headline is served");
  ok(home.text.includes("Request Early Access"), "the primary CTA is served");
  ok(/\/sign-in/.test(home.html), "a sign-in link is served");

  // THE STATUS TABLE MOVED. The 1 September restructure gave the integration
  // claims their own page, so probing "/" for them asserted the old shape of
  // the site rather than the truth of the claims — and would have gone on
  // passing while "Coming Soon" turned into "Connected" on the page that
  // actually says it. The evidence is fetched from where the claims live.
  const integrations = await probe(host, "/integrations");
  ok(integrations.status === 200, `/integrations answers 200`, `status ${integrations.status}`);
  if (integrations.status !== 200) return;

  for (const [name, status] of Object.entries(TRUTH)) {
    ok(integrations.text.includes(name), `names ${name}`);
    ok(integrations.text.includes(status), `…shows "${status}" somewhere`);
  }

  // "Coming Soon" must stay an intention. A date, or a promise that it is
  // scheduled for this contractor, is the overclaim this page exists to avoid.
  ok(integrations.text.includes("It is not a date"),
    'the "Coming Soon" disclaimer is served',
    "a planned integration reads as a commitment without it");

  // Forbidden on BOTH surfaces: the homepage still names platforms (in the
  // early-access form), so neither page may assert a connection.
  ok(!/\bConnected\b/.test(home.text),
    'the word "Connected" appears nowhere on the homepage');
  ok(!/\bConnected\b/.test(integrations.text),
    'the word "Connected" appears nowhere on /integrations');
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
