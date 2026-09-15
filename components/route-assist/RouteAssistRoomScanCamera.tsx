"use client";

import { useEffect, useRef, useState } from "react";

type ScanState = "READY" | "SCANNING" | "COMPLETE";

type Props = {
  sourceLabel: string;
  destinationLabels: string[];
  onScanComplete: () => void;
  onBack?: () => void;
};

export default function RouteAssistRoomScanCamera({
  sourceLabel,
  destinationLabels,
  onScanComplete,
  onBack,
}: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<ScanState>("READY");
  const [cameraError, setCameraError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, []);

  async function openCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false,
      });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setState("SCANNING");
    } catch {
      setCameraError("We couldn’t open the camera. Check camera permission and try again.");
    }
  }

  function finishScan() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("COMPLETE");
    onScanComplete();
  }

  const destinationCopy =
    destinationLabels.length === 1
      ? destinationLabels[0]
      : `${destinationLabels.length} new locations`;

  return (
    <div className="mx-auto w-full max-w-md" data-testid="route-assist-room-scan-camera">
      <div className="overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm">
        <div className="relative aspect-[3/4] bg-slate-950">
          <video
            ref={videoRef}
            muted
            playsInline
            className={`h-full w-full object-cover ${state === "SCANNING" ? "block" : "hidden"}`}
            aria-label="Room scan camera preview"
          />

          {state !== "SCANNING" && (
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8 text-center text-white">
              <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-white/30 bg-white/10 text-2xl">⌖</div>
              <h2 className="text-xl font-semibold">Scan the room once</h2>
              <p className="mt-2 text-sm leading-6 text-white/75">
                Keep the {sourceLabel.toLowerCase()} and {destinationCopy.toLowerCase()} in view as you slowly move across the wall.
              </p>
            </div>
          )}

          {state === "SCANNING" && (
            <>
              <div className="pointer-events-none absolute inset-x-4 top-4 rounded-xl bg-black/55 px-4 py-3 text-sm leading-5 text-white backdrop-blur-sm">
                Slowly move across the wall and keep the selected locations visible when possible.
              </div>
              <div className="pointer-events-none absolute left-1/2 top-1/2 h-36 w-56 -translate-x-1/2 -translate-y-1/2 rounded-2xl border-2 border-white/70" />
              <div className="pointer-events-none absolute inset-x-4 bottom-4 rounded-xl bg-black/55 px-4 py-3 text-center text-xs text-white/90 backdrop-blur-sm">
                Route Assist is capturing observable room geometry. It will not infer hidden wiring.
              </div>
            </>
          )}
        </div>

        <div className="p-5">
          <div className="rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate">
            <div><strong className="text-navy">Start from:</strong> {sourceLabel}</div>
            <div className="mt-1"><strong className="text-navy">Include:</strong> {destinationLabels.join(", ")}</div>
          </div>

          {cameraError && <p className="mt-3 text-sm text-red-600">{cameraError}</p>}

          {state === "READY" && (
            <button
              type="button"
              onClick={openCamera}
              className="mt-4 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm"
              data-testid="route-assist-open-room-camera"
            >
              Open camera
            </button>
          )}

          {state === "SCANNING" && (
            <button
              type="button"
              onClick={finishScan}
              className="mt-4 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm"
              data-testid="route-assist-finish-room-scan"
            >
              Finish scan
            </button>
          )}

          {state === "COMPLETE" && (
            <div className="mt-4 rounded-xl bg-emerald-50 p-4 text-sm font-medium text-emerald-900">
              Room scan captured. Route Assist can now analyze the observable geometry for review.
            </div>
          )}

          {onBack && state !== "SCANNING" && (
            <button type="button" onClick={onBack} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">
              Back
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
