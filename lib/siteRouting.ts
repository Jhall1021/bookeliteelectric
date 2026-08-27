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
import { withContractor } from "./tenantRoute";

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
