/**
 * Grants a Playwright browser context access to a Vercel-protected Preview
 * deployment, WITHOUT ever letting the designated request's own credentials
 * reach any other origin — INCLUDING an origin the designated origin
 * itself redirects to.
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
 * real cross-origin redirect: it DOES forward the header to the redirect
 * target regardless of origin. Checking only the ORIGINAL request's origin
 * did not stop the designated origin from redirecting to a different
 * origin and having the SAME bypass header ride along.
 *
 * REVIEW OF 29c1303 correction: the FOLLOW-UP fix (walking the redirect
 * chain manually via `route.fetch({ maxRedirects: 0 })` per hop) still
 * forwarded the ORIGINAL request's full headers — including any `Cookie`
 * or `Authorization` the designated origin's own request carried, not just
 * the bypass token — to every hop, cross-origin ones included. Stripping
 * only `x-vercel-protection-bypass` proved absence of that ONE header, not
 * of session credentials that never belonged on any other origin either.
 *
 * Narrowed to what this harness actually needs, per review: cross-origin
 * redirected navigation through a protected context is not an acceptance
 * requirement for the manual pricing/native booking proof. A redirect is
 * followed ONLY while every hop stays on the designated origin; the
 * moment a hop's URL resolves to any OTHER origin, this REFUSES before
 * ever calling `route.fetch()` for that hop — no request is made to it at
 * all, so no header, cookie, or credential of any kind can reach it. This
 * is deliberately not a general-purpose browser redirect implementation.
 *
 * Every request whose ORIGINAL origin is not the designated one is
 * untouched from the start — plain `route.continue()` — so an ordinary
 * third-party request the same page makes (a script load, an analytics
 * beacon, Stripe.js) is never even considered for the header.
 *
 * A no-op when no bypass secret is configured — the ordinary local case,
 * where there is no Vercel protection to satisfy against a dev/production
 * server on localhost. Proven against a local mock protected origin,
 * including a refused cross-origin 302 and a refused method-preserving
 * cross-origin 307/308 (in both cases the second origin receives ZERO
 * requests), and an accepted same-origin redirect, in
 * scripts/verify-preview-protection-access-contract.ts; no live Vercel
 * credentials are needed to test this wiring.
 */
import type { Browser, BrowserContext, Route, APIResponse } from "playwright";

const MAX_REDIRECT_HOPS = 10;

async function fetchWithinDesignatedOrigin(route: Route, targetOrigin: string, bypassSecret: string): Promise<APIResponse> {
  const req = route.request();
  let url = req.url();
  let method = req.method();
  let postData: string | Buffer | undefined = req.postDataBuffer() ?? undefined;

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop++) {
    if (new URL(url).origin !== targetOrigin) {
      // Refuse BEFORE making this request — the second origin gets zero
      // requests, not one with the header stripped. This request's own
      // Cookie/Authorization (carried over from the original, still-
      // designated-origin request) never leaves the designated origin.
      throw new Error(`refusing a redirect leaving the designated Preview origin (to ${url})`);
    }
    const headers = { ...req.headers(), "x-vercel-protection-bypass": bypassSecret };
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
      const response = await fetchWithinDesignatedOrigin(route, origin, bypassSecret);
      await route.fulfill({ response });
    } catch {
      await route.abort();
    }
  });
  return context;
}
