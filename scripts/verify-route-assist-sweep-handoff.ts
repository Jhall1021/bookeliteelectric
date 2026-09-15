import { persistRouteAssistSweepCaptureV1, type RouteAssistCaptureImagePersisterV1, type RouteAssistLocalSweepFrameV1 } from "../lib/visual-assist/route-assist/captureHandoff";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}
console.log("\nROUTE ASSIST SWEEP HANDOFF\n");

const baseFrames: RouteAssistLocalSweepFrameV1[] = [0, 1, 2].map((sequence) => ({
  imageId: `img-${sequence}`,
  objectUrl: `blob:img-${sequence}`,
  mimeType: "image/jpeg" as const,
  width: 1200,
  height: 1600,
  capturedAt: new Date(Date.UTC(2026, 8, 15, 12, 0, sequence)).toISOString(),
  sequence,
}));
const persister: RouteAssistCaptureImagePersisterV1 = {
  async persist(frame) { return { imageId: frame.imageId, imageUrl: `https://fixture.invalid/${frame.imageId}.jpg`, mimeType: frame.mimeType, width: frame.width, height: frame.height }; },
};

async function run() {
  const coherent = await persistRouteAssistSweepCaptureV1({ frames: [...baseFrames].reverse(), persister });
  check("unordered input is normalized by explicit contiguous sequence", coherent?.persistedFrames.map((frame) => frame.sequence).join(",") === "0,1,2", JSON.stringify(coherent));
  check("durable artifact IDs preserve capture order", coherent?.captureArtifacts.imageIds.join(",") === "img-0,img-1,img-2", JSON.stringify(coherent?.captureArtifacts));
  check("final ordered frame becomes review image", coherent?.reviewImage.imageId === "img-2", JSON.stringify(coherent?.reviewImage));

  const duplicateId = await persistRouteAssistSweepCaptureV1({ frames: [{ ...baseFrames[0] }, { ...baseFrames[1], imageId: "img-0" }], persister });
  check("duplicate image identity fails closed", duplicateId === null);

  const duplicateSequence = await persistRouteAssistSweepCaptureV1({ frames: [{ ...baseFrames[0] }, { ...baseFrames[1], sequence: 0 }], persister });
  check("duplicate sequence fails closed", duplicateSequence === null);

  const sequenceGap = await persistRouteAssistSweepCaptureV1({ frames: [{ ...baseFrames[0] }, { ...baseFrames[2] }], persister });
  check("sequence gap fails closed", sequenceGap === null);

  const badTimestamp = await persistRouteAssistSweepCaptureV1({ frames: [{ ...baseFrames[0], capturedAt: "not-a-date" }], persister });
  check("invalid capture timestamp fails closed", badTimestamp === null);

  const backwardsTime = await persistRouteAssistSweepCaptureV1({ frames: [{ ...baseFrames[0], capturedAt: baseFrames[1].capturedAt }, { ...baseFrames[1], capturedAt: baseFrames[0].capturedAt }], persister });
  check("backwards capture time fails closed", backwardsTime === null);

  const mutatedPersistence = await persistRouteAssistSweepCaptureV1({
    frames: baseFrames,
    persister: { async persist(frame) { return { imageId: `${frame.imageId}-mutated`, imageUrl: "https://fixture.invalid/x.jpg", mimeType: frame.mimeType, width: frame.width, height: frame.height }; } },
  });
  check("storage cannot mutate stable image identity", mutatedPersistence === null);

  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}
run().catch((error) => { console.error(error); process.exit(1); });
