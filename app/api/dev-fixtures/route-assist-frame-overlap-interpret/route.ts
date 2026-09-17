import { NextResponse } from "next/server";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import { analyzeRouteAssistFrameOverlapWithAiGatewayV1 } from "@/lib/visual-assist/route-assist/frameOverlapAiGateway";

export const runtime = "nodejs";

/**
 * Preview-only proof endpoint for the guided-continuation dev-preview: given
 * the prior frame's photo, a short description of the stable structural
 * evidence it left off on, and a newly captured frame, returns the AI
 * Gateway's frame-overlap assessment (frameOverlapAiGateway.ts).
 *
 * Same discipline as the sibling route-assist-photo-first-interpret route:
 * gated by isRouteAssistPreviewAllowedV1(), takes inline photos (data URLs)
 * rather than resolving durable media, and never touches the atomic fact
 * store -- turning this into a RouteAssistFrameOverlapObservationV1 and
 * running it through evaluateRouteAssistFrameOverlapV1 is the client's job.
 */
type Body = { fromDataUrl?: unknown; toDataUrl?: unknown; evidenceDescription?: unknown };

const DIAGNOSTIC_MESSAGE_MAX_LENGTH = 300;
const DATA_URL_PATTERN = /data:[^;,\s]+;base64,[A-Za-z0-9+/=]+/gi;

function sanitizedProviderErrorMessageV1(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutDataUrls = raw.replace(DATA_URL_PATTERN, "[data url omitted]");
  return withoutDataUrls.length > DIAGNOSTIC_MESSAGE_MAX_LENGTH ? `${withoutDataUrls.slice(0, DIAGNOSTIC_MESSAGE_MAX_LENGTH)}…` : withoutDataUrls;
}

export async function POST(req: Request) {
  if (!isRouteAssistPreviewAllowedV1()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const fromDataUrl = typeof body?.fromDataUrl === "string" ? body.fromDataUrl : "";
  const toDataUrl = typeof body?.toDataUrl === "string" ? body.toDataUrl : "";
  const evidenceDescription = typeof body?.evidenceDescription === "string" ? body.evidenceDescription.slice(0, 500) : "";

  const validDataUrl = (value: string) => value.startsWith("data:image/jpeg;base64,") && value.length <= 6_000_000;
  if (!validDataUrl(fromDataUrl) || !validDataUrl(toDataUrl) || !evidenceDescription) {
    return NextResponse.json({ error: "Invalid or oversized Route Assist frame-overlap request" }, { status: 400 });
  }

  try {
    const assessment = await analyzeRouteAssistFrameOverlapWithAiGatewayV1({ fromImageUrl: fromDataUrl, toImageUrl: toDataUrl, evidenceDescription });
    return NextResponse.json({ assessment }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Route Assist frame-overlap interpretation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Route Assist could not assess frame overlap", detail: sanitizedProviderErrorMessageV1(error) }, { status: 502 });
  }
}
