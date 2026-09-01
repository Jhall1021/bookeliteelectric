/**
 * Where a storefront is being delivered, and what its links look like there.
 *
 * WHY THIS EXISTS BEFORE THE EMBED DOES
 *
 * Every internal link a homeowner follows is built from a base path, and that
 * base was derived from the URL — `useStorefrontBase` took the first path
 * segment and hoped. On the hosted storefront that happens to be the
 * contractor's slug, so it worked; the one place it did not, a homeowner
 * adding a service on one contractor's site was navigated to another's cart.
 *
 * Under an embed the first segment would be "embed", and under a custom domain
 * there is no segment at all. Deriving from the URL gets both wrong, and gets
 * them wrong the same silent way: a link that resolves to a real page
 * belonging to the wrong place.
 *
 * So the surface is declared rather than guessed, and the base comes from it.
 *
 * ONE ENGINE. A surface changes the shape of a URL and nothing else. No
 * pricing, scheduling, tax, deposit or booking behaviour may branch on it —
 * if a rule differs between hosted and embedded, that is a second storefront
 * and the whole point of this file is that there is not one.
 */

export type SurfaceKind = "hosted" | "embed" | "custom-domain";

export type StorefrontSurface = {
  kind: SurfaceKind;
  /**
   * The prefix every internal link carries. "" for a custom domain, where the
   * storefront IS the root.
   */
  basePath: string;
};

/** price2book.com/<slug> — the fallback, and today the only one delivered. */
export function hostedSurface(hostedSlug: string): StorefrontSurface {
  return { kind: "hosted", basePath: `/${hostedSlug}` };
}

/** An iframe on the contractor's own page, addressed by opaque publicId. */
export function embedSurface(publicId: string): StorefrontSurface {
  return { kind: "embed", basePath: `/embed/${publicId}` };
}

/**
 * pricing.contractor.com — the storefront at the root of a domain the
 * contractor owns.
 *
 * Preferred where a contractor can manage DNS, because being first-party makes
 * the visit cookie a first-party cookie and the whole third-party-cookie
 * problem the embed has to work around simply does not arise.
 */
export function customDomainSurface(): StorefrontSurface {
  return { kind: "custom-domain", basePath: "" };
}

/**
 * Every surface the storefront can be delivered on, with whether it ships.
 *
 * The list the verification contract iterates. A surface added here without a
 * verifier covering it is a build failure rather than a quiet gap — which is
 * the failure this file was written to prevent: gates checking the hosted page
 * while customers use something else.
 */
export const SURFACES: { kind: SurfaceKind; delivered: boolean; why: string }[] = [
  {
    kind: "hosted",
    delivered: true,
    why: "price2book.com/<slug> — fallback, demos, and contractors with no website",
  },
  {
    kind: "custom-domain",
    delivered: false,
    why: "pricing.contractor.com — preferred where DNS can be managed; first-party cookies",
  },
  {
    kind: "embed",
    delivered: true,
    why: "an iframe on the contractor's own page — the universal low-friction mode",
  },
];

/** A publicId addresses the embed; anything else is a hosted slug. */
export function segmentIsPublicId(segment: string): boolean {
  return /^site_[0-9a-f]{8,}$/.test(segment);
}

/**
 * The link prefix for the surface a storefront segment arrived on.
 *
 * A PURE FUNCTION OF THE SEGMENT, deliberately: it needs no database, so a
 * component deep in the tree can build a correct link without resolving the
 * site again, and there is no async version to forget to await.
 *
 * EVERY customer-facing link must come from here rather than from the raw
 * route param. `/${params.site}` looks equivalent and is not: under an embed
 * the segment is a publicId, so the link becomes `/site_abc/services/...` —
 * which resolves, and silently drops the homeowner out of `/embed/...` and so
 * out of the embed surface mid-journey. Found by clicking through a real
 * embed, where the header links were right and the category links were not,
 * because only the header went through the surface.
 */
export function storefrontBaseFor(segment: string): string {
  return segmentIsPublicId(segment)
    ? embedSurface(segment).basePath
    : hostedSurface(segment).basePath;
}

/** Join a base path and a route, without doubling or dropping the slash. */
export function surfaceHref(surface: StorefrontSurface, path: string): string {
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${surface.basePath}${p}`;
}
