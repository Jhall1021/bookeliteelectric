import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminRoute } from "@/lib/adminContext";
import { availableTrades } from "@/lib/templateProvisioning";

const BOOKING_TYPES = new Set(["INSTANT", "ADJUSTED", "REMOTE_QUOTE"]);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function optionalText(value: unknown, label: string): string | null | NextResponse {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") {
    return NextResponse.json({ error: `${label} must be text.` }, { status: 400 });
  }
  return value.trim() || null;
}

function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  // No price is accepted at creation. A service is created unpriced and priced
  // through its pricing route's publish action, which derives the figure and
  // stamps the approval. See app/api/admin/services/[serviceId]/pricing.
  const categoryId = typeof body.categoryId === "string" ? body.categoryId.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const slug = typeof body.slug === "string" ? body.slug.trim() : "";
  const bookingType = typeof body.bookingType === "string" ? body.bookingType : "";
  const tradeKey = typeof body.tradeKey === "string" ? body.tradeKey.trim() : "";
  const shortDescription = optionalText(body.shortDescription, "Description");
  if (isResponse(shortDescription)) return shortDescription;
  const startingPriceLabel = optionalText(body.startingPriceLabel, "Starting price label");
  if (isResponse(startingPriceLabel)) return startingPriceLabel;
  const icon = optionalText(body.icon, "Icon");
  if (isResponse(icon)) return icon;

  if (!categoryId || !name || !slug || !bookingType) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }
  if (!SLUG.test(slug)) {
    return NextResponse.json(
      { error: "URL slug may contain lowercase letters, numbers and single hyphens only." },
      { status: 400 }
    );
  }
  if (!BOOKING_TYPES.has(bookingType)) {
    return NextResponse.json({ error: "Choose a valid booking type." }, { status: 400 });
  }

  // TRADE IS REQUIRED, AND EXPLICIT — G2.
  if (!tradeKey) {
    return NextResponse.json(
      { error: "Choose which trade this service belongs to." },
      { status: 400 }
    );
  }

  return withAdminRoute(async (db, ctx) => {
    const contractorId = ctx.contractorId;

    const existing = await db.service.findFirst({ where: { slug } });
    if (existing) {
      return NextResponse.json(
        { error: `A service with the slug "${slug}" already exists — try a different name or edit the slug.` },
        { status: 409 }
      );
    }

    const trades = await availableTrades(db);
    if (!trades.includes(tradeKey)) {
      return NextResponse.json(
        { error: `"${tradeKey}" is not a trade Price2Book publishes a catalog for yet.` },
        { status: 400 }
      );
    }

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
    // canonical slug rather than taken from the request.
    const legacy = await prisma.serviceCategory.findUnique({
      where: { slug: contractorCategory.canonicalCategory.slug },
      select: { id: true },
    });
    if (!legacy) {
      console.error(
        "[admin/services] missing legacy ServiceCategory for canonical slug",
        contractorCategory.canonicalCategory.slug,
      );
      return NextResponse.json(
        { error: "This category is not ready for new services yet. Please contact Price2Book support." },
        { status: 500 }
      );
    }

    // New services deliberately start HIDDEN. Creation cannot bypass the
    // activation guard: the contractor still needs to establish pricing,
    // resolve materials/policies and explicitly make the service live through
    // the normal activation path.
    const service = await db.service.create({
      data: {
        categoryId: legacy.id,
        contractorCategoryId: contractorCategory.id,
        contractorId,
        name,
        slug,
        shortDescription,
        bookingType,
        startingPriceLabel,
        icon,
        tradeKey,
        active: false,
      },
    });

    return NextResponse.json({ id: service.id });
  });
}
