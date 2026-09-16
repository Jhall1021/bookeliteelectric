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

  const provider = createRouteAssistAiGatewayVisibleSceneProviderV1({ media: [{ imageId, url: dataUrl }] });

  try {
    const run = await runRouteAssistVisibleSceneProviderV1(provider, input);
    if (!run.semantics) {
      // Preview-only diagnostic: this route is already gated by
      // isRouteAssistPreviewAllowedV1() above, so this never runs against
      // real customer traffic. run.problems are validator problem strings
      // (e.g. "unknown image id", shape/enum refusals) -- never the photo
      // itself, the dataUrl, or anything provider-credential-shaped -- so
      // logging them is safe and gives Vercel runtime logs the actual
      // reason even when the phone UI can't be inspected directly.
      console.error("Route Assist photo-first live interpretation: provider validation failed", run.problems);
      return NextResponse.json({ error: "Route Assist could not validate the provider's interpretation", problems: run.problems }, { status: 502 });
    }
    return NextResponse.json({ semantics: run.semantics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Route Assist photo-first live interpretation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Route Assist could not analyze this photo", detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
