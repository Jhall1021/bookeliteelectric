import { chromium } from "playwright";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const BASE = arg("base") ?? "http://localhost:3000";
const SITE = arg("site") ?? "elite-electric";
const URL = `${BASE}/${SITE}/dev-fixtures/route-assist-scan`;

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok" : "FAIL"} — ${label}${condition || !detail ? "" : `: ${detail}`}`);
  if (!condition) failures++;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${error.message}`);
  });

  console.log("\n1. Open isolated room-scan preview");
  await page.goto(URL);
  await page.waitForSelector('[data-testid="route-assist-scan-preview"]');
  const initial = await page.locator("main").innerText();
  check("fixture identifies itself as development-only", initial.includes("Development fixture"), initial.slice(0, 300));
  check("fixture states pricing/materials/production are untouched", initial.includes("Nothing below changes pricing, materials, or production data."));

  console.log("\n2. Run fake scan and inspect review state");
  await page.click('button:has-text("Run fake room scan")');
  await page.waitForSelector('text=Review what the scan observed');

  const checkboxes = page.locator('input[type="checkbox"]');
  const checkboxCount = await checkboxes.count();
  check("scan produced reviewable facts", checkboxCount >= 5, String(checkboxCount));

  let checkedInitially = 0;
  for (let i = 0; i < checkboxCount; i++) {
    if (await checkboxes.nth(i).isChecked()) checkedInitially++;
  }
  check("no scan fact is accepted by default", checkedInitially === 0, String(checkedInitially));

  const reviewText = await page.locator("main").innerText();
  check("review displays exact unrounded 14.625 ft total", reviewText.includes("14.625 ft"), reviewText.slice(0, 800));

  console.log("\n3. Explicitly accept every applicable fact");
  let enabledCount = 0;
  for (let i = 0; i < checkboxCount; i++) {
    const checkbox = checkboxes.nth(i);
    if (await checkbox.isEnabled()) {
      enabledCount++;
      await checkbox.check();
    }
  }
  check("at least the two lengths, two surfaces and one physical turn are applicable", enabledCount >= 5, String(enabledCount));

  await page.click('button:has-text("Apply selected facts to preview route")');
  await page.waitForSelector('text=Accepted Route Assist graph');
  const acceptedText = await page.locator("main").innerText();
  check("accepted graph still shows exact scan review total", acceptedText.includes("14.625 ft"), acceptedText.slice(-1200));
  check(
    "current RouteAssistResult visibly exposes the tenth-foot aggregation gate",
    acceptedText.includes("14.6 ft"),
    acceptedText.slice(-1200),
  );

  console.log("\n4. Confirm route and inspect canonical Routing V2 observations");
  await page.click('button:has-text("Confirm this preview route")');
  await page.waitForSelector('[data-testid="routing-v2-observations"]');
  const mappedText = await page.locator('[data-testid="routing-v2-observations"]').innerText();
  let mapped: Record<string, unknown> | null = null;
  try {
    mapped = JSON.parse(mappedText);
  } catch {
    check("Routing V2 observations render valid JSON", false, mappedText);
  }

  if (mapped) {
    check("confirmed install method is surface", mapped.installMethod === "surface", mappedText);
    check("current routed footage is 14.6 pending precision gate", mapped.routeLengthFt === 14.6, mappedText);
    check("explicit physical turn becomes one flat fitting fact", mapped.flatCorners === 1, mappedText);
    check("inside fitting count is exact zero", mapped.insideCorners === 0, mappedText);
    check("outside fitting count is exact zero", mapped.outsideCorners === 0, mappedText);
    check("route is explicitly customer-confirmed before canonical use", mapped.customerConfirmedRoute === true, mappedText);
  }

  await browser.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
