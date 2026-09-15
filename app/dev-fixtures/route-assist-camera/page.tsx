"use client";

import { useState } from "react";
import RouteAssistRoomScanCamera, {
  type RouteAssistRoomScanCaptureV1,
} from "@/components/route-assist/RouteAssistRoomScanCamera";

type DemoKind = "OUTLET" | "SWITCH" | "LIGHT_FIXTURE";
type RouteReviewState = "PENDING" | "ACCEPTED" | "ADJUST";

const LABELS: Record<DemoKind, string> = {
  OUTLET: "Outlet",
  SWITCH: "Switch",
  LIGHT_FIXTURE: "Light fixture",
};

function sourceLabel(): string {
  return "Existing outlet";
}

function destinationLabels(kind: DemoKind): string[] {
  if (kind === "SWITCH") return ["New switch location"];
  if (kind === "LIGHT_FIXTURE") return ["New switch location", "New light fixture location"];
  return ["New outlet location"];
}

function proposedRoute(kind: DemoKind): string[] {
  const route = [
    "Convert the selected existing outlet to the Wiremold starting box",
    "Run straight down to just above the baseboard",
    "Follow the baseboard/trim toward the new location",
    "If a doorway blocks the path, follow the side casing up, across the top casing, and down the opposite side",
  ];

  if (kind === "OUTLET") {
    route.push("Run vertically from the baseboard to the new surface outlet box");
  } else if (kind === "SWITCH") {
    route.push("Run vertically from the baseboard to the new surface switch box");
  } else {
    route.push("Run vertically from the baseboard to the new surface switch box");
    route.push("Continue the surface raceway from the switch to the new surface light-fixture box");
  }

  return route;
}

export default function RouteAssistCameraDemoPage() {
  const [kind, setKind] = useState<DemoKind>("OUTLET");
  const [capture, setCapture] = useState<RouteAssistRoomScanCaptureV1 | null>(null);
  const [reviewState, setReviewState] = useState<RouteReviewState>("PENDING");

  function chooseKind(next: DemoKind) {
    setKind(next);
    setCapture(null);
    setReviewState("PENDING");
  }

  function handleCapture(next: RouteAssistRoomScanCaptureV1) {
    setCapture(next);
    setReviewState("PENDING");
  }

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-camera-demo">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist camera preview</h1>
          <p className="mt-2 text-sm leading-6 text-slate">
            This fixture previews the phone capture and homeowner review checkpoints without changing pricing, materials, or production guided flows.
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
          sourceLabel={sourceLabel()}
          destinationLabels={destinationLabels(kind)}
          onScanComplete={handleCapture}
        />

        {capture && (
          <section className="mt-4 overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm" data-testid="route-assist-wiremold-review">
            <div className="border-b border-cardline p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">Proposed Wiremold route</p>
              <h2 className="mt-1 text-lg font-bold text-navy">Does this route look right?</h2>
              <p className="mt-2 text-sm leading-6 text-slate">
                Route Assist will prefer the trim-hugging path rather than a shorter run across the open wall.
              </p>
            </div>

            <div className="p-4">
              <div className="rounded-xl bg-blue-50 p-3 text-sm text-navy">
                <strong>Starting from this existing outlet</strong>
                <div className="mt-1 text-xs leading-5 text-slate">This outlet becomes the Wiremold starting box.</div>
              </div>

              <ol className="mt-4 space-y-3" data-testid="route-assist-proposed-route-steps">
                {proposedRoute(kind).map((step, index) => (
                  <li key={step} className="flex gap-3 text-sm leading-5 text-slate">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{index + 1}</span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>

              <div className="mt-4 rounded-xl border border-cardline bg-slate-50 p-3 text-xs leading-5 text-slate">
                <strong className="text-navy">Distance:</strong> waiting for geometry analysis and measurement provenance. An ordinary browser camera does not create a measured route by itself.
              </div>

              {reviewState === "PENDING" && (
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setReviewState("ADJUST")}
                    className="rounded-xl border border-cardline bg-white px-3 py-3 text-sm font-semibold text-navy"
                    data-testid="route-assist-adjust-route"
                  >
                    Adjust route
                  </button>
                  <button
                    type="button"
                    onClick={() => setReviewState("ACCEPTED")}
                    className="rounded-xl bg-electric px-3 py-3 text-sm font-semibold text-white"
                    data-testid="route-assist-looks-good"
                  >
                    Looks good
                  </button>
                </div>
              )}

              {reviewState === "ACCEPTED" && (
                <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900" data-testid="route-assist-route-reviewed">
                  Route reviewed. This fixture records the homeowner checkpoint only; it does not bind pricing or material quantities.
                </div>
              )}

              {reviewState === "ADJUST" && (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-950" data-testid="route-assist-route-adjustment">
                  Route adjustment requested. The proposed geometry must be corrected and shown again before it can be accepted.
                  <button type="button" onClick={() => setReviewState("PENDING")} className="mt-2 block text-xs font-semibold underline underline-offset-4">
                    Return to review
                  </button>
                </div>
              )}
            </div>
          </section>
        )}

        <p className="mt-4 text-center text-xs leading-5 text-slate-light">
          Preview checkpoint only: no hidden wiring inference, materials, labor, price, onboarding, or decision-tree behavior is changed here.
        </p>
      </div>
    </main>
  );
}
