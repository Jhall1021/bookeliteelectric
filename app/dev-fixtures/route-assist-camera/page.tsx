"use client";

import { useState } from "react";
import RouteAssistRoomScanCamera from "@/components/route-assist/RouteAssistRoomScanCamera";

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
  const [scanFinished, setScanFinished] = useState(false);

  function chooseKind(next: DemoKind) {
    setKind(next);
    setScanFinished(false);
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
          onScanComplete={() => setScanFinished(true)}
        />

        {scanFinished && (
          <div className="mt-4 rounded-2xl border border-cardline bg-white p-4 text-sm leading-6 text-slate shadow-sm" data-testid="route-assist-camera-next-step">
            <strong className="text-navy">Next:</strong> the calibrated scan provider converts observable geometry into Route Assist evidence, then the homeowner reviews the routed path before anything is accepted.
          </div>
        )}

        <p className="mt-4 text-center text-xs leading-5 text-slate-light">
          Demo only: this camera shell does not yet submit scan frames or geometry to a provider.
        </p>
      </div>
    </main>
  );
}
