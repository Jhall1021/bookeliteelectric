/**
 * Storefront tenant resolution — ADR §2.2.
 *
 *   entry point -> site identity -> contractor context -> guarded application
 *
 * THE RULE THIS EXISTS TO ENFORCE
 *
 *   Tenant context is NEVER derived from the tenant-owned resource being
 *   requested.
 *
 * `serviceSlug -> service -> contractor` is forbidden. It authorises access to
 * a resource using that same resource, so knowing another contractor's service
 * id or slug would silently switch tenants — the request would be answered
 * correctly, for the wrong contractor, with nothing failing.
 *
 * The correct shape is `siteId + serviceSlug`: identify the tenant, THEN the
 * resource. Everything in this module resolves the first half, and refuses to
 * look at the second.
 *
 * WHY RESOLUTION RUNS ON THE UNGUARDED CLIENT
 *
 * `ContractorSite` is classified PLATFORM by necessity. This is the step that
 * establishes context, so requiring context to perform it would be circular.
 * It reads routing data only — a public identity and the contractorId it maps
 * to — and nothing else in this module touches tenant-owned data.
 *
 * DELIBERATELY THIN
 *
 * No origins, no CORS, no custom-domain management, no embed handshake, no
 * branding. Those are later entry points that resolve to the same
 * ContractorSite; everything downstream of this file stays as it is.
 */

import type { PrismaClient } from "@prisma/client";
import { prisma } from "./prisma";
import { notFound } from "next/navigation";
import { withContractor } from "./tenantRoute";

/**
 * Slugs a contractor may not take, because `hostedSlug` occupies the root
 * namespace — `/elite-electric/services` sits beside `/admin` and `/api`.
 *
 * Configuration validation, not tenant security: nothing here protects one
 * contractor from another. It stops a contractor named "api" from shadowing a
 * real route, which is an ugly problem to discover after someone has printed
 * their URL on a van.
 *
 * Includes the paths Price2Book may want for its own marketing site once the
 * legacy Elite redirects are retired.
 */
export const RESERVED_HOSTED_SLUGS = new Set<string>([
  // Application namespaces.
  "api", "admin", "_next", "static", "public", "assets",
  // Auth and account.
  "login", "logout", "signin", "signup", "auth", "account", "settings",
  // Platform marketing, kept free for Price2Book itself.
  "pricing", "about", "contact", "blog", "docs", "help", "support",
  "terms", "privacy", "legal", "security", "status",
  // Legacy Elite root paths, reserved while their redirects stand.
  "services", "troubleshooting", "checkout", "quote", "my-visit",
  "service-area", "how-it-works", "why-elite",
  // Obvious traps.
  "new", "edit", "delete", "index", "null", "undefined", "www",
]);

/**
 * Is this slug usable as a public storefront address?
 *
 * Returns the reason it is not, or null when it is fine — a caller showing an
 * onboarding form needs to say WHY, not merely refuse.
 */
export function hostedSlugProblem(slug: string): string | null {
  if (!slug) return "A storefront address is required.";
  const lower = slug.toLowerCase();
  if (lower !== slug) return "Use lowercase only.";
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    return "Use lowercase letters, numbers and hyphens, starting and ending with a letter or number.";
  }
  if (slug.includes("--")) return "Avoid consecutive hyphens.";
  if (slug.length < 3) return "Too short — use at least 3 characters.";
  if (slug.length > 63) return "Too long — use at most 63 characters.";
  if (RESERVED_HOSTED_SLUGS.has(slug)) return `"${slug}" is reserved by the platform.`;
  return null;
}

/** What a resolved storefront request knows before it may query anything. */
export type ResolvedSite = {
  siteId: string;
  publicId: string;
  hostedSlug: string;
  contractorId: string;
};

/** Thrown when an entry point does not resolve. Never says why, deliberately. */
export class UnknownSiteError extends Error {
  constructor() {
    // No detail: whether a site is absent, inactive, or belongs to someone
    // else is not something an anonymous caller should be able to distinguish.
    super("Unknown storefront.");
    this.name = "UnknownSiteError";
  }
}

const SITE_SELECT = {
  id: true,
  publicId: true,
  hostedSlug: true,
  contractorId: true,
  active: true,
} as const;

function toResolved(row: {
  id: string;
  publicId: string;
  hostedSlug: string;
  contractorId: string;
  active: boolean;
}): ResolvedSite {
  return {
    siteId: row.id,
    publicId: row.publicId,
    hostedSlug: row.hostedSlug,
    contractorId: row.contractorId,
  };
}

/**
 * Resolve a hosted storefront path segment — `/elite-electric/...`.
 *
 * Returns null rather than throwing so a page can render its own not-found.
 */
export async function siteByHostedSlug(hostedSlug: string): Promise<ResolvedSite | null> {
  if (!hostedSlug) return null;
  const row = await prisma.contractorSite.findUnique({
    where: { hostedSlug },
    select: SITE_SELECT,
  });
  if (!row || !row.active) return null;
  return toResolved(row);
}

/**
 * Resolve the opaque public identifier a customer-facing API request carries.
 */
export async function siteByPublicId(publicId: string): Promise<ResolvedSite | null> {
  if (!publicId) return null;
  const row = await prisma.contractorSite.findUnique({
    where: { publicId },
    select: SITE_SELECT,
  });
  if (!row || !row.active) return null;
  return toResolved(row);
}

/**
 * Read the site identifier from a request, without ever consulting the
 * resource being requested.
 *
 * Header first, then query string. Both are the caller stating which
 * storefront it acts for; neither is inferred from a service, quote or visit.
 */
export function siteIdentifierFrom(req: Request): string | null {
  const header = req.headers.get("x-price2book-site");
  if (header) return header;
  try {
    return new URL(req.url).searchParams.get("site");
  } catch {
    return null;
  }
}

/**
 * Resolve a request to a site, or throw.
 *
 * The single entry point for customer-facing API routes.
 */
export async function requireSiteFromRequest(req: Request): Promise<ResolvedSite> {
  const identifier = siteIdentifierFrom(req);
  if (!identifier) throw new UnknownSiteError();
  const site = await siteByPublicId(identifier);
  if (!site) throw new UnknownSiteError();
  return site;
}

/**
 * Open tenant context for a resolved site and run guarded queries.
 *
 * Takes a ResolvedSite rather than a contractorId so a caller cannot reach
 * this having skipped resolution — the only way to obtain one is through the
 * functions above.
 */
export function withSite<T>(
  site: ResolvedSite,
  fn: (db: PrismaClient) => Promise<T>
): Promise<T> {
  return withContractor(site.contractorId, "site-identifier", fn);
}

/**
 * Resolve a hosted storefront page's `[site]` segment, or render not-found.
 *
 * The single entry point for pages under `app/[site]/`. Called at the TOP of
 * every such page, before any tenant-owned query — the whole point of §2.2 is
 * that the tenant is known before the resource is looked at, and that ordering
 * is only true if resolution comes first in the function body.
 *
 * `notFound()` rather than an error page: an unknown, inactive or foreign
 * storefront should be indistinguishable from a URL that was never valid.
 */
export async function requireHostedSite(siteSegment: string): Promise<ResolvedSite> {
  const site = await siteByHostedSlug(siteSegment);
  if (!site) notFound();
  return site;
}
