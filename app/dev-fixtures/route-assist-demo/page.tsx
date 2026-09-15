"use client";

import { useMemo, useState, type MouseEvent } from "react";
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

type Point = { x: number; y: number };
type DemoStep = "SETUP" | "SCANNING" | "REVIEW" | "CONFIRM" | "DONE";

const DOORWAY_TURN: Point = { x: 0.52, y: 0.58 };

const DEMO_PROVIDER: RouteAssistScanProviderV1 = {
  providerKey: "demo.world-geometry.v1",
  async analyze() {
    await new Promise((resolve) => setTimeout(resolve, 650));
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

function StepDot({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <div
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
          done ? "bg-emerald-600 text-white" : active ? "bg-electric text-white" : "bg-slate-200 text-slate-500"
        }`}
      >
        {done ? "✓" : ""}
      </div>
      <span className={`truncate text-xs font-medium ${active ? "text-navy" : "text-slate-500"}`}>{label}</span>
    </div>
  );
}

function Marker({ point, label, tone }: { point: Point; label: string; tone: "source" | "destination" }) {
  return (
    <div
      className={`pointer-events-none absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white text-sm font-bold text-white shadow-lg ${
        tone === "source" ? "bg-electric" : "bg-emerald-600"
      }`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
    >
      {label}
    </div>
  );
}

function RoomView({
  source,
  destination,
  showRoute,
  interactive,
  onTap,
}: {
  source: Point | null;
  destination: Point | null;
  showRoute: boolean;
  interactive: boolean;
  onTap?: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const routePoints = source && destination
    ? `${source.x * 100},${source.y * 100} ${DOORWAY_TURN.x * 100},${DOORWAY_TURN.y * 100} ${destination.x * 100},${destination.y * 100}`
    : "";

  return (
    <div
      className={`relative aspect-[16/10] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${interactive ? "cursor-crosshair" : ""}`}
      onClick={interactive ? onTap : undefined}
      data-testid="route-assist-demo-room"
    >
      <div className="absolute inset-x-0 top-0 h-[68%] bg-gradient-to-b from-white to-slate-100" />
      <div className="absolute inset-x-0 bottom-0 h-[32%] bg-slate-200" />
      <div className="absolute left-[47%] top-[26%] h-[43%] w-[15%] rounded-t-xl border-2 border-slate-400 bg-white/90" />
      <div className="absolute left-[49%] top-[29%] text-[10px] font-medium text-slate-400">doorway</div>

      {source && destination && showRoute && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-electric" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <polyline
            points={routePoints}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx={DOORWAY_TURN.x * 100} cy={DOORWAY_TURN.y * 100} r="2.1" fill="currentColor" />
        </svg>
      )}

      {source && <Marker point={source} label="A" tone="source" />}
      {destination && <Marker point={destination} label="B" tone="destination" />}

      {interactive && !source && (
        <div className="pointer-events-none absolute inset-x-5 bottom-4 rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-navy shadow-sm">
          Tap the existing outlet to place A
        </div>
      )}
      {interactive && source && !destination && (
        <div className="pointer-events-none absolute inset-x-5 bottom-4 rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-navy shadow-sm">
          Now tap where you want the new outlet to place B
        </div>
      )}
    </div>
  );
}

export default function RouteAssistDemoPage() {
  const [step, setStep] = useState<DemoStep>("SETUP");
  const [source, setSource] = useState<Point | null>(null);
  const [destination, setDestination] = useState<Point | null>(null);
  const [prepared, setPrepared] = useState<RouteAssistScanReviewPipelineV1 | null>(null);
  const [draft, setDraft] = useState<RouteAssistResult | null>(null);
  const [confirmed, setConfirmed] = useState<RouteAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const scanInput = useMemo<RouteAssistScanProviderInputV1 | null>(() => {
    if (!source || !destination) return null;
    return {
      version: 1,
      mode: "SURFACE",
      destinationType: "RECEPTACLE",
      captureKind: "ORDINARY_ROOM_SCAN",
      points: [
        { id: "source", x: source.x, y: source.y, imageId: "demo-room", kind: "SOURCE" },
        { id: "doorway-turn", x: DOORWAY_TURN.x, y: DOORWAY_TURN.y, imageId: "demo-room", kind: "WAYPOINT" },
        { id: "destination", x: destination.x, y: destination.y, imageId: "demo-room", kind: "DESTINATION" },
      ],
      segments: [
        { id: "leg-1", fromPointId: "source", toPointId: "doorway-turn" },
        { id: "leg-2", fromPointId: "doorway-turn", toPointId: "destination" },
      ],
      captureArtifacts: { imageIds: ["demo-room"], overlayImageIds: [] },
    };
  }, [source, destination]);

  const mapped = confirmed ? adaptRouteAssistResult(confirmed).mapped : null;

  function handleRoomTap(event: MouseEvent<HTMLDivElement>) {
    if (step !== "SETUP") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0.04, Math.min(0.96, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0.08, Math.min(0.92, (event.clientY - rect.top) / rect.height)),
    };
    if (!source) {
      setSource(point);
      return;
    }
    if (!destination) setDestination(point);
  }

  function resetPoints() {
    setSource(null);
    setDestination(null);
    setPrepared(null);
    setDraft(null);
    setConfirmed(null);
    setError(null);
    setStep("SETUP");
  }

  async function startScan() {
    if (!scanInput) return;
    setError(null);
    setPrepared(null);
    setDraft(null);
    setConfirmed(null);
    setStep("SCANNING");
    const next = await prepareRouteAssistScanReviewV1(DEMO_PROVIDER, scanInput);
    if (!next.review || !next.candidates) {
      setError(next.problems.join("; ") || "We couldn't read this route. Please try again.");
      setStep("SETUP");
      return;
    }
    setPrepared(next);
    setStep("REVIEW");
  }

  function applyReview(selection: RouteAssistScanReviewSelectionV1) {
    if (!prepared?.candidates || !scanInput) return;
    setError(null);
    const accepted = applyRouteAssistScanReviewSelectionV1(
      [...scanInput.points],
      [...scanInput.segments],
      prepared.candidates,
      selection.acceptedReviewItemIds,
      selection.reviewFingerprint,
    );
    if (!accepted.ok) {
      setError(accepted.problems.join("; "));
      return;
    }

    const result = buildRouteAssistResult({
      mode: scanInput.mode,
      destinationType: scanInput.destinationType,
      points: accepted.graph.points,
      segments: accepted.graph.segments,
      drywallAccessAllowed: null,
      captureArtifacts: scanInput.captureArtifacts,
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
    <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-homeowner-demo">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p>
              <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist</h1>
            </div>
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-electric">Demo</span>
          </div>
          <p className="mt-2 text-sm leading-6 text-slate">
            Show us the route for your new outlet. You’ll review what Route Assist observed before anything is used.
          </p>
        </header>

        <div className="mb-6 flex gap-2 rounded-2xl border border-cardline bg-white p-4 shadow-sm">
          <StepDot active={step === "SETUP" || step === "SCANNING"} done={step !== "SETUP" && step !== "SCANNING"} label="Set points" />
          <StepDot active={step === "REVIEW"} done={step === "CONFIRM" || step === "DONE"} label="Review" />
          <StepDot active={step === "CONFIRM"} done={step === "DONE"} label="Confirm" />
        </div>

        {error && (
          <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {(step === "SETUP" || step === "SCANNING") && (
          <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold text-navy">
              {!source ? "Tap your existing outlet" : !destination ? "Tap where you want the new outlet" : "Ready to scan the route"}
            </h2>
            <p className="mt-1 text-sm text-slate">
              Place A first, then B. Route Assist will use the room scan to trace the route between them.
            </p>

            <div className="mt-5">
              <RoomView
                source={source}
                destination={destination}
                showRoute={step === "SCANNING"}
                interactive={step === "SETUP" && !destination}
                onTap={handleRoomTap}
              />
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-xl bg-blue-50 p-3 text-navy"><strong>A</strong><br />{source ? "Existing outlet placed" : "Existing outlet"}</div>
              <div className="rounded-xl bg-emerald-50 p-3 text-emerald-900"><strong>B</strong><br />{destination ? "New outlet placed" : "New outlet location"}</div>
            </div>

            {source && destination && step === "SETUP" && (
              <button type="button" onClick={resetPoints} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">
                Reset A and B
              </button>
            )}

            <button
              type="button"
              onClick={startScan}
              disabled={step === "SCANNING" || !scanInput}
              className="mt-5 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
            >
              {step === "SCANNING" ? "Scanning room…" : "Scan route between A and B"}
            </button>
            <p className="mt-3 text-center text-xs text-slate-light">Demo scan uses simulated calibrated room geometry.</p>
          </section>
        )}

        {step === "REVIEW" && prepared?.review && (
          <div className="space-y-4">
            <section className="rounded-2xl border border-cardline bg-white p-4 shadow-sm">
              <p className="mb-3 text-sm font-semibold text-navy">Route Assist traced this path</p>
              <RoomView source={source} destination={destination} showRoute interactive={false} />
            </section>
            <RouteAssistScanReview review={prepared.review} onApply={applyReview} />
          </div>
        )}

        {step === "CONFIRM" && draft && (
          <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm" data-testid="route-assist-demo-confirm">
            <p className="text-xs font-semibold uppercase tracking-wide text-electric">Route ready</p>
            <h2 className="mt-1 text-xl font-semibold text-navy">Does this route look right?</h2>
            <div className="mt-4">
              <RoomView source={source} destination={destination} showRoute interactive={false} />
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate">Measured route</div>
                <div className="mt-1 text-xl font-bold text-navy">{draft.estimatedTotalRouteLengthFt} ft</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate">Physical turns</div>
                <div className="mt-1 text-xl font-bold text-navy">1</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-6 text-slate">
              You can rescan if anything looks wrong. Nothing is priced from this route until you confirm it.
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={resetPoints} className="rounded-xl border border-cardline px-4 py-3 text-sm font-semibold text-slate">Rescan</button>
              <button type="button" onClick={confirmRoute} className="rounded-xl bg-electric px-4 py-3 text-sm font-semibold text-white">Confirm route</button>
            </div>
          </section>
        )}

        {step === "DONE" && mapped && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm" data-testid="route-assist-demo-done">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">✓</div>
            <h2 className="mt-3 text-xl font-semibold text-emerald-950">Route added</h2>
            <p className="mt-1 text-sm leading-6 text-emerald-900">We’ll use the route you confirmed to continue your quote.</p>
            <div className="mt-4 rounded-xl bg-white p-4 text-sm text-slate">
              <div className="flex justify-between"><span>Measured route</span><strong className="text-navy">{String(mapped.routeLengthFt)} ft</strong></div>
              <div className="mt-2 flex justify-between"><span>Flat turns</span><strong className="text-navy">{String(mapped.flatCorners)}</strong></div>
              <div className="mt-2 flex justify-between"><span>Installation</span><strong className="text-navy">Surface route</strong></div>
            </div>
            <button type="button" onClick={resetPoints} className="mt-4 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-900">
              Try another route
            </button>
            <p className="mt-4 text-xs leading-5 text-emerald-800">Demo only: no pricing, materials, booking, or production data is changed.</p>
          </section>
        )}
      </div>
    </main>
  );
}
