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
import { withAdminRoute } from "@/lib/adminContext";
import { hostedSlugProblem } from "@/lib/siteRouting";
import { prisma } from "@/lib/prisma";

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    const existing = await db.contractorSite.findFirst({ where: { contractorId: ctx.contractorId } });
    if (existing) {
      return NextResponse.json(
        { ok: true, alreadyExists: true, hostedSlug: existing.hostedSlug },
        { status: 200 }
      );
    }

    const base = ctx.contractorSlug;
    // Uniqueness is global — hostedSlug is a public address — so the check runs
    // on the unguarded client. It reads nothing but slugs, and a contractor
    // must not be handed an address that silently collides with another
    // tenant's.
    let candidate = base;
    for (let n = 2; n < 50; n++) {
      const problem = hostedSlugProblem(candidate);
      const taken = problem ? true : Boolean(
        await prisma.contractorSite.findUnique({ where: { hostedSlug: candidate }, select: { id: true } })
      );
      if (!taken) break;
      candidate = `${base}-${n}`;
    }
    if (hostedSlugProblem(candidate)) {
      return NextResponse.json(
        {
          error: "NO_AVAILABLE_ADDRESS",
          message: "We couldn't derive a storefront address from your business slug. Contact support.",
        },
        { status: 409 }
      );
    }

    const site = await db.contractorSite.create({
      data: {
        contractorId: ctx.contractorId,
        hostedSlug: candidate,
        publicId: `site_${randomBytes(16).toString("hex")}`,
        active: true,
      },
      select: { hostedSlug: true },
    });

    // publicId is deliberately NOT returned: nothing the contractor does needs
    // it, and it is not theirs to copy around.
    return NextResponse.json({ ok: true, hostedSlug: site.hostedSlug });
  });
}
