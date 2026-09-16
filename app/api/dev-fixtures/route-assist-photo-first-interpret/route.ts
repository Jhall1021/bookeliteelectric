import { NextResponse } from "next/server";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import { runRouteAssistVisibleSceneProviderV1, type RouteAssistVisibleSceneProviderInputV1 } from "@/lib/visual-assist/route-assist/visibleSceneProvider";
import { createRouteAssistAiGatewayVisibleSceneProviderV1 } from "@/lib/visual-assist/route-assist/visibleSceneProviderAdapter";
import type { RoutePoint, RouteSegment } from "@/lib/visual-assist/route-assist/types";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";

export const runtime = "nodejs";

/**
 * Preview-only proof endpoint for the photo-first live interpretation slice.
 *
 * Same discipline as the sibling route-assist-visible-scene dev-fixtures
 * route: gated by isRouteAssistPreviewAllowedV1(), takes an inline photo
 * (data URL) rather than resolving R2 media, and returns the SERVER-
 * VALIDATED semantics for the caller to apply -- this route never touches
 * the atomic fact store itself. Validation happens here, in
 * runRouteAssistVisibleSceneProviderV1, before anything is returned; turning
 * that into fact writes is the client's job (livePhotoFactAdapter.ts),
 * mirroring exactly how the existing sweep tier's client (RouteAssistSmart
 * Capture.tsx) already runs the review pipeline over server-validated
 * semantics rather than the server writing anything server-side.
 */
type Body = {
  imageId?: unknown;
  dataUrl?: unknown;
  sourceAnchor?: { x?: unknown; y?: unknown };
  destinationAnchor?: { x?: unknown; y?: unknown };
  destinationType?: unknown;
};

const DESTINATION_TYPES: readonly string[] = ["RECEPTACLE", "SWITCH", "WALL_LIGHT", "CEILING_LIGHT", "SURFACE_BOX", "OTHER"];

const DIAGNOSTIC_MESSAGE_MAX_LENGTH = 300;
const DATA_URL_PATTERN = /data:[^;,\s]+;base64,[A-Za-z0-9+/=]+/gi;

/**
 * Preview-only diagnostic text, never validation logic: turns whatever the
 * AI Gateway call threw into a short, safe-to-show/log string. Strips any
 * data:...;base64,... run (a photo could only end up in an error message if
 * something echoed the request body back, which nothing here does today,
 * but this is a cheap guarantee rather than an assumption) and truncates,
 * so this can never become a vector for leaking the photo, and can't grow
 * request/response bodies or Authorization headers into the diagnostic --
 * those were never part of `error.message` to begin with, only bounded further here.
 */
function sanitizedProviderErrorMessageV1(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  const withoutDataUrls = raw.replace(DATA_URL_PATTERN, "[data url omitted]");
  return withoutDataUrls.length > DIAGNOSTIC_MESSAGE_MAX_LENGTH ? `${withoutDataUrls.slice(0, DIAGNOSTIC_MESSAGE_MAX_LENGTH)}…` : withoutDataUrls;
}

export async function POST(req: Request) {
  if (!isRouteAssistPreviewAllowedV1()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await req.json().catch(() => null)) as Body | null;
  const imageId = typeof body?.imageId === "string" ? body.imageId : "";
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  const sourceX = typeof body?.sourceAnchor?.x === "number" ? body.sourceAnchor.x : NaN;
  const sourceY = typeof body?.sourceAnchor?.y === "number" ? body.sourceAnchor.y : NaN;
  const destinationX = typeof body?.destinationAnchor?.x === "number" ? body.destinationAnchor.x : NaN;
  const destinationY = typeof body?.destinationAnchor?.y === "number" ? body.destinationAnchor.y : NaN;
  const destinationType = typeof body?.destinationType === "string" && DESTINATION_TYPES.includes(body.destinationType) ? (body.destinationType as RouteAssistDestinationType) : "RECEPTACLE";

  if (!imageId || !dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.length > 6_000_000) {
    return NextResponse.json({ error: "Invalid or oversized Route Assist photo" }, { status: 400 });
  }
  if (![sourceX, sourceY, destinationX, destinationY].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    return NextResponse.json({ error: "Invalid anchor coordinates" }, { status: 400 });
  }

  const points: RoutePoint[] = [
    { id: "A", kind: "SOURCE", x: sourceX, y: sourceY, imageId },
    { id: "B", kind: "DESTINATION", x: destinationX, y: destinationY, imageId },
  ];
  const segments: RouteSegment[] = [{ id: "leg-A-B", fromPointId: "A", toPointId: "B" }];
  const input: RouteAssistVisibleSceneProviderInputV1 = {
    version: 1,
    mode: "SURFACE",
    destinationType,
    points,
    segments,
    captureArtifacts: { imageIds: [imageId], overlayImageIds: [] },
    supplementalCaptureSets: [],
    reviewCorrections: [],
  };

  // Preview-only diagnostic capture: runRouteAssistVisibleSceneProviderV1
  // still catches whatever provider.analyze() throws itself and still
  // returns the same generic "visible scene provider failed without
  // producing semantics" problem -- that production-safe behavior is
  // unchanged. onProviderError just gets a synchronous look at the real
  // error before it's rethrown unchanged and swallowed there, so this
  // preview route can report WHY, not just that it failed.
  let providerError: unknown = null;
  const provider = createRouteAssistAiGatewayVisibleSceneProviderV1({
    media: [{ imageId, url: dataUrl }],
    onProviderError: (error) => { providerError = error; },
  });

  try {
    const run = await runRouteAssistVisibleSceneProviderV1(provider, input);
    if (!run.semantics) {
      const problems = [...run.problems];
      if (providerError) problems.push(`provider error: ${sanitizedProviderErrorMessageV1(providerError)}`);
      // Preview-only diagnostic: this route is already gated by
      // isRouteAssistPreviewAllowedV1() above, so this never runs against
      // real customer traffic. run.problems are validator problem strings
      // (e.g. "unknown image id", shape/enum refusals); the appended
      // provider-error line is the sanitized, length-bounded message from
      // whatever the AI Gateway call actually threw. Neither ever contains
      // the photo, the dataUrl, or a credential -- so logging them is safe
      // and gives Vercel runtime logs the actual reason even when the
      // phone UI can't be inspected directly.
      console.error("Route Assist photo-first live interpretation: provider validation failed", problems);
      return NextResponse.json({ error: "Route Assist could not validate the provider's interpretation", problems }, { status: 502 });
    }
    return NextResponse.json({ semantics: run.semantics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Route Assist photo-first live interpretation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Route Assist could not analyze this photo", detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
