/**
 * Bringing a contractor into existence, and its first owner with it.
 *
 * THE ONLY SANCTIONED WAY. Until now there was none: invitation into an
 * existing contractor was built, and a brand-new user creating their own
 * tenant was a gap that had to be closed with a direct membership write. That
 * was acceptable for a fixture and is not acceptable for release, because a
 * hand-written membership is a tenant grant nobody reviewed.
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
 */

import type { PrismaClient, ContractorRole, Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { hostedSlugProblem } from "./siteRouting";

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
export function slugProblem(slug: string): string | null {
  const problem = hostedSlugProblem(slug);
  if (problem) return problem;
  if (slug.length > SLUG_MAX) return `Too long — use at most ${SLUG_MAX} characters.`;
  return null;
}

/**
 * The name and web address a contractor will be created with, or the refusal
 * a person can act on. Shared by the self-serve path below and the founder's
 * onboarding wizard so the two cannot disagree about what a slug is.
 */
export function validateIdentity(
  input: { name: string; slug?: string }
): { ok: true; name: string; slug: string } | { ok: false; refusal: CreationRefusal } {
  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, refusal: { code: "NAME_REQUIRED", message: "Your business needs a name." } };
  }
  const slug = (input.slug?.trim() || slugify(name)).toLowerCase();
  const problem = slugProblem(slug);
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

  // ONE OWNED CONTRACTOR PER ACCOUNT, for now.
  //
  // Not a technical limit — the membership model is many-to-many and the
  // switcher at /choose already handles several. It is a guard against the
  // obvious abuse of a self-serve create endpoint, and against a mistyped
  // business name quietly becoming a second tenant. Lifting it later is a
  // product decision; discovering a hundred empty contractors is not.
  const owned = await db.contractorMembership.findFirst({
    where: { userId: user.id, role: "OWNER", active: true },
    select: { contractorId: true },
  });
  if (owned) {
    return {
      ok: false,
      refusal: {
        code: "ALREADY_OWNS",
        message: "This account already owns a business. Ask us if you need a second one.",
      },
    };
  }

  // Checked before the transaction for a readable refusal, and enforced by the
  // unique constraints inside it — two signups racing for the same address
  // must not both win, and the loser gets a rename rather than a stack trace.
  const clash = await db.contractor.findFirst({ where: { slug }, select: { id: true } });
  if (clash) return { ok: false, refusal: slugTaken(slug) };

  try {
    const created = await db.$transaction(async (tx) => {
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
    });

    return { ok: true, contractorId: created.id, slug: created.slug };
  } catch (err) {
    // The unique constraint is the real arbiter of a race; the pre-check above
    // only buys a better message when there is no race.
    if (isUniqueViolation(err)) return { ok: false, refusal: slugTaken(slug, true) };
    throw err;
  }
}
