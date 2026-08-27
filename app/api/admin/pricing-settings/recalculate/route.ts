import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

import { suggestPrimaryPrice, suggestWwtPrice, type PricingSettings } from "@/lib/pricing";
import { withAdminContractor } from "@/lib/adminContext";

/**
 * Preview what the model says, against what's published.
 *
 * THIS NO LONGER WRITES ANYTHING, AND THAT IS THE POINT.
 *
 * It used to bulk-rewrite every published price in one click, and by the end
 * of the August reconciliation it would have destroyed that work:
 *
 *   - it selected on `primaryLaborUnits`, the legacy workbook field, so the
 *     crew-hours established in August were invisible to it
 *   - it read `materialMultiplier ?? 1`, and those overrides were
 *     deliberately cleared — so every material package would have been
 *     priced at cost with no markup at all
 *   - it applied the old band formula rather than the progressive markup
 *   - and it wrote all of it straight to basePrice in a transaction
 *
 * Pressing the button would have reverted 82 reconciled prices to figures
 * derived from data we had just replaced, with no record of what changed.
 *
 * A published price now moves in exactly two ways: a person edits one service
 * in the admin, or a named migration carries owner-approved figures. Neither
 * is a button that reprices the catalog.
 *
 * What survives is the useful half — showing where published and model
 * disagree, using the CURRENT model.
 */
export async function POST() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // GUARD-ADOPTED (ADR-007a). Swept every active service with no contractor
  // condition, so a second contractor's catalog would have appeared in this
  // contractor's recalculation report.
  return withAdminContractor(async (db, ctx) => {
  const contractorId = ctx.contractorId;

  // ADR-007a: PricingSettings carries contractorId and is tenant-scoped. This
  // read used `where: { id: "default" }` — the pre-tenant singleton row — so
  // with two contractors every admin surface would have read the same
  // settings regardless of who was asking. Keyed by contractor now, on the
  // guarded client.
  const settings = (await db.pricingSettings.findUnique({
    where: { contractorId },
  })) as PricingSettings | null;
  if (!settings) {
    return NextResponse.json(
      { error: "Pricing settings haven't been configured yet" },
      { status: 400 }
    );
  }

  const services = await db.service.findMany({
    where: { active: true, fieldLaborHours: { not: null } },
    orderBy: { name: "asc" },
    select: {
      slug: true, name: true, basePrice: true, whileWeThereBasePrice: true,
      fieldLaborHours: true, wwtLaborHours: true, requiresTechCount: true,
      materialCostCents: true, materialMultiplier: true,
      permitAdminCents: true, otherDirectCostCents: true, isPrimaryEligible: true,
    },
  });

  const differences = [];

  for (const svc of services) {
    const inputs = {
      fieldLaborHours: svc.fieldLaborHours,
      wwtLaborHours: svc.wwtLaborHours,
      requiresTechCount: svc.requiresTechCount,
      materialCostCents: svc.materialCostCents,
      materialMultiplier: svc.materialMultiplier,
      permitAdminCents: svc.permitAdminCents,
      otherDirectCostCents: svc.otherDirectCostCents,
      isPrimaryEligible: svc.isPrimaryEligible,
    };

    const primary = suggestPrimaryPrice(inputs, settings).totalCents;
    const wwt = svc.wwtLaborHours === null ? null : suggestWwtPrice(inputs, settings).totalCents;

    // $5 is the rounding increment, so anything inside it is agreement.
    const primaryOff = primary !== null && svc.basePrice !== null
      && Math.abs(primary - svc.basePrice) > 500;
    const wwtOff = wwt !== null && svc.whileWeThereBasePrice !== null
      && Math.abs(wwt - svc.whileWeThereBasePrice) > 500;

    if (primaryOff || wwtOff) {
      differences.push({
        slug: svc.slug,
        name: svc.name.trim(),
        publishedPrimary: svc.basePrice,
        modelPrimary: primary,
        publishedAddOn: svc.whileWeThereBasePrice,
        modelAddOn: wwt,
      });
    }
  }

  return NextResponse.json({
    ok: true,
    readOnly: true,
    checked: services.length,
    differences,
    message:
      differences.length === 0
        ? `All ${services.length} model-priced services match. Nothing to reconcile.`
        : `${differences.length} of ${services.length} differ from the model. ` +
          `Nothing was changed — publish individually from each service, or ` +
          `raise a reconciliation migration for a batch.`,
  });
  });
}
