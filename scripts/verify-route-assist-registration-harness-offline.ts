/**
 * OFFLINE REGISTRATION HARNESS (real-phone correction: "check registration
 * separately -- run saved accepted photo pairs through registration
 * offline or in a separate test harness; do not reconnect the review
 * UI"). This script exercises the EXACT, UNCHANGED registration pipeline
 * (imageRegistration.ts's registerFrameV1, stitchedWorkspace.ts's
 * addRouteAssistStitchedWorkspaceFrameV1) against a pair of accepted
 * photos WITHOUT touching the capture-isolation client or its plain
 * review UI at all -- it is a standalone CLI script, not wired into the
 * app.
 *
 * TWO MODES:
 *
 *   --synthetic (default, no external dependencies): proves the HARNESS
 *   ITSELF is correct and runnable -- given a deterministic, hand-built
 *   correspondence set standing in for "what an AI landmark proposal
 *   would return", it calls the real registerFrameV1/
 *   addRouteAssistStitchedWorkspaceFrameV1 and reports ADDED/REFUSED with
 *   full diagnostics. This proves the MECHANISM (nothing more) -- it does
 *   NOT prove that any REAL captured photo pair would register.
 *
 *   --pair <fromImagePath> <toImagePath> --from-aspect <n> --to-aspect
 *   <n>: the REAL path, for two actual accepted photos (e.g. copied off a
 *   phone after a real capture session). Calls
 *   analyzeRouteAssistFrameLandmarksWithAiGatewayV1 (the SAME landmark
 *   proposal call the client would eventually use once reconnected) to
 *   get real correspondences, then runs the same registration pipeline.
 *
 * CONCRETE BLOCKER, as of this run: this sandbox has neither
 * AI_GATEWAY_API_KEY nor VERCEL_OIDC_TOKEN set (confirmed by inspecting
 * the shell environment directly), so --pair mode cannot complete here --
 * analyzeRouteAssistFrameLandmarksWithAiGatewayV1 throws
 * "AI Gateway authentication unavailable" immediately. This sandbox also
 * has no physical camera, so there ARE no real phone-captured photo pairs
 * to feed it even if credentials were present. Both are named, checkable
 * facts, not a design limitation of the harness itself -- --pair mode is
 * real, callable code, ready to run wherever both a credential and a real
 * photo pair exist (e.g. from a machine with Vercel AI Gateway access,
 * pointed at two photos saved from an actual phone capture session).
 *
 * STITCHABILITY REMAINS UNVERIFIED for any real, phone-captured photo
 * pair until --pair mode is actually run somewhere both preconditions
 * hold. --synthetic mode below proves the harness and the underlying
 * registration functions work; it does not, and cannot, stand in for
 * that.
 *
 * Run:
 *   npx tsx scripts/verify-route-assist-registration-harness-offline.ts --synthetic
 *   npx tsx scripts/verify-route-assist-registration-harness-offline.ts --pair photo1.jpg photo2.jpg --from-aspect 1.333 --to-aspect 1.333
 */
import { readFileSync } from "node:fs";
import {
  addRouteAssistStitchedWorkspaceFrameV1,
  emptyRouteAssistStitchedWorkspaceV1,
} from "../lib/visual-assist/route-assist/stitchedWorkspace";
import { analyzeRouteAssistFrameLandmarksWithAiGatewayV1, landmarksToCorrespondencesV1 } from "../lib/visual-assist/route-assist/frameRegistrationAiGateway";
import type { RouteAssistPointCorrespondenceV1 } from "../lib/visual-assist/route-assist/imageRegistration";

const arg = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

function reportResult(label: string, result: ReturnType<typeof addRouteAssistStitchedWorkspaceFrameV1>) {
  console.log(`\n${label}`);
  console.log(`  outcome: ${result.outcome}`);
  if (result.outcome === "ADDED") {
    console.log(`  transform type: ${result.registration.transformType}`);
    console.log(`  inliers: ${result.registration.inlierCount}/${result.registration.candidateCount}`);
    console.log(`  mean reprojection error: ${result.registration.meanReprojectionError.toFixed(5)}`);
    console.log(`  STITCHABLE: yes, per the unchanged registration pipeline's own acceptance criteria`);
  } else {
    console.log(`  problem: ${result.problem}`);
    if (result.registration?.outcome === "REJECTED") {
      console.log(`  best inlier count reached: ${result.registration.bestInlierCount}/${result.registration.candidateCount}`);
      console.log(`  best reprojection error reached: ${result.registration.bestReprojectionError?.toFixed(5) ?? "n/a"}`);
    }
    if (result.diagnostics?.sanityFailureReason) {
      console.log(`  sanity failure reason: ${result.diagnostics.sanityFailureReason}`);
    }
    console.log(`  STITCHABLE: no -- the pipeline refused this pair`);
  }
}

async function runSynthetic() {
  console.log("=== SYNTHETIC MODE ===");
  console.log("Proves the harness and the unchanged registration pipeline are callable and behave correctly.");
  console.log("This does NOT prove any real, phone-captured photo pair would register -- see the module doc comment.\n");

  let workspace = emptyRouteAssistStitchedWorkspaceV1();
  const first = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "photo-1", aspectRatio: 4 / 3 });
  if (first.outcome !== "ADDED") throw new Error("unreachable: the first frame always succeeds");
  workspace = first.workspace;

  // A well-distributed, modest-translation correspondence set -- standing
  // in for "what a real landmark proposal call would plausibly return for
  // two overlapping handheld phone photos", per this module's own
  // documented distribution/redundancy requirements.
  const wellDistributed: RouteAssistPointCorrespondenceV1[] = [
    { from: { x: 0.75, y: 0.1 }, to: { x: 0.45, y: 0.1 } },
    { from: { x: 0.95, y: 0.15 }, to: { x: 0.65, y: 0.15 } },
    { from: { x: 0.8, y: 0.5 }, to: { x: 0.5, y: 0.5 } },
    { from: { x: 0.98, y: 0.85 }, to: { x: 0.68, y: 0.85 } },
    { from: { x: 0.7, y: 0.9 }, to: { x: 0.4, y: 0.9 } },
    { from: { x: 0.85, y: 0.35 }, to: { x: 0.55, y: 0.35 } },
  ];
  const goodResult = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "photo-2-good", aspectRatio: 4 / 3, correspondencesFromPrevious: wellDistributed });
  reportResult("Case A: well-distributed, consistent correspondences (expect ADDED)", goodResult);

  // Exactly 4 correspondences with a GENUINE perspective (homography-only)
  // relationship -- the historical real-phone failure this engagement
  // diagnosed two passes ago: a fit from (at) a model's own minimal point
  // count is a tautological exact match, not a robustly tested consensus.
  // Note this is deliberately NOT just "the first 4 points of case A" --
  // 4 points that agree on a pure translation are fine (translation's own
  // minPoints is 1, so 4 agreeing points is real corroboration); the
  // redundancy gate is specifically about HOMOGRAPHY being reachable from
  // (close to) its own 4-point minimum.
  const homographyOnly: RouteAssistPointCorrespondenceV1[] = [
    { from: { x: 0.05, y: 0.05 }, to: { x: -0.2383, y: 0.0791 } },
    { from: { x: 0.95, y: 0.05 }, to: { x: 0.6242, y: 0.0372 } },
    { from: { x: 0.95, y: 0.95 }, to: { x: 0.5947, y: 0.7426 } },
    { from: { x: 0.05, y: 0.95 }, to: { x: -0.1714, y: 0.8898 } },
  ];
  const thinResult = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "photo-2-thin", aspectRatio: 4 / 3, correspondencesFromPrevious: homographyOnly });
  reportResult("Case B: exactly 4 correspondences with a genuine perspective relationship, homography's own bare minimum (expect REFUSED -- low redundancy)", thinResult);

  // Clustered correspondences -- expect REFUSED, insufficient spatial distribution.
  const clustered: RouteAssistPointCorrespondenceV1[] = [
    { from: { x: 0.81, y: 0.1 }, to: { x: 0.51, y: 0.1 } },
    { from: { x: 0.83, y: 0.11 }, to: { x: 0.53, y: 0.11 } },
    { from: { x: 0.84, y: 0.09 }, to: { x: 0.54, y: 0.09 } },
    { from: { x: 0.82, y: 0.12 }, to: { x: 0.52, y: 0.12 } },
    { from: { x: 0.85, y: 0.1 }, to: { x: 0.55, y: 0.1 } },
    { from: { x: 0.86, y: 0.11 }, to: { x: 0.56, y: 0.11 } },
  ];
  const clusteredResult = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "photo-2-clustered", aspectRatio: 4 / 3, correspondencesFromPrevious: clustered });
  reportResult("Case C: 6 correspondences all clustered in one small region (expect REFUSED -- clustered)", clusteredResult);
}

async function runPair() {
  const fromPath = arg("pair");
  const toPath = process.argv[process.argv.indexOf(`--pair`) + 2];
  const fromAspect = Number(arg("from-aspect") ?? "1");
  const toAspect = Number(arg("to-aspect") ?? "1");
  console.log("=== PAIR MODE (real accepted photos) ===");
  console.log(`from: ${fromPath}`);
  console.log(`to:   ${toPath}`);
  console.log(`aspect ratios: ${fromAspect} -> ${toAspect}\n`);
  if (!fromPath || !toPath) throw new Error("--pair requires two image paths: --pair <from> <to>");

  const fromDataUrl = `data:image/jpeg;base64,${readFileSync(fromPath).toString("base64")}`;
  const toDataUrl = `data:image/jpeg;base64,${readFileSync(toPath).toString("base64")}`;

  console.log("Calling analyzeRouteAssistFrameLandmarksWithAiGatewayV1 (the same landmark-proposal call the client would use once reconnected)...");
  const landmarks = await analyzeRouteAssistFrameLandmarksWithAiGatewayV1({ fromImageUrl: fromDataUrl, toImageUrl: toDataUrl });
  console.log(`  received ${landmarks.length} candidate landmark(s).`);
  const correspondences = landmarksToCorrespondencesV1(landmarks);

  let workspace = emptyRouteAssistStitchedWorkspaceV1();
  const first = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "photo-1", aspectRatio: fromAspect });
  if (first.outcome !== "ADDED") throw new Error("unreachable");
  workspace = first.workspace;
  const result = addRouteAssistStitchedWorkspaceFrameV1({ workspace, imageId: "photo-2", aspectRatio: toAspect, correspondencesFromPrevious: correspondences });
  reportResult("Real accepted pair", result);
}

async function main() {
  if (arg("pair")) {
    await runPair();
  } else {
    await runSynthetic();
  }
}

main().catch((error) => {
  console.error(`\nHARNESS ERROR: ${error instanceof Error ? error.message : String(error)}`);
  if (error instanceof Error && error.message.includes("AI Gateway authentication unavailable")) {
    console.error("\nThis is the concrete, named blocker documented in this file's own module doc comment:");
    console.error("no AI_GATEWAY_API_KEY / VERCEL_OIDC_TOKEN in this environment. Stitchability for a real,");
    console.error("phone-captured photo pair remains UNVERIFIED until this is run somewhere both a credential");
    console.error("and a real photo pair exist.");
  }
  process.exit(1);
});
