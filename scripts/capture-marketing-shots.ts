/**
 * Capture the product screenshots used on the marketing homepage — ADR-020.
 *
 * Repeatable on purpose. Screenshots go stale, and a stale screenshot on a
 * marketing site is a claim that has quietly stopped being true; regenerating
 * them has to be one command rather than an afternoon of manual cropping.
 *
 * It only ever photographs the demonstration contractor from
 * scripts/demo-contractor.ts. It refuses to run against any other tenant —
 * see assertDemoOnly below, which is the difference between a rule and a
 * habit.
 *
 *   npx tsx scripts/demo-contractor.ts --create
 *   npx tsx scripts/demo-contractor.ts --sign-in-url            # paste below
 *   npx tsx scripts/capture-marketing-shots.ts --out public/marketing \
 *     --sign-in "<url>"
 */
import { chromium, type Page } from "playwright";
import { mkdirSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { DEMO } from "./demo-contractor";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const BASE = arg("base") ?? "http://localhost:3000";
const OUT = arg("out") ?? "public/marketing";
const SIGN_IN = arg("sign-in");

const VIEWPORT = { width: 1440, height: 900 };

type Shot = {
  name: string;
  path: string;
  height?: number;
  /**
   * Scroll the heading containing this text to the top before capturing.
   * Some surfaces put the interesting part well below the fold — the Guided
   * Pricing editor sits under a long pricing form — and a screenshot of the
   * top of that page shows a different feature from the one it is labeled.
   */
  /**
   * Capture width in CSS px, defaulting to the full viewport.
   *
   * THE 1040 CROP IS GONE for the admin surfaces. It was written when these
   * sat in quarter-width module tiles; What You Control now shows them at
   * 58vw, and the September portal redesign added a fixed ~245px sidebar that
   * the crop could not pay for. The result cut sentences mid-word at the right
   * edge — "jobs too long to finish before t", "you don't have t" — which
   * reads as a broken screenshot rather than a cropped one. A full-viewport
   * capture downsamples to roughly 835px on the page and stays legible.
   *
   * The module tiles are a quarter of a 1440px grid, so a full-width capture
   * lands in them at roughly one fifth scale and every label turns to texture.
   * Cropping to the left of the screen instead keeps the same real screenshot
   * legible at tile size.
   */
  width?: number;
  anchor?: string;
  /**
   * A control to press before the shutter opens, matched by its text.
   *
   * The service workspace keeps its four panes in the DOM and shows one, so a
   * heading anchor can match a pane that is not on screen — which is how the
   * first capture of the rebuilt editor produced a photograph of the Overview
   * tab captioned as the question editor. Pressing the tab is the difference
   * between "this heading exists" and "this is what a contractor sees".
   */
  click?: string;
  /**
   * Why this surface is NOT photographed for the marketing site. Recorded
   * here rather than by silently omitting the entry: "we have no screenshot
   * of Photo Review" is a fact with a reason, and the reason is the thing
   * that will change.
   */
  notReady?: string;
};

const SHOTS: Shot[] = [
  { name: "storefront", path: `/${DEMO.slug}/services/tv-media`, height: 760 },
  { name: "services-pricing", path: "/dashboard/services", height: 900 },
  { name: "storefront-design", path: "/dashboard/design", height: 900 },
  { name: "hours-availability", path: "/dashboard/business-hours", height: 900 },
  { name: "service-area", path: "/dashboard/service-area", height: 900 },
  {
    name: "crew-eligibility", width: 1040, path: "/dashboard/jobber/crews", height: 620,
    notReady: "empty until a Jobber account is connected and crews are synced — the demo tenant has neither",
  },
  { name: "integrations", path: "/dashboard/jobber", height: 900 },
  {
    name: "photo-review", width: 1040, path: "/dashboard/quotes", height: 620,
    notReady: "an empty queue; photographing it would need fabricated customer submissions",
  },
  {
    name: "overview", width: 1040, path: "/dashboard", height: 620,
    notReady: "no slot on the homepage — the control-panel grid names modules, not the dashboard root",
  },
];

/**
 * A screenshot is a publication, and a publication cannot be taken back.
 *
 * This asserts the page being photographed belongs to the demo contractor
 * before the shutter opens. Without it, a stale sign-in cookie or a mistyped
 * slug is all it takes to publish a real contractor's customers, prices and
 * bookings on the public homepage — and nothing downstream would notice,
 * because the image would look exactly as intended.
 */
async function assertDemoOnly(page: Page, where: string) {
  const text = await page.evaluate(() => document.body.innerText);
  if (!text.toLowerCase().includes(DEMO.shortName.toLowerCase())) {
    throw new Error(
      `REFUSING to capture ${where}: the page does not name "${DEMO.name}". ` +
        `Only the demonstration contractor may appear in marketing screenshots.`,
    );
  }
  for (const forbidden of ["Elite Electric", "Elite Electric & Lighting"]) {
    if (text.includes(forbidden)) {
      throw new Error(`REFUSING to capture ${where}: it contains "${forbidden}".`);
    }
  }
}

/**
 * The Guided Pricing editor is addressed by service id, not slug, so the shot
 * has to be resolved rather than hardcoded — a pasted id would rot the first
 * time the demo tenant is rebuilt.
 */
async function guidedPricingPath(): Promise<string | null> {
  const db = new PrismaClient();
  try {
    const svc = await db.service.findFirst({
      where: { contractor: { slug: DEMO.slug }, questions: { some: {} }, active: true },
      orderBy: { questions: { _count: "desc" } },
      select: { id: true, name: true },
    });
    if (!svc) return null;
    console.log(`  guided pricing shot -> "${svc.name}"`);
    return `/dashboard/services/${svc.id}`;
  } finally {
    await db.$disconnect();
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });

  const guided = await guidedPricingPath();
  // THE ANCHOR FOLLOWS THE PRODUCT. The service editor was rebuilt in the
  // September workspace redesign — TreeEditor became GuidedPricingWorkspace —
  // and the screen no longer carries a "Guided Pricing" heading. The anchor
  // said so by refusing to shoot, which is the behavior working: it did not
  // photograph whatever happened to be on screen. "Customer questions" is the
  // rebuilt workspace's own heading.
  if (guided) SHOTS.splice(2, 0, { name: "guided-pricing", path: guided, height: 900, click: "Customer questions", anchor: "Customer questions" });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const page = await ctx.newPage();

  if (SIGN_IN) {
    await page.goto(SIGN_IN, { waitUntil: "networkidle" });
    console.log(`  signed in -> ${page.url()}`);
  }

  for (const shot of SHOTS) {
    if (shot.notReady && !process.argv.includes("--all")) {
      console.log(`  - ${shot.name}: not published — ${shot.notReady}`);
      continue;
    }
    const url = `${BASE}${shot.path}`;
    const res = await page.goto(url, { waitUntil: "networkidle" });
    if (!res || res.status() >= 400) {
      console.log(`  ! ${shot.name}: ${res?.status() ?? "no response"} at ${shot.path} — skipped`);
      continue;
    }
    if (shot.click) {
      const pressed = await page.evaluate((text) => {
        const el = [...document.querySelectorAll("button,[role='tab'],a")]
          .find((e) => e.textContent?.trim() === text) as HTMLElement | undefined;
        if (!el) return false;
        el.click();
        return true;
      }, shot.click);
      if (!pressed) {
        console.log(`  ! ${shot.name}: no control labeled "${shot.click}" — skipped`);
        continue;
      }
      await page.waitForTimeout(400);
    }
    if (shot.anchor) {
      // VISIBLY RENDERED, not merely present. Matching any heading in the DOM
      // is what let the rebuilt service workspace be photographed on the wrong
      // tab: it keeps all four panes mounted and shows one, so the anchor found
      // a heading nobody could see and reported success. The click above fixes
      // today's screenshot; this is what keeps it fixed. If the tab interaction
      // ever stops working, no VISIBLE heading matches and the capture refuses
      // instead of quietly photographing whatever pane happens to be open.
      // The predicate is inline rather than a named const on purpose: tsx keeps
      // function names, and a NAMED function inside page.evaluate ships a
      // `__name(...)` call into a browser that has no such helper — the whole
      // capture dies with "__name is not defined" after the first shot.
      const found = await page.evaluate((text) => {
        const h = [...document.querySelectorAll("h1,h2,h3")]
          .filter((e) => e.textContent?.includes(text))
          .find((e) => {
            if (e.getClientRects().length === 0) return false;    // display:none, here or above
            const cs = getComputedStyle(e);
            if (cs.visibility === "hidden" || cs.visibility === "collapse") return false;
            if (Number(cs.opacity) === 0) return false;
            const r = e.getBoundingClientRect();
            return r.width > 0 && r.height > 0;
          });
        if (!h) return false;
        window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 24);
        return true;
      }, shot.anchor);
      if (!found) {
        console.log(`  ! ${shot.name}: no VISIBLE heading matching "${shot.anchor}" — skipped`);
        continue;
      }
    }
    await page.waitForTimeout(500);
    await assertDemoOnly(page, shot.name);
    await page.screenshot({
      path: `${OUT}/${shot.name}.png`,
      clip: { x: 0, y: 0, width: shot.width ?? VIEWPORT.width, height: shot.height ?? VIEWPORT.height },
    });
    console.log(`  ${shot.name}.png  <-  ${shot.path}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
