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

const SiteContext = createContext<{ publicId: string; hostedSlug: string } | null>(null);

export function SiteProvider({
  publicId,
  hostedSlug,
  children,
}: {
  publicId: string;
  hostedSlug: string;
  children: ReactNode;
}) {
  return (
    <SiteContext.Provider value={{ publicId, hostedSlug }}>{children}</SiteContext.Provider>
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
  // The hook is called unconditionally and returns null AFTER, rather than
  // returning early — a conditional hook call breaks the rules of hooks, and
  // the header renders both inside and outside a storefront.
  const fetcher = useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-price2book-site", publicId as string);
      return fetch(input, { ...init, headers });
    },
    [publicId]
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
  const { publicId } = useSite();
  return useCallback(
    (input: RequestInfo | URL, init?: RequestInit) => {
      const headers = new Headers(init?.headers);
      headers.set("x-price2book-site", publicId);
      return fetch(input, { ...init, headers });
    },
    [publicId]
  );
}
