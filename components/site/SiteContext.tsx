"use client";

/**
 * The storefront a browser session is acting for — ADR §2.2.
 *
 * Every customer-facing API call must say which storefront it belongs to, and
 * the server refuses the ones that do not. Threading that identifier through
 * every component as a prop would mean twenty call sites each remembering to
 * add a header — the same "correct as long as someone remembers" shape the
 * tenant guard exists to remove, moved to the client.
 *
 * So it is provided once, by the `[site]` layout that already had to resolve
 * the site in order to render, and consumed through `useSiteFetch()`.
 *
 * WHAT IS AND IS NOT A SECRET
 *
 * `publicId` is opaque but not secret: it identifies a storefront, and any
 * visitor to that storefront can see it. It is not a credential and grants
 * nothing beyond reading that storefront's public catalog — exactly what the
 * page already shows. The server treats it as a routing key and re-resolves it
 * on every request; it never trusts anything else the client sends about which
 * tenant it is.
 */

import { createContext, useContext, useCallback, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { hostedSurface, type StorefrontSurface } from "@/lib/storefrontSurface";
import { embedVisitToken } from "@/lib/visitToken.client";

/**
 * Attach the visit token, but only where the cookie cannot do the job.
 *
 * Hosted and custom-domain storefronts are first-party and keep using the
 * cookie; sending a second identifier there would be two sources of truth for
 * one visit. Inside an embed the cookie is never sent, so the frame supplies
 * the token it holds.
 */
function withVisitToken(headers: Headers, surface: StorefrontSurface | undefined) {
  if (surface?.kind !== "embed") return headers;
  const token = embedVisitToken();
  if (token) headers.set("x-price2book-visit", token);
  return headers;
}

const SiteContext = createContext<
  { publicId: string; hostedSlug: string; surface: StorefrontSurface } | null
>(null);

export function SiteProvider({
  publicId,
  hostedSlug,
  surface,
  children,
}: {
  publicId: string;
  hostedSlug: string;
  /**
   * Where this storefront is being delivered. Defaults to the hosted surface
   * so existing callers are unchanged; an embed or a custom domain passes its
   * own, and every link below follows without a second code path.
   */
  surface?: StorefrontSurface;
  children: ReactNode;
}) {
  const resolved = surface ?? hostedSurface(hostedSlug);
  return (
    <SiteContext.Provider value={{ publicId, hostedSlug, surface: resolved }}>
      {children}
    </SiteContext.Provider>
  );
}

/** The current storefront, or a thrown error if rendered outside one. */
export function useSite() {
  const site = useContext(SiteContext);
  if (!site) {
    throw new Error(
      "useSite() outside a SiteProvider. Customer-facing components render " +
        "under app/[site]/, whose layout provides it."
    );
  }
  return site;
}

/**
 * The current storefront, or null.
 *
 * For components that render both inside and outside a storefront — the shared
 * header sits in the ROOT layout, above `[site]`, and appears on the admin and
 * not-found pages too. Throwing there would take down pages that have no
 * storefront and correctly do not need one.
 */
export function useSiteOptional() {
  return useContext(SiteContext);
}

/**
 * `fetch` with the storefront identifier, or null when there is no storefront.
 *
 * A component using this must handle null by doing nothing. Outside a
 * storefront there is no catalog and no visit, so there is nothing to ask for.
 */
export function useSiteFetchOptional():
  | ((input: RequestInfo | URL, init?: RequestInit) => Promise<Response>)
  | null {
  const site = useContext(SiteContext);
  const publicId = site?.publicId ?? null;
  const surface = site?.surface ?? null;
  // The hook is called unconditionally and returns null AFTER, rather than
  // returning early — a conditional hook call breaks the rules of hooks, and
  // the header renders both inside and outside a storefront.
  const fetcher = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-price2book-site", publicId as string);
      withVisitToken(headers, surface ?? undefined);
      return fetch(input, { ...init, headers });
    },
    [publicId, surface]
  );
  return publicId === null ? null : fetcher;
}

/**
 * `fetch`, with the storefront identifier attached.
 *
 * Use this for every customer-facing API call. A plain `fetch` to those routes
 * gets a 404 with no explanation, which is deliberate: an anonymous caller
 * should not learn whether a storefront exists.
 */
export function useSiteFetch() {
  const { publicId, surface } = useSite();
  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-price2book-site", publicId);
      withVisitToken(headers, surface);
      return fetch(input, { ...init, headers });
    },
    [publicId, surface]
  );
}

/**
 * The storefront prefix for building links in shared chrome.
 *
 * The header and footer live in the ROOT layout, above `[site]`, so the
 * provider cannot reach them — they also render on `/admin`, where there is no
 * storefront at all. They still have to link within the current storefront, or
 * every nav click leaves it.
 *
 * So this reads the first path segment. That is LINK CONSTRUCTION, not tenant
 * resolution: it decides where a link points, never who the request acts for.
 * Nothing is authorised by it, no query is scoped by it, and the server
 * re-resolves the site from `x-price2book-site` or the URL on every request
 * regardless. §2.2's rule is about authority, and this has none.
 *
 * Returns "" outside a storefront, so admin chrome keeps its root-relative
 * links exactly as before.
 */
export function useStorefrontBase(): string {
  const site = useContext(SiteContext);
  // DECLARED, not derived. The surface knows its own base — "/elite-electric"
  // hosted, "/embed/pub_…" embedded, "" on a custom domain — and the guess
  // below is only for components rendering above the provider.
  if (site) return site.surface.basePath;

  const pathname = usePathname();
  const first = pathname?.split("/").filter(Boolean)[0];
  if (!first || NON_STOREFRONT_SEGMENTS.has(first)) return "";
  return `/${first}`;
}

/** Root segments that are not a storefront. */
const NON_STOREFRONT_SEGMENTS = new Set(["admin", "api", "_next", "embed"]);
