import type { RouteAssistPointCorrespondenceV1 } from "./imageRegistration";

/**
 * CLASSICAL-CV REPLACEMENT FOR THE AI-LANDMARK PROPOSAL STEP (real-phone
 * diagnosis, 21-22 Sep 2026): a real captured attempt proved the AI
 * Gateway landmark call (frameRegistrationAiGateway.ts) does not reliably
 * honor its own documented [0,1] coordinate contract -- reproduced by
 * hand against the real captured JSON, matching its reported rejection
 * stats exactly (see git history on this branch). Asking a general-
 * purpose multimodal model for precise pixel-level point localization is
 * fighting the wrong tool for a solved, deterministic problem. ORB
 * keypoint pixel coordinates come directly from the same image data this
 * module reads, normalized by the SAME known image dimensions -- there is
 * no separate coordinate space to get wrong.
 *
 * RUNS IN A DEDICATED WEB WORKER (real-phone correction, 22 Sep 2026): a
 * first version ran OpenCV.js on the MAIN thread, loaded via a dynamically
 * injected <script> tag. Verified correct and fast in complete isolation
 * (a controlled synthetic translation recovered exactly; a full ORB run
 * at real photo resolution completed in under 100ms) -- but driven
 * through the REAL app end-to-end, that same main-thread loading
 * genuinely hung: OpenCV.js's own onRuntimeInitialized callback fired
 * (confirmed directly via tracing), yet the awaiting call never resumed,
 * for minutes, with near-zero CPU use throughout -- consistent with the
 * main thread's own ongoing work (the alignment-evidence probe loop,
 * React re-renders) starving whatever OpenCV.js needed afterward. Moving
 * the exact same library and algorithm into a Web Worker -- verified,
 * step by step, against the real running app page before this rewrite --
 * resolved it outright: importScripts, onRuntimeInitialized, and a full
 * real-resolution ORB match all completed in under 500ms with zero main-
 * thread contention, because there IS none in a worker's own isolated
 * global scope. This is also simply the right place for CPU-heavy WASM
 * work regardless of that specific hang's exact cause: it keeps the
 * capture UI responsive while matching runs.
 *
 * Returns correspondences in the EXACT RouteAssistPointCorrespondenceV1
 * shape imageRegistration.ts's registerFrameV1 already consumes. The
 * entire downstream pipeline -- the spatial-distribution gate, RANSAC
 * homography/affine/similarity fitting, every threshold -- is UNCHANGED.
 * This module only replaces how candidate correspondences are proposed.
 */

const OPENCV_JS_URL_V1 = "https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.9.0-release.2/dist/opencv.js";
const ORB_FEATURE_COUNT_V1 = 500;
/** Best-N matches by Hamming distance kept for registration -- generous enough that the distribution gate (not this cap) is what decides whether the set is trustworthy. */
const MAX_CORRESPONDENCES_USED_V1 = 40;

export type RouteAssistFeatureMatchDiagnosticsV1 = {
  fromKeypointCount: number;
  toKeypointCount: number;
  rawMatchCount: number;
  usedMatchCount: number;
  maxHammingDistanceUsed: number | null;
};

export type RouteAssistFeatureMatchResultV1 = {
  correspondences: RouteAssistPointCorrespondenceV1[];
  diagnostics: RouteAssistFeatureMatchDiagnosticsV1;
};

/**
 * The worker's entire body, as a string -- built once via a Blob URL, the
 * same "load from a CDN, only on this page, no bundled asset" spirit
 * OPENCV_JS_URL_V1 already used on the main thread. Runs entirely in the
 * worker's own isolated global scope: importScripts (synchronous, exactly
 * what opencv.js's UMD build expects), ORB detection, cross-checked
 * Hamming matching, and the SAME normalize-by-known-dimensions math the
 * main-thread version used -- moved here verbatim, not reimplemented.
 */
const WORKER_SOURCE_V1 = `
let cvReadyPromise = null;
// RESOLVE WITH A PLAIN BOOLEAN, NEVER THE cv OBJECT ITSELF (real-phone
// bug, 22 Sep 2026): a first version called resolve(self.cv). opencv.js's
// exported cv object exposes a .then method (a known trait of its
// wrapper), which makes it a "thenable" -- and per the Promise spec,
// resolving a promise WITH a thenable makes the outer promise chain onto
// it instead of settling immediately. That inner chain never completed,
// so every await ensureCvV1() hung forever even though
// onRuntimeInitialized had genuinely already fired (confirmed directly:
// the callback ran, resolve() was called, and the await still never
// continued). Resolving with a plain, non-thenable value sidesteps this
// entirely; callers re-read self.cv fresh afterward, same as before.
function ensureCvV1() {
  if (cvReadyPromise) return cvReadyPromise;
  cvReadyPromise = new Promise((resolve, reject) => {
    try {
      importScripts(${JSON.stringify(OPENCV_JS_URL_V1)});
    } catch (err) {
      reject(err);
      return;
    }
    if (typeof self.cv.getBuildInformation === "function") {
      resolve(true);
      return;
    }
    self.cv.onRuntimeInitialized = () => resolve(true);
  });
  return cvReadyPromise;
}

self.onmessage = async (event) => {
  const { id, fromImageData, toImageData } = event.data;
  try {
    await ensureCvV1();
    const cv = self.cv;

    const fromMat = cv.matFromImageData(fromImageData);
    const toMat = cv.matFromImageData(toImageData);
    const fromGray = new cv.Mat();
    const toGray = new cv.Mat();
    cv.cvtColor(fromMat, fromGray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(toMat, toGray, cv.COLOR_RGBA2GRAY);
    fromMat.delete();
    toMat.delete();

    const orb = new cv.ORB(${ORB_FEATURE_COUNT_V1});
    const fromKeypoints = new cv.KeyPointVector();
    const toKeypoints = new cv.KeyPointVector();
    const fromDescriptors = new cv.Mat();
    const toDescriptors = new cv.Mat();
    const mask = new cv.Mat();

    try {
      orb.detectAndCompute(fromGray, mask, fromKeypoints, fromDescriptors);
      orb.detectAndCompute(toGray, mask, toKeypoints, toDescriptors);

      if (fromDescriptors.rows === 0 || toDescriptors.rows === 0) {
        self.postMessage({
          id,
          correspondences: [],
          diagnostics: {
            fromKeypointCount: fromKeypoints.size(),
            toKeypointCount: toKeypoints.size(),
            rawMatchCount: 0,
            usedMatchCount: 0,
            maxHammingDistanceUsed: null,
          },
        });
        return;
      }

      const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
      const matches = new cv.DMatchVector();
      try {
        matcher.match(fromDescriptors, toDescriptors, matches);

        const ordered = [];
        for (let i = 0; i < matches.size(); i += 1) {
          const match = matches.get(i);
          const fromPoint = fromKeypoints.get(match.queryIdx).pt;
          const toPoint = toKeypoints.get(match.trainIdx).pt;
          ordered.push({
            distance: match.distance,
            from: { x: fromPoint.x / fromImageData.width, y: fromPoint.y / fromImageData.height },
            to: { x: toPoint.x / toImageData.width, y: toPoint.y / toImageData.height },
          });
        }
        ordered.sort((a, b) => a.distance - b.distance);
        const used = ordered.slice(0, ${MAX_CORRESPONDENCES_USED_V1});

        self.postMessage({
          id,
          correspondences: used.map((match) => ({ from: match.from, to: match.to })),
          diagnostics: {
            fromKeypointCount: fromKeypoints.size(),
            toKeypointCount: toKeypoints.size(),
            rawMatchCount: ordered.length,
            usedMatchCount: used.length,
            maxHammingDistanceUsed: used.length > 0 ? used[used.length - 1].distance : null,
          },
        });
      } finally {
        matches.delete();
        matcher.delete();
      }
    } finally {
      fromGray.delete();
      toGray.delete();
      fromDescriptors.delete();
      toDescriptors.delete();
      fromKeypoints.delete();
      toKeypoints.delete();
      mask.delete();
      orb.delete();
    }
  } catch (err) {
    self.postMessage({ id, error: String((err && err.stack) || err) });
  }
};
`;

let workerInstance: Worker | null = null;
let nextRequestId = 1;
const pendingRequests = new Map<number, { resolve: (result: RouteAssistFeatureMatchResultV1) => void; reject: (error: Error) => void }>();

function getWorkerV1(): Worker {
  if (workerInstance) return workerInstance;
  const blobUrl = URL.createObjectURL(new Blob([WORKER_SOURCE_V1], { type: "application/javascript" }));
  const worker = new Worker(blobUrl);
  worker.onmessage = (event: MessageEvent<{ id: number; correspondences?: RouteAssistPointCorrespondenceV1[]; diagnostics?: RouteAssistFeatureMatchDiagnosticsV1; error?: string }>) => {
    const { id, correspondences, diagnostics, error } = event.data;
    const pending = pendingRequests.get(id);
    if (!pending) return;
    pendingRequests.delete(id);
    if (error || !correspondences || !diagnostics) {
      pending.reject(new Error(error ?? "feature-matching worker returned an incomplete result"));
      return;
    }
    pending.resolve({ correspondences, diagnostics });
  };
  worker.onerror = (event: ErrorEvent) => {
    // A worker-level (script-load or uncaught) error has no request id to
    // route to -- reject every request currently in flight rather than
    // leaving them hanging forever.
    const error = new Error(event.message || "feature-matching worker failed to load or run");
    for (const [id, pending] of pendingRequests) {
      pendingRequests.delete(id);
      pending.reject(error);
    }
  };
  workerInstance = worker;
  return worker;
}

function imageToImageDataV1(image: HTMLImageElement): ImageData {
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.drawImage(image, 0, 0);
  return context.getImageData(0, 0, canvas.width, canvas.height);
}

/** Proposes candidate correspondences for a from/to photo pair via ORB detection + cross-checked Hamming matching, run in a dedicated Web Worker. See this module's own doc comment for why this replaced the AI-landmark step, and why it runs off the main thread. */
export function proposeCorrespondencesViaFeatureMatchingV1(fromImage: HTMLImageElement, toImage: HTMLImageElement): Promise<RouteAssistFeatureMatchResultV1> {
  const fromImageData = imageToImageDataV1(fromImage);
  const toImageData = imageToImageDataV1(toImage);
  const worker = getWorkerV1();
  const id = nextRequestId++;

  return new Promise((resolve, reject) => {
    pendingRequests.set(id, { resolve, reject });
    worker.postMessage({ id, fromImageData, toImageData });
  });
}
