import { NextResponse } from "next/server";
import { categorySlug, requireContractorCategory } from "@/lib/categories";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";

// REROUTE_SERVICE answer options only store a serviceId (the AnswerOption
// model doesn't know slugs). The client needs the slug to navigate to the
// new service's flow page.
export async function GET(req: Request, { params }: { params: { id: string } }) {
  // ADR §2.2. The site identifier the caller carries decides the tenant.
  // Resolving it from the requested resource would authorise access to that
  // resource using itself.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  const full = await withSite(site, (db) =>
    db.service.findUnique({
    where: { id: params.id },
    include: { contractorCategory: { select: { canonicalCategory: { select: { slug: true } } } } },
    })
  );

  if (!full) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  return NextResponse.json({
    slug: full.slug,
    name: full.name,
    categorySlug: categorySlug(requireContractorCategory(full.slug, full.contractorCategory)),
  });
}
