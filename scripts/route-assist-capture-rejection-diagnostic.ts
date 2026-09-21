/**
 * ROUTE ASSIST CAPTURE-REJECTION DIAGNOSTIC (real-phone request, 21 Sep
 * 2026): makes a capture-validation rejection REVIEWABLE, per this
 * task's explicit instruction to retain the exact previous image and
 * frozen candidate and produce an annotated pair showing proposed
 * matches, inliers, overlap region, coverage measurements, thresholds,
 * and the exact rejection reason -- not to infer the cause from the
 * generic error alone.
 *
 * TWO MODES, matching verify-route-assist-registration-harness-
 * offline.ts's own established --pair / --synthetic convention:
 *
 *   --from <photo1.jpg> --to <candidate.jpg> --from-aspect <n>
 *   --to-aspect <n> --direction <RIGHT|LEFT|UP|DOWN>: the REAL path.
 *   Calls analyzeRouteAssistFrameLandmarksWithAiGatewayV1 (needs
 *   AI_GATEWAY_API_KEY or VERCEL_OIDC_TOKEN -- this sandbox has neither,
 *   the same confirmed, unresolved blocker documented in the offline
 *   registration harness) to get REAL landmark proposals for the EXACT
 *   two images given, then runs the full registerFrameV1 pipeline twice
 *   (with and without the direction-aware expectedOverlapRegion) and
 *   renders an annotated PNG.
 *
 *   --landmarks <landmarks.json>: bypasses the AI call entirely -- loads
 *   a pre-recorded or hand-constructed correspondence set (same shape as
 *   RouteAssistLandmarkProposalV1[] or a plain {from,to}[] array) and
 *   runs the same annotated comparison. Use this to review a specific
 *   rejection deterministically, or when AI Gateway credentials are
 *   unavailable (as in this sandbox).
 *
 * Output: a single annotated PNG (--out, default ./route-assist-capture-
 * diagnostic.png) showing both images side by side with numbered
 * landmark markers, the expected overlap region, bounding-box/coverage
 * measurements, and the OLD (global-quadrant) vs NEW (region-aware)
 * distribution-check outcome and exact reason, plus the full
 * registerFrameV1 outcome for both.
 *
 * Run:
 *   npx tsx scripts/route-assist-capture-rejection-diagnostic.ts --landmarks landmarks.json --from photo1.jpg --to candidate.jpg --direction RIGHT --from-aspect 1221:1301 --to-aspect 1221:1170
 *   npx tsx scripts/route-assist-capture-rejection-diagnostic.ts --from photo1.jpg --to candidate.jpg --direction RIGHT --from-aspect 1221:1301 --to-aspect 1221:1170
 */
import { chromium } from "playwright";
import { readFileSync, writeFileSync } from "node:fs";
import { evaluateRouteAssistCorrespondenceDistributionV1, type RouteAssistDistributionReferenceRegionV1 } from "../lib/visual-assist/route-assist/correspondenceDistribution";
import { registerFrameV1, type RouteAssistPointCorrespondenceV1 } from "../lib/visual-assist/route-assist/imageRegistration";
import { ghostEdgeCropRectV1, type RouteAssistNormalizedRectV1 } from "../lib/visual-assist/route-assist/alignmentLock";
import type { RouteAssistRelativeDirectionV1 } from "../lib/visual-assist/route-assist/frameContinuation";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

function parseAspect(spec: string | undefined, fallback: number): number {
  if (!spec) return fallback;
  if (spec.includes(":")) {
    const [w, h] = spec.split(":").map(Number);
    return w / h;
  }
  return Number(spec);
}

function toDataUrl(path: string): string {
  const buffer = readFileSync(path);
  const ext = path.toLowerCase().endsWith(".png") ? "png" : "jpeg";
  return `data:image/${ext};base64,${buffer.toString("base64")}`;
}

async function loadCorrespondences(fromPath: string, toPath: string): Promise<RouteAssistPointCorrespondenceV1[]> {
  const landmarksPath = arg("landmarks");
  if (landmarksPath) {
    const raw = JSON.parse(readFileSync(landmarksPath, "utf8"));
    const list = Array.isArray(raw) ? raw : raw.landmarks;
    return list.map((item: { fromPoint?: { x: number; y: number }; from?: { x: number; y: number }; toPoint?: { x: number; y: number }; to?: { x: number; y: number } }) => ({
      from: item.fromPoint ?? item.from,
      to: item.toPoint ?? item.to,
    }));
  }
  const { analyzeRouteAssistFrameLandmarksWithAiGatewayV1, landmarksToCorrespondencesV1 } = await import("../lib/visual-assist/route-assist/frameRegistrationAiGateway");
  const landmarks = await analyzeRouteAssistFrameLandmarksWithAiGatewayV1({ fromImageUrl: toDataUrl(fromPath), toImageUrl: toDataUrl(toPath) });
  return landmarksToCorrespondencesV1(landmarks);
}

async function main() {
  const fromPath = arg("from");
  const toPath = arg("to");
  if (!fromPath || !toPath) throw new Error("Usage: --from <photo1> --to <candidate> [--direction RIGHT|LEFT|UP|DOWN] [--from-aspect W:H] [--to-aspect W:H] [--landmarks landmarks.json] [--out out.png]");
  const direction = (arg("direction") as RouteAssistRelativeDirectionV1 | undefined) ?? "RIGHT";
  const fromAspectRatio = parseAspect(arg("from-aspect"), 1);
  const toAspectRatio = parseAspect(arg("to-aspect"), 1);
  const outPath = arg("out") ?? "route-assist-capture-diagnostic.png";
  const region: RouteAssistNormalizedRectV1 = ghostEdgeCropRectV1(direction);

  const correspondences = await loadCorrespondences(fromPath, toPath);

  const oldEval = evaluateRouteAssistCorrespondenceDistributionV1(correspondences);
  const newEval = evaluateRouteAssistCorrespondenceDistributionV1(correspondences, region);
  const oldRegistration = registerFrameV1({ correspondences, fromAspectRatio, toAspectRatio });
  const newRegistration = registerFrameV1({ correspondences, fromAspectRatio, toAspectRatio, expectedOverlapRegion: region });

  console.log(`Direction: ${direction}  Expected overlap region: ${JSON.stringify(region)}`);
  console.log(`Correspondences: ${correspondences.length}`);
  console.log(`\nOLD distribution check (no expected region): sufficient=${oldEval.sufficient} reason="${oldEval.reason}"`);
  console.log(JSON.stringify(oldEval.distribution, null, 2));
  console.log(`\nNEW distribution check (region-aware): sufficient=${newEval.sufficient} reason="${newEval.reason}"`);
  console.log(`\nOLD registerFrameV1 outcome: ${oldRegistration.outcome}${oldRegistration.outcome === "REJECTED" ? ` -- ${oldRegistration.reason}` : ""}`);
  console.log(`NEW registerFrameV1 outcome: ${newRegistration.outcome}${newRegistration.outcome === "REJECTED" ? ` -- ${newRegistration.reason}` : ""}`);

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<!doctype html><html><body></body></html>");

  const outputDataUrl = await page.evaluate(
    async ({ photo1Url, candidateUrl, landmarks, regionArg, oldEvalResult, newEvalResult, oldReg, newReg, directionArg }) => {
      const img1 = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = photo1Url as string;
      });
      const img2 = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image();
        el.onload = () => resolve(el);
        el.onerror = reject;
        el.src = candidateUrl as string;
      });

      const panelW = 520;
      const panelH = Math.round(panelW * (img1.height / img1.width));
      const gap = 20;
      const textH = 420;
      const canvas = document.createElement("canvas");
      canvas.width = panelW * 2 + gap * 3;
      canvas.height = panelH + gap * 2 + textH;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#111827";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const x1 = gap;
      const x2 = gap * 2 + panelW;
      const yTop = gap;
      ctx.drawImage(img1, x1, yTop, panelW, panelH);
      ctx.drawImage(img2, x2, yTop, panelW, panelH);

      const reg = regionArg as { x: number; y: number; width: number; height: number };
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 6]);
      ctx.strokeRect(x1 + reg.x * panelW, yTop + reg.y * panelH, reg.width * panelW, reg.height * panelH);
      ctx.setLineDash([]);
      ctx.fillStyle = "#22c55e";
      ctx.font = "bold 14px sans-serif";
      ctx.fillText("expected overlap region", x1 + reg.x * panelW - 150, yTop + panelH + 18);

      const pts = landmarks as Array<{ from: { x: number; y: number }; to: { x: number; y: number } }>;
      pts.forEach((lm, i) => {
        const fx = x1 + lm.from.x * panelW;
        const fy = yTop + lm.from.y * panelH;
        const tx = x2 + lm.to.x * panelW;
        const ty = yTop + lm.to.y * panelH;
        ctx.fillStyle = "#f59e0b";
        ctx.beginPath();
        ctx.arc(fx, fy, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(tx, ty, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText(String(i + 1), fx + 9, fy - 9);
        ctx.fillText(String(i + 1), tx + 9, ty - 9);
      });

      ctx.fillStyle = "#e5e7eb";
      ctx.font = "bold 16px sans-serif";
      ctx.fillText("FROM (previous accepted photo)", x1, yTop - 6);
      ctx.fillText("TO (frozen candidate frame)", x2, yTop - 6);

      const textY = yTop + panelH + gap + 24;
      ctx.fillStyle = "#f9fafb";
      ctx.font = "bold 18px sans-serif";
      ctx.fillText(`Route Assist capture-validation diagnostic — ${directionArg} continuation`, gap, textY);
      ctx.font = "13px monospace";
      const oldE = oldEvalResult as { sufficient: boolean; reason: string; distribution: any };
      const newE = newEvalResult as { sufficient: boolean; reason: string; distribution: any };
      const oldR = oldReg as { outcome: string; reason?: string };
      const newR = newReg as { outcome: string; reason?: string };
      const lh = 20;
      const lines: Array<[string, string]> = [
        [`Correspondences: ${pts.length} pairs, numbered 1-${pts.length} above`, "#d1d5db"],
        [`Bounding box (FROM space): width=${oldE.distribution.fromBoundingBoxWidth.toFixed(3)} height=${oldE.distribution.fromBoundingBoxHeight.toFixed(3)}  (threshold: >= 0.2 on either axis)`, "#d1d5db"],
        [`Min pairwise separation: ${oldE.distribution.minPairSeparation.toFixed(4)}`, "#d1d5db"],
        ["", "#d1d5db"],
        [`OLD distribution check (global 2x2 grid, no expected region): sufficient=${oldE.sufficient}`, oldE.sufficient ? "#86efac" : "#fca5a5"],
        [`  reason="${oldE.reason}"`, oldE.sufficient ? "#86efac" : "#fca5a5"],
        [`NEW distribution check (region-aware, 3 bins along the region's dominant axis): sufficient=${newE.sufficient}`, newE.sufficient ? "#86efac" : "#fca5a5"],
        [`  reason="${newE.reason}"`, newE.sufficient ? "#86efac" : "#fca5a5"],
        ["", "#d1d5db"],
        [`OLD registerFrameV1: ${oldR.outcome}${oldR.outcome === "REJECTED" ? ` -- ${oldR.reason}` : ""}`, oldR.outcome === "REGISTERED" ? "#86efac" : "#fca5a5"],
        [`NEW registerFrameV1: ${newR.outcome}${newR.outcome === "REJECTED" ? ` -- ${newR.reason}` : ""}`, newR.outcome === "REGISTERED" ? "#86efac" : "#fca5a5"],
      ];
      for (let i = 0; i < lines.length; i++) {
        ctx.fillStyle = lines[i][1];
        ctx.fillText(lines[i][0], gap, textY + 28 + i * lh);
      }

      return canvas.toDataURL("image/png");
    },
    {
      photo1Url: toDataUrl(fromPath),
      candidateUrl: toDataUrl(toPath),
      landmarks: correspondences,
      regionArg: region,
      oldEvalResult: oldEval,
      newEvalResult: newEval,
      oldReg: oldRegistration,
      newReg: newRegistration,
      directionArg: direction,
    },
  );

  await browser.close();
  writeFileSync(outPath, Buffer.from(outputDataUrl.replace(/^data:image\/png;base64,/, ""), "base64"));
  console.log(`\nAnnotated diagnostic saved to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
