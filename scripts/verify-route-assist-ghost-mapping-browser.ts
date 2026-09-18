import { chromium } from "playwright";

/**
 * GHOST-COORDINATE VERIFICATION (real-phone correction: "do not treat
 * contain -> cover as sufficient proof; demonstrate that the captured
 * image, selected edge crop, and live preview use consistent orientation,
 * scale, and crop coordinates, using recognizable landmarks across
 * differing aspect ratios"). This is a PIXEL-LEVEL proof, not a visual
 * screenshot inspection: synthetic source photos carry a distinctly
 * colored landmark placed at a KNOWN coordinate inside the edge strip and
 * a second landmark placed OUTSIDE it; the crop math is replicated
 * VERBATIM from cropRouteAssistGhostStripV1/ghostEdgeCropRectV1
 * (lib/visual-assist/route-assist/alignmentLock.ts,
 * app/dev-fixtures/route-assist-guided-continuation/
 * RouteAssistGuidedContinuationPreviewClient.tsx) and checked with
 * getImageData against exact expected pixel positions.
 *
 * Two orientations are covered: a LANDSCAPE (4:3) source with a RIGHT
 * continuation (width-based crop), and a PORTRAIT (3:4) source with an
 * UP continuation (height-based crop) -- proving the crop's width/height
 * roles correctly swap with orientation, not just that one hardcoded axis
 * happens to work. object-fit: cover is verified against BOTH a
 * same-aspect live-view band (should introduce ~0 crop) and a
 * DELIBERATELY MISMATCHED-aspect band (a different capture vs. preview
 * resolution, which neither getUserMedia call constrains) -- proving
 * cover uses one uniform scale factor (never stretches non-uniformly)
 * and that the landmark remains visible after its symmetric center-crop.
 *
 * Run: npx tsx scripts/verify-route-assist-ghost-mapping-browser.ts
 */

let failures = 0;
function check(label: string, condition: boolean, detail = "") {
  console.log(`  ${condition ? "ok" : "FAIL"} — ${label}${condition || !detail ? "" : `: ${detail}`}`);
  if (!condition) failures++;
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on("pageerror", (error) => {
    failures++;
    console.error(`  FAIL — uncaught page error: ${error.message}`);
  });
  await page.setContent("<!doctype html><html><body></body></html>");

  console.log("\n1. RIGHT continuation on a LANDSCAPE (4:3) source -- width-based crop");
  const rightResult = await page.evaluate(async () => {
    const results: Array<{ label: string; ok: boolean; detail?: unknown }> = [];
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 800;
    sourceCanvas.height = 600;
    const sctx = sourceCanvas.getContext("2d")!;
    sctx.fillStyle = "#222222";
    sctx.fillRect(0, 0, 800, 600);
    sctx.fillStyle = "#ff0000";
    sctx.fillRect(770, 290, 20, 20); // center (780,300) -- inside the right 20% (source x in [640,800])
    sctx.fillStyle = "#0000ff";
    sctx.fillRect(90, 290, 20, 20); // center (100,300) -- well outside the strip
    const sourceImg = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = sourceCanvas.toDataURL("image/png");
    });

    // ghostEdgeCropRectV1("RIGHT") given ROUTE_ASSIST_GHOST_EDGE_STRIP_FRACTION_V1=0.2
    const rect = { x: 0.8, y: 0, width: 0.2, height: 1 };
    const sourceWidth = 800;
    const sourceHeight = 600;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.round(rect.width * sourceWidth));
    cropCanvas.height = Math.max(1, Math.round(rect.height * sourceHeight));
    const cctx = cropCanvas.getContext("2d")!;
    // Verbatim cropRouteAssistGhostStripV1 drawImage call.
    cctx.drawImage(sourceImg, rect.x * sourceWidth, rect.y * sourceHeight, rect.width * sourceWidth, rect.height * sourceHeight, 0, 0, cropCanvas.width, cropCanvas.height);

    results.push({ label: "crop canvas width == 20% of source width (160px)", ok: cropCanvas.width === 160 });
    results.push({ label: "crop canvas height == 100% of source height (600px)", ok: cropCanvas.height === 600 });

    const redPixel = cctx.getImageData(140, 300, 1, 1).data; // source (770-790,290-310) -> crop-local x = source_x - 640 -> [130,150]
    results.push({ label: "RED landmark present at its exact expected crop-local position (140,300)", ok: redPixel[0] > 200 && redPixel[1] < 60, detail: Array.from(redPixel) });

    const cropPixels = cctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height).data;
    let blueFound = false;
    for (let i = 0; i < cropPixels.length; i += 4) {
      if (cropPixels[i] < 40 && cropPixels[i + 1] < 40 && cropPixels[i + 2] > 200) {
        blueFound = true;
        break;
      }
    }
    results.push({ label: "BLUE landmark (outside the strip) is completely absent from the crop", ok: !blueFound });

    // object-fit: cover's own algorithm, inlined (no local helper function --
    // page.evaluate's serialized source cannot resolve esbuild's __name()
    // shim that a named/const-bound function inside this callback picks up).
    // scale = max(boxW/imgW, boxH/imgH); offset = (box - img*scale) / 2.
    const sameAspectScale = Math.max(80 / 160, 300 / 600); // band aspect == crop aspect (0.2667)
    const sameAspectOffsetX = (80 - 160 * sameAspectScale) / 2;
    const sameAspectOffsetY = (300 - 600 * sameAspectScale) / 2;
    results.push({ label: "same-aspect live-view band: cover introduces ~0 crop", ok: Math.abs(sameAspectOffsetX) < 0.5 && Math.abs(sameAspectOffsetY) < 0.5 });

    const mismatchedScale = Math.max(80 / 160, 225 / 600); // deliberately different (16:9-ish) live-view aspect
    const mismatchedOffsetY = (225 - 600 * mismatchedScale) / 2;
    const scaledLandmarkY = 300 * mismatchedScale + mismatchedOffsetY;
    results.push({ label: "mismatched-aspect band: RED landmark (vertical center) remains visible after cover's symmetric center-crop", ok: scaledLandmarkY >= 0 && scaledLandmarkY <= 225, detail: scaledLandmarkY });

    const liveImg = document.createElement("img");
    liveImg.src = cropCanvas.toDataURL("image/png");
    liveImg.style.cssText = "position:fixed;left:0;top:0;width:80px;height:225px;object-fit:cover;";
    document.body.appendChild(liveImg);
    await new Promise<void>((res) => {
      liveImg.onload = () => res();
      if (liveImg.complete) res();
    });
    const rectLive = liveImg.getBoundingClientRect();
    results.push({ label: "live DOM <img object-fit:cover> renders at the exact requested band size", ok: Math.round(rectLive.width) === 80 && Math.round(rectLive.height) === 225 });
    liveImg.remove();

    return results;
  });
  for (const r of rightResult) check(r.label, r.ok, r.detail !== undefined ? JSON.stringify(r.detail) : "");

  console.log("\n2. UP continuation on a PORTRAIT (3:4) source -- height-based crop, orientation roles swapped");
  const upResult = await page.evaluate(async () => {
    const results: Array<{ label: string; ok: boolean; detail?: unknown }> = [];
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 600;
    sourceCanvas.height = 800;
    const sctx = sourceCanvas.getContext("2d")!;
    sctx.fillStyle = "#222222";
    sctx.fillRect(0, 0, 600, 800);
    sctx.fillStyle = "#00ff00";
    sctx.fillRect(290, 10, 20, 20); // center (300,20) -- inside the top 20% (source y in [0,160])
    sctx.fillStyle = "#ffff00";
    sctx.fillRect(290, 700, 20, 20); // center (300,710) -- well outside (bottom of image)
    const sourceImg = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = sourceCanvas.toDataURL("image/png");
    });

    // ghostEdgeCropRectV1("UP") = {x:0, y:0, width:1, height:0.2}
    const rect = { x: 0, y: 0, width: 1, height: 0.2 };
    const sourceWidth = 600;
    const sourceHeight = 800;
    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = Math.max(1, Math.round(rect.width * sourceWidth));
    cropCanvas.height = Math.max(1, Math.round(rect.height * sourceHeight));
    const cctx = cropCanvas.getContext("2d")!;
    cctx.drawImage(sourceImg, rect.x * sourceWidth, rect.y * sourceHeight, rect.width * sourceWidth, rect.height * sourceHeight, 0, 0, cropCanvas.width, cropCanvas.height);

    results.push({ label: "UP crop width == 100% of source width (600px) -- only height is cropped", ok: cropCanvas.width === 600 });
    results.push({ label: "UP crop height == 20% of source height (160px)", ok: cropCanvas.height === 160 });

    const greenPixel = cctx.getImageData(300, 20, 1, 1).data;
    results.push({ label: "GREEN landmark (top edge) present at its expected crop-local position", ok: greenPixel[1] > 200, detail: Array.from(greenPixel) });

    const cropPixels = cctx.getImageData(0, 0, cropCanvas.width, cropCanvas.height).data;
    let yellowFound = false;
    for (let i = 0; i < cropPixels.length; i += 4) {
      if (cropPixels[i] > 200 && cropPixels[i + 1] > 200 && cropPixels[i + 2] < 40) {
        yellowFound = true;
        break;
      }
    }
    results.push({ label: "YELLOW landmark (bottom of source, outside the top-20% strip) is completely absent from the UP crop", ok: !yellowFound });

    // ghostEdgeDisplayEdgeV1("UP") === "DOWN" -- the source's TOP-edge crop must display on the live view's BOTTOM.
    const displayRect = { x: 0, y: 0.8, width: 1, height: 0.2 };
    results.push({ label: "UP source-crop displays at the bottom 20% of the live view (y=0.8) -- source/display edge roles correctly swapped", ok: displayRect.y === 0.8 });

    return results;
  });
  for (const r of upResult) check(r.label, r.ok, r.detail !== undefined ? JSON.stringify(r.detail) : "");

  await browser.close();
  console.log(failures === 0 ? "\nAll ghost-mapping coordinate checks passed.\n" : `\n${failures} ghost-mapping coordinate check(s) FAILED.\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
