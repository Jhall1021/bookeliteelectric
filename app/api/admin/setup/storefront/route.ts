/**
 * Give this contractor a routable Price2Book storefront.
 *
 * `SITE_MISSING` used to be a dead end: storefront identity was created by
 * provisioning, so a contractor without one had a blocker they could not act
 * on and no one to ask. This is the sanctioned action that clears it.
 *
 * THE CONTRACTOR DOES NOT CHOOSE THE ROUTING IDENTITY.
 *
 * `publicId` is opaque by design — it is what a customer-facing request
 * carries to say which storefront it acts for, and it must reveal nothing and
 * be rotatable without renaming anything a homeowner sees. `hostedSlug` is a
 * public address subject to platform reservations. Neither is accepted from
 * the request: the server derives an available address from the contractor's
 * own slug and issues the opaque id itself.
 *
 * Vanity addresses and custom domains are NOT modeled here. The blocker this
 * clears is "there is nowhere to send a homeowner", not "the address is
 * pretty".
 */

import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { withAdminRoute } from "@/lib/adminContext";
import { hostedSlugProblem } from "@/lib/siteRouting";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    const existing = await db.contractorSite.findFirst({ where: { contractorId: ctx.contractorId } });
    if (existing) {
      // Readiness deliberately asks for an ACTIVE storefront. Returning
      // "already exists" for an inactive row left the contractor in a loop:
      // the button succeeded, but SITE_MISSING could never clear. Reuse the
      // existing routing identity and reactivate it instead of minting a
      // second storefront for the same contractor.
      if (!existing.active) {
        const site = await db.contractorSite.update({
          where: { id: existing.id },
          data: { active: true },
          select: { hostedSlug: true },
        });
        return NextResponse.json({ ok: true, reactivated: true, hostedSlug: site.hostedSlug });
      }

      return NextResponse.json(
        { ok: true, alreadyExists: true, hostedSlug: existing.hostedSlug },
        { status: 200 }
      );
    }

    const base = ctx.contractorSlug;

    // hostedSlug is globally unique, so "check then create" has a race: two
    // contractors can both observe the same candidate as free before either
    // insert lands. The unique constraint is the authority. Try deterministic
    // candidates and advance only when that constraint says one was taken.
    for (let n = 1; n <= 49; n++) {
      const candidate = n === 1 ? base : `${base}-${n}`;
      if (hostedSlugProblem(candidate)) continue;

      try {
        const site = await db.contractorSite.create({
          data: {
            contractorId: ctx.contractorId,
            hostedSlug: candidate,
            publicId: `site_${randomBytes(16).toString("hex")}`,
            active: true,
          },
          select: { hostedSlug: true },
        });

        // publicId is deliberately NOT returned: nothing the contractor does
        // needs it, and it is not theirs to copy around.
        return NextResponse.json({ ok: true, hostedSlug: site.hostedSlug });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          continue;
        }
        throw error;
      }
    }

    return NextResponse.json(
      {
        error: "NO_AVAILABLE_ADDRESS",
        message: "We couldn't derive an available storefront address from your business slug. Contact support.",
      },
      { status: 409 }
    );
  });
}
