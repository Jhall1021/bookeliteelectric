import { chromium } from "playwright";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const BASE = arg("base") ?? "http://localhost:3000";
const URL = `${BASE}/dev-fixtures/route-assist-multi-outlet`;

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok" : "FAIL"} — ${label}${condition || !detail ? "" : `: ${detail}`}`);
  if (!condition) failures++;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });

  await page.goto(URL);
  await page.waitForSelector('[data-testid="route-assist-multi-outlet-demo"]');
  const room = page.locator('[data-testid="route-assist-multi-room"]');
  const box = await room.boundingBox();
  if (!box) throw new Error("room did not render");

  await room.click({ position: { x: box.width * 0.16, y: box.height * 0.58 } });
  await room.click({ position: { x: box.width * 0.78, y: box.height * 0.58 } });
  check("A and B render", await page.locator('[data-endpoint-label="A"]').count() === 1 && await page.locator('[data-endpoint-label="B"]').count() === 1);
  check("first leg exists", await page.locator('[data-route-leg="outlet-leg-1"]').count() === 1);

  await page.click('button:has-text("+ Add another outlet")');
  await room.click({ position: { x: box.width * 0.86, y: box.height * 0.42 } });
  check("C renders after adding another outlet", await page.locator('[data-endpoint-label="C"]').count() === 1);
  const summary = await page.locator('[data-testid="route-assist-leg-summary"]').innerText();
  check("summary shows A to B", summary.includes("A → B"), summary);
  check("summary shows B to C", summary.includes("B → C"), summary);
  check("two independent legs render", await page.locator('[data-route-leg]').count() === 2);

  const paths = page.locator('[data-route-leg]');
  const firstPoints = await paths.nth(0).getAttribute("points");
  const secondPoints = await paths.nth(1).getAttribute("points");
  check("first leg contains doorway bypass waypoints", (firstPoints?.trim().split(/\s+/).length ?? 0) === 6, String(firstPoints));
  check("later leg stays independent/straight", (secondPoints?.trim().split(/\s+/).length ?? 0) === 2, String(secondPoints));

  const removeButtons = page.locator('button:has-text("Remove")');
  await removeButtons.nth(0).click();
  const listText = await page.locator('[data-testid="route-assist-outlet-list"]').innerText();
  check("remaining outlet is relabeled B after removal", listText.includes("B · Outlet 1") && !listText.includes("C · Outlet 2"), listText);

  await browser.close();
  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
