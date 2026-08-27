import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { soleContractorId } from "@/lib/categories";
import { withContractor } from "@/lib/tenantRoute";

export async function POST(req: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const body = await req.json();
  const { categoryId, name, slug, shortDescription, bookingType, basePrice, whileWeThereBasePrice, startingPriceLabel, icon } = body;

  if (!categoryId || !name || !slug || !bookingType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // GUARD-ADOPTED (ADR-007a).
  const contractorId = await soleContractorId(prisma, "the new-service route");

  return withContractor(contractorId, "admin-session", async (db) => {
  // NOTE: still resolves by slug alone, which works only while Service.slug is
  // globally unique. Under the guard this now means "does THIS contractor
  // already have that slug" — which is the correct question, and becomes the
  // only possible one once slugs are per-contractor. See ADR-008's sequencing.
  const existing = await db.service.findUnique({ where: { slug } });
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
      basePrice: typeof basePrice === "number" ? basePrice : null,
      whileWeThereBasePrice: typeof whileWeThereBasePrice === "number" ? whileWeThereBasePrice : null,
      startingPriceLabel: startingPriceLabel ?? null,
      icon: icon ?? null,
      active: true,
    },
  });

  return NextResponse.json({ id: service.id });
  });
}
