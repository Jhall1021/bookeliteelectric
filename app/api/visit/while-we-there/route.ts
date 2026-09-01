import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";
import {
  CANONICAL_CATEGORY_SELECT,
  categoryIcon,
  categoryName,
  categorySlug,
} from "@/lib/categories";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { findOpenVisit } from "@/lib/openVisit";
import { canPlaceAlongside } from "@/lib/sameVisit";
import { selectPrimary } from "@/lib/visitPrimary";

// Returns EVERY active service, grouped by category, so the homeowner can
// add anything from any category "while we're there." Services already in
// the cart are NOT excluded — they're shown with their current quantity so
// the customer can add another (e.g. a second outlet in a different room)
// instead of the service just vanishing after the first add.
export async function GET(req: Request) {
  // ADR §2.2. Tenant from the site identifier the caller carries.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  const sessionId = getOrCreateSessionId();

  // ADR-011. Inside the site's tenant context, and keyed on the contractor —
  // this used to read the session cookie alone, so the quantities shown on
  // one contractor's storefront came from whatever cart the visitor had
  // started on another's.
  const visit = await withSite(site, (db) =>
    db.visit.findFirst({
      where: { contractorId: site.contractorId, sessionId, status: "OPEN" },
      include: { lineItems: { select: { serviceId: true } } },
    })
  );

  const quantityByService = new Map<string, number>();
  for (const li of visit?.lineItems ?? []) {
    quantityByService.set(li.serviceId, (quantityByService.get(li.serviceId) ?? 0) + 1);
  }

  // ADR-007: rooted at ContractorCategory, the tenant-owned model.
  const categories = await withSite(site, (db) =>
    db.contractorCategory.findMany({
    where: { active: true },
    orderBy: { sortOrder: "asc" },
    include: {
      canonicalCategory: CANONICAL_CATEGORY_SELECT,
      services: {
        where: { active: true },
        // Matches the customer-facing category pages, so the order an admin
        // sets is the order everywhere rather than just on the browse screen.
        orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
        select: {
          id: true,
          slug: true,
          name: true,
          // Read so placement can be asked through selectPrimary below, then
          // dropped from the payload — the browser decides nothing from a
          // standalone price here, and `...s` would otherwise ship it.
          basePrice: true,
          whileWeThereBasePrice: true,
          startingPriceLabel: true,
          bookingType: true,
          shortDescription: true,
          icon: true,
          // A service whose price comes from its tree can't be added straight
          // from this grid — the client routes it through the flow instead.
          // Sent here so the redirect happens on click rather than after a
          // rejected POST comes back.
          _count: { select: { questions: true } },
        },
      },
    },
    })
  );

  const withServices = categories
    .filter((c) => c.services.length > 0)
    .map((c) => ({
      // The API contract is unchanged: same field names, same resolved values.
      // `id` is now the ContractorCategory's, which is what a reorder targets;
      // slug stays canonical identity.
      id: c.id,
      slug: categorySlug(c),
      name: categoryName(c),
      icon: categoryIcon(c),
      services: c.services.map(({ _count, ...s }) => ({
        ...s,
        icon: s.icon ?? categoryIcon(c),
        categorySlug: categorySlug(c),
        quantityInVisit: quantityByService.get(s.id) ?? 0,
        requiresQualification: _count.questions > 0,
      })),
    }));

  const quickPicks = withServices
    .flatMap((c) => c.services.filter((s) => s.whileWeThereBasePrice !== null))
    .slice(0, 6)
    .map(({ basePrice: _unused, ...rest }) => rest);

  // BROWSE IS FILTERED THE SAME WAY THE ADD WOULD BE.
  //
  // quickPicks already only offered services with an add-on price, but "browse
  // all" offered everything — so a homeowner whose visit already holds a
  // service that can only be primary could pick a second one and be refused
  // with PRIMARY_UNRESOLVABLE. Rare (15 of Elite's 2,080 pairs) and a dead end
  // every time it happened.
  //
  // Asked through selectPrimary itself rather than by re-testing "has an
  // add-on price", so the offer and the add cannot disagree about what is
  // possible.
  const onVisit = await withSite(site, (db) =>
    db.service.findMany({
      where: { id: { in: [...quantityByService.keys()] } },
      select: { slug: true, basePrice: true, whileWeThereBasePrice: true },
    })
  );
  const placeable = withServices.map((c) => ({
    ...c,
    services: c.services
      .filter((s) =>
        canPlaceAlongside(onVisit, {
          slug: s.slug, basePrice: s.basePrice, whileWeThereBasePrice: s.whileWeThereBasePrice,
        }, selectPrimary)
      )
      .map(({ basePrice: _unused, ...rest }) => rest),
  })).filter((c) => c.services.length > 0);

  return NextResponse.json({ quickPicks, categories: placeable });
}
