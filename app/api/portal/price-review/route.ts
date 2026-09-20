import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdminRoute } from "@/lib/adminContext";
import { publishSuggestedPrice } from "@/lib/pricePublication";

type ReviewItem = { serviceId: string; expectedCents: number };

export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let body: { items?: unknown };
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Expected JSON." }, { status: 400 }); }
    if (!Array.isArray(body.items) || body.items.length === 0 || body.items.length > 100) {
      return NextResponse.json({ error: "Choose between 1 and 100 suggested prices." }, { status: 400 });
    }
    const items = body.items as ReviewItem[];
    const seen = new Set<string>();
    for (const item of items) {
      if (!item || typeof item.serviceId !== "string" || !item.serviceId || !Number.isInteger(item.expectedCents) || item.expectedCents < 0) {
        return NextResponse.json({ error: "Each selection needs a serviceId and nonnegative expectedCents." }, { status: 400 });
      }
      if (seen.has(item.serviceId)) return NextResponse.json({ error: "A service may be selected only once." }, { status: 400 });
      seen.add(item.serviceId);
    }

    try {
      const receipts = await db.$transaction(async (tx) => {
        const owned = await tx.service.findMany({
          where: { contractorId: ctx.contractorId, id: { in: items.map((item) => item.serviceId) } },
          select: { id: true, pricingMethod: true, publishedPriceApprovedAt: true },
        });
        if (owned.length !== items.length) throw new Error("SERVICE_NOT_FOUND");
        if (owned.some((service) => service.pricingMethod === "DERIVED_RESOLVED_SCOPE")) throw new Error("ROUTE_PRICE_REVIEW_REQUIRED");
        if (owned.some((service) => service.publishedPriceApprovedAt !== null)) throw new Error("ALREADY_APPROVED");

        const published = [];
        for (const item of items) {
          const result = await publishSuggestedPrice(tx, ctx.contractorId, item.serviceId, { expectedBasePrice: item.expectedCents });
          if (!result.ok) throw new Error(`PUBLISH_REFUSED:${result.refusal.code}:${result.refusal.message}`);
          published.push({ serviceId: item.serviceId, basePrice: result.basePrice });
        }
        return published;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      return NextResponse.json({ ok: true, published: receipts });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === "SERVICE_NOT_FOUND") return NextResponse.json({ error: "One of the selected services was not found." }, { status: 404 });
      if (message === "ROUTE_PRICE_REVIEW_REQUIRED") return NextResponse.json({ error: "Route-priced services require route-pricing review." }, { status: 409 });
      if (message === "ALREADY_APPROVED") return NextResponse.json({ error: "An already-approved price changed. Reload and review it individually." }, { status: 409 });
      if (message.startsWith("PUBLISH_REFUSED:")) return NextResponse.json({ error: message.split(":").slice(2).join(":"), code: message.split(":")[1] }, { status: 409 });
      if ((error as { code?: string }).code === "P2034") return NextResponse.json({ error: "Pricing changed concurrently. Reload and review again." }, { status: 409 });
      throw error;
    }
  });
}
