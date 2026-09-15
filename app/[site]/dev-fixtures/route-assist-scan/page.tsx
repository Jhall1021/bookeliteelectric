"use client";

import { useState } from "react";
import {
  applyConfirmation,
  applyRouteAssistScanReviewSelectionV1,
  buildRouteAssistResult,
  prepareRouteAssistScanReviewV1,
  type AcceptedRouteAssistScanGraphV1,
  type RouteAssistResult,
  type RouteAssistScanProviderInputV1,
  type RouteAssistScanProviderV1,
  type RouteAssistScanReviewPipelineV1,
} from "@/lib/visual-assist/route-assist";
import { adaptRouteAssistResult } from "@/lib/electrical/routeAssistAdapter";

/**
 * Development-only Room Scan V1 preview.
 *
 * No real provider, persistence, pricing, MaterialTakeoff or production Route
 * Assist flow is touched here. The fake provider stands in for calibrated world
 * geometry so a human can exercise the exact authority chain:
 *
 * scan -> evidence -> candidates -> review -> explicit selection -> copied
 * Route Assist graph -> normal result confirmation -> normal Routing V2 adapter
 */

const POINTS: RouteAssistScanProviderInputV1["points"] = [
  { id: "a", x: 0.12, y: 0.55, imageId: "room-scan-preview", kind: "SOURCE" },
  { id: "turn-1", x: 0.52, y: 0.55, imageId: "room-scan-preview", kind: "WAYPOINT" },
  { id: "b", x: 0.86, y: 0.32, imageId: "room-scan-preview", kind: "DESTINATION" },
];

const SEGMENTS: RouteAssistScanProviderInputV1["segments"] = [
  { id: "leg-1", fromPointId: "a", toPointId: "turn-1" },
  { id: "leg-2", fromPointId: "turn-1", toPointId: "b" },
];

const INPUT: RouteAssistScanProviderInputV1 = {
  version: 1,
  mode: "SURFACE",
  destinationType: "RECEPTACLE",
  captureKind: "ORDINARY_ROOM_SCAN",
  points: POINTS,
  segments: SEGMENTS,
  captureArtifacts: { imageIds: ["room-scan-preview"], overlayImageIds: [] },
};

const FAKE_WORLD_PROVIDER: RouteAssistScanProviderV1 = {
  providerKey: "dev.world-geometry.v1",
  async analyze() {
    return {
      version: 1,
      sourcePointId: "a",
      destinationPointId: "b",
      segments: [
        {
          segmentId: "leg-1",
          measuredLengthFt: {
            value: 5.125,
            confidence: 0.61,
            visibility: "CLEAR",
            basis: "WORLD_GEOMETRY",
          },
          surface: {
            value: "WALL",
            confidence: 0.74,
            visibility: "CLEAR",
            basis: "VISIBLE_SCENE",
          },
        },
        {
          segmentId: "leg-2",
          measuredLengthFt: {
            value: 9.5,
            confidence: 0.58,
            visibility: "CLEAR",
            basis: "WORLD_GEOMETRY",
          },
          surface: {
            value: "WALL",
            confidence: 0.72,
            visibility: "CLEAR",
            basis: "VISIBLE_SCENE",
          },
        },
      ],
      transitions: [
        {
          pointId: "turn-1",
          physicalTurn: {
            value: "FLAT",
            confidence: 0.66,
            visibility: "CLEAR",
            basis: "WORLD_GEOMETRY",
          },
        },
      ],
    };
  },
};

function itemLabel(kind: string, routeId: string, value: unknown): string {
  switch (kind) {
    case "MEASURED_LENGTH":
      return `${routeId}: ${String(value)} ft measured route`;
    case "SURFACE":
      return `${routeId}: ${String(value).toLowerCase()} surface`;
    case "PHYSICAL_TURN":
      return `${routeId}: ${String(value).toLowerCase()} physical turn`;
    case "OBSTACLE":
      return `${routeId}: ${String(value).toLowerCase()} obstacle`;
    default:
      return `${routeId}: ${String(value)}`;
  }
}

export default function RouteAssistScanPreviewPage() {
  const [prepared, setPrepared] = useState<RouteAssistScanReviewPipelineV1 | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [acceptedGraph, setAcceptedGraph] = useState<AcceptedRouteAssistScanGraphV1 | null>(null);
  const [draftResult, setDraftResult] = useState<RouteAssistResult | null>(null);
  const [confirmedResult, setConfirmedResult] = useState<RouteAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runScan() {
    setRunning(true);
    setError(null);
    setSelected([]);
    setAcceptedGraph(null);
    setDraftResult(null);
    setConfirmedResult(null);
    const next = await prepareRouteAssistScanReviewV1(FAKE_WORLD_PROVIDER, INPUT);
    setPrepared(next);
    if (!next.review || !next.candidates) {
      setError(next.problems.join("; ") || "The fake scan did not produce a review.");
    }
    setRunning(false);
  }

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  function applySelectedFacts() {
    if (!prepared?.candidates || !prepared.review) return;
    setError(null);
    const applied = applyRouteAssistScanReviewSelectionV1(
      [...POINTS],
      [...SEGMENTS],
      prepared.candidates,
      selected,
      prepared.review.fingerprint,
    );
    if (!applied.ok) {
      setError(applied.problems.join("; "));
      return;
    }

    setAcceptedGraph(applied.graph);
    setConfirmedResult(null);
    const result = buildRouteAssistResult({
      mode: "SURFACE",
      destinationType: "RECEPTACLE",
      points: applied.graph.points,
      segments: applied.graph.segments,
      drywallAccessAllowed: null,
      captureArtifacts: { imageIds: ["room-scan-preview"], overlayImageIds: [] },
      customerNotes: null,
    });
    if ("reason" in result) {
      setDraftResult(null);
      setError(result.recoveryPrompt);
      return;
    }
    setDraftResult(result);
  }

  function confirmRoute() {
    if (!draftResult) return;
    setConfirmedResult(applyConfirmation(draftResult, "ACCEPTED"));
  }

  const mapped = confirmedResult ? adaptRouteAssistResult(confirmedResult).mapped : null;

  return (
    <main className="min-h-screen bg-slate-100 px-5 py-10" data-testid="route-assist-scan-preview">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Development fixture</p>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">Route Assist — Room Scan V1 Preview</h1>
          <p className="mt-2 text-sm text-slate-600">
            Fake calibrated world geometry. Nothing below changes pricing, materials, or production data.
          </p>
          <button
            type="button"
            onClick={runScan}
            disabled={running}
            className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
          >
            {running ? "Scanning…" : "Run fake room scan"}
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
        )}

        {prepared?.review && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Review what the scan observed</h2>
                <p className="mt-1 text-sm text-slate-500">Nothing is selected automatically.</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-3 py-2 text-right">
                <div className="text-xs text-slate-500">Complete measured route</div>
                <div className="font-semibold text-slate-900">
                  {prepared.review.completeMeasuredRouteLengthFt ?? "—"} ft
                </div>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              {prepared.review.items.map((item) => (
                <label
                  key={item.id}
                  className={`flex items-start gap-3 rounded-xl border p-4 ${
                    item.canApplyToRouteGraph ? "border-slate-200" : "border-amber-200 bg-amber-50"
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    checked={selected.includes(item.id)}
                    disabled={!item.canApplyToRouteGraph}
                    onChange={() => toggle(item.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-slate-900">
                      {itemLabel(item.kind, item.routeId, item.value)}
                    </span>
                    <span className="mt-1 block text-xs text-slate-500">
                      Evidence: {item.basis} · provider confidence {Math.round(item.confidence * 100)}%
                    </span>
                    {!item.canApplyToRouteGraph && (
                      <span className="mt-1 block text-xs font-medium text-amber-700">
                        Visible evidence only — no Route Assist V1 graph mapping.
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </div>

            <button
              type="button"
              onClick={applySelectedFacts}
              className="mt-5 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
            >
              Apply selected facts to preview route
            </button>
          </section>
        )}

        {acceptedGraph && draftResult && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Accepted Route Assist graph</h2>
            <p className="mt-1 text-sm text-slate-500">
              The graph is still unconfirmed. Route Assist now preserves the accepted physical measurement exactly; later pricing/binding policy may apply its own precision rules.
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">Scan review total</div>
                <div className="mt-1 text-lg font-semibold">{prepared?.review?.completeMeasuredRouteLengthFt ?? "—"} ft</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-4">
                <div className="text-xs text-slate-500">RouteAssistResult total</div>
                <div className="mt-1 text-lg font-semibold">{draftResult.estimatedTotalRouteLengthFt ?? "—"} ft</div>
              </div>
            </div>
            <pre className="mt-4 max-h-72 overflow-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
              {JSON.stringify(acceptedGraph, null, 2)}
            </pre>
            <button
              type="button"
              onClick={confirmRoute}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white"
            >
              Confirm this preview route
            </button>
          </section>
        )}

        {confirmedResult && mapped && (
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-emerald-950">Canonical Routing V2 observations</h2>
            <p className="mt-1 text-sm text-emerald-800">
              Read-only preview of what the existing electrical adapter receives after confirmation.
            </p>
            <pre data-testid="routing-v2-observations" className="mt-4 overflow-auto rounded-xl bg-white p-4 text-xs text-slate-900">
              {JSON.stringify(mapped, null, 2)}
            </pre>
          </section>
        )}
      </div>
    </main>
  );
}
