"use client";

import { useRef, useState } from "react";
import {
  applyConfirmation,
  buildRouteAssistResult,
  isRouteAssistIncomplete,
} from "@/lib/visual-assist/route-assist";
import type { RouteAssistResult, RoutePlacement, RoutePoint, RouteSegment } from "@/lib/visual-assist/route-assist/types";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";

type Props = {
  destinationType: RouteAssistDestinationType;
  sourceHint: string;
  placementHint: string;
  minPlacements: number;
  maxPlacements: number;
  onUploadPhoto: (file: File) => Promise<string>;
  onComplete: (result: RouteAssistResult) => void;
  onCancel?: () => void;
};

type Step = "PHOTO" | "SOURCE" | "PLACEMENTS" | "CONFIRM";

let placementIdCounter = 0;
function nextId(prefix: string): string {
  placementIdCounter += 1;
  return `${prefix}_${placementIdCounter}_${Date.now().toString(36)}`;
}

/**
 * Placement-layout capture for new fixtures/fans/recessed lights.
 *
 * This records WHERE the homeowner wants devices. It deliberately does not
 * infer a daisy-chain order, cable route, joist direction, hidden framing or
 * accessible-attic path. Additional placement dots are not route waypoints.
 */
export default function RouteAssistPlacementCapture({
  destinationType,
  sourceHint,
  placementHint,
  minPlacements,
  maxPlacements,
  onUploadPhoto,
  onComplete,
  onCancel,
}: Props) {
  const [step, setStep] = useState<Step>("PHOTO");
  const [imageId, setImageId] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<RoutePoint | null>(null);
  const [placements, setPlacements] = useState<RoutePlacement[]>([]);
  const [result, setResult] = useState<RouteAssistResult | null>(null);
  const imageRef = useRef<HTMLDivElement | null>(null);

  function normalizedCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) return { x: 0.5, y: 0.5 };
    return {
      x: Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)),
    };
  }

  async function handleFile(file: File) {
    setUploading(true);
    setError(null);
    try {
      const url = await onUploadPhoto(file);
      setImageId(nextId("img"));
      setImageUrl(url);
      setSource(null);
      setPlacements([]);
      setResult(null);
      setStep("SOURCE");
    } catch {
      setError("We couldn't upload that photo. Try again.");
    } finally {
      setUploading(false);
    }
  }

  function handleImageClick(clientX: number, clientY: number) {
    if (!imageId) return;
    const { x, y } = normalizedCoords(clientX, clientY);

    if (step === "SOURCE") {
      setSource({ id: nextId("source"), x, y, imageId, kind: "SOURCE", surface: "WALL" });
      setStep("PLACEMENTS");
      return;
    }

    if (step === "PLACEMENTS" && placements.length < maxPlacements) {
      const placement: RoutePlacement = {
        id: nextId("placement"),
        x,
        y,
        imageId,
        destinationType,
        surface: "CEILING",
        label: `${placements.length + 1}`,
      };
      setPlacements((previous) => [...previous, placement]);
    }
  }

  function removePlacement(id: string) {
    setPlacements((previous) =>
      previous
        .filter((placement) => placement.id !== id)
        .map((placement, index) => ({ ...placement, label: `${index + 1}` }))
    );
  }

  function buildLayout() {
    if (!source || !imageId || placements.length < minPlacements) return;

    // The first requested location is the graph DESTINATION only so the
    // existing RouteAssistResult persistence/confirmation envelope remains
    // usable. It is NOT a claim that the eventual wiring route is a straight
    // source-to-first-fixture segment. Additional placements remain entirely
    // outside the route graph for exactly that reason.
    const first = placements[0];
    const destination: RoutePoint = {
      id: nextId("destination"),
      x: first.x,
      y: first.y,
      imageId,
      kind: "DESTINATION",
      surface: "CEILING",
    };
    const segment: RouteSegment = {
      id: nextId("reference"),
      fromPointId: source.id,
      toPointId: destination.id,
      surface: "UNKNOWN",
    };

    const outcome = buildRouteAssistResult({
      mode: "CONCEALED",
      destinationType,
      points: [source, destination],
      segments: [segment],
      captureKind: "PLACEMENT_LAYOUT",
      placements,
      concealedAccessEvidence: null,
      drywallAccessAllowed: null,
      captureArtifacts: { imageIds: [imageId], overlayImageIds: [] },
    });

    if (isRouteAssistIncomplete(outcome)) {
      setError(outcome.recoveryPrompt);
      return;
    }

    setResult(outcome);
    setStep("CONFIRM");
  }

  function acceptLayout() {
    if (!result) return;
    onComplete(applyConfirmation(result, "ACCEPTED"));
  }

  if (step === "PHOTO") {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Show us the room</h2>
        <p className="text-sm text-slate-600">
          Take a wide photo that shows the wall control area and the ceiling where you want the new fixture{maxPlacements > 1 ? "s" : ""}.
        </p>
        <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 py-8 text-sm font-medium text-blue-600 hover:border-blue-400">
          {uploading ? "Uploading…" : "Open camera"}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            disabled={uploading}
            data-testid="placement-photo-input"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-slate-500 underline">
            Cancel
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">
          {step === "SOURCE" && "Start with the control or power source"}
          {step === "PLACEMENTS" && "Place the new fixture locations"}
          {step === "CONFIRM" && "Does this layout look right?"}
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          {step === "SOURCE" && sourceHint}
          {step === "PLACEMENTS" && placementHint}
          {step === "CONFIRM" && "The dots show the locations you requested. This does not assume how the electrician will route the wiring."}
        </p>
      </div>

      {imageUrl && (
        <div
          ref={imageRef}
          data-testid="placement-capture-image"
          className="relative w-full select-none overflow-hidden rounded-xl border border-slate-200"
          onClick={(event) => handleImageClick(event.clientX, event.clientY)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={imageUrl} alt="Room for fixture placement" className="block w-full" draggable={false} />
          <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {source && <circle cx={source.x * 100} cy={source.y * 100} r="2.3" fill="currentColor" className="text-blue-700" />}
            {placements.map((placement, index) => (
              <g key={placement.id}>
                <circle cx={placement.x * 100} cy={placement.y * 100} r="2.8" fill="currentColor" className="text-amber-500" />
                <text x={placement.x * 100} y={placement.y * 100 + 0.8} textAnchor="middle" fontSize="2.7" fill="white">
                  {index + 1}
                </text>
              </g>
            ))}
          </svg>
        </div>
      )}

      {step === "PLACEMENTS" && (
        <>
          <div className="flex flex-wrap gap-2">
            {placements.map((placement, index) => (
              <button
                key={placement.id}
                type="button"
                onClick={() => removePlacement(placement.id)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs text-slate-700"
              >
                Remove {index + 1}
              </button>
            ))}
          </div>
          <p className="text-xs text-slate-500">
            {placements.length} of {maxPlacements} placed{placements.length < minPlacements ? ` — place at least ${minPlacements}` : ""}.
          </p>
          <button
            type="button"
            disabled={placements.length < minPlacements}
            onClick={buildLayout}
            className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            Done placing
          </button>
        </>
      )}

      {step === "CONFIRM" && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setStep("PLACEMENTS");
            }}
            className="flex-1 rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800"
          >
            Adjust
          </button>
          <button
            type="button"
            onClick={acceptLayout}
            className="flex-1 rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
          >
            Confirm layout
          </button>
        </div>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
