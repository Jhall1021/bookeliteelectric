/**
 * Which contractors are verifier fixtures — one rule, stated once.
 *
 * The verifiers in `npm run verify` build real contractors in the shared
 * production database, use them, and remove them. For the seconds a fixture
 * exists it is indistinguishable from a genuine tenant to anything that
 * lists contractors: the Platform Admin showed one as a business to onboard
 * (and on 7 Sep 2026 a founder did, mid-teardown, which is how one leaked),
 * and the marketing capture counted its 75 services as the product's estate
 * and failed the deploy gate.
 *
 * So the rule lives here, in one place, and two things enforce it:
 *
 *   1. RESERVED PREFIXES. A slug beginning with one of these can only be a
 *      fixture, because `validateIdentity` refuses to create a genuine
 *      contractor with one. That is what makes the predicate exact rather
 *      than a guess: nothing a person can create matches it.
 *   2. LEGACY PROBE PREFIXES. Older verifiers still name their throwaways
 *      differently. Each is listed with the verifier that owns it; every one
 *      creates its row inactive and removes it in its own teardown. They are
 *      reserved on the same terms, so the list is closed, not open-ended.
 *
 * Nothing here decides what the verifiers may do. A verifier inspects its own
 * probe through the read model exactly as before — the read model separates
 * fixtures from genuine rows and reports both; only the human-facing pages
 * leave the fixtures out, and say how many they left out.
 *
 * No Prisma import on purpose: the platform surfaces that use this may hold
 * no client, and a rule about a string should not need one.
 */

/** Slugs that only verifier fixtures may carry. Creation refuses them. */
export const RESERVED_FIXTURE_PREFIXES: readonly string[] = [
  "test-", // verify-platform-* (read-model, onboarding, authority), verify-launch-behavior, verify-trade-enrolment, verify-template-installation, verify-activation-dependencies, verify-cross-tenant-resource-access, verify-onboarding-readiness, verify-policy-resolution, verify-tenant-isolation-live
  "__",    // verify-write-freeze, verify-checkout-atomicity, verify-template-*, verify-pricing-strategy, verify-design-picker, verify-deployed-matrix, verify-*-tenancy — never a valid hosted slug anyway
];

/** Older verifiers' probe prefixes, each with its owner. Closed list. */
export const LEGACY_FIXTURE_PREFIXES: Readonly<Record<string, string>> = {
  "wh-probe-": "verify-deposit-flow",
  "psi-probe-": "verify-pricing-settings-impact",
  "stripe-probe-": "verify-stripe-connect",
  "ts-probe-": "verify-troubleshooting-route",
  "g2-probe-": "verify-trade-scoped-troubleshooting",
  "bootstrap-electric-": "verify-account-bootstrap",
};

export const FIXTURE_SLUG_PREFIXES: readonly string[] = [
  ...RESERVED_FIXTURE_PREFIXES,
  ...Object.keys(LEGACY_FIXTURE_PREFIXES),
];

/** True when this slug can only belong to a verifier fixture. */
export function isFixtureContractorSlug(slug: string): boolean {
  return FIXTURE_SLUG_PREFIXES.some((p) => slug.startsWith(p));
}

/** Why a person may not create a contractor with this slug, or null. */
export function fixtureSlugProblem(slug: string): string | null {
  const hit = FIXTURE_SLUG_PREFIXES.find((p) => slug.startsWith(p));
  return hit ? `Addresses beginning with "${hit}" are reserved for platform verification.` : null;
}

/** Genuine rows and fixture rows, in their original order. */
export function partitionFixtures<T extends { slug: string }>(rows: readonly T[]): { genuine: T[]; fixtures: T[] } {
  const genuine: T[] = [];
  const fixtures: T[] = [];
  for (const r of rows) (isFixtureContractorSlug(r.slug) ? fixtures : genuine).push(r);
  return { genuine, fixtures };
}

/**
 * Deliberately NO Prisma where-clause form of this rule. `startsWith: "__"`
 * reaches Postgres as LIKE '__%', where the underscore is a wildcard, and
 * excludes every contractor with a two-character slug or longer — which is
 * how a first draft of the marketing capture measured an estate of zero.
 * A database-side measurement reads the contractors, applies
 * `partitionFixtures` in code, and scopes its queries by id.
 */
