import { NextResponse } from "next/server";
import { categorySlug, requireContractorCategory } from "@/lib/categories";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";

export async function GET(req: Request, { params }: { params: { quoteId: string } }) {
  // ADR §2.2 / ADR-011. The site decides the tenant; the quote id in the URL
  // never does. Quote derives its owner through Service, so another
  // contractor's quote id comes back null and takes the same 404 path as a
  // missing one.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  return withSite(site, async (db) => {
    const quote = await db.quote.findUnique({
      where: { id: params.quoteId },
      include: {
        service: {
          select: {
            name: true,
            slug: true,
            contractorCategory: { select: { canonicalCategory: { select: { slug: true } } } },
          },
        },
      },
    });

    if (!quote) {
      return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    }

    // Rooted at Photo rather than pulled through the quote's include.
    //
    // Photo is direct-owned (ADR-011), so a query rooted here is scoped by the
    // guard on its own contractorId. Read as a nested relation it would be
    // scoped only by whatever the parent happened to be — and a nested read is
    // invisible to the extension entirely (ADR-007). Only the count is needed,
    // so this is also strictly less data than the include it replaces.
    const photoCount = await db.photo.count({ where: { quoteId: quote.id } });

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
      photoCount,
      createdAt: quote.createdAt,
    });
  });
}
