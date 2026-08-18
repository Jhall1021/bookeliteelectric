import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

// Saving settings here does NOT change any live price — it only stores
// the rate/minimum/rounding for the NEXT time "Recalculate" is run. This
// separation is deliberate: typing a new rate shouldn't silently change
// what customers see until you explicitly confirm it.
export async function PATCH(req: Request) {
  if (!isAdminAuthenticated()) {
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

  await prisma.pricingSettings.upsert({
    where: { id: "default" },
    update: { targetRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents },
    create: { id: "default", targetRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents },
  });

  return NextResponse.json({ ok: true });
}
