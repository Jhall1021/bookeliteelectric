"use client";

import { useEffect, useRef, useState } from "react";
import type { RouteAssistLocalSweepFrameV1 } from "@/lib/visual-assist/route-assist/captureHandoff";
import type { RouteAssistTargetedRecaptureFocusV1 } from "@/lib/visual-assist/route-assist/targetedRecapture";

export type RouteAssistTargetedRecaptureCaptureV1 = {
  version: 1;
  captureKind: "TARGETED_SUPPLEMENT";
  focus: RouteAssistTargetedRecaptureFocusV1;
  capturedAt: string;
  frames: RouteAssistLocalSweepFrameV1[];
};

type Props = {
  focus: RouteAssistTargetedRecaptureFocusV1;
  instruction: string;
  onComplete: (capture: RouteAssistTargetedRecaptureCaptureV1) => void;
  onCancel?: () => void;
};

const MAX_FRAMES = 4;
const MAX_LONG_EDGE_PX = 1600;

export default function RouteAssistTargetedRecaptureCamera({ focus, instruction, onComplete, onCancel }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const objectUrlsRef = useRef<string[]>([]);
  const framesRef = useRef<RouteAssistLocalSweepFrameV1[]>([]);
  const [state, setState] = useState<"READY" | "CAPTURING" | "COMPLETE">("READY");
  const [frameCount, setFrameCount] = useState(0);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing] = useState(false);

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
  }, []);

  async function openCamera() {
    setCameraError(null);
    framesRef.current = [];
    setFrameCount(0);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("camera unavailable");
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("CAPTURING");
    } catch {
      setCameraError("We couldn’t open the camera. Check camera permission and try again.");
    }
  }

  async function captureFrame() {
    if (capturing || framesRef.current.length >= MAX_FRAMES) return;
    const video = videoRef.current;
    if (!video?.videoWidth || !video.videoHeight) return;
    setCapturing(true);
    try {
      const longEdge = Math.max(video.videoWidth, video.videoHeight);
      const scale = longEdge > MAX_LONG_EDGE_PX ? MAX_LONG_EDGE_PX / longEdge : 1;
      const width = Math.max(1, Math.round(video.videoWidth * scale));
      const height = Math.max(1, Math.round(video.videoHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.drawImage(video, 0, 0, width, height);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
      if (!blob) return;
      const objectUrl = URL.createObjectURL(blob);
      const sequence = framesRef.current.length;
      objectUrlsRef.current.push(objectUrl);
      framesRef.current.push({
        imageId: `browser-supplement-${Date.now()}-${sequence}`,
        objectUrl,
        mimeType: "image/jpeg",
        width,
        height,
        capturedAt: new Date().toISOString(),
        sequence,
      });
      setFrameCount(framesRef.current.length);
    } finally {
      setCapturing(false);
    }
  }

  function finish() {
    if (!framesRef.current.length) return;
    const frames = framesRef.current.map((frame) => ({ ...frame }));
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("COMPLETE");
    onComplete({ version: 1, captureKind: "TARGETED_SUPPLEMENT", focus, capturedAt: new Date().toISOString(), frames });
  }

  return <div className="overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm" data-testid="route-assist-targeted-recapture-camera">
    <div className="relative aspect-[3/4] bg-slate-950">
      <video ref={videoRef} muted playsInline className={`h-full w-full object-cover ${state === "CAPTURING" ? "block" : "hidden"}`} aria-label="Focused Route Assist recapture camera" />
      {state !== "CAPTURING" && <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white"><div className="text-xl font-semibold">Capture just this area</div><p className="mt-2 text-sm leading-6 text-white/75">{instruction}</p></div>}
      {state === "CAPTURING" && <><div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-black/55 px-4 py-3 text-sm leading-5 text-white backdrop-blur-sm">{instruction}</div><div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/55 px-4 py-3 text-center text-xs text-white/90 backdrop-blur-sm">{frameCount} focused photo{frameCount === 1 ? "" : "s"} captured · supplemental evidence only</div></>}
    </div>
    <div className="p-5">
      <div className="text-xs text-slate">These photos supplement the original room sweep. Their order does not establish room geometry or route adjacency.</div>
      {cameraError && <p className="mt-3 text-sm text-red-600">{cameraError}</p>}
      {state === "READY" && <button type="button" onClick={openCamera} className="mt-4 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white">Open camera</button>}
      {state === "CAPTURING" && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" disabled={capturing || frameCount >= MAX_FRAMES} onClick={captureFrame} className="rounded-xl border border-cardline px-4 py-3 text-sm font-semibold text-navy disabled:opacity-50">{capturing ? "Capturing…" : frameCount >= MAX_FRAMES ? "4 photos captured" : "Capture photo"}</button><button type="button" disabled={frameCount === 0} onClick={finish} className="rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Use {frameCount || ""} photo{frameCount === 1 ? "" : "s"}</button></div>}
      {state === "COMPLETE" && <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">Focused evidence captured. A fresh provider review is still required.</div>}
      {onCancel && state !== "CAPTURING" && <button type="button" onClick={onCancel} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">Cancel</button>}
    </div>
  </div>;
}
