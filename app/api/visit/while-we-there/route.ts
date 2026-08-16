import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// Returns EVERY active service, grouped by category, so the homeowner can
// add anything from any category "while we're there." Services already in
// the cart are NOT excluded — they're shown with their current quantity so
// the customer can add another (e.g. a second outlet in a different room)
// instead of the service just vanishing after the first add.
export async function GET() {
  const sessionId = getOrCreateSessionId();

  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: { lineItems: { select: { serviceId: true } } },
  });

  const quantityByService = new Map<string, number>();
  for (const li of visit?.lineItems ?? []) {
    quantityByService.set(li.serviceId, (quantityByService.get(li.serviceId) ?? 0) + 1);
  }

  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        where: { active: true },
        orderBy: { name: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          whileWeThereBasePrice: true,
          startingPriceLabel: true,
          bookingType: true,
          shortDescription: true,
        },
      },
    },
  });

  const withServices = categories
    .filter((c) => c.services.length > 0)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      services: c.services.map((s) => ({
        ...s,
        categorySlug: c.slug,
        quantityInVisit: quantityByService.get(s.id) ?? 0,
      })),
    }));

  const quickPicks = withServices
    .flatMap((c) => c.services.filter((s) => s.whileWeThereBasePrice !== null))
    .slice(0, 6);

  return NextResponse.json({ quickPicks, categories: withServices });
}
