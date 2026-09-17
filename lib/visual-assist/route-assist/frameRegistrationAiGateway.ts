import { ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1, type RouteAssistFrameOverlapEvidenceKindV1 } from "./frameContinuation";
import type { RouteAssistPointCorrespondenceV1 } from "./imageRegistration";

/**
 * A focused, SEPARATE AI Gateway call used exactly ONCE per candidate
 * full-quality continuation photo -- never on the frequent, low-rate probe
 * frames the live guidance loop uses (frameOverlapAiGateway.ts stays
 * exactly as it was for that; this module does not touch it). Its only
 * job is to propose CANDIDATE point correspondences: for a handful of
 * stable, point-like landmarks (a corner, a doorway casing corner, a
 * window corner, an outlet center, a ceiling/wall intersection, ...)
 * visible in BOTH images, where that same physical point sits, in each
 * image's own normalized [0,1] local coordinates.
 *
 * SEMANTIC AI VS GEOMETRIC REGISTRATION: this module's output is a set of
 * CANDIDATES, nothing more. It never decides the final transform, never
 * computes a matrix, and its own per-landmark confidence is not treated
 * as a geometric quality signal anywhere downstream -- imageRegistration.
 * ts's registerFrameV1 treats every proposed pair as a possible outlier,
 * fits transforms by robust consensus over actual pixel-position
 * agreement, and computes its own objective inlier count/reprojection
 * error. If the model's proposed points are wrong, poorly distributed, or
 * too few, registration is expected to (and, by design, will) reject
 * rather than trust the proposal.
 */
const MODEL = process.env.ROUTE_ASSIST_VISION_MODEL || "google/gemini-3.1-flash-lite";

export type RouteAssistLandmarkProposalV1 = {
  kind: RouteAssistFrameOverlapEvidenceKindV1;
  fromPoint: { x: number; y: number };
  toPoint: { x: number; y: number };
  confidence: number;
};

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    landmarks: {
      type: "array",
      maxItems: 20,
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1] },
          fromPoint: {
            type: "object",
            properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
            required: ["x", "y"],
            additionalProperties: false,
          },
          toPoint: {
            type: "object",
            properties: { x: { type: "number", minimum: 0, maximum: 1 }, y: { type: "number", minimum: 0, maximum: 1 } },
            required: ["x", "y"],
            additionalProperties: false,
          },
          confidence: { type: "number", minimum: 0, maximum: 1 },
        },
        required: ["kind", "fromPoint", "toPoint", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["landmarks"],
  additionalProperties: false,
} as const;

function landmarkPrompt(): string {
  return [
    "You are the landmark-correspondence perception layer for Price2Book Route Assist's image-registration step.",
    "The FIRST image and the SECOND image were taken moments apart, moving the camera to continue capturing the same physical work area.",
    "Identify AS MANY distinct, POINT-LIKE stable architectural landmarks as you can genuinely find that are visibly the SAME physical point in BOTH images. For an ordinary room overlap, aim for roughly 8 to 20 landmarks when the scene supports that many -- four is only the bare mathematical minimum for one class of fit and gives the geometry solver almost no room to reject a single bad point, so do not stop early merely because you already found a handful.",
    "Prefer landmarks such as: wall/ceiling intersections, doorway corners, window corners, wall corners, trim/molding intersections, the center or a corner of a fixed fixture (outlet, switch plate, light fixture), ceiling-grid intersections ONLY when uniquely identifiable (not an interchangeable repeated tile), and cabinet or other fixed built-in corners.",
    "AVOID landmarks on: a blank, featureless wall area; a repeated ceiling tile or grid line with no unique surrounding context; a screen or monitor's own displayed content; papers, chairs, bags, or any movable object; people. These either cannot be pinpointed precisely or will not still be in the same place in a moment.",
    "Spread your landmarks across the FULL overlapping area -- across its left/right and top/bottom extent, not clustered in one corner or one small region. A geometric fit from tightly clustered points is unreliable even if there are many of them; spatial spread across the shared view matters as much as the count.",
    "Do not propose a landmark unless you can point to a specific, small location, not a general area or edge. Do not propose two landmarks that are really the same physical point.",
    "For each landmark, report fromPoint (its position in the FIRST image) and toPoint (its position in the SECOND image), each as normalized [0,1] coordinates with (0,0) at the image's top-left corner and (1,1) at its bottom-right corner.",
    "confidence is your own honest confidence (0 to 1) that fromPoint and toPoint are truly the same physical point, not confidence about anything else. If the scene genuinely does not offer enough precise, identifiable, well-distributed landmarks, report as many as you honestly can, even if that is 0, 1, or 2 -- a short list is the correct answer when the overlap does not support more, and never invent a landmark merely to reach a higher count.",
    "Never infer hidden wiring, measurements, materials, labor, price, or electrical diagnosis. This is a point-correspondence observation only, not a final geometric transform -- you are not being asked to compute or guess any transform, rotation, or alignment yourself.",
  ].join("\n");
}

export async function analyzeRouteAssistFrameLandmarksWithAiGatewayV1(args: { fromImageUrl: string; toImageUrl: string }): Promise<RouteAssistLandmarkProposalV1[]> {
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) throw new Error("AI Gateway authentication unavailable");

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: landmarkPrompt() },
    { type: "text", text: "FIRST image:" },
    { type: "image_url", image_url: { url: args.fromImageUrl, detail: "auto" } },
    { type: "text", text: "SECOND image:" },
    { type: "image_url", image_url: { url: args.toImageUrl, detail: "auto" } },
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
    const response = await fetch("https://ai-gateway.vercel.sh/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content }],
        stream: false,
        response_format: {
          type: "json_schema",
          json_schema: { name: "route_assist_frame_landmarks_v1", description: "Candidate point correspondences only; never a final geometric transform.", schema: RESPONSE_SCHEMA },
        },
      }),
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`AI Gateway failed with ${response.status}${detail ? `: ${detail.slice(0, 500)}` : ""}`);
    }
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content;
    if (!text) throw new Error("AI Gateway returned no structured content");
    const parsed = JSON.parse(text) as { landmarks?: unknown };
    if (!Array.isArray(parsed.landmarks)) throw new Error("AI Gateway returned a malformed landmark proposal list");
    const landmarks: RouteAssistLandmarkProposalV1[] = [];
    for (const item of parsed.landmarks) {
      if (
        !item || typeof item !== "object" ||
        typeof (item as Record<string, unknown>).kind !== "string" ||
        !(ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1 as readonly string[]).includes((item as Record<string, unknown>).kind as string)
      ) {
        throw new Error("AI Gateway returned a landmark with an invalid kind");
      }
      const record = item as { kind: RouteAssistFrameOverlapEvidenceKindV1; fromPoint?: unknown; toPoint?: unknown; confidence?: unknown };
      const validPoint = (p: unknown): p is { x: number; y: number } =>
        Boolean(p) && typeof (p as { x?: unknown }).x === "number" && typeof (p as { y?: unknown }).y === "number";
      if (!validPoint(record.fromPoint) || !validPoint(record.toPoint) || typeof record.confidence !== "number") {
        throw new Error("AI Gateway returned a landmark with malformed points or confidence");
      }
      landmarks.push({ kind: record.kind, fromPoint: record.fromPoint, toPoint: record.toPoint, confidence: record.confidence });
    }
    return landmarks;
  } finally {
    clearTimeout(timeout);
  }
}

/** Landmark proposals, stripped to exactly what imageRegistration.ts's registerFrameV1 consumes -- point pairs only, never confidence or kind (see the module doc comment on why semantic confidence never influences the final geometry). */
export function landmarksToCorrespondencesV1(landmarks: readonly RouteAssistLandmarkProposalV1[]): RouteAssistPointCorrespondenceV1[] {
  return landmarks.map((landmark) => ({ from: landmark.fromPoint, to: landmark.toPoint }));
}
