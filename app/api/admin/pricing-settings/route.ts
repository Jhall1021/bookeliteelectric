import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

// Saving settings here does NOT change any live price — it only stores
// the rate/minimum/rounding for the NEXT time "Recalculate" is run. This
// separation is deliberate: typing a new rate shouldn't silently change
// what customers see until you explicitly confirm it.
export async function PATCH(req: Request) {
  return withAdminContractor(async (db, ctx) => {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { targetRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents } = await req.json();

  if (
    typeof targetRateCents !== "number" ||
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
    update: { targetRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents },
    create: {
      contractorId: ctx.contractorId,
      targetRateCents,
      primaryMinimumCents,
      roundingIncrementCents,
      defaultPermitAdminCents,
    },
  });

  return NextResponse.json({ ok: true });
  });
}
