import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

// Saving settings here does NOT change any live price — it only stores
// the rate/minimum/rounding for the NEXT time "Recalculate" is run. This
// separation is deliberate: typing a new rate shouldn't silently change
// what customers see until you explicitly confirm it.
export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {

  const { crewHourRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents } = await req.json();

  if (
    typeof crewHourRateCents !== "number" ||
    typeof primaryMinimumCents !== "number" ||
    typeof roundingIncrementCents !== "number" ||
    typeof defaultPermitAdminCents !== "number"
  ) {
    return NextResponse.json({ error: "Invalid values" }, { status: 400 });
  }

  // ADR-007a: keyed by contractor. `id: "default"` meant one labour rate for
  // every contractor — and this route SETS the rate that prices their work.
  await db.pricingSettings.upsert({
    where: { contractorId: ctx.contractorId },
    update: { crewHourRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents },
    create: {
      contractorId: ctx.contractorId,
      crewHourRateCents,
      primaryMinimumCents,
      roundingIncrementCents,
      defaultPermitAdminCents,
    },
  });

  return NextResponse.json({ ok: true });
  });
}
