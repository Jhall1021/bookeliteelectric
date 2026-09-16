import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { NextResponse } from "next/server";
import { r2 } from "@/lib/r2";
import { getOrCreateSessionId } from "@/lib/session";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { loadSession } from "@/lib/guidedFlowSession";
import { analyzeRouteAssistVisibleSceneWithAiGatewayV1 } from "@/lib/visual-assist/route-assist/aiGatewayVisibleScene";
import type { RouteAssistHttpVisibleSceneRequestV1 } from "@/lib/visual-assist/route-assist/httpVisibleSceneProvider";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";
import { validateRouteAssistVisibleSceneSemanticsV1, type RouteAssistVisibleSceneSemanticsV1 } from "@/lib/visual-assist/route-assist/visualSceneSemantics";
import type { RoutePoint, RouteSegment } from "@/lib/visual-assist/route-assist/types";

export type RouteAssistVisibleSceneMediaBindingV1 = {
  imageId: string;
  mediaRef: string;
};

type Body = {
  request?: RouteAssistHttpVisibleSceneRequestV1;
  media?: RouteAssistVisibleSceneMediaBindingV1[];
};

function taskPrefix(sessionId: string, taskId: string): string {
  return `route-assist/${sessionId}/${taskId}/`;
}

function requiredImageIds(request: RouteAssistHttpVisibleSceneRequestV1): string[] {
  return [
    ...request.imageIds,
    ...request.supplementalCaptureSets.flatMap((set) => set.supplementalImageIds),
  ];
}

/**
 * Validate provider output at the boundary that actually matters.
 *
 * Both provider paths below previously trusted the raw response and returned
 * it straight to the browser — the real semantic validator only ran later,
 * client-side, after the trust boundary had already been crossed. This
 * reconstructs the minimal RoutePoint/RouteSegment shapes the validator needs
 * for its point-anchor check from what the request already carries; it does
 * not fetch or assume anything beyond this one request's body.
 */
function validatedSemanticsOrNull(
  raw: unknown,
  request: RouteAssistHttpVisibleSceneRequestV1,
): RouteAssistVisibleSceneSemanticsV1 | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Partial<RouteAssistVisibleSceneSemanticsV1>;
  if (
    candidate.version !== 1 ||
    !Array.isArray(candidate.captureImageIds) ||
    !Array.isArray(candidate.objects) ||
    !Array.isArray(candidate.segmentObservations)
  ) {
    return null;
  }
  const semantics = candidate as RouteAssistVisibleSceneSemanticsV1;
  const points: RoutePoint[] = request.pointAnchors.map((anchor) => ({
    id: anchor.pointId,
    x: anchor.x,
    y: anchor.y,
    imageId: anchor.imageId,
    kind: anchor.kind,
  }));
  const segments: RouteSegment[] = request.segments.map((segment) => ({
    id: segment.segmentId,
    fromPointId: segment.fromPointId,
    toPointId: segment.toPointId,
  }));
  const problems = validateRouteAssistVisibleSceneSemanticsV1({
    semantics,
    expectedCaptureImageIds: request.imageIds,
    authorizedSupplementalImageIds: request.supplementalCaptureSets.flatMap((set) => set.supplementalImageIds),
    points,
    segments,
  });
  return problems.length === 0 ? semantics : null;
}

/**
 * Server-side provider gateway for ordinary-camera Route Assist semantics.
 *
 * The browser supplies opaque imageId -> private mediaRef bindings. This route
 * repeats session/task ownership checks, validates every storage key belongs to
 * this exact task, creates short-lived signed GET URLs, and sends those URLs to
 * semantic CV. Public image URLs never exist.
 *
 * A separately configured provider remains supported. When none is configured,
 * Price2Book uses Vercel AI Gateway with the deployment's short-lived OIDC
 * identity. Either path must return the same provider-neutral visible-scene
 * contract and neither path receives pricing or contractor economics.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string; taskId: string } },
) {
  // Route Assist's live camera-to-vision-model path is preview-only today —
  // see previewGate.ts. Nothing below this line may run against real
  // customer traffic until that is a deliberate, separate decision.
  if (!isRouteAssistPreviewAllowedV1()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let site;
  try { site = await requireSiteFromRequest(req); }
  catch { return NextResponse.json({ error: "Unknown storefront." }, { status: 404 }); }

  return withSite(site, async (db) => {
    const sessionId = getOrCreateSessionId();
    const session = await loadSession(db, params.id);
    if (!session || session.sessionId !== sessionId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const task = await db.guidedFlowVisualAssistTask.findFirst({
      where: { id: params.taskId, guidedFlowSessionId: params.id, taskType: "ROUTE_ASSIST" },
      select: { id: true },
    });
    if (!task) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const body = await req.json().catch(() => null) as Body | null;
    const request = body?.request;
    const media = Array.isArray(body?.media) ? body!.media! : [];
    if (!request || request.version !== 1 || !Array.isArray(request.imageIds)) {
      return NextResponse.json({ error: "Invalid Route Assist semantic request" }, { status: 400 });
    }

    const required = requiredImageIds(request);
    if (!required.length || new Set(required).size !== required.length) {
      return NextResponse.json({ error: "Route Assist image identities are invalid" }, { status: 400 });
    }
    if (media.length !== required.length) {
      return NextResponse.json({ error: "Route Assist media bindings are incomplete" }, { status: 400 });
    }

    const prefix = taskPrefix(params.id, params.taskId);
    const mediaByImageId = new Map<string, string>();
    for (const binding of media) {
      if (!binding || typeof binding.imageId !== "string" || typeof binding.mediaRef !== "string") {
        return NextResponse.json({ error: "Route Assist media binding is malformed" }, { status: 400 });
      }
      if (!required.includes(binding.imageId) || mediaByImageId.has(binding.imageId)) {
        return NextResponse.json({ error: "Route Assist media binding identity is invalid" }, { status: 400 });
      }
      if (!binding.mediaRef.startsWith(prefix) || binding.mediaRef.includes("..")) {
        return NextResponse.json({ error: "Route Assist media binding is outside this task" }, { status: 400 });
      }
      mediaByImageId.set(binding.imageId, binding.mediaRef);
    }
    if (required.some((imageId) => !mediaByImageId.has(imageId))) {
      return NextResponse.json({ error: "Route Assist media bindings are incomplete" }, { status: 400 });
    }

    const bucket = process.env.R2_ROUTE_ASSIST_BUCKET_NAME ?? process.env.R2_BUCKET_NAME;
    if (!bucket) return NextResponse.json({ error: "Route Assist media storage is unavailable" }, { status: 503 });

    const signedMedia = await Promise.all(required.map(async (imageId) => ({
      imageId,
      url: await getSignedUrl(
        r2,
        new GetObjectCommand({ Bucket: bucket, Key: mediaByImageId.get(imageId)! }),
        { expiresIn: 300 },
      ),
    })));

    const providerUrl = process.env.ROUTE_ASSIST_VISIBLE_SCENE_PROVIDER_URL;
    if (!providerUrl) {
      try {
        const raw = await analyzeRouteAssistVisibleSceneWithAiGatewayV1({ request, media: signedMedia });
        const semantics = validatedSemanticsOrNull(raw, request);
        if (!semantics) {
          console.error("Route Assist built-in semantic provider returned semantics that failed validation");
          return NextResponse.json({ error: "Route Assist semantic provider returned invalid data" }, { status: 502 });
        }
        return NextResponse.json(semantics, { headers: { "Cache-Control": "no-store" } });
      } catch (error) {
        console.error("Route Assist built-in semantic provider failed", error instanceof Error ? error.message : error);
        return NextResponse.json({ error: "Route Assist semantic provider failed" }, { status: 502 });
      }
    }

    let parsedProviderUrl: URL;
    try { parsedProviderUrl = new URL(providerUrl); }
    catch { return NextResponse.json({ error: "Route Assist semantic provider is misconfigured" }, { status: 503 }); }
    if (parsedProviderUrl.protocol !== "https:" && process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Route Assist semantic provider must use HTTPS" }, { status: 503 });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const providerResponse = await fetch(parsedProviderUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.ROUTE_ASSIST_VISIBLE_SCENE_PROVIDER_TOKEN
            ? { Authorization: `Bearer ${process.env.ROUTE_ASSIST_VISIBLE_SCENE_PROVIDER_TOKEN}` }
            : {}),
        },
        body: JSON.stringify({ request, media: signedMedia }),
        signal: controller.signal,
        cache: "no-store",
      });
      if (!providerResponse.ok) {
        return NextResponse.json({ error: "Route Assist semantic provider failed" }, { status: 502 });
      }
      const raw = await providerResponse.json().catch(() => null);
      const semantics = validatedSemanticsOrNull(raw, request);
      if (!semantics) {
        return NextResponse.json({ error: "Route Assist semantic provider returned invalid data" }, { status: 502 });
      }
      return NextResponse.json(semantics);
    } catch {
      return NextResponse.json({ error: "Route Assist semantic provider could not be reached" }, { status: 502 });
    } finally {
      clearTimeout(timeout);
    }
  });
}
