"use client";

import { useEffect, useRef, useState } from "react";

type ScanState = "READY" | "MARK_SOURCE" | "SCANNING" | "MARK_DESTINATION" | "COMPLETE";
type RouteAssistBrowserFrameV1 = { imageId: string; objectUrl: string; mimeType: "image/jpeg"; width: number; height: number; capturedAt: string; sequence: number };
export type RouteAssistRoomScanAnchorV1 = { imageId: string; x: number; y: number };
export type RouteAssistRoomScanDestinationAnchorV1 = RouteAssistRoomScanAnchorV1 & { id: string; label: string };
export type RouteAssistRoomScanCaptureV1 = {
  version: 1;
  captureKind: "ORDINARY_ROOM_SCAN";
  capturedAt: string;
  sourceLabel: string;
  destinationLabels: string[];
  sourceAnchor: RouteAssistRoomScanAnchorV1;
  destinationAnchors: RouteAssistRoomScanDestinationAnchorV1[];
  camera: { facingMode: "environment"; width: number | null; height: number | null };
  sweepFrames: RouteAssistBrowserFrameV1[];
  reviewFrame: Omit<RouteAssistBrowserFrameV1, "capturedAt" | "sequence"> | null;
};
type Props = { sourceLabel: string; destinationLabels: string[]; onScanComplete: (capture: RouteAssistRoomScanCaptureV1) => void; onBack?: () => void };
const SWEEP_FRAME_INTERVAL_MS = 900;
const MAX_SWEEP_FRAMES = 12;
const MAX_SWEEP_FRAME_LONG_EDGE_PX = 1600;

function normalizedPoint(event: React.PointerEvent<HTMLElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
  return { x, y };
}

export default function RouteAssistRoomScanCamera({ sourceLabel, destinationLabels, onScanComplete, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const sweepFramesRef = useRef<RouteAssistBrowserFrameV1[]>([]);
  const sweepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const samplingPromiseRef = useRef<Promise<void> | null>(null);
  const finishingRef = useRef(false);
  const [state, setState] = useState<ScanState>("READY");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [sourceAnchor, setSourceAnchor] = useState<RouteAssistRoomScanAnchorV1 | null>(null);
  const [destinationAnchors, setDestinationAnchors] = useState<RouteAssistRoomScanDestinationAnchorV1[]>([]);
  const [destinationFrame, setDestinationFrame] = useState<RouteAssistBrowserFrameV1 | null>(null);

  function stopSweepTimer() { if (sweepTimerRef.current) { clearInterval(sweepTimerRef.current); sweepTimerRef.current = null; } }
  function revokeObjectUrls() { objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); objectUrlsRef.current = []; }
  useEffect(() => () => { stopSweepTimer(); streamRef.current?.getTracks().forEach((track) => track.stop()); revokeObjectUrls(); }, []);

  async function frameFromVideo(video: HTMLVideoElement, sequence: number): Promise<RouteAssistBrowserFrameV1 | null> {
    if (!video.videoWidth || !video.videoHeight) return null;
    const sourceWidth = video.videoWidth;
    const sourceHeight = video.videoHeight;
    const longEdge = Math.max(sourceWidth, sourceHeight);
    const scale = longEdge > MAX_SWEEP_FRAME_LONG_EDGE_PX ? MAX_SWEEP_FRAME_LONG_EDGE_PX / longEdge : 1;
    const width = Math.max(1, Math.round(sourceWidth * scale));
    const height = Math.max(1, Math.round(sourceHeight * scale));
    const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const context = canvas.getContext("2d"); if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82)); if (!blob) return null;
    const objectUrl = URL.createObjectURL(blob);
    return { imageId: `browser-sweep-${Date.now()}-${sequence}`, objectUrl, mimeType: "image/jpeg", width, height, capturedAt: new Date().toISOString(), sequence };
  }

  async function appendFrame(): Promise<RouteAssistBrowserFrameV1 | null> {
    const video = videoRef.current;
    const sequence = sweepFramesRef.current.length;
    if (!video || sequence >= MAX_SWEEP_FRAMES) return null;
    const frame = await frameFromVideo(video, sequence);
    if (!frame) return null;
    if (sweepFramesRef.current.length >= MAX_SWEEP_FRAMES || sweepFramesRef.current.length !== sequence) { URL.revokeObjectURL(frame.objectUrl); return null; }
    objectUrlsRef.current.push(frame.objectUrl);
    sweepFramesRef.current.push(frame);
    setFrameCount(sweepFramesRef.current.length);
    return frame;
  }

  async function sampleSweepFrame() {
    if (samplingPromiseRef.current) return samplingPromiseRef.current;
    const run = appendFrame().then(() => undefined).finally(() => { if (samplingPromiseRef.current === run) samplingPromiseRef.current = null; });
    samplingPromiseRef.current = run;
    return run;
  }

  async function openCamera() {
    setCameraError(null); stopSweepTimer(); finishingRef.current = false; setFinishing(false); revokeObjectUrls(); sweepFramesRef.current = []; setFrameCount(0); setSourceAnchor(null); setDestinationAnchors([]); setDestinationFrame(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setState("MARK_SOURCE");
    } catch { setCameraError("We couldn’t open the camera. Check camera permission and try again."); }
  }

  async function markSource(event: React.PointerEvent<HTMLDivElement>) {
    if (state !== "MARK_SOURCE" || samplingPromiseRef.current) return;
    const point = normalizedPoint(event);
    const frame = await appendFrame();
    if (!frame) { setCameraError("We couldn’t capture the starting point. Try again."); return; }
    setSourceAnchor({ imageId: frame.imageId, ...point });
    setState("SCANNING");
    sweepTimerRef.current = setInterval(() => { void sampleSweepFrame(); }, SWEEP_FRAME_INTERVAL_MS);
  }

  async function finishScan() {
    if (finishingRef.current || !sourceAnchor) return;
    finishingRef.current = true; setFinishing(true); stopSweepTimer();
    if (samplingPromiseRef.current) await samplingPromiseRef.current;
    const finalFrame = await appendFrame() ?? sweepFramesRef.current[sweepFramesRef.current.length - 1] ?? null;
    if (!finalFrame) { setCameraError("We couldn’t capture the end of the route. Try the scan again."); finishingRef.current = false; setFinishing(false); return; }
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setDestinationFrame(finalFrame);
    setState("MARK_DESTINATION");
    setFinishing(false);
    finishingRef.current = false;
  }

  function markDestination(event: React.PointerEvent<HTMLDivElement>) {
    if (state !== "MARK_DESTINATION" || !destinationFrame || !sourceAnchor) return;
    const point = normalizedPoint(event);
    const index = destinationAnchors.length;
    const label = destinationLabels[index] ?? `Destination ${index + 1}`;
    const next = [...destinationAnchors, { id: `destination-${index + 1}`, label, imageId: destinationFrame.imageId, ...point }];
    setDestinationAnchors(next);
    if (next.length < Math.max(1, destinationLabels.length)) return;

    const frames = [...sweepFramesRef.current].sort((a, b) => a.sequence - b.sequence);
    const reviewFrame = { imageId: destinationFrame.imageId, objectUrl: destinationFrame.objectUrl, mimeType: destinationFrame.mimeType, width: destinationFrame.width, height: destinationFrame.height };
    const capture: RouteAssistRoomScanCaptureV1 = {
      version: 1,
      captureKind: "ORDINARY_ROOM_SCAN",
      capturedAt: new Date().toISOString(),
      sourceLabel,
      destinationLabels: [...destinationLabels],
      sourceAnchor,
      destinationAnchors: next,
      camera: { facingMode: "environment", width: destinationFrame.width, height: destinationFrame.height },
      sweepFrames: frames,
      reviewFrame,
    };
    setState("COMPLETE");
    onScanComplete(capture);
  }

  const destinationCopy = destinationLabels.length === 1 ? destinationLabels[0] : `${destinationLabels.length} new locations`;
  const nextDestinationLabel = destinationLabels[destinationAnchors.length] ?? destinationCopy;
  return <div className="mx-auto w-full max-w-md" data-testid="route-assist-room-scan-camera"><div className="overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm">
    <div className="relative aspect-[3/4] bg-slate-950">
      <video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${state === "MARK_SOURCE" || state === "SCANNING" ? "block" : "hidden"}`} aria-label="Room scan camera preview" />
      {state === "MARK_DESTINATION" && destinationFrame && <div className="absolute inset-0" onPointerDown={markDestination} data-testid="route-assist-mark-destination"><img src={destinationFrame.objectUrl} alt="Final room scan frame" className="h-full w-full object-cover" /></div>}
      {state === "READY" && <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 text-2xl">⌖</div><h2 className="text-xl font-semibold">Scan the room once</h2><p className="mt-2 text-sm leading-6 text-white/75">Start at the {sourceLabel.toLowerCase()}, then slowly move across the wall toward {destinationCopy.toLowerCase()}.</p></div>}
      {state === "MARK_SOURCE" && <div className="absolute inset-0" onPointerDown={markSource} data-testid="route-assist-mark-source"><div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-black/60 px-4 py-3 text-center text-sm font-medium text-white backdrop-blur-sm">Tap the {sourceLabel.toLowerCase()} first.</div><div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/55 px-4 py-3 text-center text-xs text-white/90 backdrop-blur-sm">This creates the start anchor on the first captured frame.</div></div>}
      {state === "SCANNING" && <><div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-black/55 px-4 py-3 text-sm leading-5 text-white backdrop-blur-sm">Slowly move across the wall toward {destinationCopy.toLowerCase()}. Keep the baseboard and door/window trim visible.</div><div className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-56 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/70" /><div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/55 px-4 py-3 text-center text-xs text-white/90 backdrop-blur-sm">{frameCount} scene {frameCount === 1 ? "frame" : "frames"} captured · no hidden wiring inference</div></>}
      {state === "MARK_DESTINATION" && <><div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-black/60 px-4 py-3 text-center text-sm font-medium text-white backdrop-blur-sm">Tap {nextDestinationLabel.toLowerCase()}.</div>{destinationAnchors.map((anchor, index) => <div key={anchor.id} className="pointer-events-none absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-electric text-xs font-bold text-white shadow" style={{ left: `${anchor.x * 100}%`, top: `${anchor.y * 100}%` }}>{index + 1}</div>)}</>}
    </div>
    <div className="p-5"><div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate"><div><strong className="text-navy">Start from:</strong> {sourceLabel}</div><div className="mt-1"><strong className="text-navy">Include:</strong> {destinationLabels.join(", ")}</div></div>{cameraError && <p className="mt-3 text-sm text-red-600">{cameraError}</p>}
      {state === "READY" && <button type="button" onClick={openCamera} className="mt-4 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm" data-testid="route-assist-open-room-camera">Open camera</button>}
      {state === "SCANNING" && <button type="button" disabled={finishing} onClick={finishScan} className="mt-4 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60" data-testid="route-assist-finish-room-scan">{finishing ? "Finishing scan…" : "I reached the destination"}</button>}
      {state === "MARK_SOURCE" && <p className="mt-4 text-center text-xs text-slate-500">Tap directly on the existing source in the camera view.</p>}
      {state === "MARK_DESTINATION" && <p className="mt-4 text-center text-xs text-slate-500">The final frame is frozen so your destination tap stays tied to one exact image.</p>}
      {state === "COMPLETE" && <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Room sweep and endpoint anchors captured in {frameCount} ordered scene {frameCount === 1 ? "frame" : "frames"}. Geometry still requires provider analysis and homeowner review.</div>}
      {onBack && state !== "SCANNING" && <button type="button" onClick={onBack} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">Back</button>}
    </div>
  </div></div>;
}
