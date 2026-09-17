import { NextResponse } from "next/server";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import { analyzeRouteAssistFrameLandmarksWithAiGatewayV1 } from "@/lib/visual-assist/route-assist/frameRegistrationAiGateway";

export const runtime = "nodejs";

/**
 * Preview-only proof endpoint for the real image-registration step: given
 * the previously-accepted frame's full-quality photo and a newly captured
 * full-quality candidate, returns the AI Gateway's candidate landmark
 * point proposals (frameRegistrationAiGateway.ts). Called exactly ONCE per
 * candidate frame -- never on the frequent live-guidance probe frames,
 * which keep using the separate, lighter route-assist-frame-overlap-
 * interpret endpoint unchanged.
 *
 * This endpoint never computes a transform itself -- it returns raw
 * candidate correspondences only. Running them through
 * imageRegistration.ts's registerFrameV1 (the actual geometric fit +
 * rejection) is the client's job, exactly like the sibling endpoints never
 * touch the atomic fact store themselves.
 */
type Body = { fromDataUrl?: unknown; toDataUrl?: unknown };

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

  const validDataUrl = (value: string) => value.startsWith("data:image/jpeg;base64,") && value.length <= 8_000_000;
  if (!validDataUrl(fromDataUrl) || !validDataUrl(toDataUrl)) {
    return NextResponse.json({ error: "Invalid or oversized Route Assist frame-registration request" }, { status: 400 });
  }

  try {
    const landmarks = await analyzeRouteAssistFrameLandmarksWithAiGatewayV1({ fromImageUrl: fromDataUrl, toImageUrl: toDataUrl });
    return NextResponse.json({ landmarks }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Route Assist frame-registration landmark interpretation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Route Assist could not identify landmarks for registration", detail: sanitizedProviderErrorMessageV1(error) }, { status: 502 });
  }
}
