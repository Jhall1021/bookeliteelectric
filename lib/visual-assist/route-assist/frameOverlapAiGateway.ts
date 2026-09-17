import { ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1, type RouteAssistFrameOverlapEvidenceKindV1 } from "./frameContinuation";

/**
 * A focused, SEPARATE AI Gateway call for the guided-continuation dev-preview
 * proof: given the prior frame's own described continuation anchor and a
 * newly captured frame, ask whether the new frame visibly shows the SAME
 * physical structural feature -- the frame-overlap judgment
 * frameContinuation.ts's evaluateRouteAssistFrameOverlapV1 consumes.
 *
 * Deliberately NOT folded into aiGatewayVisibleScene.ts's whole-scene call:
 * that call describes objects WITHIN one frame against a homeowner's
 * source/destination taps; this call answers a narrower, different question
 * (do these two DIFFERENT frames share one physical feature) and needs
 * neither point anchors nor a full scene-object inventory. Keeping it
 * separate avoids growing the shared production request/response schema
 * every other Route Assist caller (sweep tier included) already depends on.
 */
const MODEL = process.env.ROUTE_ASSIST_VISION_MODEL || "google/gemini-3.1-flash-lite";

export type RouteAssistFrameOverlapAssessmentV1 =
  | { matched: true; evidenceKind: RouteAssistFrameOverlapEvidenceKindV1; confidence: number }
  | { matched: false; confidence: number };

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    matched: { type: "boolean" },
    evidenceKind: { type: ["string", "null"], enum: [...ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1, null] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
  required: ["matched", "evidenceKind", "confidence"],
  additionalProperties: false,
} as const;

function frameOverlapPrompt(evidenceDescription: string): string {
  return [
    "You are the frame-overlap perception layer for Price2Book Route Assist's guided-continuation capture.",
    `The FIRST image is a prior photo. Stable structural evidence near its edge was described as: ${evidenceDescription}`,
    "The SECOND image is a new photo taken by moving the camera to continue following the same electrical route. Determine whether the SECOND image visibly shows the SAME physical structural feature described above -- not merely a similar-looking feature elsewhere in the room.",
    "Set matched=true only when you are confident (0.75 or higher) the two images show the same physical feature, confirming the second photo genuinely continues from the first. Set matched=false, or report a lower confidence, whenever this is not clearly the same feature, the connection is ambiguous, or image quality is insufficient. Never guess in order to be helpful.",
    "evidenceKind must be the single closed-set value that best names the shared feature: CORNER, WALL_CEILING_TRANSITION, DOORWAY_CASING, WINDOW_EDGE, CEILING_WALL_LINE, ROUTE_ANCHOR, or PLACED_FEATURE. Set it to null when matched is false.",
    "Never infer hidden wiring, measurements, materials, labor, price, or electrical diagnosis. This is a structural continuity judgment only.",
  ].join("\n");
}

export async function analyzeRouteAssistFrameOverlapWithAiGatewayV1(args: {
  fromImageUrl: string;
  toImageUrl: string;
  evidenceDescription: string;
}): Promise<RouteAssistFrameOverlapAssessmentV1> {
  const token = process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN;
  if (!token) throw new Error("AI Gateway authentication unavailable");

  const content: Array<Record<string, unknown>> = [
    { type: "text", text: frameOverlapPrompt(args.evidenceDescription) },
    { type: "text", text: "FIRST (prior) image:" },
    { type: "image_url", image_url: { url: args.fromImageUrl, detail: "auto" } },
    { type: "text", text: "SECOND (new) image:" },
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
          json_schema: { name: "route_assist_frame_overlap_v1", description: "Frame-overlap structural continuity judgment only.", schema: RESPONSE_SCHEMA },
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
    const parsed = JSON.parse(text) as { matched?: unknown; evidenceKind?: unknown; confidence?: unknown };
    if (typeof parsed.matched !== "boolean" || typeof parsed.confidence !== "number") {
      throw new Error("AI Gateway returned a malformed frame-overlap assessment");
    }
    if (parsed.matched) {
      if (typeof parsed.evidenceKind !== "string" || !(ROUTE_ASSIST_FRAME_OVERLAP_EVIDENCE_KINDS_V1 as readonly string[]).includes(parsed.evidenceKind)) {
        throw new Error("AI Gateway returned matched=true with an invalid evidenceKind");
      }
      return { matched: true, evidenceKind: parsed.evidenceKind as RouteAssistFrameOverlapEvidenceKindV1, confidence: parsed.confidence };
    }
    return { matched: false, confidence: parsed.confidence };
  } finally {
    clearTimeout(timeout);
  }
}
