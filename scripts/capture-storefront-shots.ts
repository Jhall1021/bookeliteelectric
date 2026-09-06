/**
 * The homeowner's side of the product, photographed from the running product.
 *
 * WHY THIS EXISTS, AND WHY IT BREAKS AN OLD RULE ON PURPOSE.
 *
 * components/marketing/shots.ts used to say marketing screenshots may only
 * ever come from a demonstration tenant, never a real contractor. That rule
 * was right about the risk — a screenshot is a publication and cannot be
 * un-published — but it had a cost nobody had priced: the demonstration
 * tenant does not currently exist, capturing the admin side needs an
 * authenticated session, and the homepage was left explaining the product in
 * prose while the real screens sat unused.
 *
 * The owner lifted the rule on 2 September 2026, in a specific and narrow
 * way: use the REAL storefront, and change the contractor's NAME. Nothing
 * else. Not the layout, not the flow, not the prices, not the questions.
 *
 * SO THE ONLY TRANSFORMATION HERE IS IDENTITY, and it is enforced rather than
 * trusted. Every capture runs `rename()` first and `assertRenamed()` after,
 * and the script throws rather than writing a file if any spelling of the
 * source tenant survives into the image. A screenshot that leaked the real
 * name would be exactly the publication the old rule existed to prevent.
 *
 * WHAT IS NOT TOUCHED. Prices, service names, question wording, photography
 * and layout are the product's. If a price looks wrong in a shot, the fix is
 * in the catalog, not here.
 *
 * The storefront is public, so this needs no session and reads nothing
 * private — there is no customer data on these screens to sanitize.
 *
 *   npx tsx scripts/capture-storefront-shots.ts
 *   npx tsx scripts/capture-storefront-shots.ts --base http://localhost:3000
 */
import { chromium, type Page } from "playwright";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

const BASE = arg("base") ?? "https://price2book.com";
const SITE = arg("site") ?? "elite-electric";
/** The portal is a different origin from the storefront — ADR-019. */
const ADMIN_BASE = arg("admin-base") ?? "https://app.price2book.com";
const OUT = "public/marketing";
const VIEWPORT = { width: 1280, height: 860 };

/**
 * The one neutral identity, used across every marketing screenshot so the
 * homeowner shots and the admin shots show the same company. It matches the
 * demonstration tenant the admin captures already carry.
 */
const BRAND = "Voltmark Electric";

/** Every spelling of the source tenant that must not survive into an image. */
const SOURCE_NAMES = [
  "Elite Electric & Lighting",
  "Elite Electric and Lighting",
  "Elite Electric",
  "Why Elite",
  "Elite",
];

/**
 * Swap the identity in the rendered DOM.
 *
 * Text nodes only, plus the logo. Deliberately not a string replace over
 * innerHTML: that would rewrite attributes and class names and could change
 * what the page renders, which is the one thing this must not do.
 */
async function rename(page: Page, brand: string, sources: string[]) {
  await page.evaluate(
    ({ brand, sources }) => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      for (const n of nodes) {
        let v = n.nodeValue ?? "";
        for (const s of sources) {
          if (!v.includes(s)) continue;
          // "Why Elite" is a nav label, not a company name: keep the sentence
          // shape the product uses rather than producing "Why Voltmark
          // Electric", which no storefront would ever render.
          v = s === "Why Elite" ? v.split(s).join("Why Us") : v.split(s).join(brand);
        }
        if (v !== (n.nodeValue ?? "")) n.nodeValue = v;
      }
      // THE NAME IS NOT THE ONLY IDENTITY ON THE PAGE. The first run of this
      // script renamed the company and published a screenshot whose footer
      // still carried the source tenant's street address, telephone number
      // and state license number — under the substituted brand, which is
      // worse than leaving the real name on it: it attributes a real
      // business's contact details to a company that does not exist.
      const scrub: [RegExp, string][] = [
        [/\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g, "(555) 555-0100"],
        [/\b\d{2,6}\s+[A-Z][A-Za-z.]*(?:\s+[A-Z][A-Za-z.]*)*\s+(?:Ave|Avenue|St|Street|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Way|Ct|Court)\.?\b/g, "120 Example Ave."],
        [/\b[A-Z][a-z]+,\s*[A-Z]{2}\s+\d{5}\b/g, "Springfield, NJ 07000"],
        [/(Licen[cs]e\s*#?\s*)\d+/gi, "$1000000"],
        // THE ADMIN SURFACE CARRIES OTHER PEOPLE'S DATA. The storefront is
        // public and has none, but a review queue lists the homeowners who
        // asked for a price — their names, e-mail addresses and telephone
        // numbers. Those belong to neither Price2Book nor the contractor.
        [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "customer@example.com"],
        // The storefront slug is the tenant's identity in URL form, and the
        // membership chooser prints it under the name.
        [/elite-electric/g, "voltmark-electric"],
      ];
      const walk2 = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const more: Text[] = [];
      while (walk2.nextNode()) more.push(walk2.currentNode as Text);
      for (const n of more) {
        let v = n.nodeValue ?? "";
        for (const [re, to] of scrub) v = v.replace(re, to);
        if (v !== (n.nodeValue ?? "")) n.nodeValue = v;
      }

      // The logo is the contractor's mark. Replace it with the same wordmark
      // the rest of the page now shows rather than leaving a real brand in an
      // image, and rather than inventing a logo the product cannot render.
      document.querySelectorAll("img").forEach((img) => {
        const alt = (img.getAttribute("alt") ?? "").toLowerCase();
        const src = (img.getAttribute("src") ?? "").toLowerCase();
        if (alt.includes("elite") || src.includes("elite") || alt.includes("logo")) {
          const span = document.createElement("span");
          span.textContent = brand;
          span.style.cssText =
            "font-weight:700;font-size:19px;letter-spacing:-.01em;color:#14181f;white-space:nowrap";
          img.replaceWith(span);
        }
      });
    },
    { brand, sources },
  );
}

/** Refuse to write the file if the identity swap missed anything. */
async function assertRenamed(page: Page, where: string, sources: string[]) {
  const text = await page.evaluate(() => document.body.innerText);
  // A leaked e-mail address is the failure mode the scrubber exists for, so
  // it is asserted rather than assumed.
  const stray = text.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)
    ?.filter((e) => !e.includes("example.com") && !e.includes("price2book.com"));
  if (stray?.length) {
    throw new Error(`REFUSING to write ${where}: it still shows ${stray[0]}.`);
  }
  for (const s of sources) {
    if (text.includes(s)) {
      throw new Error(
        `REFUSING to write ${where}: the rendered page still contains "${s}". ` +
          `A marketing screenshot must not publish the source tenant's identity.`,
      );
    }
  }
}

type Shot = {
  name: string;
  /** Drive the page into the state worth photographing. */
  reach: (page: Page) => Promise<boolean>;
  /**
   * TWO IMAGES PER SCREEN, and they do different jobs.
   *
   * The THUMBNAIL is a tight window on the subject — at three-across a full
   * page is unreadable, so the crop is what makes it legible small. `y` and
   * `height` frame it.
   *
   * The FULL image is the whole page, uncropped, and is what opens when the
   * thumbnail is clicked. Cropping the thing someone clicked *to see more of*
   * is the wrong way round, which is what the single-image version did.
   */
  x?: number;
  width?: number;
  y?: number;
  height?: number;
  /** Admin screens need a session; skipped unless --sign-in is given. */
  needsAuth?: boolean;
};

/** Click a button or link whose visible text contains `text`. */
async function click(page: Page, text: string, timeout = 8000) {
  const el = page.locator(`button:has-text("${text}"), a:has-text("${text}")`).first();
  try {
    await el.waitFor({ state: "visible", timeout });
  } catch {
    return false;
  }
  await el.click();
  await page.waitForTimeout(900);
  return true;
}

const SHOTS: Shot[] = [
  {
    // What a homeowner lands on: the contractor's own catalog, browsable.
    name: "home-services",
    x: 200,
    width: 700,
    y: 175,
    height: 440,
    reach: async (page) => {
      await page.goto(`${BASE}/${SITE}/services`, { waitUntil: "networkidle" });
      return true;
    },
  },
  {
    // The questions that decide the job — the heart of Guided Pricing.
    name: "home-question",
    x: 250,
    width: 780,
    y: 195,
    height: 420,
    reach: async (page) => {
      await page.goto(`${BASE}/${SITE}/services/outlets-switches/replace-standard-outlet`, {
        waitUntil: "networkidle",
      });
      if (!(await click(page, "Check My Price"))) return false;
      return page.locator("text=/replacing this|happening with/i").first().isVisible();
    },
  },
  {
    // A contractor-approved price, released because the answers qualified it.
    name: "home-price",
    x: 380,
    width: 520,
    y: 195,
    height: 400,
    reach: async (page) => {
      await page.goto(`${BASE}/${SITE}/services/outlets-switches/replace-standard-outlet`, {
        waitUntil: "networkidle",
      });
      if (!(await click(page, "Check My Price"))) return false;
      if (!(await click(page, "I just want it replaced or upgraded"))) return false;
      if (!(await click(page, "It just needs to be swapped for a new one"))) return false;
      return page.locator("text=/\\$[0-9]/").first().isVisible();
    },
  },
  // ── The contractor's side. Same product, same rename, but the dashboard
  //    needs a session, so these run only with --sign-in. The owner approved
  //    the admin surface as a capture source alongside the storefront.
  {
    name: "admin-services",
    needsAuth: true,
    x: 105,
    width: 830,
    y: 150,
    height: 430,
    reach: async (page) => {
      await page.goto(`${ADMIN_BASE}/dashboard/services`, { waitUntil: "networkidle" });
      if (page.url().includes("/choose") || page.url().includes("/sign-in")) return false;
      return page.locator("h1, h2").filter({ hasText: /services/i }).first().isVisible();
    },
  },
  {
    // "Your Rates" — the screen that answers "am I buying someone else's
    // flat-rate book?". The quote queue was captured and NOT published: it is
    // legitimately empty on this tenant, and an empty queue with two test
    // entries in it advertises nothing.
    name: "admin-rates",
    needsAuth: true,
    x: 105,
    width: 700,
    y: 150,
    height: 440,
    reach: async (page) => {
      await page.goto(`${ADMIN_BASE}/dashboard/pricing-settings`, { waitUntil: "networkidle" });
      if (page.url().includes("/choose") || page.url().includes("/sign-in")) return false;
      return page.locator("h1, h2").first().isVisible();
    },
  },
  {
    name: "admin-quotes",
    needsAuth: true,
    y: 0,
    height: 700,
    reach: async (page) => {
      await page.goto(`${ADMIN_BASE}/dashboard/quotes`, { waitUntil: "networkidle" });
      if (page.url().includes("/choose") || page.url().includes("/sign-in")) return false;
      return page.locator("h1, h2").filter({ hasText: /quote/i }).first().isVisible();
    },
  },
  {
    name: "admin-hours",
    needsAuth: true,
    x: 105,
    width: 830,
    y: 150,
    height: 430,
    reach: async (page) => {
      await page.goto(`${ADMIN_BASE}/dashboard/business-hours`, { waitUntil: "networkidle" });
      if (page.url().includes("/choose") || page.url().includes("/sign-in")) return false;
      return page.locator("h1, h2").filter({ hasText: /hours/i }).first().isVisible();
    },
  },
];

async function main() {
  mkdirSync(OUT, { recursive: true });
  console.log(`\nSTOREFRONT SHOTS — ${BASE}/${SITE} as "${BRAND}"\n`);

  const browser = await chromium.launch();
  const reuse = arg("session") ?? ".auth/portal.json";
  const haveSession = !arg("sign-in") && existsSync(reuse);
  const ctx = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 2,
    ...(haveSession ? { storageState: reuse } : {}),
  });
  if (haveSession) console.log(`  reusing session from ${reuse}\n`);
  const page = await ctx.newPage();
  let written = 0;

  const signIn = arg("sign-in");
  const sessionFile = arg("session") ?? ".auth/portal.json";

  /**
   * An account with more than one membership lands on /choose, and the choice
   * is part of BEING signed in rather than part of any shot. It has to run on
   * every path — a reused session that was saved before the choice comes back
   * to this page, which is how the first three attempts each produced nothing.
   *
   * The chooser renders BUTTONS labeled with the tenant's real name and slug:
   * no anchors, no form. Matching the substituted brand cannot work, because
   * the rename runs per shot and this page is crossed before any shot.
   */
  async function chooseTenant() {
    if (!page.url().includes("/choose")) return;
    const pick = page.locator("button", { hasText: SITE }).first();
    if (!(await pick.count())) {
      console.log(`  ! /choose has no button matching "${SITE}"`);
      return;
    }
    await pick.click();
    await page.waitForLoadState("networkidle");
  }

  if (signIn || haveSession) {
    if (signIn) await page.goto(signIn, { waitUntil: "networkidle" });
    else await page.goto(`${ADMIN_BASE}/dashboard`, { waitUntil: "networkidle" });
    await chooseTenant();
    console.log(`  portal -> ${page.url().replace(/token=[^&]+/, "token=REDACTED")}`);
    // A magic link is single use, so the session is persisted — and persisted
    // AFTER the choice, so reusing it lands on a dashboard.
    mkdirSync(dirname(sessionFile), { recursive: true });
    await ctx.storageState({ path: sessionFile });
    console.log(`  session saved -> ${sessionFile}\n`);
  }

  try {
    for (const shot of SHOTS) {
      if (shot.needsAuth && !signIn && !haveSession) {
        console.log(`  - ${shot.name}: needs --sign-in "<magic link>" — skipped`);
        continue;
      }
      let reached = false;
      try {
        reached = await shot.reach(page);
      } catch (e) {
        console.log(`  ! ${shot.name}: ${(e as Error).message.split("\n")[0]}`);
      }
      if (!reached) {
        console.log(`  ! ${shot.name}: could not reach that state — skipped`);
        continue;
      }
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(250);
      await rename(page, BRAND, SOURCE_NAMES);
      await page.waitForTimeout(250);
      await assertRenamed(page, shot.name, SOURCE_NAMES);
      /**
       * JPEG, NOT PNG. These pages are mostly photography, and a lossless
       * encoding of a photograph is enormous: the first full-page capture of
       * the services grid was a 2.5MB PNG that took the image optimizer 12.7
       * seconds cold, so the first person to open it watched a blank dialog.
       * The admin captures stay PNG — they are flat UI where text edges
       * matter and the files are already small.
       */
      // the readable thumbnail
      await page.screenshot({
        path: `${OUT}/${shot.name}.jpg`,
        type: "jpeg",
        quality: 88,
        clip: {
          x: shot.x ?? 0,
          y: shot.y ?? 0,
          width: shot.width ?? VIEWPORT.width - (shot.x ?? 0),
          height: shot.height ?? VIEWPORT.height - (shot.y ?? 0),
        },
      });
      // the whole page, for the reader who clicked to see more
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(200);
      await page.screenshot({
        path: `${OUT}/${shot.name}-full.jpg`,
        type: "jpeg",
        // A full catalog page is 12,000px tall. At 84 that is a 2.5MB file
        // handed to someone for clicking a thumbnail; flat UI survives 72
        // without a visible difference at the width the dialog shows.
        quality: 72,
        fullPage: true,
      });
      console.log(`  wrote ${shot.name}.jpg + ${shot.name}-full.jpg`);
      written++;
    }
  } finally {
    await browser.close();
  }

  console.log(`\n  ${written} of ${SHOTS.length} captured\n`);
  if (!written) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
