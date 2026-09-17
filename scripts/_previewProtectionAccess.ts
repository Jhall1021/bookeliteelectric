/**
 * Grants a Playwright browser context access to a Vercel-protected Preview
 * deployment, WITHOUT ever letting the secret reach any other origin —
 * INCLUDING an origin the designated origin itself redirects to.
 *
 * Passing the deployment-identity preflight (a single Node-side `fetch`
 * carrying the bypass header) proves nothing about whether the SEPARATE
 * browser session Playwright drives can reach the deployment at all —
 * Vercel's Deployment Protection blocks ordinary page navigation
 * independently of that one authenticated request.
 *
 * REVIEW OF c687467 correction: the first version of this file used
 * `route.continue({ headers })` to attach the header. Per Playwright's own
 * documentation (playwright.dev/docs/api/class-route#route-continue), a
 * header override passed to `continue()` "applies to both the routed
 * request and any redirects it initiates" — confirmed directly against a
 * real cross-origin redirect below: it DOES forward the header to the
 * redirect target regardless of origin. Checking only the ORIGINAL
 * request's origin did not stop the designated origin from redirecting to
 * a different origin and having the SAME bypass header ride along.
 *
 * Also confirmed directly: handing a raw 3xx back to the browser via
 * `route.fulfill()` (so the BROWSER'S OWN redirect-following logic, not
 * Playwright's, would re-issue the request and re-enter this route
 * handler) does not reliably reach the cross-origin target either — a
 * `fetch()`-initiated request fulfilled with a redirect status did not
 * consistently trigger a fresh, independently-routed request the way a
 * real network redirect does, once this handler is registered.
 *
 * Fixed by never handing ANY redirect back to the browser at all: the
 * ENTIRE chain is walked HERE, inside this one route callback, using
 * `route.fetch({ url, method, headers, postData, maxRedirects: 0 })` for
 * each hop — `maxRedirects: 0` means a 3xx comes back to US as plain data,
 * never auto-followed — and only the origin's designated bypass header is
 * attached to a hop whose URL is ACTUALLY that designated origin, decided
 * fresh for every hop, not just the first. HTTP's own redirect-method
 * rules are replicated exactly: 303 (and 301/302 for a non-GET/HEAD
 * method) downgrades to GET with no body, matching every browser's actual
 * behavior; 307/308 preserve the original method and body untouched. Only
 * the terminal (non-redirect) response is ever given back to the
 * browser, via `route.fulfill({ response })`.
 *
 * Every request to any OTHER origin (from the very first hop) is
 * untouched — plain `route.continue()` — so a third-party request the
 * same page makes (a script load, an analytics beacon, Stripe.js) never
 * receives the header and the secret is never logged or printed.
 *
 * A no-op when no bypass secret is configured — the ordinary local case,
 * where there is no Vercel protection to satisfy against a dev/production
 * server on localhost. Proven against a local mock protected origin,
 * including a cross-origin redirect, a method-preserving 307/308
 * cross-origin redirect, and a same-origin redirect, in
 * scripts/verify-preview-protection-access-contract.ts; no live Vercel
 * credentials are needed to test this wiring.
 */
import type { Browser, BrowserContext, Route, APIResponse } from "playwright";

const MAX_REDIRECT_HOPS = 10;

async function fetchFollowingRedirects(route: Route, targetOrigin: string, bypassSecret: string): Promise<APIResponse> {
  const req = route.request();
  const baseHeaders = { ...req.headers() };
  delete baseHeaders["x-vercel-protection-bypass"];

  let url = req.url();
  let method = req.method();
  let postData: string | Buffer | undefined = req.postDataBuffer() ?? undefined;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    const hopIsDesignatedOrigin = new URL(url).origin === targetOrigin;
    const headers = hopIsDesignatedOrigin ? { ...baseHeaders, "x-vercel-protection-bypass": bypassSecret } : baseHeaders;
    const response = await route.fetch({ url, method, headers, postData, maxRedirects: 0 });
    const status = response.status();
    if (status < 300 || status >= 400) return response; // terminal — never a redirect

    const location = response.headers()["location"];
    if (!location) return response; // a 3xx with no Location to follow — hand it back as-is

    if (status === 303 || ((status === 301 || status === 302) && method !== "GET" && method !== "HEAD")) {
      method = "GET";
      postData = undefined;
    }
    // 307/308 (and an already-GET/HEAD 301/302) preserve method and body exactly, per HTTP's own redirect contract.
    url = new URL(location, url).toString();
  }
  throw new Error(`too many redirects (> ${MAX_REDIRECT_HOPS}) while following ${req.url()}`);
}

export async function newProtectedContext(browser: Browser, targetOrigin: string, bypassSecret: string | undefined): Promise<BrowserContext> {
  const context = await browser.newContext();
  if (!bypassSecret) return context;

  const origin = new URL(targetOrigin).origin;
  await context.route("**/*", async (route) => {
    if (new URL(route.request().url()).origin !== origin) {
      await route.continue();
      return;
    }
    try {
      const response = await fetchFollowingRedirects(route, origin, bypassSecret);
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });
  return context;
}
