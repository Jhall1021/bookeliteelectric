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

function endpointLetter(index: number): string {
  return String.fromCharCode("B".charCodeAt(0) + index);
}

function Marker({ point, label, source = false }: { point: RouteAssistPlanPoint; label: string; source?: boolean }) {
  return (
    <div
      className={`pointer-events-none absolute flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-4 border-white text-sm font-bold text-white shadow-lg ${source ? "bg-electric" : "bg-emerald-600"}`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
    >
      {label}
    </div>
  );
}

function visualPointsForLeg(leg: RouteAssistOutletLeg): RouteAssistPlanPoint[] {
  if (leg.ordinal === 1 && leg.source.x < DOOR_LEFT_X && leg.destination.x > DOOR_RIGHT_X) {
    return [
      leg.source,
      { x: DOOR_LEFT_X, y: leg.source.y },
      { x: DOOR_LEFT_X, y: DOOR_HEADER_Y },
      { x: DOOR_RIGHT_X, y: DOOR_HEADER_Y },
      { x: DOOR_RIGHT_X, y: leg.destination.y },
      leg.destination,
    ];
  }
  return [leg.source, leg.destination];
}

function ProjectRoom({
  source,
  outlets,
  placingOutlet,
  showRoutes,
  onTap,
}: {
  source: RouteAssistOutletEndpoint | null;
  outlets: RouteAssistOutletEndpoint[];
  placingOutlet: boolean;
  showRoutes: boolean;
  onTap: (event: MouseEvent<HTMLDivElement>) => void;
}) {
  const legs = source ? buildOrderedOutletLegs(source, outlets) : [];
  return (
    <div
      className={`relative aspect-[16/10] overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 ${placingOutlet ? "cursor-crosshair" : ""}`}
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

      {source && <Marker point={source.point} label="A" source />}
      {outlets.map((endpoint, index) => <Marker key={endpoint.id} point={endpoint.point} label={endpointLetter(index)} />)}
      {!source && <div className="pointer-events-none absolute inset-x-5 bottom-4 rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-navy shadow-sm">Tap the existing outlet to place A</div>}
      {source && placingOutlet && <div className="pointer-events-none absolute inset-x-5 bottom-4 rounded-xl bg-white/95 px-4 py-3 text-center text-sm font-medium text-navy shadow-sm">Tap where you want outlet {endpointLetter(outlets.length)}</div>}
    </div>
  );
}

export default function RouteAssistMultiOutletDemoPage() {
  const [source, setSource] = useState<RouteAssistOutletEndpoint | null>(null);
  const [outlets, setOutlets] = useState<RouteAssistOutletEndpoint[]>([]);
  const [placingOutlet, setPlacingOutlet] = useState(true);
  const [projectStep, setProjectStep] = useState<ProjectStep>("PLAN");
  const legs = useMemo(() => (source ? buildOrderedOutletLegs(source, outlets) : []), [source, outlets]);

  function handleRoomTap(event: MouseEvent<HTMLDivElement>) {
    if (projectStep !== "PLAN") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const point = {
      x: Math.max(0.04, Math.min(0.96, (event.clientX - rect.left) / rect.width)),
      y: Math.max(0.08, Math.min(0.92, (event.clientY - rect.top) / rect.height)),
    };

    if (!source) {
      setSource({ id: "A", label: "Existing outlet", point });
      setPlacingOutlet(true);
      return;
    }

    if (!placingOutlet || outlets.length >= MAX_NEW_OUTLETS) return;
    const index = outlets.length;
    const letter = endpointLetter(index);
    setOutlets((current) => [...current, { id: letter, label: `Outlet ${index + 1}`, point }]);
    setPlacingOutlet(false);
  }

  function removeOutlet(index: number) {
    setOutlets((current) =>
      current
        .filter((_, currentIndex) => currentIndex !== index)
        .map((endpoint, currentIndex) => ({ ...endpoint, id: endpointLetter(currentIndex), label: `Outlet ${currentIndex + 1}` })),
    );
    setPlacingOutlet(false);
  }

  function resetProject() {
    setSource(null);
    setOutlets([]);
    setPlacingOutlet(true);
    setProjectStep("PLAN");
  }

  if (projectStep === "SCAN_ROOM" && source) {
    return (
      <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-multi-outlet-scan-room">
        <div className="mx-auto w-full max-w-md">
          <header className="mb-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p>
            <h1 className="mt-1 text-2xl font-bold text-navy">Scan the room</h1>
            <p className="mt-2 text-sm leading-6 text-slate">Keep all outlet locations in view. Route Assist will analyze the room once and connect the outlets in the order you placed them.</p>
          </header>

          <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm">
            <ProjectRoom source={source} outlets={outlets} placingOutlet={false} showRoutes={false} onTap={() => {}} />
            <div className="mt-4 rounded-xl bg-blue-50 p-4 text-sm leading-6 text-navy">
              <strong>One scan for this room.</strong><br />A is the existing outlet. {outlets.map((_, index) => endpointLetter(index)).join(", ")} are the new outlet locations.
            </div>
            <button
              type="button"
              onClick={() => setProjectStep("REVIEW")}
              className="mt-5 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm"
              data-testid="route-assist-scan-room"
            >
              Scan room
            </button>
            <button type="button" onClick={() => setProjectStep("PLAN")} className="mt-3 w-full text-xs font-semibold text-slate underline underline-offset-4">Back to outlet plan</button>
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
            <p className="mt-2 text-sm leading-6 text-slate">Route Assist analyzed the room as one project. Review the complete path before confirming it.</p>
          </header>

          <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm">
            <ProjectRoom source={source} outlets={outlets} placingOutlet={false} showRoutes onTap={() => {}} />
            <div className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate" data-testid="route-assist-internal-leg-summary">
              <div className="flex items-center justify-between"><span>New outlets</span><strong className="text-navy">{outlets.length}</strong></div>
              <div className="mt-2 flex items-center justify-between"><span>Connected path</span><strong className="text-navy">A → {endpointLetter(outlets.length - 1)}</strong></div>
              <p className="mt-3 text-xs leading-5 text-slate-light">Route Assist keeps each endpoint-to-endpoint section separate internally so measurements and obstacles stay attached to the right part of the run.</p>
            </div>
            <button
              type="button"
              onClick={() => setProjectStep("DONE")}
              className="mt-5 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm"
              data-testid="route-assist-confirm-project"
            >
              Confirm route
            </button>
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
            <p className="mt-1 text-sm leading-6 text-emerald-900">All {outlets.length} new outlets are part of one confirmed room route.</p>
            <div className="mt-4"><ProjectRoom source={source} outlets={outlets} placingOutlet={false} showRoutes onTap={() => {}} /></div>
            <button type="button" onClick={resetProject} className="mt-5 w-full rounded-xl border border-emerald-300 bg-white px-4 py-3 text-sm font-semibold text-emerald-900">Start over</button>
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
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist · Multiple outlets</h1>
          <p className="mt-2 text-sm leading-6 text-slate">Place the existing outlet first, then add each new outlet in the order the route should continue.</p>
        </header>

        <section className="rounded-2xl border border-cardline bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-navy">{!source ? "Place the existing outlet" : placingOutlet ? `Place outlet ${endpointLetter(outlets.length)}` : "Outlet chain ready"}</h2>
          <p className="mt-1 text-sm text-slate">A is the existing outlet. B, C, D and later points are new outlets connected in order.</p>
          <div className="mt-5"><ProjectRoom source={source} outlets={outlets} placingOutlet={placingOutlet} showRoutes={false} onTap={handleRoomTap} /></div>

          {source && (
            <div className="mt-4 space-y-2" data-testid="route-assist-outlet-list">
              <div className="flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3 text-sm"><span><strong>A</strong> · Existing outlet</span><span className="text-xs text-slate">Start</span></div>
              {outlets.map((outlet, index) => (
                <div key={outlet.id} className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-3 text-sm">
                  <span><strong>{endpointLetter(index)}</strong> · Outlet {index + 1}</span>
                  <button type="button" onClick={() => removeOutlet(index)} className="text-xs font-semibold text-slate underline underline-offset-4">Remove</button>
                </div>
              ))}
            </div>
          )}

          {source && outlets.length > 0 && !placingOutlet && outlets.length < MAX_NEW_OUTLETS && (
            <button type="button" onClick={() => setPlacingOutlet(true)} className="mt-4 w-full rounded-xl border border-cardline bg-white px-4 py-3 text-sm font-semibold text-electric">+ Add another outlet</button>
          )}

          {source && outlets.length > 0 && !placingOutlet && (
            <button
              type="button"
              onClick={() => setProjectStep("SCAN_ROOM")}
              className="mt-5 w-full rounded-xl bg-electric px-5 py-3.5 text-sm font-semibold text-white shadow-sm"
              data-testid="route-assist-continue-to-scan"
            >
              Continue
            </button>
          )}

          <button type="button" onClick={resetProject} className="mt-4 w-full text-xs font-semibold text-slate underline underline-offset-4">Reset project</button>
        </section>
        <p className="mt-4 text-center text-xs leading-5 text-slate-light">Demo only: the room scan is simulated and does not calculate pricing, materials, or booking.</p>
      </div>
    </main>
  );
}
