/**
 * End-to-end browser proof for the sump-pump and fridge/freezer
 * dedicated-circuit entry aliases — the parts the DB-level verifier
 * (verify-dedicated-circuit-entry-aliases.ts) cannot see, since they only
 * exist client-side in GuidedFlowEngine:
 *
 *   4. the dedicated_equipment question is genuinely SKIPPED after a reroute
 *      carries the preset answer — the next screen shown is
 *      dedicated_route_access, not dedicated_equipment again
 *   5. the remaining canonical questions behave completely normally after
 *      the skip (same terminal every real customer reaches)
 *   10. direct entry into dedicated-120v-circuit-outlet is UNCHANGED — a
 *      customer who goes there directly still sees dedicated_equipment as
 *      the first question, proving nothing global was altered
 *
 * Same tool and style as the rest of this repo's browser-level scripts: raw
 * `playwright` via `tsx`, no test-runner framework.
 *
 *   npx tsx scripts/verify-dedicated-circuit-entry-aliases-browser-flow.ts --base http://localhost:3517
 */
import { chromium } from "playwright";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
const BASE = arg("base") ?? "http://localhost:3000";

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? "ok" : "FAIL"} — ${name}${!cond && detail ? `: ${detail}` : ""}`);
  if (!cond) failures++;
}

const ALIASES = [
  { slug: "sump-pump-dedicated-circuit", name: "Sump Pump Dedicated Circuit", prompt: "Add a dedicated circuit for your sump pump?" },
  { slug: "freezer-fridge-dedicated-circuit", name: "Freezer / Refrigerator Dedicated Circuit", prompt: "Add a dedicated circuit for your refrigerator or freezer?" },
];
const CANONICAL_PATH = "/elite-electric/services/dedicated-circuits/dedicated-120v-circuit-outlet";
const CANONICAL_EQUIPMENT_PROMPT = "What will this dedicated circuit power?";
const CANONICAL_ROUTE_ACCESS_PROMPT = "Can we reach the wiring path";

async function runAliasFlow(browser: Awaited<ReturnType<typeof chromium.launch>>, alias: (typeof ALIASES)[number]) {
  const page = await (await browser.newContext()).newPage();
  console.log(`\n=== ${alias.slug} ===`);

  await page.goto(`${BASE}/elite-electric/services/dedicated-circuits/${alias.slug}`, { waitUntil: "networkidle" });

  // 1 (browser-rendered half). Discoverable and shows its own identity.
  await check1(page, `1. alias intro renders its own name`, alias.name);

  await page.getByRole("button", { name: /check my (price|estimate)/i }).click();

  // The tiny one-question, one-click alias step.
  await page.waitForSelector(`h2:has-text("${alias.prompt}")`, { timeout: 10_000 });
  check("2. alias's own tiny question is shown", true);
  await page.getByRole("button", { name: "Yes, continue" }).click();

  // RerouteNotice.
  await page.waitForSelector('text=Based on your answer, you actually need a different service', { timeout: 10_000 });
  check("2. reroute notice appears, pointing at the canonical service", true);
  const continueBtn = page.getByRole("button", { name: /Continue to/ });
  await continueBtn.waitFor({ timeout: 10_000 });
  const continueLabel = await continueBtn.textContent();
  check("   ...naming Dedicated Circuit & Outlet", (continueLabel ?? "").includes("Dedicated Circuit"), continueLabel ?? "");
  await continueBtn.click();

  // Landed on the canonical service's OWN intro screen.
  await page.waitForURL(`**${CANONICAL_PATH}`, { timeout: 10_000 });
  check("landed on dedicated-120v-circuit-outlet's own URL", true);
  await page.getByRole("button", { name: /check my (price|estimate)/i }).click();

  // 4. THE CRITICAL CHECK: dedicated_equipment must NOT be asked again.
  // The next screen must be dedicated_route_access directly.
  await page.waitForSelector("h2", { timeout: 10_000 });
  const firstHeading = (await page.locator("h2").first().textContent()) ?? "";
  check("4. dedicated_equipment question is SKIPPED (preset carried in)", !firstHeading.includes(CANONICAL_EQUIPMENT_PROMPT), firstHeading);
  check("4. the customer instead lands directly on dedicated_route_access", firstHeading.includes(CANONICAL_ROUTE_ACCESS_PROMPT), firstHeading);

  // 5. Remaining canonical questions behave normally — walk the rest exactly
  // as any real customer would.
  await page.getByRole("button", { name: /unfinished basement/i }).first().click();
  await page.waitForSelector("h2:has-text(\"About how far\")", { timeout: 10_000 });
  check("5. dedicated_distance asked normally", true);
  await page.getByRole("button", { name: /25 feet or less/i }).click();
  await page.waitForSelector("h2:has-text(\"Where is your electrical panel\")", { timeout: 10_000 });
  check("5. dedicated_panel_location asked normally", true);
  await page.getByRole("button", { name: /unfinished basement/i }).first().click();
  await page.waitForSelector("h2:has-text(\"One quick note about access openings\")", { timeout: 10_000 });
  check("5. dedicated_finish_ack asked normally", true);
  await page.getByRole("button", { name: /give me my price/i }).click();

  // Terminal: dedicated_finish_ack's "accepted" answer has
  // photosBlockBooking=false, so the price is already locked and photos are
  // prep, not a gate — the same terminal a direct customer reaches.
  await page.waitForSelector('h2:has-text("One last thing before you schedule")', { timeout: 10_000 });
  check("reached the canonical tree's normal terminal (price locked in, photos as prep)", true);

  await page.close();
}

async function directEntryStillAsksEquipment(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  console.log(`\n=== direct entry regression: dedicated-120v-circuit-outlet ===`);
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}${CANONICAL_PATH}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /check my (price|estimate)/i }).click();
  await page.waitForSelector("h2", { timeout: 10_000 });
  const heading = (await page.locator("h2").first().textContent()) ?? "";
  check("10. direct entry still asks dedicated_equipment first (no global auto-skip introduced)",
    heading.includes(CANONICAL_EQUIPMENT_PROMPT), heading);
  await page.close();
}

async function check1(page: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>["newPage"]>>, label: string, expectedName: string) {
  await page.waitForSelector("h1", { timeout: 10_000 });
  const h1 = (await page.locator("h1").first().textContent()) ?? "";
  check(label, h1.includes(expectedName), h1);
}

async function main() {
  const browser = await chromium.launch();
  console.log(`\nDEDICATED CIRCUIT ENTRY ALIASES — browser flow (${BASE})\n`);
  try {
    for (const alias of ALIASES) await runAliasFlow(browser, alias);
    await directEntryStillAsksEquipment(browser);
  } finally {
    await browser.close();
  }
  console.log(`\n  ${failures === 0 ? "all checks passed" : `${failures} check(s) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
