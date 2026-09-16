"use client";

import { useRef, useState } from "react";
import {
  emptyRouteAssistFactStoreV1,
  getRouteAssistFactV1,
  writeRouteAssistFactV1,
  type RouteAssistFactStoreV1,
} from "@/lib/visual-assist/route-assist/factModel";
import { evaluateRouteAssistPhotoEscalationV1, type RouteAssistCaptureEscalationResultV1 } from "@/lib/visual-assist/route-assist/captureEscalation";
import { applyRouteAssistLiveVisibleSceneFactsV1 } from "@/lib/visual-assist/route-assist/livePhotoFactAdapter";
import { routeAssistFeatureInstanceScopeIdV1, ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1 } from "@/lib/visual-assist/route-assist/routeFeatureScope";
import type { RouteAssistVisibleSceneSemanticsV1 } from "@/lib/visual-assist/route-assist/visualSceneSemantics";
import {
  nextRouteAssistPhotoMarkerLabelV1,
  placeRouteAssistPhotoMarkerV1,
  removeRouteAssistPhotoMarkerV1,
  repositionRouteAssistPhotoMarkerV1,
  routeAssistPhotoMarkersToFactWritesV1,
  setRouteAssistPhotoMarkerTypeV1,
  type RouteAssistPhotoMarkerV1,
} from "@/lib/visual-assist/route-assist/photoMarkerState";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";

type Stage = "READY" | "CAMERA_OPEN" | "PLACING_MARKERS" | "CONFIRMED";
const LIVE_PROVIDER_KEY = "price2book.route-assist.photo-first-preview.v1";

type MarkerTypeChoice = { value: RouteAssistDestinationType; label: string };
const MARKER_TYPE_CHOICES: MarkerTypeChoice[] = [
  { value: "RECEPTACLE", label: "Outlet" },
  { value: "SWITCH", label: "Switch" },
  { value: "WALL_LIGHT", label: "Light / fixture" },
];
const DEFAULT_MARKER_TYPE: RouteAssistDestinationType = "RECEPTACLE";

type RouteAssistPhotoV1 = { imageId: string; dataUrl: string; width: number; height: number };

export type RouteAssistPhotoFirstOutcomeV1 = {
  store: RouteAssistFactStoreV1;
  markers: RouteAssistPhotoMarkerV1[];
  /** One result per source->destination leg, keyed by the destination's label ("B", "C", ...). */
  legEscalations: Record<string, RouteAssistCaptureEscalationResultV1>;
};

type Props = {
  onComplete: (outcome: RouteAssistPhotoFirstOutcomeV1) => void;
  onEscalateToSweep: () => void;
  onBack?: () => void;
};

function normalizedPoint(event: React.PointerEvent<HTMLElement>): { x: number; y: number } {
  const rect = event.currentTarget.getBoundingClientRect();
  const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
  const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
  return { x, y };
}

/** `legId` for the leg from the source to this destination label -- the scope escalation-relevant facts (WALL_PLANE, DOORWAY_*, ...) are written under. */
function legScopeId(destinationLabel: string): string {
  return `leg-A-${destinationLabel}`;
}

export default function RouteAssistPhotoCapture({ onComplete, onEscalateToSweep, onBack }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [stage, setStage] = useState<Stage>("READY");
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<RouteAssistPhotoV1 | null>(null);
  const [markers, setMarkers] = useState<RouteAssistPhotoMarkerV1[]>([]);
  const [pendingMarkerType, setPendingMarkerType] = useState<RouteAssistDestinationType>(DEFAULT_MARKER_TYPE);
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<RouteAssistPhotoFirstOutcomeV1 | null>(null);
  const [interpreting, setInterpreting] = useState(false);
  const [interpretError, setInterpretError] = useState<string | null>(null);
  const [liveLegLabel, setLiveLegLabel] = useState<string | null>(null);

  async function openCamera() {
    setCameraError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setStage("CAMERA_OPEN");
    } catch {
      setCameraError("We couldn’t open the camera. Check camera permission and try again.");
    }
  }

  async function takePhoto() {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    // A data URL (rather than a blob object URL) so the same captured photo
    // can be both rendered here AND sent inline to the preview-only
    // interpretation endpoint below -- this proof deliberately reuses the
    // existing dev-fixtures inline-image convention rather than adding an
    // R2 upload path for a slice that's explicitly not production-facing.
    const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setPhoto({ imageId: `photo-first-${Date.now()}`, dataUrl, width: canvas.width, height: canvas.height });
    setMarkers([]);
    setStage("PLACING_MARKERS");
  }

  function placeMarker(event: React.PointerEvent<HTMLDivElement>) {
    if (stage !== "PLACING_MARKERS" || !photo) return;
    // Placing a new marker is a distinct gesture from repositioning one --
    // startDrag below stops propagation on its own pointerdown, so a tap
    // that lands on empty photo area is always a fresh placement, never a
    // reposition of whatever marker happens to be selected.
    const point = normalizedPoint(event);
    const next = placeRouteAssistPhotoMarkerV1(markers, { ...point, imageId: photo.imageId }, pendingMarkerType);
    setMarkers(next);
    setSelectedMarkerId(next[next.length - 1].id);
  }

  function startDrag(markerId: string) {
    setSelectedMarkerId(markerId);
    const onMove = (event: PointerEvent) => {
      const container = document.getElementById("route-assist-photo-surface");
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width)));
      const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height)));
      setMarkers((prev) => repositionRouteAssistPhotoMarkerV1(prev, markerId, { x, y }));
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function removeMarker(markerId: string) {
    setMarkers((prev) => removeRouteAssistPhotoMarkerV1(prev, markerId));
    setSelectedMarkerId(null);
  }

  function retagMarker(markerId: string, markerType: RouteAssistDestinationType) {
    setMarkers((prev) => setRouteAssistPhotoMarkerTypeV1(prev, markerId, markerType));
  }

  function confirmAnchors() {
    if (!photo || !markers.some((marker) => marker.role === "SOURCE") || !markers.some((marker) => marker.role === "DESTINATION")) return;

    let store = emptyRouteAssistFactStoreV1();
    for (const write of routeAssistPhotoMarkersToFactWritesV1(markers)) {
      const result = writeRouteAssistFactV1(store, write);
      // Anchors are homeowner-placed into a fresh store on first confirm, so
      // a refusal here would be a defect in this function, not a real
      // conflict -- surfacing it as a thrown error rather than continuing
      // silently on unwritten anchor data.
      if (result.outcome !== "WRITTEN") throw new Error(`unexpected anchor write refusal: ${result.problem}`);
      store = result.store;
    }

    const destinationLabels = markers.filter((marker) => marker.role === "DESTINATION").map((marker) => marker.label);
    const legEscalations: Record<string, RouteAssistCaptureEscalationResultV1> = {};
    for (const label of destinationLabels) {
      legEscalations[label] = evaluateRouteAssistPhotoEscalationV1({
        store,
        legScopeId: legScopeId(label),
        sourceScopeId: "A",
        destinationScopeId: label,
      });
    }

    const built: RouteAssistPhotoFirstOutcomeV1 = { store, markers, legEscalations };
    setOutcome(built);
    setInterpretError(null);
    setStage("CONFIRMED");
    // Deliberately does NOT call onComplete/onEscalateToSweep yet -- with no
    // provider facts written, every leg is TARGETED_PHOTO_REQUIRED/REVIEW_
    // REQUIRED trivially (nothing has been observed), which would be a
    // meaningless "result" to hand upward. The real result for this proof
    // comes only after interpretWithLiveProvider below actually runs the
    // photo through the provider.
  }

  /**
   * Sends the confirmed photo + A/B anchors to the preview-only live
   * interpretation endpoint, applies the returned (server-validated)
   * semantics to the fact store via livePhotoFactAdapter, and re-evaluates
   * escalation for the leg. Only the FIRST destination is interpreted --
   * this proof's demo case is a single A->B leg; multi-destination live
   * interpretation is not implemented here (see the report's Open Issues).
   */
  async function interpretWithLiveProvider() {
    if (!photo || !outcome) return;
    const firstDestination = markers.find((marker) => marker.role === "DESTINATION");
    const source = markers.find((marker) => marker.role === "SOURCE");
    if (!firstDestination || !source) return;

    setInterpreting(true);
    setInterpretError(null);
    setLiveLegLabel(firstDestination.label);
    try {
      const response = await fetch("/api/dev-fixtures/route-assist-photo-first-interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imageId: photo.imageId,
          dataUrl: photo.dataUrl,
          sourceAnchor: { x: source.x, y: source.y },
          destinationAnchor: { x: firstDestination.x, y: firstDestination.y },
          destinationType: firstDestination.markerType,
        }),
      });
      const body = (await response.json().catch(() => null)) as { semantics?: RouteAssistVisibleSceneSemanticsV1; error?: string; problems?: string[] } | null;
      if (!response.ok || !body?.semantics) {
        setInterpretError(body?.error ?? "Route Assist could not interpret this photo.");
        return;
      }

      const leg = legScopeId(firstDestination.label);
      const application = applyRouteAssistLiveVisibleSceneFactsV1({
        store: outcome.store,
        semantics: body.semantics,
        legScopeId: leg,
        sourcePointId: "A",
        destinationPointId: firstDestination.label,
        imageId: photo.imageId,
        sourceAnchor: { x: source.x, y: source.y },
        destinationAnchor: { x: firstDestination.x, y: firstDestination.y },
        providerKey: LIVE_PROVIDER_KEY,
      });
      if (application.problems.length) {
        setInterpretError(application.problems.join("; "));
      }

      const escalation = evaluateRouteAssistPhotoEscalationV1({ store: application.store, legScopeId: leg, sourceScopeId: "A", destinationScopeId: firstDestination.label });
      const nextOutcome: RouteAssistPhotoFirstOutcomeV1 = {
        store: application.store,
        markers,
        legEscalations: { ...outcome.legEscalations, [firstDestination.label]: escalation },
      };
      setOutcome(nextOutcome);

      if (escalation.escalation === "SWEEP_REQUIRED") {
        onEscalateToSweep();
      } else if (escalation.escalation === "PHOTO_SUFFICIENT") {
        onComplete(nextOutcome);
      }
      // TARGETED_PHOTO_REQUIRED/REVIEW_REQUIRED/WORLD_GEOMETRY_REQUIRED: shown
      // in the debug panel below; this proof does not build the targeted-
      // recapture UI those states hand off to.
    } catch (error) {
      setInterpretError(error instanceof Error ? error.message : "Route Assist could not reach the interpretation endpoint.");
    } finally {
      setInterpreting(false);
    }
  }

  function factRowLabel(kind: "BOOLEAN" | "presence", scopeId: string, type: Parameters<typeof getRouteAssistFactV1>[1]): string {
    const fact = outcome ? getRouteAssistFactV1(outcome.store, type, scopeId) : null;
    if (!fact) return "not yet observed";
    if (fact.value.kind === "BOOLEAN") return fact.value.value ? "confirmed" : "not confirmed";
    if (fact.value.kind === "ENUM") return fact.value.value.toLowerCase();
    if (fact.value.kind === "OBJECT_REF") return "confirmed";
    return "recorded";
  }

  const { role: nextRole, label: nextLabel } = nextRouteAssistPhotoMarkerLabelV1(markers);
  const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId) ?? null;

  return (
    <div className="flex flex-col gap-4">
      {stage === "READY" && (
        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4">
          <p className="text-sm text-slate-700">Take one photo of the work area. You’ll tap where the power comes from and where you want it to go.</p>
          {cameraError && <p className="text-sm text-red-600">{cameraError}</p>}
          <button type="button" onClick={openCamera} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-photo-open-camera">
            Open camera
          </button>
          {onBack && (
            <button type="button" onClick={onBack} className="text-sm text-slate-500 underline">
              Back
            </button>
          )}
        </div>
      )}

      {stage === "CAMERA_OPEN" && (
        <div className="flex flex-col gap-3">
          <video ref={videoRef} playsInline muted className="w-full rounded-xl bg-black" />
          <button type="button" onClick={takePhoto} className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white" data-testid="route-assist-photo-take">
            Take photo
          </button>
        </div>
      )}

      {(stage === "PLACING_MARKERS" || stage === "CONFIRMED") && photo && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {MARKER_TYPE_CHOICES.map((choice) => (
              <button
                key={choice.value}
                type="button"
                onClick={() => (selectedMarker ? retagMarker(selectedMarker.id, choice.value) : setPendingMarkerType(choice.value))}
                data-testid={`route-assist-marker-type-${choice.value.toLowerCase()}`}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium ${
                  (selectedMarker ? selectedMarker.markerType : pendingMarkerType) === choice.value
                    ? "border-electric bg-electric/10 text-electric"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                {choice.label}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {stage === "PLACING_MARKERS"
              ? `Tap the photo to place ${nextRole === "SOURCE" ? "the existing source (A)" : `the next desired location (${nextLabel})`}.`
              : "Anchors confirmed."}
          </p>

          <div
            id="route-assist-photo-surface"
            onPointerDown={stage === "PLACING_MARKERS" ? placeMarker : undefined}
            className="relative aspect-[4/3] w-full overflow-hidden rounded-xl bg-black"
            data-testid="route-assist-photo-surface"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.dataUrl} alt="Captured work area" className="pointer-events-none h-full w-full object-cover" />
            {markers.map((marker) => (
              <button
                key={marker.id}
                type="button"
                onPointerDown={(event) => {
                  event.stopPropagation();
                  if (stage === "PLACING_MARKERS") startDrag(marker.id);
                  else setSelectedMarkerId(marker.id);
                }}
                data-testid={`route-assist-marker-${marker.label}`}
                className={`absolute flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${
                  marker.role === "SOURCE" ? "bg-blue-600" : "bg-emerald-600"
                } ${marker.id === selectedMarkerId ? "ring-2 ring-offset-2 ring-blue-300" : ""}`}
                style={{ left: `${marker.x * 100}%`, top: `${marker.y * 100}%` }}
              >
                {marker.label}
              </button>
            ))}
          </div>

          {selectedMarker && stage === "PLACING_MARKERS" && (
            <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <span>
                {selectedMarker.label} — {MARKER_TYPE_CHOICES.find((choice) => choice.value === selectedMarker.markerType)?.label ?? selectedMarker.markerType}
              </span>
              <button type="button" onClick={() => removeMarker(selectedMarker.id)} className="text-red-600" data-testid={`route-assist-marker-remove-${selectedMarker.label}`}>
                Remove
              </button>
            </div>
          )}

          {stage === "PLACING_MARKERS" && (
            <button
              type="button"
              onClick={confirmAnchors}
              disabled={!markers.some((marker) => marker.role === "SOURCE") || !markers.some((marker) => marker.role === "DESTINATION")}
              className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
              data-testid="route-assist-photo-confirm"
            >
              Confirm points
            </button>
          )}

          {stage === "CONFIRMED" && outcome && (
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={interpretWithLiveProvider}
                disabled={interpreting}
                className="rounded-xl bg-electric px-5 py-3 text-sm font-semibold text-white disabled:opacity-40"
                data-testid="route-assist-photo-interpret"
              >
                {interpreting ? "Interpreting…" : "Interpret with Route Assist"}
              </button>
              {interpretError && <p className="text-sm text-red-600" data-testid="route-assist-photo-interpret-error">{interpretError}</p>}

              {/* Preview-only debug panel -- not the final homeowner UX. Shows exactly what the fact ledger currently holds for the leg being interpreted. */}
              {liveLegLabel && (
                <ul className="flex flex-col gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700" data-testid="route-assist-photo-debug-panel">
                  <li>Source A: {getRouteAssistFactV1(outcome.store, "SOURCE_ANCHOR", "A")?.state === "LOCKED" ? "locked" : "not placed"}</li>
                  <li>
                    Destination {liveLegLabel}: {getRouteAssistFactV1(outcome.store, "DESTINATION_ANCHOR", liveLegLabel)?.state === "LOCKED" ? "locked" : "not placed"}
                  </li>
                  <li>Wall plane: {factRowLabel("BOOLEAN", legScopeId(liveLegLabel), "WALL_PLANE")}</li>
                  <li>Doorway: {factRowLabel("presence", routeAssistFeatureInstanceScopeIdV1("doorway", legScopeId(liveLegLabel), ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1), "DOORWAY_PRESENCE")}</li>
                  <li>Left casing: {factRowLabel("presence", routeAssistFeatureInstanceScopeIdV1("doorway", legScopeId(liveLegLabel), ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1), "DOORWAY_LEFT_CASING")}</li>
                  <li>Top casing: {factRowLabel("presence", routeAssistFeatureInstanceScopeIdV1("doorway", legScopeId(liveLegLabel), ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1), "DOORWAY_TOP_CASING")}</li>
                  <li>Right casing: {factRowLabel("presence", routeAssistFeatureInstanceScopeIdV1("doorway", legScopeId(liveLegLabel), ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1), "DOORWAY_RIGHT_CASING")}</li>
                  <li>Entry side: {factRowLabel("presence", routeAssistFeatureInstanceScopeIdV1("doorway", legScopeId(liveLegLabel), ROUTE_ASSIST_PRIMARY_FEATURE_INSTANCE_V1), "DOORWAY_ENTRY_SIDE")}</li>
                  <li>Baseboard continuity: {factRowLabel("BOOLEAN", legScopeId(liveLegLabel), "BASEBOARD_CONTINUITY")}</li>
                  <li className="mt-1 font-semibold">Result: {outcome.legEscalations[liveLegLabel]?.escalation ?? "REVIEW_REQUIRED"}</li>
                </ul>
              )}

              <ul className="flex flex-col gap-1 text-sm text-slate-600" data-testid="route-assist-photo-escalation-summary">
                {Object.entries(outcome.legEscalations).map(([label, result]) => (
                  <li key={label}>
                    A → {label}: {result.escalation}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
