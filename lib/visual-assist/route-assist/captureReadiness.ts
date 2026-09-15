import type { RouteAssistSweepCaptureHandoffV1 } from "./captureHandoff";

export type RouteAssistCaptureReadinessProblemCodeV1 =
  | "TOO_FEW_FRAMES"
  | "FRAME_TOO_SMALL"
  | "INVALID_CAPTURE_TIME"
  | "INSUFFICIENT_TEMPORAL_COVERAGE";

export type RouteAssistCaptureReadinessProblemV1 = {
  code: RouteAssistCaptureReadinessProblemCodeV1;
  message: string;
  imageId?: string;
};

export type RouteAssistCaptureReadinessV1 = {
  status: "READY_FOR_SEMANTIC_REVIEW" | "RECAPTURE_REQUIRED";
  problems: RouteAssistCaptureReadinessProblemV1[];
};

const MIN_SWEEP_FRAMES = 3;
const MIN_FRAME_WIDTH = 320;
const MIN_FRAME_HEIGHT = 240;
const MIN_SWEEP_SPAN_MS = 800;

/**
 * Structural pre-CV readiness only. This does not judge blur, identify objects,
 * infer overlap, estimate geometry, or create route facts. Those capabilities
 * require downstream providers/evidence and must not be guessed here.
 */
export function evaluateRouteAssistCaptureReadinessV1(
  handoff: RouteAssistSweepCaptureHandoffV1,
): RouteAssistCaptureReadinessV1 {
  const frames = [...handoff.persistedFrames].sort((a, b) => a.sequence - b.sequence);
  const problems: RouteAssistCaptureReadinessProblemV1[] = [];

  if (frames.length < MIN_SWEEP_FRAMES) {
    problems.push({
      code: "TOO_FEW_FRAMES",
      message: `room sweep has ${frames.length} frame${frames.length === 1 ? "" : "s"}; at least ${MIN_SWEEP_FRAMES} ordered frames are required before semantic review`,
    });
  }

  const times: number[] = [];
  for (const frame of frames) {
    if (frame.width < MIN_FRAME_WIDTH || frame.height < MIN_FRAME_HEIGHT) {
      problems.push({
        code: "FRAME_TOO_SMALL",
        imageId: frame.imageId,
        message: `frame ${frame.imageId} is ${frame.width}x${frame.height}; persisted evidence is too small for semantic review`,
      });
    }
    const capturedAtMs = Date.parse(frame.capturedAt);
    if (!Number.isFinite(capturedAtMs)) {
      problems.push({ code: "INVALID_CAPTURE_TIME", imageId: frame.imageId, message: `frame ${frame.imageId} has an invalid capture time` });
    } else {
      times.push(capturedAtMs);
    }
  }

  if (frames.length >= MIN_SWEEP_FRAMES && times.length === frames.length) {
    const spanMs = times[times.length - 1] - times[0];
    if (spanMs < MIN_SWEEP_SPAN_MS) {
      problems.push({
        code: "INSUFFICIENT_TEMPORAL_COVERAGE",
        message: `ordered sweep spans only ${Math.max(0, spanMs)} ms; recapture slowly across the visible route`,
      });
    }
  }

  return {
    status: problems.length ? "RECAPTURE_REQUIRED" : "READY_FOR_SEMANTIC_REVIEW",
    problems,
  };
}
