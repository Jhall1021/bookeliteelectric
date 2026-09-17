import { NextResponse } from "next/server";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import { runRouteAssistVisibleSceneProviderV1, type RouteAssistVisibleSceneProviderInputV1 } from "@/lib/visual-assist/route-assist/visibleSceneProvider";
import { createRouteAssistAiGatewayVisibleSceneProviderV1 } from "@/lib/visual-assist/route-assist/visibleSceneProviderAdapter";
import type { RoutePoint, RouteSegment } from "@/lib/visual-assist/route-assist/types";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";

export const runtime = "nodejs";

/**
 * Preview-only proof endpoint for the capture-the-work-area-first dev
 * preview. Same shape and discipline as the sibling route-assist-photo-
 * first-interpret route (inline photo, server-validated semantics only,
 * never touches the fact store), generalized for the workspace flow:
 * anchors are no longer hardcoded to point ids "A"/"B" and segment id
 * "leg-A-B" -- the caller names its own destination label and leg scope id,
 * since a workspace leg may be evaluated per-frame under a frame-scoped
 * sub-leg id (captureWorkspace.ts's routeAssistFrameScopedLegIdV1).
 */
type Body = {
  imageId?: unknown;
  dataUrl?: unknown;
  sourceAnchor?: { x?: unknown; y?: unknown };
  destinationAnchor?: { x?: unknown; y?: unknown };
  destinationLabel?: unknown;
  destinationType?: unknown;
  legScopeId?: unknown;
};

const DESTINATION_TYPES: readonly string[] = ["RECEPTACLE", "SWITCH", "WALL_LIGHT", "CEILING_LIGHT", "SURFACE_BOX", "OTHER"];
const LABEL_PATTERN = /^[A-Za-z][A-Za-z0-9]{0,15}$/;
const SCOPE_ID_PATTERN = /^[A-Za-z0-9._:@-]{1,120}$/;

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
  const imageId = typeof body?.imageId === "string" ? body.imageId : "";
  const dataUrl = typeof body?.dataUrl === "string" ? body.dataUrl : "";
  const sourceX = typeof body?.sourceAnchor?.x === "number" ? body.sourceAnchor.x : NaN;
  const sourceY = typeof body?.sourceAnchor?.y === "number" ? body.sourceAnchor.y : NaN;
  const destinationX = typeof body?.destinationAnchor?.x === "number" ? body.destinationAnchor.x : NaN;
  const destinationY = typeof body?.destinationAnchor?.y === "number" ? body.destinationAnchor.y : NaN;
  const destinationLabel = typeof body?.destinationLabel === "string" ? body.destinationLabel : "";
  const destinationType = typeof body?.destinationType === "string" && DESTINATION_TYPES.includes(body.destinationType) ? (body.destinationType as RouteAssistDestinationType) : "RECEPTACLE";
  const legScopeId = typeof body?.legScopeId === "string" ? body.legScopeId : "";

  if (!imageId || !dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.length > 6_000_000) {
    return NextResponse.json({ error: "Invalid or oversized Route Assist photo" }, { status: 400 });
  }
  if (![sourceX, sourceY, destinationX, destinationY].every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    return NextResponse.json({ error: "Invalid anchor coordinates" }, { status: 400 });
  }
  if (!LABEL_PATTERN.test(destinationLabel) || destinationLabel === "A") {
    return NextResponse.json({ error: "Invalid destination label" }, { status: 400 });
  }
  if (!SCOPE_ID_PATTERN.test(legScopeId)) {
    return NextResponse.json({ error: "Invalid leg scope id" }, { status: 400 });
  }

  const points: RoutePoint[] = [
    { id: "A", kind: "SOURCE", x: sourceX, y: sourceY, imageId },
    { id: destinationLabel, kind: "DESTINATION", x: destinationX, y: destinationY, imageId },
  ];
  const segments: RouteSegment[] = [{ id: legScopeId, fromPointId: "A", toPointId: destinationLabel }];
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
      console.error("Route Assist workspace interpretation: provider validation failed", problems);
      return NextResponse.json({ error: "Route Assist could not validate the provider's interpretation", problems }, { status: 502 });
    }
    return NextResponse.json({ semantics: run.semantics }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Route Assist workspace interpretation failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Route Assist could not analyze this photo", detail: error instanceof Error ? error.message : String(error) }, { status: 502 });
  }
}
