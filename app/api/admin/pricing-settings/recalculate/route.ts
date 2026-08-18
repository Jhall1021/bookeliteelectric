import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

function ceilToIncrement(cents: number, incrementCents: number): number {
  if (incrementCents <= 0) return Math.round(cents);
  return Math.ceil(cents / incrementCents) * incrementCents;
}

// Reproduces the exact formula from the client's validated Excel pricing
// engine (Pricing Engine v2 tab) — not a simplified approximation:
//   Recommended Primary = CEILING(MAX(
//       primaryLaborUnits*rate + materialCost*multiplier + permitAdmin,
//       primaryLaborUnits > 0 ? primaryMinimum : 0
//     ), roundingIncrement)
//   Recommended Add-On = CEILING(addOnLaborUnits*rate + materialCost*multiplier, roundingIncrement)
//     — left UNCHANGED (not zeroed out) when both addOnLaborUnits and
//     materialCost are 0, since that means "no While We're There concept
//     for this service" (e.g. Electrical Troubleshooting), not "$0".
export async function POST() {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const settings = await prisma.pricingSettings.findUnique({ where: { id: "default" } });
  if (!settings) {
    return NextResponse.json({ error: "Pricing settings haven't been configured yet" }, { status: 400 });
  }

  const services = await prisma.service.findMany({
    where: { primaryLaborUnits: { not: null } },
    select: {
      id: true, slug: true, name: true, basePrice: true, whileWeThereBasePrice: true,
      primaryLaborUnits: true, addOnLaborUnits: true, materialCostCents: true,
      materialMultiplier: true, permitAdminCents: true,
    },
  });

  const changes: {
    name: string; oldPrimary: number | null; newPrimary: number;
    oldAddOn: number | null; newAddOn: number | null;
  }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const svc of services) {
      const primaryUnits = svc.primaryLaborUnits ?? 0;
      const addOnUnits = svc.addOnLaborUnits ?? 0;
      const materialCost = svc.materialCostCents ?? 0;
      const multiplier = svc.materialMultiplier ?? 1;
      const permit = (svc.permitAdminCents ?? 0) > 0 ? svc.permitAdminCents! : settings.defaultPermitAdminCents;

      const materialSell = materialCost * multiplier;

      const laborPrimary = primaryUnits * settings.targetRateCents;
      const calcPrimary = laborPrimary + materialSell + permit;
      const floor = primaryUnits > 0 ? settings.primaryMinimumCents : 0;
      const newPrimary = ceilToIncrement(Math.max(calcPrimary, floor), settings.roundingIncrementCents);

      let newAddOn: number | null = svc.whileWeThereBasePrice;
      if (!(addOnUnits === 0 && materialCost === 0)) {
        const laborAddOn = addOnUnits * settings.targetRateCents;
        newAddOn = ceilToIncrement(laborAddOn + materialSell, settings.roundingIncrementCents);
      }

      await tx.service.update({
        where: { id: svc.id },
        data: { basePrice: newPrimary, whileWeThereBasePrice: newAddOn },
      });

      changes.push({
        name: svc.name,
        oldPrimary: svc.basePrice,
        newPrimary,
        oldAddOn: svc.whileWeThereBasePrice,
        newAddOn,
      });
    }
  });

  return NextResponse.json({ ok: true, updatedCount: changes.length, changes });
}
