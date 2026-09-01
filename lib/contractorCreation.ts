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

import type { PrismaClient, ContractorRole } from "@prisma/client";
import { randomBytes } from "node:crypto";

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

/** Lowercase, hyphenated, no leading or trailing hyphen. A public address. */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const SLUG_SHAPE = /^[a-z0-9](?:[a-z0-9-]{1,46}[a-z0-9])$/;

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

  const name = input.name?.trim() ?? "";
  if (!name) {
    return { ok: false, refusal: { code: "NAME_REQUIRED", message: "Your business needs a name." } };
  }

  const slug = (input.slug?.trim() || slugify(name)).toLowerCase();
  if (!SLUG_SHAPE.test(slug)) {
    return {
      ok: false,
      refusal: {
        code: "SLUG_INVALID",
        message:
          "That web address can only use lowercase letters, numbers and hyphens, " +
          "and must be at least three characters.",
      },
    };
  }

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
  if (clash) {
    return {
      ok: false,
      refusal: {
        code: "SLUG_TAKEN",
        message: `price2book.com/${slug} is already taken. Try another web address.`,
      },
    };
  }

  try {
    const created = await db.$transaction(async (tx) => {
      const contractor = await tx.contractor.create({
        data: {
          name,
          slug,
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
          hostedSlug: slug,
          // Opaque, stable, globally unique — the routing key a storefront
          // request carries. Generated here so the tenant is addressable the
          // moment it exists.
          publicId: `pub_${randomBytes(16).toString("hex")}`,
          active: true,
        },
      });

      await tx.contractorMembership.create({
        data: {
          contractorId: contractor.id,
          userId: user.id,
          role: "OWNER" as ContractorRole,
          active: true,
        },
      });

      await tx.contractorOnboarding.create({
        data: { contractorId: contractor.id, currentStage: "business" },
      });

      return contractor;
    });

    return { ok: true, contractorId: created.id, slug: created.slug };
  } catch (err) {
    // The unique constraint is the real arbiter of a race; the pre-check above
    // only buys a better message when there is no race.
    const message = err instanceof Error ? err.message : "";
    if (/Unique constraint/i.test(message)) {
      return {
        ok: false,
        refusal: {
          code: "SLUG_TAKEN",
          message: `price2book.com/${slug} was just taken. Try another web address.`,
        },
      };
    }
    throw err;
  }
}
