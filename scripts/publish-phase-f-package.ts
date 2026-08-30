/**
 * Publish a Phase F starting package the owner has approved by figure.
 *
 *   npx tsx scripts/publish-phase-f-package.ts <slug>          report
 *   npx tsx scripts/publish-phase-f-package.ts <slug> --apply  publish
 *
 * One publisher rather than a bespoke script per service, because by the
 * fourth rescue the gates had stopped changing. What varies is the slug and
 * the figure the owner approved; what does not is the five things that must be
 * true before a price becomes a promise:
 *
 *   1. no price already exists — repricing is a reconciliation decision
 *   2. crew-hours are established and the material cost resolves
 *   3. no role in the recipe is on a cost hold
 *   4. the TREE enforces the scope: exactly one route prices, several reach
 *      review or hand off, none reaches nothing
 *   5. the engine still derives EXACTLY the figure that was approved
 *
 * The fifth is the one that only exists because of this project's history. An
 * approval is given for a number, and between the approval and the write a
 * material cost can move — as 10/3 did, by 64%. Publishing "the derived price"
 * after that would be publishing something nobody approved, while looking like
 * obedience. So the figure is passed in and checked.
 */

import { PrismaClient } from "@prisma/client";
import { suggestPrimaryPrice, suggestWwtPrice, type PricingSettings } from "../lib/pricing";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { publicationHold } from "../lib/materialHolds";
import { serviceSlugKey } from "../prisma/_serviceKey";

const prisma = new PrismaClient();

/** What the owner approved, in cents. A slug absent from here cannot publish. */
const APPROVED: Record<string, { standalone: number; sameVisit: number; note: string }> = {
  "hot-tub-spa-electrical": {
    standalone: 138500, sameVisit: 132000,
    note: "Owner-approved 29 Aug 2026 at the derived figure: 4.0 crew-hours, $292.49 material.",
  },
  // The four garage configurations. Four rows because there are four
  // recipes — a 6-30 on 10/2 and a 14-50 on 6/3 are different jobs, and
  // collapsing them into one row with typed modifiers would put three of the
  // four economies nowhere the reconciler could see them.
  "240v-garage-outlet": {
    standalone: 72500, sameVisit: 66500,
    note: "Owner-approved 29 Aug 2026. 30A 3-prong (NEMA 6-30 on 10/2) — the public service, and the cheapest configuration, which is what a \"from\" price should mean.",
  },
  "240v-garage-outlet-14-30": {
    standalone: 73500, sameVisit: 67500,
    note: "Owner-approved 29 Aug 2026. 30A 4-prong (NEMA 14-30 on 10/3). Hidden; reached by reroute from the public tree.",
  },
  "240v-garage-outlet-6-50": {
    standalone: 78000, sameVisit: 72000,
    note: "Owner-approved 29 Aug 2026. 50A 3-prong (NEMA 6-50 on 6/2) — the welder configuration. Hidden; reached by reroute.",
  },
  "240v-garage-outlet-14-50": {
    standalone: 81500, sameVisit: 75000,
    note: "Owner-approved 29 Aug 2026. 50A 4-prong (NEMA 14-50 on 6/3). Hidden; reached by reroute.",
  },
  "under-cabinet-led-lighting": {
    standalone: 123500, sameVisit: 117000,
    note:
      "Owner-approved 29 Aug 2026 at the derived figure: 4.0 provisional crew-hours, " +
      "$178.41 material, architecture B. Scope stays bounded at one continuous run up " +
      "to 12 ft — explicitly NOT broadened because the old calibration reached $1,800.",
  },
};

async function main() {
  const slug = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!slug || slug.startsWith("--")) {
    console.error(`\n  usage: publish-phase-f-package.ts <slug> [--apply]\n`);
    process.exit(1);
  }
  const approved = APPROVED[slug];
  if (!approved) {
    console.error(`\n  ${slug} has no recorded owner approval. Refusing.\n`);
    console.error(`  A price is published against a figure somebody signed off, not`);
    console.error(`  against whatever the engine happens to say today.\n`);
    process.exit(1);
  }

  console.log(`\n${slug.toUpperCase()}\n`);

  const svc = await prisma.service.findUnique({
    where: await serviceSlugKey(prisma, slug),
    select: {
      id: true, contractorId: true, basePrice: true, whileWeThereBasePrice: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
      materialCostCents: true, materialCostResolved: true, materialMultiplier: true,
      permitAdminCents: true, otherDirectCostCents: true, isPrimaryEligible: true,
    },
  });
  if (!svc) { console.error(`  not in the catalogue.\n`); process.exit(1); }

  if (svc.basePrice !== null || svc.whileWeThereBasePrice !== null) {
    console.log(`  Already published. Repricing is a reconciliation decision.\n`); return;
  }
  if (svc.fieldLaborHours === null || svc.wwtLaborHours === null) {
    console.error(`  No crew-hours. Refusing.\n`); process.exit(1);
  }
  if (!svc.materialCostResolved) {
    console.error(`  Material cost unresolved. Refusing.\n`); process.exit(1);
  }

  const hold = await publicationHold(prisma as any, svc.contractorId, slug);
  if (hold) { console.error(`  REFUSED — ${hold}\n`); process.exit(1); }
  console.log(`  ✓ no role on a cost hold`);

  const settings = await loadPricingSettings(prisma as any, svc.contractorId);
  const full = await loadServiceForResolution(prisma as any, svc.id);
  if (!full || full.questions.length === 0) {
    console.error(`  No tree. A price with no boundary behind it is a quote wearing a number.\n`);
    process.exit(1);
  }

  const byId = new Map(full.questions.map((q: any) => [q.id, q]));
  const nk = (o: any) =>
    o.routeAction === "CONTINUE" && o.nextQuestionId ? (byId.get(o.nextQuestionId) as any)?.key ?? null : null;
  let priced = 0, review = 0, handoff = 0, dead = 0;
  const walk = (k: string | null, ans: Record<string, string>) => {
    if (!k) {
      const r: any = resolveRoute(full as any, ans, true, settings!);
      if (r.status === "PRICED") priced++;
      else if (r.status === "REVIEW") review++;
      else if (r.status === "REROUTE") handoff++;
      else if (/has no published (base|add-on) price/.test(String(r.reason))) priced++;
      else { dead++; console.log(`      dead route: ${r.reason}`); }
      return;
    }
    const q: any = full.questions.find((x: any) => x.key === k);
    if (!q) return;
    for (const o of q.options) walk(nk(o), { ...ans, [q.key]: o.value });
  };
  walk(full.questions[0]?.key ?? null, {});
  console.log(`  ✓ routes: ${priced} priced / ${review} review / ${handoff} hand-off / ${dead} dead`);
  if (dead > 0) { console.error(`\n  Refusing: ${dead} route(s) reach nothing.\n`); process.exit(1); }
  if (priced !== 1) { console.error(`\n  Refusing: expected 1 pricing route, found ${priced}.\n`); process.exit(1); }
  if (review < 5) { console.error(`\n  Refusing: only ${review} review routes — boundary looks unenforced.\n`); process.exit(1); }

  const inputs = {
    fieldLaborHours: svc.fieldLaborHours, wwtLaborHours: svc.wwtLaborHours,
    requiresTechCount: svc.requiresTechCount, materialCostCents: svc.materialCostCents,
    materialMultiplier: svc.materialMultiplier, permitAdminCents: svc.permitAdminCents,
    otherDirectCostCents: svc.otherDirectCostCents, isPrimaryEligible: svc.isPrimaryEligible,
  };
  const primary = suggestPrimaryPrice(inputs, settings as unknown as PricingSettings);
  const wwt = suggestWwtPrice(inputs, settings as unknown as PricingSettings);
  if (primary.totalCents === null || wwt.totalCents === null) {
    console.error(`\n  The engine produced no price. Refusing.\n`); process.exit(1);
  }

  console.log(`  derived $${(primary.totalCents / 100).toFixed(2)} / $${(wwt.totalCents / 100).toFixed(2)}`);
  console.log(`  approved $${(approved.standalone / 100).toFixed(2)} / $${(approved.sameVisit / 100).toFixed(2)}`);

  if (primary.totalCents !== approved.standalone || wwt.totalCents !== approved.sameVisit) {
    console.error(`\n  REFUSED — the engine no longer derives the approved figure.`);
    console.error(`  Something moved between the approval and this run. Publishing the`);
    console.error(`  new number would publish something nobody approved.\n`);
    process.exit(1);
  }
  console.log(`  ✓ engine agrees with the approval`);

  if (!apply) { console.log(`\n  Report only. Re-run with --apply to publish.\n`); return; }

  await prisma.service.update({
    where: { id: svc.id },
    data: {
      basePrice: primary.totalCents,
      whileWeThereBasePrice: wwt.totalCents,
      publishedPriceApprovedAt: new Date(),
    },
  });
  console.log(`\n  ✓ Published. ${approved.note}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
