/**
 * Proves scripts/_previewProtectionAccess.ts's `newProtectedContext` against
 * a LOCAL MOCK protected origin — no live Vercel credentials needed. Two
 * throwaway HTTP servers on 127.0.0.1 stand in for (a) the designated
 * Preview origin, which behaves like Vercel Deployment Protection (refuses
 * without the bypass header/secret, serves with it, and can redirect), and
 * (b) an unrelated third-party origin that records whether it ever saw the
 * header and which HTTP method it received.
 *
 * A real Playwright browser context (chromium) drives every navigation, so
 * this proves the actual `context.route()` interception wired into both
 * browser harnesses — not just the helper's own source.
 *
 * REVIEW OF c687467 extension: three redirect scenarios, proving the fix
 * for the actual defect (Playwright forwards a `continue({headers})`
 * override through every redirect hop automatically, per its own docs) —
 * a designated-origin-to-cross-origin redirect (plain 302, and a
 * method-preserving 307), and a designated-origin-to-itself redirect —
 * plus one direct check that a plain Node `fetch()` with `redirect:
 * "error"` (the fix for the OTHER half of Defect 2, the Node-side
 * deployment-identity fetch in both scripts) actually refuses a redirect
 * rather than silently following it. Fake credentials only; no assertion
 * below ever prints the secret's value.
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

type ProtectedOrigin = { url: string; close: () => Promise<void> };
type ThirdPartyOrigin = { url: string; close: () => Promise<void>; sawBypassHeader: () => boolean; lastMethod: () => string | undefined };

function startProtectedOrigin(thirdPartyUrl: string): Promise<ProtectedOrigin> {
  const server = http.createServer((req, res) => {
    const authorized = req.headers["x-vercel-protection-bypass"] === BYPASS_SECRET;
    const cors = { "access-control-allow-origin": "*" };
    const path = (req.url ?? "/").split("?")[0];

    if (path === "/redirect-cross-origin") {
      if (!authorized) { res.writeHead(401, cors); res.end(); return; }
      res.writeHead(302, { ...cors, location: `${thirdPartyUrl}/landed` });
      res.end();
      return;
    }
    if (path === "/redirect-cross-origin-307") {
      if (!authorized) { res.writeHead(401, cors); res.end(); return; }
      res.writeHead(307, { ...cors, location: `${thirdPartyUrl}/echo-method` });
      res.end();
      return;
    }
    if (path === "/redirect-same-origin") {
      if (!authorized) { res.writeHead(401, cors); res.end(); return; }
      res.writeHead(302, { ...cors, location: "/after-redirect" });
      res.end();
      return;
    }
    if (path === "/after-redirect") {
      res.writeHead(authorized ? 200 : 401, cors);
      res.end();
      return;
    }
    // default path: the plain protected page used by the earlier checks
    res.writeHead(authorized ? 200 : 401, { ...cors, "content-type": "text/html" });
    res.end(authorized ? "<html><body>protected-ok</body></html>" : "<html><body>protected-denied</body></html>");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      resolve({ url: `http://127.0.0.1:${port}`, close: () => new Promise((r) => server.close(() => r())) });
    });
  });
}

function startThirdPartyOrigin(): Promise<ThirdPartyOrigin> {
  let sawHeader = false;
  let lastMethod: string | undefined;
  const server = http.createServer((req, res) => {
    if (req.headers["x-vercel-protection-bypass"] !== undefined) sawHeader = true;
    lastMethod = req.method;
    res.writeHead(200, { "access-control-allow-origin": "*", "content-type": "text/html" });
    res.end("<html><body>third-party-ok</body></html>");
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      resolve({
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
        sawBypassHeader: () => sawHeader,
        lastMethod: () => lastMethod,
      });
    });
  });
}

async function main() {
  console.log("\nPREVIEW PROTECTION ACCESS — local mock protected-origin contract\n");

  const thirdParty = await startThirdPartyOrigin();
  const protectedOrigin = await startProtectedOrigin(thirdParty.url);
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

    // ── THE REGRESSION: the designated origin redirects (302) to a cross-origin
    //    destination. The original route.continue({headers}) implementation would
    //    have carried the header across this hop automatically (Playwright's own
    //    documented behavior); the fix must not. ──
    {
      const ctx = await newProtectedContext(browser, protectedOrigin.url, BYPASS_SECRET);
      const page = await ctx.newPage();
      await page.goto(protectedOrigin.url);
      const status = await page.evaluate((u) => fetch(u).then((r) => r.status), `${protectedOrigin.url}/redirect-cross-origin`);
      ok("a designated-origin redirect to a cross-origin destination is still followed and completes", status === 200, `status=${status}`);
      ok("the cross-origin redirect TARGET never received the bypass header", !thirdParty.sawBypassHeader());
      await ctx.close();
    }

    // ── method-preserving 307/308: a POST to the designated origin, redirected
    //    307 to a cross-origin destination, must arrive there as a POST — and
    //    still without the header. ──
    {
      const ctx = await newProtectedContext(browser, protectedOrigin.url, BYPASS_SECRET);
      const page = await ctx.newPage();
      await page.goto(protectedOrigin.url);
      const status = await page.evaluate(
        (u) => fetch(u, { method: "POST", body: "x" }).then((r) => r.status),
        `${protectedOrigin.url}/redirect-cross-origin-307`
      );
      ok("a 307 designated-origin-to-cross-origin redirect is followed and completes", status === 200, `status=${status}`);
      ok("the 307 redirect preserved the original POST method at the cross-origin destination", thirdParty.lastMethod() === "POST", `method=${thirdParty.lastMethod()}`);
      ok("the 307 cross-origin redirect target never received the bypass header", !thirdParty.sawBypassHeader());
      await ctx.close();
    }

    // ── a SAME-origin redirect: both hops are the designated origin, so both
    //    must still get the header — the fix must not break legitimate
    //    same-origin multi-hop flows. ──
    {
      const ctx = await newProtectedContext(browser, protectedOrigin.url, BYPASS_SECRET);
      const page = await ctx.newPage();
      await page.goto(protectedOrigin.url);
      const status = await page.evaluate((u) => fetch(u).then((r) => r.status), `${protectedOrigin.url}/redirect-same-origin`);
      ok("a same-origin redirect still succeeds end to end (both hops authorized)", status === 200, `status=${status}`);
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

    // ── the OTHER half of Defect 2: the Node-side deployment-identity fetch in
    //    both scripts now passes redirect: "error" instead of the default
    //    "follow" — confirms that actually refuses rather than silently
    //    following (and forwarding the header past this hop) for a plain
    //    Node fetch(), independent of the browser/Playwright path above. ──
    {
      let threw = false;
      try {
        await fetch(`${protectedOrigin.url}/redirect-cross-origin?authorized-check-only`, {
          headers: { "x-vercel-protection-bypass": BYPASS_SECRET },
          redirect: "error",
        });
      } catch {
        threw = true;
      }
      ok("a plain Node fetch() with redirect: \"error\" refuses (throws) on a 3xx instead of following it", threw);
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
