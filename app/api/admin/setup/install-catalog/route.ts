/**
 * Install this contractor's canonical catalog.
 *
 * GET  — the preview: what installing would create.
 * POST — install it, atomically.
 *
 * BOTH READ THE SAME SOURCE, so the preview cannot promise a different catalog
 * than the install delivers. That is not a nicety: the preview is the only
 * thing the contractor sees before dozens of services appear in their account.
 *
 * WHAT THIS CANNOT DO
 *
 * Seed a price, a labor hour, a material cost, a markup or a minimum; mark
 * anything offered; make anything active. A canonical template owns structure
 * and the contractor owns every economic value, so provisioning that made a
 * catalog "look ready" would be inventing their business decisions.
 */

import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { prisma } from "@/lib/prisma";
import {
  templateVersionSource, preflight, installCatalog,
} from "@/lib/templateProvisioning";

/** The one enrolment V1 allows, or a refusal a contractor can act on. */
async function enrolledTrade(
  db: Parameters<Parameters<typeof withAdminRoute>[0]>[0],
  contractorId: string
) {
  const enrolments = await db.contractorTrade.findMany({
    where: { contractorId }, orderBy: { enrolledAt: "asc" },
  });
  return enrolments[0] ?? null;
}

export async function GET() {
  return withAdminRoute(async (db, ctx) => {
    const enrolment = await enrolledTrade(db, ctx.contractorId);
    if (!enrolment) {
      return NextResponse.json(
        { error: "NOT_ENROLLED", message: "Choose your trade first." },
        { status: 409 }
      );
    }
    const pre = await preflight(
      db, ctx.contractorId, templateVersionSource(prisma, enrolment.tradeKey)
    );
    if (!pre.ok) {
      return NextResponse.json({ error: pre.code, message: pre.message }, { status: 409 });
    }
    return NextResponse.json({ ok: true, preview: pre.preview });
  });
}

export async function POST() {
  return withAdminRoute(async (db, ctx) => {
    const enrolment = await enrolledTrade(db, ctx.contractorId);
    if (!enrolment) {
      return NextResponse.json(
        { error: "NOT_ENROLLED", message: "Choose your trade first." },
        { status: 409 }
      );
    }

    const pre = await preflight(
      db, ctx.contractorId, templateVersionSource(prisma, enrolment.tradeKey)
    );
    if (!pre.ok) {
      return NextResponse.json({ error: pre.code, message: pre.message }, { status: 409 });
    }

    // The UNGUARDED client, as the guard itself instructs: questions and answer
    // options are derived models with no contractorId to stamp, so they cannot
    // be created under it. The contractor is already established above, by an
    // authenticated membership, and every write is keyed to that id inside one
    // transaction.
    const result = await installCatalog(prisma, ctx.contractorId, pre.catalog);
    return NextResponse.json({ ok: true, ...result, trade: enrolment.tradeKey });
  });
}
