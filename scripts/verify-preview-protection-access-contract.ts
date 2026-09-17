/**
 * Proves scripts/_previewProtectionAccess.ts's `newProtectedContext` against
 * a LOCAL MOCK protected origin — no live Vercel credentials needed. Two
 * throwaway HTTP servers on 127.0.0.1 stand in for (a) the designated
 * Preview origin, which behaves like Vercel Deployment Protection (refuses
 * without the bypass header/secret, serves with it), and (b) an unrelated
 * third-party origin that just records whether it ever saw the header.
 *
 * A real Playwright browser context (chromium) drives both navigations, so
 * this proves the actual `context.route()` interception wired into both
 * browser harnesses — not just the helper's own source.
 *
 *   npx tsx scripts/verify-preview-protection-access-contract.ts
 */
import http from "node:http";
import { chromium } from "playwright";
import { newProtectedContext } from "./_previewProtectionAccess";

const BYPASS_SECRET = "test-bypass-secret-9f3a";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

function startProtectedOrigin(): Promise<{ url: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const header = req.headers["x-vercel-protection-bypass"];
    if (header === BYPASS_SECRET) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end("<html><body>protected-ok</body></html>");
    } else {
      res.writeHead(401, { "content-type": "text/html" });
      res.end("<html><body>protected-denied</body></html>");
    }
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
      });
    });
  });
}

function startThirdPartyOrigin(): Promise<{ url: string; close: () => Promise<void>; sawBypassHeader: () => boolean }> {
  let sawHeader = false;
  const server = http.createServer((req, res) => {
    if (req.headers["x-vercel-protection-bypass"] !== undefined) sawHeader = true;
    res.writeHead(200, { "content-type": "text/html" });
    res.end("<html><body>third-party-ok</body></html>");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
        sawBypassHeader: () => sawHeader,
      });
    });
  });
}

async function main() {
  console.log("\nPREVIEW PROTECTION ACCESS — local mock protected-origin contract\n");

  const protectedOrigin = await startProtectedOrigin();
  const thirdParty = await startThirdPartyOrigin();
  const browser = await chromium.launch();

  try {
    // ── baseline: an UNPROTECTED plain context is refused by the mock ──
    {
      const plain = await browser.newContext();
      const page = await plain.newPage();
      const res = await page.goto(protectedOrigin.url);
      ok("baseline: a plain browser.newContext() (no header) is refused by the mock protected origin", res?.status() === 401, `status=${res?.status()}`);
      await plain.close();
    }

    // ── the fix: newProtectedContext() is let through ──
    {
      const ctx = await newProtectedContext(browser, protectedOrigin.url, BYPASS_SECRET);
      const page = await ctx.newPage();
      const res = await page.goto(protectedOrigin.url);
      ok("newProtectedContext() carries the header to the designated origin and is let through", res?.status() === 200, `status=${res?.status()}`);
      await ctx.close();
    }

    // ── the third-party origin never receives the header, even from the same protected context ──
    {
      const ctx = await newProtectedContext(browser, protectedOrigin.url, BYPASS_SECRET);
      const page = await ctx.newPage();
      const res = await page.goto(thirdParty.url);
      ok("navigating the SAME protected context to a third-party origin still succeeds", res?.status() === 200, `status=${res?.status()}`);
      ok("the third-party origin never received the bypass header", !thirdParty.sawBypassHeader());
      await ctx.close();
    }

    // ── no-op when no secret is configured (ordinary local case) ──
    {
      const ctx = await newProtectedContext(browser, protectedOrigin.url, undefined);
      const page = await ctx.newPage();
      const res = await page.goto(protectedOrigin.url);
      ok("with no bypass secret configured, newProtectedContext is a plain context (still refused by the mock — unchanged local behavior)", res?.status() === 401, `status=${res?.status()}`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    await protectedOrigin.close();
    await thirdParty.close();
  }

  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
