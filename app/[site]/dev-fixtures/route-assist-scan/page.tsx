"use client";

import { useState } from "react";
import RouteAssistScanReview, {
  type RouteAssistScanReviewSelectionV1,
} from "@/components/route-assist/RouteAssistScanReview";
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

export default function RouteAssistScanPreviewPage() {
  const [prepared, setPrepared] = useState<RouteAssistScanReviewPipelineV1 | null>(null);
  const [acceptedGraph, setAcceptedGraph] = useState<AcceptedRouteAssistScanGraphV1 | null>(null);
  const [draftResult, setDraftResult] = useState<RouteAssistResult | null>(null);
  const [confirmedResult, setConfirmedResult] = useState<RouteAssistResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  async function runScan() {
    setRunning(true);
    setError(null);
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

  function applySelectedFacts(selection: RouteAssistScanReviewSelectionV1) {
    if (!prepared?.candidates) return;
    setError(null);
    const applied = applyRouteAssistScanReviewSelectionV1(
      [...POINTS],
      [...SEGMENTS],
      prepared.candidates,
      selection.acceptedReviewItemIds,
      selection.reviewFingerprint,
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
          <RouteAssistScanReview review={prepared.review} onApply={applySelectedFacts} />
        )}

        {acceptedGraph && draftResult && (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-900">Accepted Route Assist graph</h2>
            <p className="mt-1 text-sm text-slate-500">
              The graph is still unconfirmed. Route Assist preserves the accepted physical measurement exactly; later pricing/binding policy may apply its own precision rules.
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
