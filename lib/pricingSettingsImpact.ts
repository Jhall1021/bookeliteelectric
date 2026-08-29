/**
 * What a change to the rate or the minimum would do to the published book.
 *
 * Saving these figures does not move a published price — basePrice is stored,
 * not recomputed — and that is exactly what makes the change quiet. What it
 * moves is the MODEL every published price is judged against. Change the rate
 * and a catalogue that reconciled yesterday is out by a hundred prices today,
 * with nothing on screen to say so.
 *
 * This measures that before the save, so the number can be shown to the person
 * making the decision and stored alongside what they decided.
 *
 * Counts PRICE POINTS, not services: a service carries a standalone price and
 * a same-visit price and they can disagree with the model independently.
 */

import type { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice, type PricingSettings } from "./pricing";

/** Rounding is $5, so anything inside that is agreement, not a gap. */
const TOLERANCE_CENTS = 500;

export type SettingsImpact = {
  /** Published price points that would no longer agree with the model. */
  affected: number;
  /** Price points the model can judge at all. */
  judged: number;
  raised: number;
  lowered: number;
  largestChangeCents: number;
  examples: { slug: string; kind: "standalone" | "same-visit"; publishedCents: number; modelCents: number }[];
};

export async function pricingSettingsImpact(
  db: PrismaClient,
  contractorId: string,
  proposed: PricingSettings
): Promise<SettingsImpact> {
  const services = await db.service.findMany({
    where: { contractorId, active: true },
    select: {
      slug: true, basePrice: true, whileWeThereBasePrice: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
      materialCostCents: true, materialMultiplier: true, permitAdminCents: true,
      otherDirectCostCents: true, isPrimaryEligible: true,
    },
    orderBy: { slug: "asc" },
  });

  const out: SettingsImpact = {
    affected: 0, judged: 0, raised: 0, lowered: 0, largestChangeCents: 0, examples: [],
  };

  for (const s of services) {
    const inputs = {
      fieldLaborHours: s.fieldLaborHours,
      wwtLaborHours: s.wwtLaborHours,
      requiresTechCount: s.requiresTechCount,
      materialCostCents: s.materialCostCents,
      materialMultiplier: s.materialMultiplier,
      permitAdminCents: s.permitAdminCents,
      otherDirectCostCents: s.otherDirectCostCents,
      isPrimaryEligible: s.isPrimaryEligible,
    };

    const pairs: [number | null, number | null, "standalone" | "same-visit"][] = [
      [s.basePrice, suggestPrimaryPrice(inputs, proposed).totalCents, "standalone"],
      [s.whileWeThereBasePrice, suggestWwtPrice(inputs, proposed).totalCents, "same-visit"],
    ];

    for (const [published, model, kind] of pairs) {
      // A price the model cannot produce is not evidence either way. Counting
      // it as "unaffected" would understate the blast radius.
      if (published === null || model === null) continue;
      out.judged++;
      const delta = model - published;
      if (Math.abs(delta) <= TOLERANCE_CENTS) continue;
      out.affected++;
      if (delta > 0) out.raised++;
      else out.lowered++;
      if (Math.abs(delta) > Math.abs(out.largestChangeCents)) out.largestChangeCents = delta;
      if (out.examples.length < 5) {
        out.examples.push({ slug: s.slug, kind, publishedCents: published, modelCents: model });
      }
    }
  }

  return out;
}
