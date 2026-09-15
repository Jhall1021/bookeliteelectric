import { chromium } from "playwright";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const BASE = arg("base") ?? "http://localhost:3000";
const SITE = arg("site") ?? "elite-electric";
const URL = `${BASE}/${SITE}/dev-fixtures/route-assist-demo`;

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok" : "FAIL"} — ${label}${condition || !detail ? "" : `: ${detail}`}`);
  if (!condition) failures++;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  page.on("pageerror", (error) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${error.message}`);
  });

  console.log("\n1. Open homeowner Route Assist demo");
  await page.goto(URL);
  await page.waitForSelector('[data-testid="route-assist-homeowner-demo"]');
  const setup = await page.locator("main").innerText();
  check("demo introduces Route Assist", setup.includes("Route Assist"));
  check("demo identifies A as existing outlet", setup.includes("Existing outlet"));
  check("demo identifies B as new outlet location", setup.includes("New outlet location"));

  console.log("\n2. Run simulated room scan");
  await page.click('button:has-text("Scan route between A and B")');
  await page.waitForSelector('[data-testid="route-assist-scan-review"]');
  const review = page.locator('[data-testid="route-assist-scan-review"]');
  const reviewText = await review.innerText();
  check("review shows exact 14.625 ft route", reviewText.includes("14.625 ft"), reviewText);

  const checkboxes = review.locator('input[type="checkbox"]');
  const count = await checkboxes.count();
  let checked = 0;
  let enabled = 0;
  for (let i = 0; i < count; i++) {
    const checkbox = checkboxes.nth(i);
    if (await checkbox.isChecked()) checked++;
    if (await checkbox.isEnabled()) enabled++;
  }
  check("scan facts start unapproved", checked === 0, String(checked));
  check("demo exposes applicable route facts for review", enabled >= 5, String(enabled));

  console.log("\n3. Approve the applicable observations");
  for (let i = 0; i < count; i++) {
    const checkbox = checkboxes.nth(i);
    if (await checkbox.isEnabled()) await checkbox.check();
  }
  await review.locator('button:has-text("Apply selected facts to route")').click();
  await page.waitForSelector('[data-testid="route-assist-demo-confirm"]');
  const confirmation = await page.locator('[data-testid="route-assist-demo-confirm"]').innerText();
  check("confirmation preserves exact measured footage", confirmation.includes("14.625 ft"), confirmation);
  check("homeowner has a rescan escape before confirmation", confirmation.includes("Rescan"));

  console.log("\n4. Confirm route");
  await page.click('button:has-text("Confirm route")');
  await page.waitForSelector('[data-testid="route-assist-demo-done"]');
  const done = await page.locator('[data-testid="route-assist-demo-done"]').innerText();
  check("demo reaches Route added state", done.includes("Route added"), done);
  check("final route stays 14.625 ft", done.includes("14.625 ft"), done);
  check("final route exposes one flat turn", done.includes("Flat turns") && /Flat turns\s*1/.test(done), done);
  check("demo still states no production pricing/material side effect", done.includes("no pricing, materials, booking, or production data is changed"), done);

  await browser.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
