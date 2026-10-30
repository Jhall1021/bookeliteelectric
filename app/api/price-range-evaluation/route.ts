import { NextResponse } from "next/server";

import { dedicatedCircuitPriceRangeAnswers, requestsDedicatedCircuitPriceRange } from "@/lib/electrical/dedicatedCircuitPriceRange";
import { getSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { evaluateStorefrontPrice } from "@/lib/storefrontPriceEvaluation";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  let body: { serviceId?: unknown; answers?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (typeof body.serviceId !== "string" || !body.serviceId
      || body.answers === null || typeof body.answers !== "object" || Array.isArray(body.answers)
      || Object.values(body.answers as Record<string, unknown>).some((value) => typeof value !== "string")) {
    return NextResponse.json({ error: "Missing serviceId or answers" }, { status: 400 });
  }

  const answers = body.answers as Record<string, string>;
  if (!requestsDedicatedCircuitPriceRange(answers)) {
    return NextResponse.json({ error: "RANGE_NOT_REQUESTED" }, { status: 400 });
  }

  return withSite(site, async (db) => {
    const sessionId = getSessionId();
    const endpoints = dedicatedCircuitPriceRangeAnswers(answers);
    const [low, high] = await Promise.all([
      evaluateStorefrontPrice(db, { contractorId: site.contractorId, sessionId, serviceId: body.serviceId, answers: endpoints.low }),
      evaluateStorefrontPrice(db, { contractorId: site.contractorId, sessionId, serviceId: body.serviceId, answers: endpoints.high }),
    ]);

    if (!low.ok || !high.ok) {
      return NextResponse.json({ outcome: "UNAVAILABLE", message: "We need to take a quick look before confirming this range." });
    }
    if (low.evaluation.outcome !== "PRICED" || high.evaluation.outcome !== "PRICED") {
      const review = low.evaluation.outcome === "REVIEW" ? low.evaluation
        : high.evaluation.outcome === "REVIEW" ? high.evaluation
          : null;
      return NextResponse.json({
        outcome: "REVIEW",
        message: review?.message ?? "We need to take a quick look before confirming this range.",
        photoLabels: review?.photoLabels ?? [],
      });
    }
    if (high.evaluation.priceCents < low.evaluation.priceCents) {
      return NextResponse.json({
        outcome: "UNAVAILABLE",
        message: "We need to take a quick look before confirming this range.",
      });
    }

    return NextResponse.json({
      outcome: "PRICED_RANGE",
      lowPriceCents: low.evaluation.priceCents,
      highPriceCents: high.evaluation.priceCents,
    });
  });
}
