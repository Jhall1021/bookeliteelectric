import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { categorySlug, requireContractorCategory } from "@/lib/categories";

export async function GET(_req: Request, { params }: { params: { quoteId: string } }) {
  const quote = await prisma.quote.findUnique({
    where: { id: params.quoteId },
    include: {
      service: {
        select: {
          name: true,
          slug: true,
          contractorCategory: { select: { canonicalCategory: { select: { slug: true } } } },
        },
      },
      photos: { select: { id: true, label: true } },
    },
  });

  if (!quote) {
    return NextResponse.json({ error: "Quote not found" }, { status: 404 });
  }

  return NextResponse.json({
    id: quote.id,
    status: quote.status,
    serviceName: quote.service.name,
    serviceSlug: quote.service.slug,
    categorySlug: categorySlug(
      requireContractorCategory(quote.service.slug, quote.service.contractorCategory)
    ),
    quotedPriceCents: quote.quotedPriceCents,
    depositRequired: quote.depositRequired,
    photoCount: quote.photos.length,
    createdAt: quote.createdAt,
  });
}
