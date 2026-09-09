/**
 * Bringing a contractor into existence, and its first owner with it.
 *
 * THE ONLY SANCTIONED WAY TO CREATE ONE. Before this, there was none: a
 * brand-new user creating their own tenant was a gap closed with a direct
 * membership write. That was acceptable for a fixture and is not acceptable
 * for release, because a hand-written membership is a tenant grant nobody
 * reviewed. (An earlier version of this comment claimed invitation into an
 * existing contractor was already built; it was not — see
 * lib/contractorInvitations.ts, added with Phase 3A, 7 September 2026.)
 *
 * ONE TRANSACTION, for the same reason catalog installation is one: a
 * contractor with no site cannot be reached, and a contractor with no owner
 * cannot be administered. Either half alone is a broken tenant somebody has to
 * repair by hand, and the repair is another unreviewed membership write.
 *
 * WHY THIS RUNS UNGUARDED
 *
 * The tenant guard refuses `create` on a contractor-scoped model with no
 * tenant context, and there is no context to open until the contractor row
 * exists — the same bootstrap resolveAdminContractor already faces when it
 * reads memberships to decide which context to open. So this is deliberately
 * outside the guard, and that is exactly why it is one function with one
 * caller rather than a step any route could perform.
 *
 * A VERIFIED ADDRESS IS REQUIRED. A membership is what reaches a tenant's
 * data; an unverified address must never hold one, even for the instant
 * before it is confirmed.
 *
 * THE ONE-OWNED-BUSINESS GUARD IS RACE-SAFE, DELIBERATELY.
 *
 * Three paths can grant a user their first OWNER membership: this file's own
 * self-serve creation, the founder's `attachOwnerFor`, and invitation
 * acceptance (`lib/contractorInvitations.ts`). A user could reach two of them
 * at once — accepting one invitation while another is being attached, or two
 * invitations accepted in two tabs — and a plain "check, then write" is a
 * classic TOCTOU gap under Postgres's default READ COMMITTED isolation: both
 * transactions can pass the check before either commits. `withOwnershipLock`
 * closes it with a transaction-scoped Postgres advisory lock keyed to the
 * user, so any two grants for the SAME account serialize regardless of which
 * of the three paths each one came through — every caller must take the lock
 * before checking `ownsAnotherBusiness` and before writing the membership,
 * inside the same transaction. This is a product-policy guard, not a security
 * boundary (the membership model is many-to-many by design, see below), so an
 * advisory lock is the right weight: no schema migration, no partial unique
 * index, and it cannot be forgotten by a caller that already opened the
 * transaction correctly.
 */

import type { PrismaClient, ContractorRole, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hostedSlugProblem } from "./siteRouting";
import { fixtureSlugProblem, isFixtureContractorSlug } from "./fixtureContractors";

export type CreationRefusal = {
  code:
    | "NOT_VERIFIED"
    | "NAME_REQUIRED"
    | "SLUG_TAKEN"
    | "SLUG_INVALID"
    | "ALREADY_OWNS";
  message: string;
};

export type CreationResult =
  | { ok: true; contractorId: string; slug: string }
  | { ok: false; refusal: CreationRefusal };

/**
 * Lowercase, hyphenated, no leading, trailing or doubled hyphen, at most 48
 * characters — trimmed AFTER the cut so a long name cannot end on a hyphen.
 * A generated address is still judged by hostedSlugProblem like any other;
 * "Dashboard" slugifies to a reserved word and is refused, not silently used.
 */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
}

/**
 * The longest address creation accepts. Routing allows 63; creation stays at
 * 48 so a generated slug and a typed one obey the same ceiling, and the HTML
 * `pattern` on the create forms can say the same thing.
 */
export const SLUG_MAX = 48;

/**
 * The HTML `pattern` for a slug field: what hostedSlugProblem's SHAPE rules
 * say — lowercase runs of letters and digits joined by single hyphens, 3 to
 * SLUG_MAX characters. The reserved list cannot be a pattern; the server
 * still refuses it.
 */
export const SLUG_INPUT_PATTERN = `(?=.{3,${SLUG_MAX}}$)[a-z0-9]+(-[a-z0-9]+)*`;

/**
 * ONE slug rule. lib/siteRouting.ts's hostedSlugProblem decides what a public
 * storefront address may be — shape, boundaries, doubled hyphens, the
 * reserved list — because that is the rule the router enforces when a
 * homeowner arrives. Creation asks it the same question, plus its own
 * shorter ceiling, so a contractor can never be created at an address the
 * storefront would then refuse to serve.
 */
export function slugProblem(slug: string, opts: IdentityOptions = {}): string | null {
  const problem = hostedSlugProblem(slug);
  if (problem) return problem;
  if (slug.length > SLUG_MAX) return `Too long — use at most ${SLUG_MAX} characters.`;
  // Verifier fixtures are told apart by their slug (lib/fixtureContractors).
  // That only works if no person can create one that matches, so creation
  // refuses the reserved prefixes on every path — self-serve and wizard.
  // A verifier building its probe through the shipped path says so, and
  // then the slug MUST carry a reserved prefix: the flag and the name agree
  // or the identity is refused, so neither can smuggle the other.
  if (opts.verifierFixture) {
    return isFixtureContractorSlug(slug) ? null : "A verifier fixture must carry a reserved prefix (lib/fixtureContractors).";
  }
  return fixtureSlugProblem(slug);
}

/**
 * `verifierFixture` is passed by verifiers only. No page, action or API
 * passes it — scripts/verify-platform-onboarding.ts checks that — so a
 * person can never create a contractor the fixture rule would hide.
 */
export type IdentityOptions = { verifierFixture?: boolean };

/**
 * The name and web address a contractor will be created with, or the refusal
 * a person can act on. Shared by the self-serve path below and the founder's
 * onboarding wizard so the two cannot disagree about what a slug is.
 */
export function validateIdentity(
  input: { name: string; slug?: string },
  opts: IdentityOptions = {},
): { ok: true; name: string; slug: string } | { ok: false; refusal: CreationRefusal } {
  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, refusal: { code: "NAME_REQUIRED", message: "Your business needs a name." } };
  }
  const slug = (input.slug?.trim() || slugify(name)).toLowerCase();
  const problem = slugProblem(slug, opts);
  if (problem) {
    return { ok: false, refusal: { code: "SLUG_INVALID", message: `That web address can't be used: ${problem}` } };
  }
  return { ok: true, name, slug };
}

/** The refusal a slug collision produces, before or during the transaction. */
export function slugTaken(slug: string, raced = false): CreationRefusal {
  return {
    code: "SLUG_TAKEN",
    message: `price2book.com/${slug} ${raced ? "was just taken" : "is already taken"}. Try another web address.`,
  };
}

/** Prisma's unique-constraint failure, by code first and by message as a fallback. */
export function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  if (code === "P2002") return true;
  const message = err instanceof Error ? err.message : "";
  return /Unique constraint/i.test(message);
}

/**
 * Thrown INSIDE a transaction wrapped by `withOwnershipLock` to abort it
 * cleanly when the account already owns a business. A sentinel, not a real
 * error: every caller catches this specific class and turns it into its own
 * refusal message, since "This account already owns a business" reads
 * differently at self-serve signup than at an invitation's acceptance.
 * Never let this escape past the transaction boundary uncaught.
 */
export class OwnershipConflictError extends Error {
  constructor() {
    super("This account already owns a business.");
    this.name = "OwnershipConflictError";
  }
}

/**
 * Thrown INSIDE a transaction wrapped by `withContractorLock` to abort it
 * cleanly when the contractor has been retired since an earlier, unlocked
 * check. Shared across every command that grants OWNER membership or
 * invitation access on a contractor: a fast refusal before opening a
 * transaction is a nicety, not the guarantee — this re-check, taken while
 * the contractor's lock is held, right before the write, is.
 */
export class ContractorRetiredError extends Error {
  constructor() {
    super("This business is retired.");
    this.name = "ContractorRetiredError";
  }
}

/**
 * Two independent lock DOMAINS, so a user-scoped lock and a contractor-scoped
 * lock can never collide with each other by coincidence of hash value.
 * `pg_advisory_xact_lock(int, int)` takes the domain as its first argument
 * and the hashed key as its second — two contractors and two users can still
 * collide with EACH OTHER inside one domain (the hash is not perfect), which
 * only makes two unrelated grants in the SAME domain wait on each other
 * briefly; a genuine correctness check still runs inside the lock either way.
 * A contractor and a user can never collide with EACH OTHER, because they
 * live in different domains.
 */
const LOCK_DOMAIN = {
  /** Grants of a user's first OWNER membership — self-serve creation, attachOwnerFor, invitation acceptance. */
  OWNERSHIP: 1,
  /** Everything that can change ONE contractor's invitation state, membership grants onto it, or its retirement. */
  CONTRACTOR_LIFECYCLE: 2,
} as const;

/**
 * Transaction-scoped Postgres advisory lock. Acquired here, released
 * automatically at commit or rollback — no separate unlock call, and no lock
 * left behind by a crash or an early return.
 *
 * Callers open their own `$transaction`, take the lock(s) they need FIRST,
 * inside it, before reading or writing anything the lock is meant to
 * serialize, and do that reading and writing inside `fn` — everything keyed
 * to the same transaction, so the lock covers exactly the window that
 * matters.
 *
 * LOCK ORDERING, to avoid deadlock. Only two call sites ever need BOTH
 * domains — attachOwnerFor and acceptInvitationFor, which grant an OWNER
 * membership onto one contractor and must therefore also serialize against
 * that user's OTHER ownership grants. Both take CONTRACTOR_LIFECYCLE first,
 * then OWNERSHIP, and nothing in this codebase takes them in the other
 * order — a fixed, global order is what makes two locks safe together.
 */
async function withAdvisoryLock<T>(
  tx: Prisma.TransactionClient,
  domain: number,
  key: string,
  fn: () => Promise<T>
): Promise<T> {
  // Explicit casts: Prisma's tagged-template binding infers a bare JS
  // number as bigint by default, which does not match Postgres's
  // pg_advisory_xact_lock(int, int) overload — confirmed empirically
  // (42883, "function ... does not exist") the first time this ran for
  // real, against the real database, rather than assumed.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${domain}::int, hashtext(${key})::int)`;
  return fn();
}

/** See `withAdvisoryLock`. Serializes every path that can grant a user their first OWNER membership. */
export async function withOwnershipLock<T>(
  tx: Prisma.TransactionClient,
  userId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withAdvisoryLock(tx, LOCK_DOMAIN.OWNERSHIP, userId, fn);
}

/**
 * See `withAdvisoryLock`. Serializes invitation mint/resend/revoke, owner
 * attachment, invitation acceptance, and retirement — everything that reads
 * or changes ONE contractor's "who may join it, who owns it, is it retired"
 * state — so that, taken together, exactly one deterministic outcome exists
 * for any two of these racing on the same contractor, never a partial or
 * inconsistent one.
 */
export async function withContractorLock<T>(
  tx: Prisma.TransactionClient,
  contractorId: string,
  fn: () => Promise<T>
): Promise<T> {
  return withAdvisoryLock(tx, LOCK_DOMAIN.CONTRACTOR_LIFECYCLE, contractorId, fn);
}

/**
 * The standing rule, checked INSIDE `withOwnershipLock`'s transaction: does
 * this account already hold an active OWNER membership on some other
 * contractor? `exceptContractorId` makes the check idempotent for a caller
 * re-granting the SAME contractor (attaching an owner who is already that
 * contractor's owner is not "owning another business").
 */
export async function ownsAnotherBusiness(
  tx: Prisma.TransactionClient | PrismaClient,
  userId: string,
  exceptContractorId?: string
): Promise<boolean> {
  const owned = await tx.contractorMembership.findFirst({
    where: {
      userId,
      role: "OWNER",
      active: true,
      ...(exceptContractorId ? { NOT: { contractorId: exceptContractorId } } : {}),
    },
    select: { contractorId: true },
  });
  return !!owned;
}

/**
 * The tenant itself — contractor, storefront, guided-setup record — with NO
 * membership. The one shape every creation path writes, inside the caller's
 * transaction. Who may administer the new tenant is the caller's decision:
 * the self-serve path below makes the signed-in user its OWNER in the same
 * transaction; the founder's wizard attaches an owner as a later, separate
 * step. Nothing here is reachable by a homeowner until a service is activated.
 */
export async function createContractorRecord(
  tx: Prisma.TransactionClient | PrismaClient,
  input: { name: string; slug: string }
): Promise<{ id: string; slug: string }> {
  const contractor = await tx.contractor.create({
    data: {
      name: input.name,
      slug: input.slug,
      // Live from the start: `active` gates whether a membership can be
      // used at all, and a contractor who cannot open their own dashboard
      // cannot finish setup. What a homeowner can reach is governed by
      // ContractorSite and by each service's own activation.
      active: true,
    },
    select: { id: true, slug: true },
  });

  await tx.contractorSite.create({
    data: {
      contractorId: contractor.id,
      hostedSlug: input.slug,
      // Opaque, stable, globally unique — the routing key a storefront
      // request carries. Generated here so the tenant is addressable the
      // moment it exists.
      // `site_` + 16 random bytes, matching every publicId already issued.
      // A second prefix would be a second thing to recognize, and the
      // embed route has to recognize it.
      publicId: `site_${randomBytes(16).toString("hex")}`,
      active: true,
    },
  });

  await tx.contractorOnboarding.create({
    data: { contractorId: contractor.id, currentStage: "business" },
  });

  return contractor;
}

/**
 * Create a contractor and make this user its OWNER.
 *
 * `db` is the UNGUARDED client — see the header. Callers pass the signed-in
 * user's id and verified state; this does not read the session itself, so the
 * authority stays testable without one.
 */
export async function createContractorForUser(
  db: PrismaClient,
  user: { id: string; emailVerified: boolean },
  input: { name: string; slug?: string }
): Promise<CreationResult> {
  if (!user.emailVerified) {
    return {
      ok: false,
      refusal: {
        code: "NOT_VERIFIED",
        message: "Confirm your email address before creating a business.",
      },
    };
  }

  const identity = validateIdentity(input);
  if (!identity.ok) return identity;
  const { name, slug } = identity;

  // Checked before the transaction for a readable refusal, and enforced by the
  // unique constraints inside it — two signups racing for the same address
  // must not both win, and the loser gets a rename rather than a stack trace.
  const clash = await db.contractor.findFirst({ where: { slug }, select: { id: true } });
  if (clash) return { ok: false, refusal: slugTaken(slug) };

  try {
    const created = await db.$transaction(async (tx) =>
      // ONE OWNED CONTRACTOR PER ACCOUNT, for now — checked and written
      // together, inside the lock, so this cannot race attachOwnerFor or an
      // invitation accepted concurrently. Not a technical limit — the
      // membership model is many-to-many and the switcher at /choose already
      // handles several. It is a guard against the obvious abuse of a
      // self-serve create endpoint, and against a mistyped business name
      // quietly becoming a second tenant. Lifting it later is a product
      // decision; discovering a hundred empty contractors is not.
      withOwnershipLock(tx, user.id, async () => {
        if (await ownsAnotherBusiness(tx, user.id)) throw new OwnershipConflictError();
        const contractor = await createContractorRecord(tx, { name, slug });
        await tx.contractorMembership.create({
          data: {
            contractorId: contractor.id,
            userId: user.id,
            role: "OWNER" as ContractorRole,
            active: true,
          },
        });
        return contractor;
      })
    );

    return { ok: true, contractorId: created.id, slug: created.slug };
  } catch (err) {
    if (err instanceof OwnershipConflictError) {
      return {
        ok: false,
        refusal: {
          code: "ALREADY_OWNS",
          message: "This account already owns a business. Ask us if you need a second one.",
        },
      };
    }
    // The unique constraint is the real arbiter of a race; the pre-check above
    // only buys a better message when there is no race.
    if (isUniqueViolation(err)) return { ok: false, refusal: slugTaken(slug, true) };
    throw err;
  }
}
