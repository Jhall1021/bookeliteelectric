"use client";

import { useMemo, useState, type MouseEvent } from "react";
import {
  buildOrderedOutletLegs,
  type RouteAssistOutletEndpoint,
  type RouteAssistOutletLeg,
  type RouteAssistPlanPoint,
} from "@/lib/visual-assist/route-assist/multiOutletPlan";

const DOOR_LEFT_X = 0.44;
const DOOR_RIGHT_X = 0.66;
const DOOR_HEADER_Y = 0.18;
const MAX_NEW_OUTLETS = 5;

type ProjectStep = "PLAN" | "SCAN_ROOM" | "REVIEW" | "DONE";
type WorkKind = "OUTLET" | "SWITCH" | "LIGHT_FIXTURE";

const WORK_KIND_LABEL: Record<WorkKind, string> = {
  OUTLET: "Outlet",
  SWITCH: "Switch",
  LIGHT_FIXTURE: "Light fixture",
};

function sourceInstruction(kind: WorkKind): { title: string; help: string; marker: string; label: string } {
  if (kind === "LIGHT_FIXTURE") {
    return {
      title: "Tap the switch that will control this light",
      help: "This can be an existing switch or a new switch you just added.",
      marker: "SW",
      label: "Controlling switch",
    };
  }
  return {
    title: `Tap the existing outlet this new ${kind === "SWITCH" ? "switch" : "outlet"} will connect to`,
    help: "If there isn’t an outlet on this wall, tap the nearest outlet in the room.",
    marker: "P",
    label: "Existing outlet",
  };
}

function destinationInstruction(kind: WorkKind, index: number): string {
  if (kind === "SWITCH") return "Tap where you want the new switch installed";
  if (kind === "LIGHT_FIXTURE") return "Tap where you want the new light fixture installed";
  return index === 0 ? "Tap where you want the new outlet installed" : "Tap where you want the next outlet installed";
}

function destinationLabel(kind: WorkKind, index: number): string {
  if (kind === "SWITCH") return "New switch";
  if (kind === "LIGHT_FIXTURE") return "New light fixture";
  return `New outlet ${index + 1}`;
}

function Marker({ point, label, source = false }: { point: RouteAssistPlanPoint; label: string; source?: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute flex h-10 min-w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white px-1.5 text-[11px] font-bold text-white shadow-lg ${source ? "bg-electric" : "bg-emerald-600"}`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
    >
      {label}
    </div>
  );
}

function visualPointsForLeg(leg: RouteAssistOutletLeg): RouteAssistPlanPoint[] {
  const crossesLeftToRight = leg.source.x < DOOR_LEFT_X && leg.destination.x > DOOR_RIGHT_X;
  const crossesRightToLeft = leg.source.x > DOOR_RIGHT_X && leg.destination.x < DOOR_LEFT_X;

  if (crossesLeftToRight) {
    return [
      leg.source,
      { x: DOOR_LEFT_X, y: leg.source.y },
      { x: DOOR_LEFT_X, y: DOOR_HEADER_Y },
      { x: DOOR_RIGHT_X, y: DOOR_HEADER_Y },
      { x: DOOR_RIGHT_X, y: leg.destination.y },
      leg.destination,
    ];
  }

  if (crossesRightToLeft) {
    return [
      leg.source,
      { x: DOOR_RIGHT_X, y: leg.source.y },
      { x: DOOR_RIGHT_X, y: DOOR_HEADER_Y },
      { x: DOOR_LEFT_X, y: DOOR_HEADER_Y },
      { x: DOOR_LEFT_X, y: leg.destination.y },
      leg.destination,
    ];
  }

  return [leg.source, leg.destination];
}

function ProjectRoom({ source, targets, kind, placingTarget, showRoutes, onTap }: {
  source: RouteAssistOutletEndpoint | null;
  targets: RouteAssistOutletEndpoint[];
  kind: WorkKind;
  placingTarget: boolean;
  showRoutes: boolean;
  onTap: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const legs = source ? buildOrderedOutletLegs(source, targets) : [];
  const sourceCopy = sourceInstruction(kind);
  return (
    <div
      className={`relative aspect-[16/10] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${placingTarget ? "cursor-crosshair" : ""}`}
      onClick={onTap}
      data-testid="route-assist-multi-room"
    >
      <div className="absolute inset-x-0 top-0 h-[68%] bg-gradient-to-b from-white to-slate-100" />
      <div className="absolute inset-x-0 bottom-0 h-[32%] bg-slate-200" />
      <div className="absolute left-[47%] top-[26%] h-[43%] w-[15%] rounded-t-xl border-2 border-slate-400 bg-white/90" />
      <div className="absolute left-[49%] top-[29%] text-[10px] font-medium text-slate-400">doorway</div>

      {showRoutes && (
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {legs.map((leg) => (
            <polyline
              key={leg.id}
              points={visualPointsForLeg(leg).map((point) => `${point.x * 100},${point.y * 100}`).join(" ")}
              fill="none"
              stroke="currentColor"
              className={leg.ordinal === 1 ? "text-electric" : "text-emerald-600"}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              data-route-leg={leg.id}
            />
          ))}
        </svg>
      )}

      {source && <Marker point={source.point} label={sourceCopy.marker} source />}
      {targets.map((endpoint, index) => <Marker key={endpoint.id} point={endpoint.point} label={String(index + 1)} />)}
      {!source && <div className="pointer-events-none absolute inset-x-5 bottom-4 rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-navy shadow-sm">{sourceCopy.title}</div>}
      {source && placingTarget && <div className="pointer-events-none absolute inset-x-5 bottom-4 rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-navy shadow-sm">{destinationInstruction(kind, targets.length)}</div>}
    </div>
  );
}

export default function RouteAssistMultiOutletDemoPage() {
  const [kind, setKind] = useState<WorkKind>("OUTLET");
  const [source, setSource] = useState<RouteAssistOutletEndpoint | null>(null);
  const [targets, setTargets] = useState<RouteAssistOutletEndpoint[]>([]);
  const [placingTarget, setPlacingTarget] = useState(true);
  const [projectStep, setProjectStep] = useState<ProjectStep>("PLAN");
  const legs = useMemo(() => (source ? buildOrderedOutletLegs(source, targets) : []), [source, targets]);
  const sourceCopy = sourceInstruction(kind);
  const hasDoorwayBypass = legs.some((leg) => visualPointsForLeg(leg).length > 2);

  function resetProject(nextKind: WorkKind = kind) {
    setKind(nextKind);
    setSource(null);
    setTargets([]);
    setPlacingTarget(true);
    setProjectStep("PLAN");
  }

  function handleRoomTap(event: MouseEvent<HTMLDivElement>) {
    if (projectStep !== "PLAN") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0.04, Math.min(0.96, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0.08, Math.min(0.92, (event.clientY - rect.top) / rect.height)),
    };

    if (!source) {
      setSource({ id: "source", label: sourceCopy.label, point });
      setPlacingTarget(true);
      return;
    }

    if (!placingTarget) return;
    if (kind !== "OUTLET" && targets.length >= 1) return;
    if (kind === "OUTLET" && targets.length >= MAX_NEW_OUTLETS) return;
    const index = targets.length;
    setTargets((current) => [...current, { id: `target-${index + 1}`, label: destinationLabel(kind, index), point }]);
    setPlacingTarget(false);
  }

  function removeTarget(index: number) {
    setTargets((current) => current.filter((_, currentIndex) => currentIndex !== index).map((endpoint, currentIndex) => ({ ...endpoint, id: `target-${currentIndex + 1}`, label: destinationLabel(kind, currentIndex) })));
    setPlacingTarget(false);
  }

  const projectRoom = (showRoutes: boolean, interactive = false) => (
    <ProjectRoom source={source} targets={targets} kind={kind} placingTarget={interactive && placingTarget} showRoutes={showRoutes} onTap={interactive ? handleRoomTap : () => {}} />
  );

  if (projectStep === "SCAN_ROOM" && source) {
    return (
      <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-multi-outlet-scan-room">
        <div className="mx-auto w-full max-w-md">
          <header className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Scan the room</h1>
            <p className="mt-2 text-sm leading-6 text-slate">Keep the {kind === "LIGHT_FIXTURE" ? "controlling switch" : "existing outlet"} and {targets.length > 1 ? "all new locations" : "the new location"} in view. Route Assist will analyze the room once.</p>
          </header>
          <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm">
            {projectRoom(false)}
            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-navy"><strong>One scan for this room.</strong><br />We’ll use the locations you already selected. You won’t need to place them again.</div>
            <button type="button" onClick={() => setProjectStep("REVIEW")} className="mt-5 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm" data-testid="route-assist-scan-room">Scan room</button>
            <button type="button" onClick={() => setProjectStep("PLAN")} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">Back</button>
            <p className="mt-4 text-center text-xs text-slate-light">Demo scan uses simulated calibrated room geometry.</p>
          </section>
        </div>
      </main>
    );
  }

  if (projectStep === "REVIEW" && source) {
    return (
      <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-multi-outlet-review">
        <div className="mx-auto w-full max-w-md">
          <header className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Review the route</h1>
            <p className="mt-2 text-sm leading-6 text-slate">Route Assist analyzed the room as one project. Make sure the path looks right before confirming it.</p>
          </header>
          <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm">
            {projectRoom(true)}
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate">
              <div className="flex items-center justify-between"><span>Project</span><strong className="text-navy">New {WORK_KIND_LABEL[kind].toLowerCase()}{targets.length > 1 ? "s" : ""}</strong></div>
              {kind === "OUTLET" && targets.length > 1 && <div className="mt-2 flex items-center justify-between"><span>New outlet locations</span><strong className="text-navy">{targets.length}</strong></div>}
              <p className="mt-3 text-xs leading-5 text-slate-light">The route shown is based on the room scan and the locations you selected.</p>
              {hasDoorwayBypass && <p className="mt-2 text-xs font-medium leading-5 text-navy">The route shown goes up and around the doorway before continuing to the next location.</p>}
            </div>
            <button type="button" onClick={() => setProjectStep("DONE")} className="mt-5 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm" data-testid="route-assist-confirm-project">Confirm route</button>
            <button type="button" onClick={() => setProjectStep("SCAN_ROOM")} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">Rescan room</button>
          </section>
        </div>
      </main>
    );
  }

  if (projectStep === "DONE" && source) {
    return (
      <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-multi-outlet-done">
        <div className="mx-auto w-full max-w-md">
          <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 shadow-sm">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-600 text-lg font-bold text-white">✓</div>
            <h1 className="mt-3 text-xl font-semibold text-emerald-950">Route confirmed</h1>
            <p className="mt-1 text-sm leading-6 text-emerald-900">Your {WORK_KIND_LABEL[kind].toLowerCase()} route is confirmed.</p>
            <div className="mt-4">{projectRoom(true)}</div>
            {hasDoorwayBypass && (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-white/80 p-4 text-sm leading-6 text-emerald-950" data-testid="route-assist-confirmed-bypass-note">
                <strong>Confirmed path:</strong> this route goes up and around the doorway before continuing to the next location.
              </div>
            )}
            <button type="button" onClick={() => resetProject()} className="mt-5 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-900">Start over</button>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-multi-outlet-demo">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist</h1>
          <p className="mt-2 text-sm leading-6 text-slate">Show us where power will come from and where you want the new device installed.</p>
        </header>

        <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm">
          <p className="text-sm font-semibold text-navy">What are you adding?</p>
          <div className="mt-3 grid grid-cols-3 gap-2" data-testid="route-assist-work-kind">
            {(Object.keys(WORK_KIND_LABEL) as WorkKind[]).map((option) => (
              <button key={option} type="button" onClick={() => resetProject(option)} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${kind === option ? "border-electric bg-blue-50 text-electric" : "border-cardline bg-white text-slate"}`}>{WORK_KIND_LABEL[option]}</button>
            ))}
          </div>

          <div className="mt-5 rounded-xl bg-slate-50 p-4">
            <h2 className="text-base font-semibold text-navy">{!source ? sourceCopy.title : placingTarget ? destinationInstruction(kind, targets.length) : "Locations ready"}</h2>
            {!source && <p className="mt-1 text-sm leading-6 text-slate">{sourceCopy.help}</p>}
            {source && placingTarget && kind === "OUTLET" && targets.length > 0 && <p className="mt-1 text-sm leading-6 text-slate">Add the next outlet in the order the wiring should continue.</p>}
          </div>

          <div className="mt-4">{projectRoom(false, true)}</div>

          {source && (
            <div className="mt-4 space-y-2" data-testid="route-assist-location-list">
              <div className="flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3 text-sm"><span><strong>{sourceCopy.label}</strong></span><span className="text-xs text-slate">Power source</span></div>
              {targets.map((target, index) => (
                <div key={target.id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm"><span><strong>{destinationLabel(kind, index)}</strong></span><button type="button" onClick={() => removeTarget(index)} className="text-xs font-semibold text-slate underline underline-offset-4">Remove</button></div>
              ))}
            </div>
          )}

          {kind === "OUTLET" && source && targets.length > 0 && !placingTarget && targets.length < MAX_NEW_OUTLETS && <button type="button" onClick={() => setPlacingTarget(true)} className="mt-4 w-full rounded-xl border border-cardline bg-white px-4 py-3 text-sm font-semibold text-electric">+ Add another outlet</button>}

          {source && targets.length > 0 && !placingTarget && <button type="button" onClick={() => setProjectStep("SCAN_ROOM")} className="mt-5 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm" data-testid="route-assist-continue-to-scan">Continue</button>}

          <button type="button" onClick={() => resetProject()} className="mt-4 w-full text-xs font-semibold text-slate underline underline-offset-4">Reset project</button>
        </section>
        <p className="mt-4 text-center text-xs leading-5 text-slate-light">Demo only: the room scan is simulated and does not calculate pricing, materials, or booking.</p>
      </div>
    </main>
  );
}
