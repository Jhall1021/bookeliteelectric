/**
 * REAL FRAME-TO-FRAME MOTION (fixes a confirmed false-alignment gap: the
 * prior "motion spread" check in alignmentEvidence.ts measured the
 * variance of the AI's OWN self-reported overlapFraction across recent
 * probes -- an estimate's internal consistency, not the phone's actual
 * physical stability. Three probes that happen to report the same
 * overlapFraction (whether because the phone is genuinely still, or
 * merely because the model gave three arbitrary-but-similar answers)
 * were indistinguishable to that check. Proven exploitable in
 * verify-route-assist-alignment-evidence.ts's check 21 (three consistent
 * but unrelated-to-any-image AI responses reached ALIGNED).
 *
 * This module replaces that proxy with an independent, non-AI, pixel-
 * level measurement: the mean absolute luminance difference between two
 * consecutive LIVE camera frames, taken directly from the same downscaled
 * samples the live probe loop already grabs. It has no opinion about
 * overlap, direction, or matching -- only "did the live view change
 * between these two moments." A camera that is truly held still against
 * a static scene produces a score near 0 regardless of what any AI call
 * says; a camera that is still panning, rolling, or otherwise moving
 * produces a materially higher score, independent of and unpersuadable by
 * a confident-but-wrong AI response.
 *
 * Pure and DOM-free: it takes raw RGBA pixel buffers (whatever produced
 * them -- a canvas 2D context's ImageData in the browser, or a plain
 * typed array in a test), so it is directly unit-testable in Node without
 * any browser environment.
 */

export type RouteAssistPixelBufferV1 = { data: ArrayLike<number>; width: number; height: number };

/**
 * Mean absolute luminance difference between two same-sized RGBA buffers,
 * normalized to [0, 1] (0 = pixel-identical; 1 = maximal possible
 * difference, e.g. full black to full white on every pixel). Buffers of
 * differing size cannot be compared meaningfully -- rather than silently
 * picking an arbitrary overlapping region, this returns the maximal
 * score (1), which is the safe default: "cannot confirm stability" must
 * never be treated as "confirmed stable."
 */
export function computeRouteAssistFrameMotionV1(previous: RouteAssistPixelBufferV1, current: RouteAssistPixelBufferV1): number {
  if (previous.width !== current.width || previous.height !== current.height) return 1;
  const pixelCount = previous.width * previous.height;
  if (pixelCount === 0) return 1;

  let sumAbsDiff = 0;
  for (let i = 0; i < pixelCount; i += 1) {
    const idx = i * 4;
    const lumaPrev = 0.299 * previous.data[idx] + 0.587 * previous.data[idx + 1] + 0.114 * previous.data[idx + 2];
    const lumaCurr = 0.299 * current.data[idx] + 0.587 * current.data[idx + 1] + 0.114 * current.data[idx + 2];
    sumAbsDiff += Math.abs(lumaCurr - lumaPrev);
  }
  return sumAbsDiff / pixelCount / 255;
}
