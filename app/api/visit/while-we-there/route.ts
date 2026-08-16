import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getOrCreateSessionId } from "@/lib/session";

// Returns EVERY active service, grouped by category, that isn't already in
// the customer's open visit — the homeowner can add anything from any
// category "while we're there," not just a short pre-picked list. Services
// with a While We're There price show the discounted add-on price; services
// without one (remote-quote-only jobs) still show up but are flagged so the
// UI can route them to a quote request instead of an instant add.
export async function GET() {
  const sessionId = getOrCreateSessionId();

  const visit = await prisma.visit.findFirst({
    where: { sessionId, status: "OPEN" },
    include: { lineItems: { select: { serviceId: true } } },
  });

  const excludeIds = visit?.lineItems.map((li) => li.serviceId) ?? [];

  const categories = await prisma.serviceCategory.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      services: {
        where: { active: true, id: { notIn: excludeIds } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          slug: true,
          name: true,
          whileWeThereBasePrice: true,
          startingPriceLabel: true,
          bookingType: true,
        },
      },
    },
  });

  // Drop categories that have nothing left to offer (everything already in cart).
  const withServices = categories
    .filter((c) => c.services.length > 0)
    .map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      services: c.services.map((s) => ({ ...s, categorySlug: c.slug })),
    }));

  // A "quick picks" row — services with a defined While We're There price,
  // capped for the collapsed view. The full grouped list below it is
  // always available via "Browse all services."
  const quickPicks = withServices
    .flatMap((c) => c.services.filter((s) => s.whileWeThereBasePrice !== null))
    .slice(0, 6);

  return NextResponse.json({ quickPicks, categories: withServices });
}
