/**
 * Grants a Playwright browser context access to a Vercel-protected Preview
 * deployment, WITHOUT ever letting the secret reach any other origin.
 *
 * Passing the deployment-identity preflight (a single Node-side `fetch`
 * carrying the bypass header) proves nothing about whether the SEPARATE
 * browser session Playwright drives can reach the deployment at all —
 * Vercel's Deployment Protection blocks ordinary page navigation
 * independently of that one authenticated request. This is what actually
 * lets the browser through: every request THIS CONTEXT makes to the
 * DESIGNATED origin carries the header, via per-request routing rather
 * than a context-wide default header, so a third-party request the same
 * page makes (a script load, an analytics beacon, Stripe.js) never
 * receives it and the secret is never logged or printed.
 *
 * A no-op when no bypass secret is configured — the ordinary local case,
 * where there is no Vercel protection to satisfy against a dev/production
 * server on localhost. Proven against a local mock protected origin in
 * scripts/verify-preview-protection-access-contract.ts; no live Vercel
 * credentials are needed to test this wiring.
 */
import type { Browser, BrowserContext } from "playwright";

export async function newProtectedContext(browser: Browser, targetOrigin: string, bypassSecret: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (!bypassSecret) return context;

  const origin = new URL(targetOrigin).origin;
  await context.route("**/*", async (route) => {
    const req = route.request();
    if (new URL(req.url()).origin === origin) {
      await route.continue({ headers: { ...req.headers(), "x-vercel-protection-bypass": bypassSecret } });
    } else {
      await route.continue();
    }
  });
  return context;
}
