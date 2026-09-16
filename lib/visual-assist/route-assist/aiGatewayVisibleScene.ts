import type { RouteAssistHttpVisibleSceneRequestV1 } from "./httpVisibleSceneProvider";
import type { RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";

export type RouteAssistAiGatewayMediaV1 = { imageId: string; url: string };

const MODEL = process.env.ROUTE_ASSIST_VISION_MODEL || "google/gemini-3.1-flash-lite";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    version: { type: "integer", enum: [1] },
    captureImageIds: { type: "array", items: { type: "string" } },
    objects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          kind: { type: "string", enum: ["SOURCE_RECEPTACLE", "DESTINATION_MARKER", "BASEBOARD_OR_TRIM", "DOORWAY", "DOOR_SIDE_CASING", "DOOR_TOP_CASING", "WINDOW", "VISIBLE_OBSTACLE", "CORNER"] },
          imageId: { type: "string" },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          box: {
            type: "object",
            properties: {
              x: { type: "number", minimum: 0, maximum: 1 },
              y: { type: "number", minimum: 0, maximum: 1 },
              width: { type: "number", exclusiveMinimum: 0, maximum: 1 },
              height: { type: "number", exclusiveMinimum: 0, maximum: 1 },
            },
            required: ["x", "y", "width", "height"],
            additionalProperties: false,
          },
          pointId: { type: ["string", "null"] },
          surfacePlaneId: { type: ["string", "null"] },
        },
        required: ["id", "kind", "imageId", "confidence", "box", "pointId", "surfacePlaneId"],
        additionalProperties: false,
      },
    },
    segmentObservations: {
      type: "array",
      items: {
        type: "object",
        properties: {
          segmentId: { type: "string" },
          imageId: { type: "string" },
          surfacePlaneId: { type: ["string", "null"] },
          objectIds: { type: "array", items: { type: "string" } },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["segmentId", "imageId", "surfacePlaneId", "objectIds", "confidence"],
        additionalProperties: false,
      },
    },
    doorwayGroups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          doorwayObjectId: { type: "string" },
          leftCasingObjectId: { type: "string" },
          topCasingObjectId: { type: "string" },
          rightCasingObjectId: { type: "string" },
          entrySide: { type: "string", enum: ["LEFT", "RIGHT", "UNRESOLVED"] },
        },
        required: ["id", "doorwayObjectId", "leftCasingObjectId", "topCasingObjectId", "rightCasingObjectId", "entrySide"],
        additionalProperties: false,
      },
    },
    qualityIssues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          code: { type: "string", enum: ["SOURCE_NOT_CLEAR", "DESTINATION_NOT_CLEAR", "DOORWAY_CONTEXT_INCOMPLETE", "INSUFFICIENT_VISIBLE_ROUTE_CONTEXT"] },
          imageIds: { type: "array", items: { type: "string" } },
        },
        required: ["code", "imageIds"],
        additionalProperties: false,
      },
    },
  },
  required: ["version", "captureImageIds", "objects", "segmentObservations", "doorwayGroups", "qualityIssues"],
  additionalProperties: false,
} as const;

function providerPrompt(request: RouteAssistHttpVisibleSceneRequestV1, media: readonly RouteAssistAiGatewayMediaV1[]): string {
  return [
    "You are the visible-scene perception layer for Price2Book Route Assist.",
    "Analyze only what is visibly supported by the supplied ordered room-sweep images. Never infer hidden wiring, concealed topology, measurements, materials, labor, price, repair condition, or electrical diagnosis.",
    "Return captureImageIds EXACTLY in the primary order supplied below, including IDs for frames you are not shown. Object and observation imageId values may use only image IDs actually supplied as media.",
    "The homeowner's source and destination taps are intent anchors, not metric geometry. Use them to identify the corresponding visible source receptacle and destination marker. SOURCE_RECEPTACLE and DESTINATION_MARKER objects must use the exact pointId from the supplied anchors.",
    "Every OTHER object kind (BASEBOARD_OR_TRIM, DOORWAY, DOOR_SIDE_CASING, DOOR_TOP_CASING, WINDOW, VISIBLE_OBSTACLE, CORNER) does not correspond to any homeowner-placed point anchor. Set pointId to null for all of these -- never invent a point id for them, even a descriptive-looking one.",
    "Identify visible baseboard/trim continuity and relevant doorways/windows between source and destination. For a doorway bypass, create a doorway group only when the doorway, physical left casing, physical right casing, and top casing are visibly supportable as one coherent doorway. entrySide means the physical casing reached first when traveling from source toward destination. If that cannot be established, use UNRESOLVED.",
    "If the wall visibly changes plane/direction (a corner) anywhere between source and destination, report one CORNER object at that location, located only by its box -- it has no pointId. If the route between source and destination stays on one continuous visible wall plane with no such bend, do not report a CORNER object at all.",
    "Use normalized image boxes x/y/width/height in [0,1]. Keep boxes inside image bounds. Confidence is evidentiary only.",
    "If a doorway is visible but both side casings and top casing are not sufficiently supported, report DOORWAY_CONTEXT_INCOMPLETE rather than inventing missing trim. If source/destination or route context is unclear, report the corresponding quality issue.",
    "Do not encode route footage or turn counts. This output is only visible-scene semantics for homeowner review.",
    `MODE: ${request.mode}; DESTINATION TYPE: ${request.destinationType}`,
    `PRIMARY ORDER: ${JSON.stringify(request.imageIds)}`,
    `POINT ANCHORS: ${JSON.stringify(request.pointAnchors)}`,
    `SEGMENTS: ${JSON.stringify(request.segments)}`,
    `SUPPLEMENTAL SETS: ${JSON.stringify(request.supplementalCaptureSets)}`,
    `REVIEW CORRECTIONS: ${JSON.stringify(request.reviewCorrections)}`,
    `MEDIA PROVIDED: ${media.map((item) => item.imageId).join(", ")}`,
  ].join("\n");
}

export async function analyzeRouteAssistVisibleSceneWithAiGatewayV1(args: {
  request: RouteAssistHttpVisibleSceneRequestV1;
  media: readonly RouteAssistAiGatewayMediaV1[];
}): Promise<RouteAssistVisibleSceneSemanticsV1> {
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) throw new Error("AI Gateway authentication unavailable");
  if (!args.media.length) throw new Error("No Route Assist media supplied");

  const content: Array<Record<string, unknown>> = [{ type: "text", text: providerPrompt(args.request, args.media) }];
  for (const item of args.media) {
    content.push({ type: "text", text: `FRAME imageId=${item.imageId}` });
    content.push({ type: "image_url", image_url: { url: item.url, detail: "auto" } });
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content }],
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "route_assist_visible_scene_v1",
            description: "Visible-scene semantics only; no route measurement or pricing authority.",
            schema: RESPONSE_SCHEMA,
          },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`AI Gateway failed with ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`);
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("AI Gateway returned no structured content");
    const parsed = JSON.parse(text) as RouteAssistVisibleSceneSemanticsV1;
    if (parsed.version !== 1 || !Array.isArray(parsed.captureImageIds) || !Array.isArray(parsed.objects) || !Array.isArray(parsed.segmentObservations)) {
      throw new Error("AI Gateway returned malformed Route Assist semantics");
    }
    return parsed;
  } finally {
    clearTimeout(timeout);
  }
}
