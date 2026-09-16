import { NextResponse } from "next/server";
import { analyzeRouteAssistVisibleSceneWithAiGatewayV1 } from "@/lib/visual-assist/route-assist/aiGatewayVisibleScene";
import type { RouteAssistHttpVisibleSceneRequestV1 } from "@/lib/visual-assist/route-assist/httpVisibleSceneProvider";
import { isRouteAssistPreviewAllowedV1 } from "@/lib/visual-assist/route-assist/previewGate";

export const runtime = "nodejs";

type Body = {
  request?: RouteAssistHttpVisibleSceneRequestV1;
  images?: Array<{ imageId?: unknown; dataUrl?: unknown }>;
};

export async function POST(req: Request) {
  if (!isRouteAssistPreviewAllowedV1()) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json().catch(() => null) as Body | null;
  const request = body?.request;
  const images = Array.isArray(body?.images) ? body!.images! : [];
  if (!request || request.version !== 1 || !Array.isArray(request.imageIds) || !request.imageIds.length) {
    return NextResponse.json({ error: "Invalid Route Assist request" }, { status: 400 });
  }
  if (!images.length || images.length > 8) {
    return NextResponse.json({ error: "Route Assist preview requires 1-8 image frames" }, { status: 400 });
  }

  const seen = new Set<string>();
  const media: Array<{ imageId: string; url: string }> = [];
  for (const image of images) {
    const imageId = typeof image?.imageId === "string" ? image.imageId : "";
    const dataUrl = typeof image?.dataUrl === "string" ? image.dataUrl : "";
    if (!imageId || seen.has(imageId) || !request.imageIds.includes(imageId)) {
      return NextResponse.json({ error: "Invalid Route Assist image identity" }, { status: 400 });
    }
    if (!dataUrl.startsWith("data:image/jpeg;base64,") || dataUrl.length > 900_000) {
      return NextResponse.json({ error: "Invalid or oversized Route Assist preview image" }, { status: 400 });
    }
    seen.add(imageId);
    media.push({ imageId, url: dataUrl });
  }

  try {
    const semantics = await analyzeRouteAssistVisibleSceneWithAiGatewayV1({ request, media });
    return NextResponse.json(semantics, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Route Assist preview semantic analysis failed", error instanceof Error ? error.message : error);
    return NextResponse.json({ error: "Route Assist could not analyze this room sweep" }, { status: 502 });
  }
}
