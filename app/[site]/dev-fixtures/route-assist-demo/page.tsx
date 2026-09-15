"use client";

import { useState } from "react";
import RouteAssistScanReview, {
  type RouteAssistScanReviewSelectionV1,
} from "@/components/route-assist/RouteAssistScanReview";
import { adaptRouteAssistResult } from "@/lib/electrical/routeAssistAdapter";
import {
  applyConfirmation,
  applyRouteAssistScanReviewSelectionV1,
  buildRouteAssistResult,
  prepareRouteAssistScanReviewV1,
  type RouteAssistResult,
  type RouteAssistScanProviderInputV1,
  type RouteAssistScanProviderV1,
  type RouteAssistScanReviewPipelineV1,
} from "@/lib/visual-assist/route-assist";

const INPUT: RouteAssistScanProviderInputV1 = {
  version: 1,
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  captureKind: "ORDINARY_ROOM_SCAN",
  points: [
    { id: "source", x: 0.12, y: 0.58, imageId: "demo-room", kind: "SOURCE" },
    { id: "doorway-turn", x: 0.52, y: 0.58, imageId: "demo-room", kind: "WAYPOINT" },
    { id: "destination", x: 0.86, y: 0.3, imageId: "demo-room", kind: "DESTINATION" },
  ],
  segments: [
    { id: "leg-1", fromPointId: "source", toPointId: "doorway-turn" },
    { id: "leg-2", fromPointId: "doorway-turn", toPointId: "destination" },
  ],
  captureArtifacts: { imageIds: ["demo-room"], overlayImageIds: [] },
};

const DEMO_PROVIDER: RouteAssistScanProviderV1 = {
  providerKey: "demo.world-geometry.v1",
  async analyze() {
    await new Promise((resolve) => setTimeout(resolve, 550));
    return {
      version: 1,
      sourcePointId: "source",
      destinationPointId: "destination",
      segments: [
        {
          segmentId: "leg-1",
          measuredLengthFt: {
            value: 5.125,
            confidence: 0.92,
            visibility: "CLEAR",
            basis: "WORLD_GEOMETRY",
          },
          surface: {
            value: "WALL",
            confidence: 0.94,
            visibility: "CLEAR",
            basis: "VISIBLE_SCENE",
          },
        },
        {
          segmentId: "leg-2",
          measuredLengthFt: {
            value: 9.5,
            confidence: 0.9,
            visibility: "CLEAR",
            basis: "WORLD_GEOMETRY",
          },
          surface: {
            value: "WALL",
            confidence: 0.93,
            visibility: "CLEAR",
            basis: "VISIBLE_SCENE",
          },
        },
      ],
      transitions: [
        {
          pointId: "doorway-turn",
          physicalTurn: {
            value: "FLAT",
            confidence: 0.89,
            visibility: "CLEAR",
            basis: "WORLD_GEOMETRY",
          },
          obstacleContext: {
            value: "DOORWAY",
            confidence: 0.96,
            visibility: "CLEAR",
            basis: "VISIBLE_SCENE",
          },
        },
      ],
    };
  },
};

type DemoStep = "SETUP" | "SCANNING" | "REVIEW" | "CONFIRM" | "DONE";

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-600 text-white" : active ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? "✓" : ""}
      </div>
      <span className={`truncate text-xs font-medium ${active ? "text-slate-900" : "text-slate-500"}`}>{label}</span>
    </div>
  );
}

export default function RouteAssistDemoPage() {
  const [step, setStep] = useState<DemoStep>("SETUP");
  const [prepared, setPrepared] = useState<RouteAssistScanReviewPipelineV1 | null>(null);
  const [draft, setDraft] = useState<RouteAssistResult | null>(null);
  const [confirmed, setConfirmed] = useState<RouteAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mapped = confirmed ? adaptRouteAssistResult(confirmed).mapped : null;

  async function startScan() {
    setError(null);
    setPrepared(null);
    setDraft(null);
    setConfirmed(null);
    setStep("SCANNING");
    const next = await prepareRouteAssistScanReviewV1(DEMO_PROVIDER, INPUT);
    if (!next.review || !next.candidates) {
      setError(next.problems.join("; ") || "We couldn't read this route. Please try again.");
      setStep("SETUP");
      return;
    }
    setPrepared(next);
    setStep("REVIEW");
  }

  function applyReview(selection: RouteAssistScanReviewSelectionV1) {
    if (!prepared?.candidates) return;
    setError(null);
    const accepted = applyRouteAssistScanReviewSelectionV1(
      [...INPUT.points],
      [...INPUT.segments],
      prepared.candidates,
      selection.acceptedReviewItemIds,
      selection.reviewFingerprint,
    );
    if (!accepted.ok) {
      setError(accepted.problems.join("; "));
      return;
    }

    const result = buildRouteAssistResult({
      mode: INPUT.mode,
      destinationType: INPUT.destinationType,
      points: accepted.graph.points,
      segments: accepted.graph.segments,
      drywallAccessAllowed: null,
      captureArtifacts: INPUT.captureArtifacts,
      customerNotes: null,
    });
    if ("reason" in result) {
      setError(result.recoveryPrompt);
      return;
    }
    setDraft(result);
    setStep("CONFIRM");
  }

  function confirmRoute() {
    if (!draft) return;
    setConfirmed(applyConfirmation(draft, "ACCEPTED"));
    setStep("DONE");
  }

  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-6" data-testid="route-assist-homeowner-demo">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-700">Price2Book</p>
              <h1 className="mt-1 text-2xl font-bold text-[#0F1E3C]">Route Assist</h1>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Demo</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Help us measure the route for your new outlet. You'll review everything before it's used.
          </p>
        </header>

        <div className="mb-6 flex gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <StepDot active={step === "SETUP" || step === "SCANNING"} done={step !== "SETUP" && step !== "SCANNING"} label="Set points" />
          <StepDot active={step === "REVIEW"} done={step === "CONFIRM" || step === "DONE"} label="Review" />
          <StepDot active={step === "CONFIRM"} done={step === "DONE"} label="Confirm" />
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {(step === "SETUP" || step === "SCANNING") && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Where should the new outlet go?</h2>
            <p className="mt-1 text-sm text-slate-500">For this demo, the two points are already placed.</p>

            <div className="relative mt-5 overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 p-4">
              <div className="h-44 rounded-xl border border-slate-300 bg-gradient-to-b from-slate-50 to-slate-200">
                <div className="absolute left-[16%] top-[58%] flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-blue-600 text-sm font-bold text-white shadow-lg">A</div>
                <div className="absolute right-[14%] top-[30%] flex h-9 w-9 items-center justify-center rounded-full border-4 border-white bg-emerald-600 text-sm font-bold text-white shadow-lg">B</div>
                <div className="absolute left-[31%] top-[50%] h-16 w-14 rounded-t-lg border-2 border-slate-400 bg-white/80" />
              </div>
              <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                <div className="rounded-xl bg-blue-50 p-3 text-blue-900"><strong>A</strong><br />Existing outlet</div>
                <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900"><strong>B</strong><br />New outlet location</div>
              </div>
            </div>

            <button
              type="button"
              onClick={startScan}
              disabled={step === "SCANNING"}
              className="mt-5 w-full rounded-xl bg-[#2452D9] px-5 py-3.5 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {step === "SCANNING" ? "Scanning room…" : "Scan route between A and B"}
            </button>
            <p className="mt-3 text-center text-xs text-slate-400">Demo scan uses simulated calibrated room geometry.</p>
          </section>
        )}

        {step === "REVIEW" && prepared?.review && (
          <RouteAssistScanReview review={prepared.review} onApply={applyReview} />
        )}

        {step === "CONFIRM" && draft && (
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" data-testid="route-assist-demo-confirm">
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">Route ready</p>
            <h2 className="mt-1 text-xl font-semibold text-slate-900">Does this route look right?</h2>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Measured route</div>
                <div className="mt-1 text-xl font-bold text-slate-900">{draft.estimatedTotalRouteLengthFt} ft</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Physical turns</div>
                <div className="mt-1 text-xl font-bold text-slate-900">1</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate-600">
              You can go back and rescan if anything looks wrong. Nothing is priced from this route until you confirm it.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setStep("SETUP")} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-700">Rescan</button>
              <button type="button" onClick={confirmRoute} className="rounded-xl bg-[#2452D9] px-4 py-3 text-sm font-semibold text-white">Confirm route</button>
            </div>
          </section>
        )}

        {step === "DONE" && mapped && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm" data-testid="route-assist-demo-done">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">✓</div>
            <h2 className="mt-3 text-xl font-semibold text-emerald-950">Route added</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900">We'll use the route you confirmed to continue your quote.</p>
            <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-700">
              <div className="flex justify-between"><span>Measured route</span><strong>{String(mapped.routeLengthFt)} ft</strong></div>
              <div className="mt-2 flex justify-between"><span>Flat turns</span><strong>{String(mapped.flatCorners)}</strong></div>
              <div className="mt-2 flex justify-between"><span>Installation</span><strong>Surface route</strong></div>
            </div>
            <p className="mt-4 text-xs leading-5 text-emerald-800">Demo only: no pricing, materials, booking, or production data is changed.</p>
          </section>
        )}
      </div>
    </main>
  );
}
