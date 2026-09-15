"use client";

import { useState } from "react";
import RouteAssistRoomScanCamera, {
  type RouteAssistRoomScanCaptureV1,
} from "@/components/route-assist/RouteAssistRoomScanCamera";

type DemoKind = "OUTLET" | "SWITCH" | "LIGHT_FIXTURE";

const LABELS: Record<DemoKind, string> = {
  OUTLET: "Outlet",
  SWITCH: "Switch",
  LIGHT_FIXTURE: "Light fixture",
};

function sourceLabel(kind: DemoKind): string {
  return kind === "LIGHT_FIXTURE" ? "Controlling switch" : "Existing outlet";
}

function destinationLabels(kind: DemoKind): string[] {
  if (kind === "SWITCH") return ["New switch location"];
  if (kind === "LIGHT_FIXTURE") return ["New light fixture location"];
  return ["New outlet 1", "New outlet 2"];
}

export default function RouteAssistCameraDemoPage() {
  const [kind, setKind] = useState<DemoKind>("OUTLET");
  const [capture, setCapture] = useState<RouteAssistRoomScanCaptureV1 | null>(null);

  function chooseKind(next: DemoKind) {
    setKind(next);
    setCapture(null);
  }

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-camera-demo">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist camera preview</h1>
          <p className="mt-2 text-sm leading-6 text-slate">
            This is the phone capture step we’ll use after the homeowner has already selected the source and new location(s).
          </p>
        </header>

        <div className="mb-4 grid grid-cols-3 gap-2" data-testid="route-assist-camera-kind">
          {(Object.keys(LABELS) as DemoKind[]).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => chooseKind(option)}
              className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${kind === option ? "border-electric bg-blue-50 text-electric" : "border-cardline bg-white text-slate"}`}
            >
              {LABELS[option]}
            </button>
          ))}
        </div>

        <RouteAssistRoomScanCamera
          key={kind}
          sourceLabel={sourceLabel(kind)}
          destinationLabels={destinationLabels(kind)}
          onScanComplete={setCapture}
        />

        {capture && (
          <div className="mt-4 rounded-2xl border border-cardline bg-white p-4 text-sm leading-6 text-slate shadow-sm" data-testid="route-assist-camera-next-step">
            <strong className="text-navy">Capture handoff ready.</strong>
            <div className="mt-2">
              Ordinary room scan · {capture.camera.width ?? "?"} × {capture.camera.height ?? "?"} camera frame
            </div>
            <div className="mt-2 text-xs leading-5 text-slate-light">
              This receipt carries capture context only. A calibrated scan provider must still produce observable geometry evidence, which remains review-only until explicitly accepted.
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-xs leading-5 text-slate-light">
          Preview checkpoint: the camera now returns a typed capture receipt. It does not infer geometry, hidden wiring, materials, labor, or price.
        </p>
      </div>
    </main>
  );
}
