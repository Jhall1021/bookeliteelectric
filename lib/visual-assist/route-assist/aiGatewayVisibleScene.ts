import type { RouteAssistHttpVisibleSceneRequestV1 } from "./httpVisibleSceneProvider";
import { isRouteAssistPreviewAllowedV1 } from "./previewGate";
import type { RouteAssistNormalizedImageBoxV1, RouteAssistVisibleSceneObjectV1, RouteAssistVisibleSceneSemanticsV1 } from "./visualSceneSemantics";

export type RouteAssistAiGatewayMediaV1 = { imageId: string; url: string };

const MODEL = process.env.ROUTE_ASSIST_VISION_MODEL || "google/gemini-3.1-flash-lite";

/**
 * PROVIDER-BOUNDARY CORRECTION: the AI Gateway's own box representation,
 * distinct from the canonical RouteAssistNormalizedImageBoxV1.
 *
 * A real phone test showed the model returning boxes in what was clearly a
 * 0..1000 image-coordinate convention (doorway: x=301, y=247, width=353,
 * height=625) despite the prompt asking for normalized [0,1] floats -- and
 * one object was even mixed-scale within itself (x=0.165, y=718). Asking a
 * vision model to self-report already-normalized [0,1] floats was the wrong
 * contract: these models reason far more reliably over a fixed integer
 * pixel-like grid. So the AI Gateway now has its OWN strict box contract --
 * integer 0..1000 image coordinates -- validated at this boundary, then
 * deterministically divided by 1000 into the canonical
 * RouteAssistNormalizedImageBoxV1 shape before this module returns
 * anything. No heuristic "if the value looks big, divide by 1000" repair
 * exists anywhere here: a box that fails the provider-local contract is
 * rejected outright, the same as a malformed canonical box already is.
 *
 * The canonical validator (visualSceneSemantics.ts) is completely
 * unchanged and unaware this boundary exists -- it still only ever
 * receives normalized [0,1] boxes, from every provider, exactly as before.
 */
export type RouteAssistAiGatewayBoxV1 = { x: number; y: number; width: number; height: number };

type RouteAssistAiGatewayObjectDtoV1 = Omit<RouteAssistVisibleSceneObjectV1, "box"> & { box: RouteAssistAiGatewayBoxV1 };
type RouteAssistAiGatewaySemanticsDtoV1 = Omit<RouteAssistVisibleSceneSemanticsV1, "objects"> & { objects: RouteAssistAiGatewayObjectDtoV1[] };

const PROVIDER_BOX_SCALE = 1000;

/**
 * Strict, fail-closed check for the AI Gateway's own box contract -- never a
 * repair. Integers only; x/y in [0, 1000); width/height positive and never
 * pushing x+width or y+height past 1000. Accepts `unknown` deliberately:
 * the parsed JSON is only TRUSTED to match RouteAssistAiGatewayBoxV1 by a
 * type assertion, never actually guaranteed to, which is exactly why this
 * runtime check exists.
 */
function isValidProviderBoxV1(box: unknown): box is RouteAssistAiGatewayBoxV1 {
  if (!box || typeof box !== "object") return false;
  const { x, y, width, height } = box as Record<string, unknown>;
  if (typeof x !== "number" || typeof y !== "number" || typeof width !== "number" || typeof height !== "number") return false;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(width) || !Number.isInteger(height)) return false;
  if (x < 0 || x >= PROVIDER_BOX_SCALE) return false;
  if (y < 0 || y >= PROVIDER_BOX_SCALE) return false;
  if (width <= 0 || width > PROVIDER_BOX_SCALE - x) return false;
  if (height <= 0 || height > PROVIDER_BOX_SCALE - y) return false;
  return true;
}

/** Deterministic 1000 -> [0,1] conversion. Only ever called after isValidProviderBoxV1 has passed for this exact box. */
function normalizeProviderBoxV1(box: RouteAssistAiGatewayBoxV1): RouteAssistNormalizedImageBoxV1 {
  return { x: box.x / PROVIDER_BOX_SCALE, y: box.y / PROVIDER_BOX_SCALE, width: box.width / PROVIDER_BOX_SCALE, height: box.height / PROVIDER_BOX_SCALE };
}

/**
 * Preview-only diagnostic, never a behavior change: this only decides what
 * a thrown error's message says. Outside preview/dev it stays empty -- the
 * error carries no coordinates for a non-preview caller to depend on.
 * `box` is deliberately `unknown` so this can safely describe whatever the
 * provider actually sent, including the mixed-scale/malformed shapes this
 * correction exists to catch.
 */
function providerBoxDiagnosticV1(box: unknown): string {
  if (!isRouteAssistPreviewAllowedV1()) return "";
  if (!box || typeof box !== "object") return ` (received: ${JSON.stringify(box)})`;
  const { x, y, width, height } = box as Record<string, unknown>;
  return ` (x=${String(x)}, y=${String(y)}, width=${String(width)}, height=${String(height)})`;
}

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
          // PROVIDER-BOUNDARY CORRECTION: integer 0..1000 image coordinates,
          // not normalized [0,1] floats -- see RouteAssistAiGatewayBoxV1's
          // doc comment above for why. The schema can only bound each field
          // individually (x/y < 1000, width/height <= 1000); the cross-field
          // x+width<=1000 / y+height<=1000 condition is enforced at runtime
          // by isValidProviderBoxV1, same limitation as the canonical box's
          // own x+width<=1 check.
          box: {
            type: "object",
            properties: {
              x: { type: "integer", minimum: 0, maximum: 999 },
              y: { type: "integer", minimum: 0, maximum: 999 },
              width: { type: "integer", minimum: 1, maximum: 1000 },
              height: { type: "integer", minimum: 1, maximum: 1000 },
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
    "Box format: integer 0..1000 image coordinates, top-left origin. The image's full width and full height are each exactly 1000 units, regardless of the image's actual pixel size. x and y are the box's top-left corner in those units; width and height are its extents in those same units. All four fields (x, y, width, height) MUST be integers -- never fractional 0..1 coordinates, never raw pixel coordinates, never any other scale. Every box must stay inside [0,1000]: 0<=x<1000, 0<=y<1000, x+width<=1000, y+height<=1000 -- never emit a box extending beyond the image. If an object is partly cropped by the image edge, box only the visible portion inside the image. Example of a valid box: {\"x\":250,\"y\":100,\"width\":300,\"height\":700}. Confidence is evidentiary only.",
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
    const parsed = JSON.parse(text) as RouteAssistAiGatewaySemanticsDtoV1;
    if (parsed.version !== 1 || !Array.isArray(parsed.captureImageIds) || !Array.isArray(parsed.objects) || !Array.isArray(parsed.segmentObservations)) {
      throw new Error("AI Gateway returned malformed Route Assist semantics");
    }
    // Deterministic normalization boundary: every object's box is checked
    // against the strict provider-local (integer 0..1000) contract and, ONLY
    // if it passes, divided by 1000 into the canonical [0,1] shape. A box
    // that fails is rejected outright here -- never clamped, repaired, or
    // guessed at -- before this function returns anything at all, so no
    // caller (preview or the guided-flow production path) ever sees a
    // provider-local box.
    const objects: RouteAssistVisibleSceneObjectV1[] = parsed.objects.map((object) => {
      if (!isValidProviderBoxV1(object.box)) {
        throw new Error(`AI Gateway returned object "${object.id || "<unknown>"}" with a box outside the 0..1000 integer coordinate contract${providerBoxDiagnosticV1(object.box)}`);
      }
      return { ...object, box: normalizeProviderBoxV1(object.box) };
    });
    return { ...parsed, objects };
  } finally {
    clearTimeout(timeout);
  }
}
