/**
 * POST /api/price-evaluation — the storefront asks the server for a derived
 * service's price once the homeowner's answers reach a terminal route.
 *
 * Read-only by construction: lib/storefrontPriceEvaluation.ts never creates a
 * visit or writes anything, and reads the session token without issuing one.
 * The tenant comes from the storefront identifier the request carries; the
 * browser names only the service and its answers.
 */
import { NextResponse } from "next/server";
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
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 }); }

  return withSite(site, async (db) => {
    const result = await evaluateStorefrontPrice(db, {
      contractorId: site.contractorId, sessionId: getSessionId(), serviceId: body.serviceId, answers: body.answers,
    });
    if (!result.ok) return NextResponse.json({ error: result.refusal.error }, { status: result.refusal.status });
    return NextResponse.json(result.evaluation);
  });
}
