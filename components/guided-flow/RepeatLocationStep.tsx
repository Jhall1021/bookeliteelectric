"use client";

import { useState } from "react";
import { formatCents } from "@/lib/flow-types";
import type { RepeatLocationUI } from "@/lib/repeatLocation";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import WhileWereThereLink from "@/components/services/WhileWereThereLink";
import MeasurementGuide from "./MeasurementGuide";

type Props = {
  serviceId: string;
  parentLineItemId: string;
  ui: RepeatLocationUI;
  onDone: () => void;
  onStartFresh: () => void;
};

export default function RepeatLocationStep({
  serviceId,
  parentLineItemId: initialParentId,
  ui,
  onDone,
  onStartFresh,
}: Props) {
  const siteFetch = useSiteFetch();
  const base = useStorefrontBase();
  const [parentLineItemId, setParentLineItemId] = useState(initialParentId);
  const [phase, setPhase] = useState<"offer" | "measure" | "preview">("offer");
  const [distance, setDistance] = useState("");
  const [doorway, setDoorway] = useState(false);
  const [turnsWall, setTurnsWall] = useState(false);
  const [sameControl, setSameControl] = useState(true);
  const [priceCents, setPriceCents] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [addedCount, setAddedCount] = useState(0);

  const request = () => ({
    parentLineItemId,
    distanceFeet: Number(distance),
    doorway: ui.askDoorway ? doorway : false,
    turnsOntoAnotherWall: ui.askWallTurn ? turnsWall : false,
    sameControl: ui.requireSameControl ? sameControl : undefined,
  });

  const resetForNext = () => {
    setDistance("");
    setDoorway(false);
    setTurnsWall(false);
    setSameControl(true);
    setPriceCents(null);
    setError("");
    setPhase("offer");
  };

  async function preview() {
    setBusy(true);
    setError("");
    try {
      const response = await siteFetch("/api/price-evaluation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, repeatLocation: request() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || body?.outcome !== "PRICED" || typeof body.priceCents !== "number") {
        throw new Error(body?.message ?? body?.error ?? "We couldn’t price this additional location.");
      }
      setPriceCents(body.priceCents);
      setPhase("preview");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "We couldn’t price this additional location.");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    setBusy(true);
    setError("");
    try {
      const response = await siteFetch("/api/visit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceId, repeatLocation: request() }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok || typeof body?.lineItemId !== "string") {
        throw new Error(body?.message ?? body?.reason ?? body?.error ?? "This location was not added.");
      }
      setParentLineItemId(body.lineItemId);
      setAddedCount((count) => count + 1);
      resetForNext();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "This location was not added.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "offer") {
    return (
      <div className="ray-accent rounded-card border border-cardline bg-white p-8 text-center shadow-card">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-success/10 text-2xl text-success">✓</div>
        <h2 className="mt-4 font-display text-xl font-bold text-ink">
          {addedCount > 0 ? `Additional ${ui.itemLabel} added` : `${ui.itemLabel[0].toUpperCase()}${ui.itemLabel.slice(1)} added`}
        </h2>
        <p className="mx-auto mt-2 max-w-xl text-slate">
          Would you like to add another {ui.itemLabel} off this new one in the same room?
        </p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate">
          You’ll only answer for the next wiring segment, and it will use the reduced{" "}
          <WhileWereThereLink href={`${base}/while-were-there`} />.
        </p>
        <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <button onClick={() => setPhase("measure")} className="rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover">
            Yes, add another
          </button>
          <button onClick={onDone} className="rounded-pill border border-cardline px-7 py-3 font-semibold text-navy hover:border-electric hover:text-electric">
            No, view My Visit
          </button>
        </div>
        <button onClick={onStartFresh} className="mt-4 text-sm font-medium text-electric hover:underline">
          Add one with a different setup
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card sm:p-8">
      <button
        onClick={() => { setError(""); setPhase(phase === "preview" ? "measure" : "offer"); }}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-electric hover:underline"
      >
        <span aria-hidden="true">←</span> Back
      </button>
      <h2 className="font-display text-xl font-bold text-ink">{ui.prompt}</h2>
      <p className="mt-2 text-sm leading-6 text-slate">{ui.helpText}</p>

      <MeasurementGuide
        questionKey={ui.measurementQuestionKey}
        prompt={ui.measurementPrompt}
        accessClass={ui.askDoorway ? "FINISHED" : "ACCESSIBLE"}
        showDoorway={ui.askDoorway}
        doorwayChecked={doorway}
        onDoorwayChange={ui.askDoorway ? setDoorway : undefined}
      />

      {phase === "measure" ? (
        <div className="mt-6 space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-navy">Distance to the next location</span>
            <div className="mt-2 flex max-w-xs items-center gap-2">
              <input
                type="number"
                min="1"
                max={ui.maxFeet}
                step="0.5"
                value={distance}
                onChange={(event) => setDistance(event.target.value)}
                className="w-full rounded-card border border-cardline px-4 py-3 text-ink focus:border-electric focus:outline-none focus:ring-2 focus:ring-electric/20"
              />
              <span className="text-sm font-medium text-slate">feet</span>
            </div>
          </label>
          {ui.askWallTurn && (
            <label className="flex cursor-pointer items-start gap-3 rounded-card border border-cardline p-4 text-sm text-navy">
              <input type="checkbox" checked={turnsWall} onChange={(event) => setTurnsWall(event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-cardline text-electric focus:ring-electric" />
              <span>The route turns onto another wall before reaching the next location.</span>
            </label>
          )}
          {ui.requireSameControl && (
            <label className="flex cursor-pointer items-start gap-3 rounded-card border border-cardline p-4 text-sm text-navy">
              <input type="checkbox" checked={sameControl} onChange={(event) => setSameControl(event.target.checked)} className="mt-0.5 h-5 w-5 rounded border-cardline text-electric focus:ring-electric" />
              <span>
                <span className="block font-semibold">This fan will use the same control as the fan I just added.</span>
                <span className="mt-1 block text-xs leading-5 text-slate">A separate switch or control location needs the full setup.</span>
              </span>
            </label>
          )}
          {error && <p role="alert" className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button
            onClick={preview}
            disabled={busy || !distance || Number(distance) < 1 || (ui.requireSameControl && !sameControl)}
            className="rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? "Calculating…" : "See reduced price"}
          </button>
        </div>
      ) : (
        <div className="mt-6 rounded-card border border-sky-200 bg-sky-50 p-5 text-center">
          <p className="text-sm font-medium text-slate">Additional {ui.itemLabel}</p>
          <p className="mt-1 font-display text-3xl font-bold text-navy">{priceCents === null ? "—" : formatCents(priceCents)}</p>
          <p className="mt-1 text-xs text-slate">Reduced While We’re There price for this segment</p>
          {error && <p role="alert" className="mt-3 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <button onClick={add} disabled={busy || priceCents === null} className="mt-5 rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover disabled:opacity-50">
            {busy ? "Adding…" : `Add this ${ui.itemLabel}`}
          </button>
        </div>
      )}
    </div>
  );
}
