import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";


export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  // No price is accepted at creation. A service is created unpriced and priced
  // through its pricing route's publish action, which derives the figure and
  // stamps the approval. See app/api/admin/services/[serviceId]/pricing.
  const { categoryId, name, slug, shortDescription, bookingType, startingPriceLabel, icon } = body;

  if (!categoryId || !name || !slug || !bookingType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // GUARD-ADOPTED (ADR-007a).

  return withAdminContractor(async (db, ctx) => {
  const contractorId = ctx.contractorId;
  // findFirst, not findUnique: slug is unique PER CONTRACTOR now, so it is no
  // longer a unique selector on its own. The guard scopes this to the active
  // contractor, which makes the question "does THIS contractor already have
  // that slug" — the only question that was ever correct here.
  const existing = await db.service.findFirst({ where: { slug } });
  if (existing) {
    return NextResponse.json({ error: `A service with the slug "${slug}" already exists — try a different name or edit the slug.` }, { status: 409 });
  }

  // `categoryId` from the form is a ContractorCategory id — ADR-006. The
  // new-service page lists this contractor's categories, not the shared
  // taxonomy.
  //
  // Checked against the contractor rather than trusted. A client can post any
  // id; without this a service could be attached to another contractor's
  // category, which is a cross-tenant foreign key written by the request body.
  // The hand-written `contractorId` filter is gone: the guard scopes this
  // centrally, so a category belonging to someone else simply is not found.
  const contractorCategory = await db.contractorCategory.findFirst({
    where: { id: categoryId },
    include: { canonicalCategory: { select: { slug: true } } },
  });
  if (!contractorCategory) {
    return NextResponse.json(
      { error: "That category does not belong to this contractor" },
      { status: 403 }
    );
  }

  // EXPAND-PHASE WRITE. Service.categoryId is still NOT NULL, so the legacy
  // row has to be filled to satisfy the column. It is DERIVED from the
  // canonical slug rather than taken from the request — the contractor
  // category is the source of truth, and this write disappears in the
  // contract phase when ServiceCategory is dropped.
  // Deprecated compatibility read, on the unguarded client by design:
  // ServiceCategory is a DEPRECATED_MODEL awaiting the contract-phase drop,
  // holds no tenant data, and this write only exists to satisfy the NOT NULL
  // column. Derived from the canonical slug, never from the request.
  const legacy = await prisma.serviceCategory.findUnique({
    where: { slug: contractorCategory.canonicalCategory.slug },
    select: { id: true },
  });
  if (!legacy) {
    return NextResponse.json(
      {
        error:
          `No legacy ServiceCategory for slug "${contractorCategory.canonicalCategory.slug}". ` +
          `Run prisma/backfill-category-split-2026-08-27.ts.`,
      },
      { status: 500 }
    );
  }

  // Service is directly tenant-owned, so the guard stamps contractorId on the
  // create — the explicit one below is kept for readability, and the guard
  // refuses outright if the two ever disagree.
  const service = await db.service.create({
    data: {
      categoryId: legacy.id,
      contractorCategoryId: contractorCategory.id,
      // Without this a new service has no owner, and route resolution throws
      // on it the first time anyone opens its page.
      contractorId,
      name,
      slug,
      shortDescription: shortDescription ?? null,
      bookingType,
      startingPriceLabel: startingPriceLabel ?? null,
      icon: icon ?? null,
      active: true,
    },
  });

  return NextResponse.json({ id: service.id });
  });
}
