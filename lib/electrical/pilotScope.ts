/**
 * The controlled onboarding pilot — what it covers, frozen.
 *
 * Electrical → New 120V Outlet → a straight surface-mounted run → a single
 * service on a visit. Anything outside that is not a bug to fix during the
 * pilot; it is a boundary, and it fails closed:
 *
 *   - a run that turns corners goes to REVIEW (segment lengths and offcut
 *     reuse are unknown, by design);
 *   - editing a visit that mixes this service with others, outside the
 *     proven add-to-visit path, refuses rather than prices;
 *   - creating the account and the business happens in the existing flows,
 *     before this wizard begins.
 *
 * Written down here so a support conversation, a diagnostic and a suite all
 * read the same list.
 */
export const PILOT_SCOPE = {
  trade: "electrical",
  serviceSlug: "new-120v-outlet",
  route: "straight surface-mounted run (no corners)",
  booking: "single service on a visit",
} as const;

export const PILOT_LIMITATIONS = [
  "Runs that turn corners go to review instead of an instant price.",
  "Changing a visit that combines this service with other services may refuse rather than reprice; adding it to a visit is supported.",
  "Account and business setup happen in the existing flows before the wizard starts.",
  "Material prices are entered in the wizard; the Materials & Costs screen for ongoing maintenance is not built yet.",
] as const;

// ── who may be reset ────────────────────────────────────────────────────────

/**
 * Reset is for REHEARSAL contractors only, named explicitly.
 *
 * Exact slugs plus one designated prefix. A slug is required rather than an
 * id, so an arbitrary id copied from a URL cannot be reset, and the prefix is
 * specific enough that no real business will ever carry it.
 */
export const PILOT_REHEARSAL_SLUGS = ["rv2-onboarding-pilot"];
export const PILOT_REHEARSAL_PREFIX = "rv2-pilot-rehearsal-";

/** Never resettable, whatever else is true. Belt and braces over the allowlist. */
export const NEVER_RESET = ["elite-electric", "brightpath-electric"];

export type ResetRefusal =
  | { code: "NOT_A_REHEARSAL_CONTRACTOR"; message: string }
  | { code: "PROTECTED_TENANT"; message: string }
  | { code: "PRODUCTION_DATABASE"; message: string }
  | { code: "DATABASE_IDENTITY_UNKNOWN"; message: string }
  | { code: "HAS_REAL_BOOKINGS"; message: string }
  | { code: "UNKNOWN_CONTRACTOR"; message: string };

export const isRehearsalSlug = (slug: string) =>
  PILOT_REHEARSAL_SLUGS.includes(slug) || slug.startsWith(PILOT_REHEARSAL_PREFIX);

/** The Neon endpoint id of a connection string — same parsing as verify-database-identity. */
export function liveEndpointOf(connectionString: string): string {
  const host = connectionString.replace(/^.*@/, "").split("/")[0];
  return host.split(".")[0].replace(/-pooler$/, "");
}

/**
 * Refuse unless this is a named rehearsal contractor on a database that is
 * NOT production.
 *
 * The production test is the existing DatabaseIdentity rule, not a name: a
 * rehearsal branch carries a COPIED identity row that still says
 * "price2book-production", so the check is whether the stamped endpoint is the
 * endpoint actually connected. Stamped-production AND endpoints match means
 * production — refused. No identity row at all is refused too: an unknown
 * database is not a safe place to delete things.
 */
export function resetRefusal(args: {
  slug: string;
  identity: { key: string; neonEndpoint: string } | null;
  liveEndpoint: string;
}): ResetRefusal | null {
  if (NEVER_RESET.includes(args.slug)) {
    return { code: "PROTECTED_TENANT", message: `${args.slug} is a real tenant and can never be reset.` };
  }
  if (!isRehearsalSlug(args.slug)) {
    return { code: "NOT_A_REHEARSAL_CONTRACTOR",
      message: `${args.slug} is not a designated rehearsal contractor (${PILOT_REHEARSAL_SLUGS.join(", ")} or ${PILOT_REHEARSAL_PREFIX}*).` };
  }
  if (!args.identity) {
    return { code: "DATABASE_IDENTITY_UNKNOWN", message: "This database has no identity marker; refusing to reset on an unknown database." };
  }
  if (args.identity.key === "price2book-production" && args.identity.neonEndpoint === args.liveEndpoint) {
    return { code: "PRODUCTION_DATABASE", message: "Connected to the stamped production database. Reset is rehearsal-only." };
  }
  return null;
}
