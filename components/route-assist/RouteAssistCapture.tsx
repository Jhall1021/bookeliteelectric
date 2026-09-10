"use client";

import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import {
  applyConfirmation,
  buildRouteAssistResult,
  decisionRecord,
  homeownerSummaryLines,
  isRouteAssistIncomplete,
} from "@/lib/visual-assist/route-assist";
import type { RouteAssistResult, RoutePoint, RouteSegment } from "@/lib/visual-assist/route-assist/types";
import type {
  RouteAssistDestinationType,
  RouteAssistMode,
  RouteSurface,
} from "@/lib/visual-assist/route-assist/taxonomy";

/**
 * §9–§12 of the Route Assist brief, Phase 1 (no CV): photo, mark A, mark B,
 * add/adjust waypoints, tag each leg, confirm. Deliberately takes
 * `onUploadPhoto` as a prop rather than importing an upload helper — see
 * docs/design/route-assist-v1.md §1.4/§4 for why (no live private-bucket
 * storage yet; the caller decides which upload path is current).
 *
 * `destinationType` is decided by the calling service, not by this
 * component — Route Assist "should know what it is being asked to capture,
 * but should not own service semantics" (brief §4).
 */
type Props = {
  destinationType: RouteAssistDestinationType;
  /** e.g. "Tap the existing receptacle we'd start from." (brief §9 step 2) */
  sourceHint: string;
  /** e.g. "Tap where you'd like the new ceiling light." (brief §9 step 3) */
  destinationHint: string;
  onUploadPhoto: (file: File) => Promise<string>;
  onComplete: (result: RouteAssistResult) => void;
  onCancel?: () => void;
};

type Step = "MODE" | "DRYWALL" | "PHOTO" | "MARK_SOURCE" | "MARK_DESTINATION" | "EDIT" | "CONFIRM";

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${idCounter}_${Date.now().toString(36)}`;
}

const SURFACE_LABEL: Record<RouteSurface, string> = {
  WALL: "Wall",
  CEILING: "Ceiling",
  FLOOR: "Floor",
  UNKNOWN: "Not sure",
};

export default function RouteAssistCapture({
  destinationType,
  sourceHint,
  destinationHint,
  onUploadPhoto,
  onComplete,
  onCancel,
}: Props) {
  const [step, setStep] = useState<Step>("MODE");
  const [mode, setMode] = useState<RouteAssistMode | null>(null);
  const [drywallAccessAllowed, setDrywallAccessAllowed] = useState<boolean | null>(null);

  const [imageId, setImageId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [points, setPoints] = useState<RoutePoint[]>([]);
  const [segments, setSegments] = useState<RouteSegment[]>([]);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);

  const [outcome, setOutcome] = useState<ReturnType<typeof buildRouteAssistResult> | null>(null);

  const imageContainerRef = useRef<HTMLDivElement | null>(null);

  const source = points.find((p) => p.kind === "SOURCE") ?? null;
  const destination = points.find((p) => p.kind === "DESTINATION") ?? null;

  function normalizedCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
    const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    return { x, y };
  }

  async function handleFile(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const url = await onUploadPhoto(file);
      const id = nextId("img");
      setImageId(id);
      setImageUrl(url);
      setPoints([]);
      setSegments([]);
      setStep("MARK_SOURCE");
    } catch {
      setUploadError("We couldn't upload that photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleImageClick(clientX: number, clientY: number) {
    if (!imageId) return;
    const { x, y } = normalizedCoords(clientX, clientY);

    if (step === "MARK_SOURCE") {
      setPoints([{ id: nextId("pt"), x, y, imageId, kind: "SOURCE" }]);
      setStep("MARK_DESTINATION");
      return;
    }
    if (step === "MARK_DESTINATION") {
      const destPoint: RoutePoint = { id: nextId("pt"), x, y, imageId, kind: "DESTINATION" };
      setPoints((prev) => [...prev, destPoint]);
      if (source) {
        setSegments([{ id: nextId("seg"), fromPointId: source.id, toPointId: destPoint.id }]);
      }
      setStep("EDIT");
      return;
    }
  }

  /** Insert a waypoint at the midpoint of the given segment, splitting it in two. */
  function addWaypointOnSegment(segmentId: string) {
    const seg = segments.find((s) => s.id === segmentId);
    if (!seg || !imageId) return;
    const from = points.find((p) => p.id === seg.fromPointId);
    const to = points.find((p) => p.id === seg.toPointId);
    if (!from || !to) return;
    const mid: RoutePoint = {
      id: nextId("pt"),
      x: (from.x + to.x) / 2,
      y: (from.y + to.y) / 2,
      imageId,
      kind: "WAYPOINT",
    };
    const segA: RouteSegment = { id: nextId("seg"), fromPointId: from.id, toPointId: mid.id, surface: seg.surface };
    const segB: RouteSegment = { id: nextId("seg"), fromPointId: mid.id, toPointId: to.id, surface: seg.surface };
    setPoints((prev) => [...prev, mid]);
    setSegments((prev) => [...prev.filter((s) => s.id !== segmentId), segA, segB]);
    setSelectedPointId(mid.id);
  }

  function removeWaypoint(pointId: string) {
    const incoming = segments.filter((s) => s.toPointId === pointId || s.fromPointId === pointId);
    if (incoming.length !== 2) return; // only a genuine interior waypoint can be removed
    const [a, b] = incoming;
    const otherOfA = a.fromPointId === pointId ? a.toPointId : a.fromPointId;
    const otherOfB = b.fromPointId === pointId ? b.toPointId : b.fromPointId;
    const merged: RouteSegment = {
      id: nextId("seg"),
      fromPointId: otherOfA,
      toPointId: otherOfB,
      surface: a.surface ?? b.surface,
    };
    setSegments((prev) => [...prev.filter((s) => s.id !== a.id && s.id !== b.id), merged]);
    setPoints((prev) => prev.filter((p) => p.id !== pointId));
    setSelectedPointId(null);
  }

  function updatePoint(pointId: string, patch: Partial<RoutePoint>) {
    setPoints((prev) => prev.map((p) => (p.id === pointId ? { ...p, ...patch } : p)));
  }

  function updateAdjacentSegments(pointId: string, patch: Partial<RouteSegment>) {
    setSegments((prev) =>
      prev.map((s) => (s.fromPointId === pointId || s.toPointId === pointId ? { ...s, ...patch } : s))
    );
  }

  function setSegmentSurface(segmentId: string, surface: RouteSurface) {
    setSegments((prev) => prev.map((s) => (s.id === segmentId ? { ...s, surface } : s)));
  }

  function setSegmentLength(segmentId: string, feet: number | null) {
    setSegments((prev) => prev.map((s) => (s.id === segmentId ? { ...s, estimatedLengthFt: feet } : s)));
  }

  /**
   * `pointId` is captured directly in this closure rather than read back out
   * of `dragPointId` state — a `setDragPointId` call doesn't take effect
   * until the next render, so a listener that read state instead of its own
   * argument would see a stale (`null`) value on every move event and never
   * move anything. Found by an actual drag in the browser, not by the
   * domain-only tests, which is exactly the gap browser verification is for.
   */
  function startDrag(pointId: string) {
    setSelectedPointId(pointId);
    const onMove = (e: PointerEvent) => {
      const { x, y } = normalizedCoords(e.clientX, e.clientY);
      updatePoint(pointId, { x, y });
    };
    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  function buildResult() {
    if (!mode) return;
    const built = buildRouteAssistResult({
      mode,
      destinationType,
      points,
      segments,
      drywallAccessAllowed: mode === "CONCEALED" ? drywallAccessAllowed : null,
      captureArtifacts: { imageIds: imageId ? [imageId] : [], overlayImageIds: [] },
    });
    setOutcome(built);
    setStep("CONFIRM");
  }

  function confirm(decision: "ACCEPTED" | "ADJUSTED" | "RETAKE") {
    if (!outcome || isRouteAssistIncomplete(outcome)) return;
    const updated = applyConfirmation(outcome, decision);
    decisionRecord(decision); // audit hook — caller wires this to persistence
    if (decision === "ACCEPTED") {
      onComplete(updated);
      return;
    }
    if (decision === "RETAKE") {
      setImageId(null);
      setImageUrl(null);
      setPoints([]);
      setSegments([]);
      setOutcome(null);
      setStep("PHOTO");
      return;
    }
    // ADJUSTED — back to editing the same photo/points.
    setOutcome(null);
    setStep("EDIT");
  }

  const selectedPoint = points.find((p) => p.id === selectedPointId) ?? null;
  const selectedAdjacentSegments = useMemo(
    () => segments.filter((s) => s.fromPointId === selectedPointId || s.toPointId === selectedPointId),
    [segments, selectedPointId]
  );

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {step === "MODE" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-900">How would you like the wiring installed?</h2>
          {(
            [
              ["SURFACE", "Surface-mounted raceway or conduit is okay"],
              ["CONCEALED", "Concealed in the wall if possible"],
              ["UNSURE", "Not sure"],
            ] as [RouteAssistMode, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              data-testid={`mode-${value}`}
              onClick={() => {
                setMode(value);
                setStep(value === "CONCEALED" ? "DRYWALL" : "PHOTO");
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:border-blue-500 hover:bg-blue-50"
            >
              {label}
            </button>
          ))}
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-sm text-slate-500 underline">
              Cancel
            </button>
          )}
        </div>
      )}

      {step === "DRYWALL" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-900">
            If necessary, are you okay with small drywall openings that would need patching afterward?
          </h2>
          {(
            [
              [true, "Yes"],
              [false, "No"],
              [null, "Not sure"],
            ] as [boolean | null, string][]
          ).map(([value, label]) => (
            <button
              key={label}
              type="button"
              data-testid={`drywall-${label.toLowerCase().replace(/\s+/g, "-")}`}
              onClick={() => {
                setDrywallAccessAllowed(value);
                setStep("PHOTO");
              }}
              className="rounded-xl border border-slate-300 px-4 py-3 text-left text-sm font-medium text-slate-800 hover:border-blue-500 hover:bg-blue-50"
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {step === "PHOTO" && (
        <div className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold text-slate-900">Show us the route</h2>
          <p className="text-sm text-slate-600">
            Use your camera to mark where the wiring starts and where you want the new device.
          </p>
          <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 py-8 text-sm font-medium text-blue-600 hover:border-blue-400">
            {uploading ? "Uploading…" : "Open camera"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              data-testid="photo-input"
              className="hidden"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void handleFile(file);
              }}
            />
          </label>
          {uploadError && <p className="text-sm text-red-600">{uploadError}</p>}
        </div>
      )}

      {(step === "MARK_SOURCE" || step === "MARK_DESTINATION" || step === "EDIT") && imageUrl && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium text-slate-700">
            {step === "MARK_SOURCE" && sourceHint}
            {step === "MARK_DESTINATION" && destinationHint}
            {step === "EDIT" && "Tap the line to add a corner. Drag any point to adjust."}
          </p>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <div
            ref={imageContainerRef}
            data-testid="capture-image"
            className="relative w-full select-none overflow-hidden rounded-xl border border-slate-200"
            onClick={(e) => handleImageClick(e.clientX, e.clientY)}
          >
            <img src={imageUrl} alt="Captured route photo" className="block w-full" draggable={false} />
            <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
              {segments.map((seg) => {
                const from = points.find((p) => p.id === seg.fromPointId);
                const to = points.find((p) => p.id === seg.toPointId);
                if (!from || !to) return null;
                const onLineClick = (e: ReactMouseEvent) => {
                  e.stopPropagation();
                  if (step === "EDIT") addWaypointOnSegment(seg.id);
                };
                return (
                  <g key={seg.id}>
                    {/* A thin diagonal line is a hard tap target, especially on a
                        phone — this invisible sibling widens the hit area without
                        changing what's visible, drawn first so the visible line
                        still wins the cursor/hover styling on top of it. */}
                    <line
                      x1={from.x * 100}
                      y1={from.y * 100}
                      x2={to.x * 100}
                      y2={to.y * 100}
                      stroke="transparent"
                      strokeWidth={16}
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-auto cursor-pointer"
                      onClick={onLineClick}
                    />
                    <line
                      x1={from.x * 100}
                      y1={from.y * 100}
                      x2={to.x * 100}
                      y2={to.y * 100}
                      stroke="#2563eb"
                      strokeWidth={1.2}
                      vectorEffect="non-scaling-stroke"
                      className="pointer-events-none"
                    />
                  </g>
                );
              })}
            </svg>
            {points.map((p) => (
              <button
                key={p.id}
                type="button"
                onPointerDown={(e) => {
                  e.stopPropagation();
                  if (step === "EDIT") startDrag(p.id);
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (step === "EDIT" && p.kind === "WAYPOINT") setSelectedPointId(p.id);
                }}
                className={`absolute flex h-7 w-7 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white shadow ${
                  p.kind === "SOURCE" ? "bg-blue-600" : p.kind === "DESTINATION" ? "bg-emerald-600" : "bg-slate-500"
                } ${p.id === selectedPointId ? "ring-2 ring-offset-2 ring-blue-400" : ""}`}
                style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              >
                {p.kind === "SOURCE" ? "A" : p.kind === "DESTINATION" ? "B" : ""}
              </button>
            ))}
          </div>

          {step === "EDIT" && selectedPoint && selectedPoint.kind === "WAYPOINT" && (
            <div className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
              <p className="font-medium text-slate-700">This point</p>
              <div className="flex flex-wrap gap-2">
                {(["DOORWAY", "WINDOW"] as const).map((obstacle) => (
                  <button
                    key={obstacle}
                    type="button"
                    data-testid={`point-tag-${obstacle.toLowerCase()}`}
                    onClick={() =>
                      updatePoint(selectedPoint.id, {
                        obstacle: selectedPoint.obstacle === obstacle ? null : obstacle,
                      })
                    }
                    className={`rounded-full border px-3 py-1 text-xs font-medium ${
                      selectedPoint.obstacle === obstacle
                        ? "border-blue-600 bg-blue-600 text-white"
                        : "border-slate-300 text-slate-700"
                    }`}
                  >
                    {obstacle === "DOORWAY" ? "Doorway here" : "Window here"}
                  </button>
                ))}
                <button
                  type="button"
                  data-testid="point-tag-different-wall"
                  onClick={() =>
                    updateAdjacentSegments(selectedPoint.id, {
                      transitionAtEnd: true,
                    })
                  }
                  className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium text-slate-700"
                >
                  Different wall here
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedAdjacentSegments.map((seg, i) => (
                  <div key={seg.id} className="flex items-center gap-1">
                    <span className="text-xs text-slate-500">Leg {i + 1}:</span>
                    {(["WALL", "CEILING", "FLOOR"] as RouteSurface[]).map((surface) => (
                      <button
                        key={surface}
                        type="button"
                        data-testid={`leg-${i}-surface-${surface}`}
                        onClick={() => setSegmentSurface(seg.id, surface)}
                        className={`rounded-full border px-2 py-0.5 text-xs ${
                          seg.surface === surface ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
                        }`}
                      >
                        {SURFACE_LABEL[surface]}
                      </button>
                    ))}
                    <input
                      type="number"
                      data-testid={`leg-${i}-length`}
                      min={0}
                      placeholder="ft"
                      value={seg.estimatedLengthFt ?? ""}
                      onChange={(e) => setSegmentLength(seg.id, e.target.value === "" ? null : Number(e.target.value))}
                      className="w-14 rounded border border-slate-300 px-1 py-0.5 text-xs"
                    />
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={() => removeWaypoint(selectedPoint.id)}
                className="self-start text-xs text-red-600 underline"
              >
                Remove this point
              </button>
            </div>
          )}

          {step === "EDIT" && (
            <button
              type="button"
              onClick={buildResult}
              disabled={!source || !destination}
              className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              Looks right — review route
            </button>
          )}
        </div>
      )}

      {step === "CONFIRM" && outcome && (
        <div className="flex flex-col gap-3">
          {isRouteAssistIncomplete(outcome) ? (
            <>
              <p className="text-sm font-medium text-slate-800">{outcome.recoveryPrompt}</p>
              <button
                type="button"
                onClick={() => {
                  setOutcome(null);
                  setStep(outcome.recovery === "RETAKE_PHOTO" ? "PHOTO" : "EDIT");
                }}
                className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
              >
                {outcome.recovery === "RETAKE_PHOTO" ? "Take another photo" : "Send for contractor review"}
              </button>
            </>
          ) : (
            <>
              <h2 className="text-lg font-semibold text-slate-900">Does this look right?</h2>
              <ul className="flex flex-col gap-1 text-sm text-slate-700">
                {homeownerSummaryLines(outcome).map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => confirm("ADJUSTED")}
                  className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800"
                >
                  Adjust route
                </button>
                <button
                  type="button"
                  onClick={() => confirm("ACCEPTED")}
                  className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
                >
                  Looks right
                </button>
              </div>
              <button type="button" onClick={() => confirm("RETAKE")} className="text-xs text-slate-500 underline">
                Take another photo
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
