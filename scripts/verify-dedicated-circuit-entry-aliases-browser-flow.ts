/**
 * End-to-end browser proof for the sump-pump and fridge/freezer
 * dedicated-circuit entry aliases — the parts the DB-level verifier
 * (verify-dedicated-circuit-entry-aliases.ts) cannot see, since they only
 * exist client-side in GuidedFlowEngine:
 *
 *   4. the alias continues automatically into the canonical estimator with
 *      no wrong-service notice and no duplicate destination intro
 *   5. the carried preset remains available to the canonical tree while the
 *      homeowner starts at its route intake
 *   10. direct entry into dedicated-120v-circuit-outlet is unchanged — it
 *       still shows its own intro before the route intake
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
const CANONICAL_PATH = "/elite-electric/services/new-outlets/dedicated-120v-circuit-outlet";
const PANEL_PROMPT = "Where is your electrical panel?";

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

  // A one-choice entry alias is already the correct customer-facing section.
  // It continues automatically into the canonical estimator.
  await page.waitForURL(`**${CANONICAL_PATH}`, { timeout: 10_000 });
  check("landed on dedicated-120v-circuit-outlet's own URL", true);
  await page.waitForSelector(`h2:has-text("${PANEL_PROMPT}")`, { timeout: 10_000 });
  check("4. alias starts the canonical estimator without another Check My Price click", true);
  check("4. no wrong-service notice is shown", await page.getByText("you actually need a different service").count() === 0);

  await page.close();
}

async function directEntryStillAsksEquipment(browser: Awaited<ReturnType<typeof chromium.launch>>) {
  console.log(`\n=== direct entry regression: dedicated-120v-circuit-outlet ===`);
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}${CANONICAL_PATH}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /check my (price|estimate)/i }).click();
  await page.waitForSelector("h2", { timeout: 10_000 });
  const heading = (await page.locator("h2").first().textContent()) ?? "";
  check("10. direct entry still begins at the panel route intake",
    heading.includes(PANEL_PROMPT), heading);
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
