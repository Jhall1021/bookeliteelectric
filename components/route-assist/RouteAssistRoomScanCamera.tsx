"use client";

import { useEffect, useRef, useState } from "react";

type ScanState = "READY" | "SCANNING" | "COMPLETE";

type RouteAssistBrowserFrameV1 = { imageId: string; objectUrl: string; mimeType: "image/jpeg"; width: number; height: number; capturedAt: string; sequence: number };

export type RouteAssistRoomScanCaptureV1 = {
  version: 1;
  captureKind: "ORDINARY_ROOM_SCAN";
  capturedAt: string;
  sourceLabel: string;
  destinationLabels: string[];
  camera: { facingMode: "environment"; width: number | null; height: number | null };
  /** Ordered browser-local frames sampled during the homeowner's room sweep. */
  sweepFrames: RouteAssistBrowserFrameV1[];
  /** Final frame retained for the existing review/persistence checkpoint. */
  reviewFrame: Omit<RouteAssistBrowserFrameV1, "capturedAt" | "sequence"> | null;
};

type Props = { sourceLabel: string; destinationLabels: string[]; onScanComplete: (capture: RouteAssistRoomScanCaptureV1) => void; onBack?: () => void };

const SWEEP_FRAME_INTERVAL_MS = 900;
const MAX_SWEEP_FRAMES = 12;

export default function RouteAssistRoomScanCamera({ sourceLabel, destinationLabels, onScanComplete, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const sweepFramesRef = useRef<RouteAssistBrowserFrameV1[]>([]);
  const sweepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [state, setState] = useState<ScanState>("READY");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [frameCount, setFrameCount] = useState(0);

  function stopSweepTimer() { if (sweepTimerRef.current) { clearInterval(sweepTimerRef.current); sweepTimerRef.current = null; } }
  function revokeObjectUrls() { objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url)); objectUrlsRef.current = []; }

  useEffect(() => () => {
    stopSweepTimer();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    revokeObjectUrls();
  }, []);

  async function frameFromVideo(video: HTMLVideoElement, sequence: number): Promise<RouteAssistBrowserFrameV1 | null> {
    if (!video.videoWidth || !video.videoHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth; canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return null;
    const objectUrl = URL.createObjectURL(blob);
    objectUrlsRef.current.push(objectUrl);
    const capturedAt = new Date().toISOString();
    return { imageId: `browser-sweep-${Date.now()}-${sequence}`, objectUrl, mimeType: "image/jpeg", width: canvas.width, height: canvas.height, capturedAt, sequence };
  }

  async function sampleSweepFrame() {
    const video = videoRef.current;
    if (!video || sweepFramesRef.current.length >= MAX_SWEEP_FRAMES) return;
    const frame = await frameFromVideo(video, sweepFramesRef.current.length);
    if (!frame || sweepFramesRef.current.length >= MAX_SWEEP_FRAMES) { if (frame) URL.revokeObjectURL(frame.objectUrl); return; }
    sweepFramesRef.current.push(frame);
    setFrameCount(sweepFramesRef.current.length);
  }

  async function openCamera() {
    setCameraError(null); stopSweepTimer(); revokeObjectUrls(); sweepFramesRef.current = []; setFrameCount(0);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) { videoRef.current.srcObject = stream; await videoRef.current.play(); }
      setState("SCANNING");
      await sampleSweepFrame();
      sweepTimerRef.current = setInterval(() => { void sampleSweepFrame(); }, SWEEP_FRAME_INTERVAL_MS);
    } catch { setCameraError("We couldn’t open the camera. Check camera permission and try again."); }
  }

  async function finishScan() {
    stopSweepTimer();
    await sampleSweepFrame();
    const video = videoRef.current;
    const frames = [...sweepFramesRef.current].sort((a, b) => a.sequence - b.sequence);
    const finalFrame = frames[frames.length - 1] ?? null;
    const reviewFrame = finalFrame ? { imageId: finalFrame.imageId, objectUrl: finalFrame.objectUrl, mimeType: finalFrame.mimeType, width: finalFrame.width, height: finalFrame.height } : null;
    const capture: RouteAssistRoomScanCaptureV1 = {
      version: 1, captureKind: "ORDINARY_ROOM_SCAN", capturedAt: new Date().toISOString(), sourceLabel,
      destinationLabels: [...destinationLabels], camera: { facingMode: "environment", width: video?.videoWidth || null, height: video?.videoHeight || null }, sweepFrames: frames, reviewFrame,
    };
    streamRef.current?.getTracks().forEach((track) => track.stop()); streamRef.current = null;
    if (video) video.srcObject = null;
    setState("COMPLETE"); onScanComplete(capture);
  }

  const destinationCopy = destinationLabels.length === 1 ? destinationLabels[0] : `${destinationLabels.length} new locations`;
  return (
    <div className="mx-auto w-full max-w-md" data-testid="route-assist-room-scan-camera"><div className="overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm">
      <div className="relative aspect-[3/4] bg-slate-950">
        <video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${state === "SCANNING" ? "block" : "hidden"}`} aria-label="Room scan camera preview" />
        {state !== "SCANNING" && <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white"><div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 text-2xl">⌖</div><h2 className="text-xl font-semibold">Scan the room once</h2><p className="mt-2 text-sm leading-6 text-white/75">Keep the {sourceLabel.toLowerCase()} and {destinationCopy.toLowerCase()} in view as you slowly move across the wall.</p></div>}
        {state === "SCANNING" && <><div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-black/55 px-4 py-3 text-sm leading-5 text-white backdrop-blur-sm">Slowly move across the wall. Keep the baseboard, door/window trim, source, and destination visible. Route Assist is sampling the sweep in order.</div><div className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-56 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/70" /><div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/55 px-4 py-3 text-center text-xs text-white/90 backdrop-blur-sm">{frameCount} scene {frameCount === 1 ? "frame" : "frames"} captured · no hidden wiring inference</div></>}
      </div>
      <div className="p-5"><div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate"><div><strong className="text-navy">Start from:</strong> {sourceLabel}</div><div className="mt-1"><strong className="text-navy">Include:</strong> {destinationLabels.join(", ")}</div></div>
        {cameraError && <p className="mt-3 text-sm text-red-600">{cameraError}</p>}
        {state === "READY" && <button type="button" onClick={openCamera} className="mt-4 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm" data-testid="route-assist-open-room-camera">Open camera</button>}
        {state === "SCANNING" && <button type="button" onClick={finishScan} className="mt-4 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm" data-testid="route-assist-finish-room-scan">Finish scan</button>}
        {state === "COMPLETE" && <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Room sweep captured in {frameCount} ordered scene {frameCount === 1 ? "frame" : "frames"}. Geometry still requires provider analysis and homeowner review.</div>}
        {onBack && state !== "SCANNING" && <button type="button" onClick={onBack} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">Back</button>}
      </div>
    </div></div>
  );
}
