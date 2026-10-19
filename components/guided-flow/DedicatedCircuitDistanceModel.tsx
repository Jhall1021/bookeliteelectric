"use client";

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";

import { EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT } from "@/lib/electrical/exteriorWallContingency";
import {
  dedicatedGarageAllowanceFeet,
  dedicatedHomeProfileRouteAccess,
  dedicatedHomeProfileUsesSurfaceConduit,
  dedicatedVerticalRoutePlan,
  type DedicatedHomeProfile,
} from "@/lib/electrical/dedicatedHomeProfile";

type RouteExterior = "" | "no" | "yes" | "unsure";

type Props = {
  profile: DedicatedHomeProfile;
  feet: string;
  onFeetChange: (feet: string) => void;
  exterior: RouteExterior;
  onExteriorChange: (value: RouteExterior) => void;
};

const FLOOR_NUMBER = { first: 1, second: 2, third: 3 } as const;

function HouseDiagram({ profile }: { profile: DedicatedHomeProfile }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const garageBoundary = profile.garageSize === "three" ? 232 : profile.garageSize === "two" ? 184 : 136;
  const garageCenter = (22 + garageBoundary) / 2;
  const [panelX, setPanelX] = useState(profile.panelLocation === "garage" ? garageCenter : profile.panelLocation === "basement" ? 150 : 165);
  const [outletX, setOutletX] = useState(430);
  const [dragging, setDragging] = useState<"panel" | "outlet" | null>(null);
  const storyCount = profile.stories === "three" ? 3 : profile.stories === "two" ? 2 : 1;
  const routeThroughAttic = profile.homeAccess === "attic" || profile.homeAccess === "both";
  const routeThroughBelow = profile.homeAccess === "below" || profile.homeAccess === "both";
  const hasLowerLevel = profile.basementCeiling !== null || profile.hasCrawlSpace;
  const panelInBasement = profile.panelLocation === "basement";
  const panelInGarage = profile.panelLocation === "garage";
  const surface = dedicatedHomeProfileUsesSurfaceConduit(profile);
  const garageAllowance = dedicatedGarageAllowanceFeet(profile);
  const occupiedTop = profile.hasAttic ? 88 : 62;
  const storyHeight = 52;
  const basementTop = occupiedTop + (storyCount * storyHeight);
  const houseBottom = basementTop + (hasLowerLevel ? 44 : 0);
  const viewBoxHeight = houseBottom + 66;
  const floorY = (floor: "first" | "second" | "third") => occupiedTop + ((storyCount - FLOOR_NUMBER[floor]) * storyHeight) + (storyHeight / 2);
  const panelY = panelInBasement ? basementTop + 22 : floorY(profile.panelFloor === "basement" ? "first" : profile.panelFloor);
  const destinationY = floorY(profile.destinationFloor);
  const accessY = routeThroughAttic ? 73 : routeThroughBelow ? basementTop + 22 : destinationY;
  const measuredPath = `M${panelX} ${accessY}H${outletX}`;
  const sourceAllowance = `M${panelX} ${panelY}V${accessY}`;
  const destinationAllowance = `M${outletX} ${accessY}V${destinationY}`;
  const measuredMidpoint = (panelX + outletX) / 2;
  const panelBounds: [number, number] = panelInGarage ? [40, garageBoundary - 10] : [42, 478];
  const outletBounds: [number, number] = [42, 478];
  const clamp = (value: number, [minimum, maximum]: [number, number]) => Math.max(minimum, Math.min(maximum, value));
  const updateDrag = (clientX: number) => {
    if (!dragging || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const svgX = ((clientX - bounds.left) / bounds.width) * 520;
    if (dragging === "panel") setPanelX(clamp(svgX, panelBounds));
    else setOutletX(clamp(svgX, outletBounds));
  };
  const handlePointerDown = (target: "panel" | "outlet") => (event: PointerEvent<SVGGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(target);
  };
  const handleKey = (target: "panel" | "outlet") => (event: KeyboardEvent<SVGGElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const direction = event.key === "ArrowLeft" ? -12 : 12;
    if (target === "panel") setPanelX((value) => clamp(value + direction, panelBounds));
    else setOutletX((value) => clamp(value + direction, outletBounds));
  };

  return (
    <svg ref={svgRef} viewBox={`0 0 520 ${viewBoxHeight}`} role="group" aria-label="Interactive diagram of the selected home and dedicated circuit route" className="h-auto w-full select-none" onPointerMove={(event) => updateDrag(event.clientX)} onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}>
      <rect x="22" y="55" width="476" height={houseBottom - 55} rx="14" fill="#FFFEFC" stroke="#B6C2CC" strokeWidth="2" />
      <path d="M22 55L260 12L498 55" fill="#FFFEFC" stroke="#0D2B4D" strokeWidth="4" strokeLinejoin="round" />
      {profile.hasAttic ? <><path d="M47 61H473V84H47Z" fill="#EAF8F2" /><text x="260" y="76" textAnchor="middle" fill="#23664B" fontSize="11" fontWeight="700">ACCESSIBLE ATTIC</text></> : null}
      {Array.from({ length: storyCount - 1 }, (_, index) => <path key={index} d={`M22 ${occupiedTop + ((index + 1) * storyHeight)}H498`} stroke="#A9B3BC" strokeWidth="2" />)}
      {hasLowerLevel ? <path d={`M22 ${basementTop}H498`} stroke="#A9B3BC" strokeWidth="2" /> : null}
      {Array.from({ length: storyCount }, (_, index) => <text key={index} x="487" y={floorY((["first", "second", "third"] as const)[index]) + 4} textAnchor="end" fill="#94A3B8" fontSize="9" fontWeight="700">{(["1ST", "2ND", "3RD"] as const)[index]}</text>)}
      {hasLowerLevel ? <><rect x="35" y={basementTop + 6} width="450" height="32" rx="7" fill={routeThroughBelow ? "#EAF8F2" : "#F8FAFC"} /><text x="260" y={basementTop + 27} textAnchor="middle" fill={routeThroughBelow ? "#23664B" : "#64748B"} fontSize="11" fontWeight="700">{profile.basementCeiling ? `${profile.basementCeiling === "drop" ? "DROP-CEILING" : profile.basementCeiling.toUpperCase()} BASEMENT` : "CRAWL SPACE"}{profile.basementCeiling && profile.hasCrawlSpace ? " + CRAWL SPACE" : ""}</text></> : null}
      {profile.hasGarage ? <><path d={`M${garageBoundary} ${floorY("first") - storyHeight / 2}V${floorY("first") + storyHeight / 2}`} stroke="#A9B3BC" strokeWidth="2" /><text x={garageCenter} y={floorY("first") + 21} textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">{profile.garageSize === "three" ? "3-CAR" : profile.garageSize === "two" ? "2-CAR" : "1-CAR"} GARAGE</text>{panelInGarage ? <text x={garageCenter} y={floorY("first") - 15} textAnchor="middle" fill="#23664B" fontSize="9" fontWeight="700">{garageAllowance} FT INCLUDED</text> : null}</> : null}
      <path d={sourceAllowance} fill="none" stroke="#94A3B8" strokeWidth="4" strokeDasharray="7 7" strokeLinecap="round" />
      <path d={destinationAllowance} fill="none" stroke="#94A3B8" strokeWidth="4" strokeDasharray="7 7" strokeLinecap="round" />
      <path d={measuredPath} fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" />
      <path d={measuredPath} fill="none" stroke={surface ? "#6B7280" : "#1688F8"} strokeWidth={surface ? 8 : 6} strokeDasharray={surface ? undefined : "12 8"} strokeLinecap="round" strokeLinejoin="round" />
      <g transform={`translate(${panelX} ${panelY})`} role="slider" tabIndex={0} aria-label="Panel horizontal position" aria-orientation="horizontal" aria-valuemin={panelBounds[0]} aria-valuemax={panelBounds[1]} aria-valuenow={Math.round(panelX)} onPointerDown={handlePointerDown("panel")} onKeyDown={handleKey("panel")} style={{ cursor: "ew-resize", touchAction: "none" }}>
        <circle r="32" fill="transparent" /><rect x="-19" y="-28" width="38" height="56" rx="3" fill="#FFF" stroke={dragging === "panel" ? "#1688F8" : "#0D2B4D"} strokeWidth="2.5" /><path d="M-12-17H12M-12-6H12M-12 5H12M-12 16H12" stroke="#1688F8" strokeWidth="2" /><path d="M-29 0h7m-4-4-4 4 4 4M29 0h-7m4-4 4 4-4 4" fill="none" stroke="#1688F8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform={`translate(${outletX} ${destinationY})`} role="slider" tabIndex={0} aria-label="Outlet horizontal position" aria-orientation="horizontal" aria-valuemin={outletBounds[0]} aria-valuemax={outletBounds[1]} aria-valuenow={Math.round(outletX)} onPointerDown={handlePointerDown("outlet")} onKeyDown={handleKey("outlet")} style={{ cursor: "ew-resize", touchAction: "none" }}>
        <circle r="31" fill="transparent" /><rect x="-15" y="-23" width="30" height="46" rx="3" fill="#FFF" stroke={dragging === "outlet" ? "#1688F8" : "#0D2B4D"} strokeWidth="2.5" /><circle cy="-8" r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" /><circle cy="9" r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" /><path d="M-25 0h6m-3-3-3 3 3 3M25 0h-6m3-3 3 3-3 3" fill="none" stroke="#1688F8" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <text x={panelX} y={panelY + 39} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{panelInGarage ? "EXTERIOR PANEL" : panelInBasement ? "BASEMENT PANEL" : "PANEL"}</text>
      <text x={outletX} y={destinationY - 31} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">NEW OUTLET</text>
      <text x={measuredMidpoint} y={routeThroughAttic ? accessY + 20 : accessY - 9} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{panelInGarage ? "MEASURE BEYOND GARAGE" : "MEASURE ACROSS"}</text>
      <text x="260" y={houseBottom + 18} textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">DRAG THE PANEL AND OUTLET LEFT OR RIGHT</text>
      <rect x="170" y={houseBottom + 29} width="180" height="25" rx="12" fill={surface ? "#F1F5F9" : "#EAF5FF"} />
      <text x="260" y={houseBottom + 46} textAnchor="middle" fill="#0D2B4D" fontSize="11" fontWeight="700">{surface ? "GARAGE CONDUIT · REVIEW" : dedicatedHomeProfileRouteAccess(profile) === "accessible" ? "OPEN-ACCESS ROUTE" : "FINISHED CONCEALED ROUTE"}</text>
    </svg>
  );
}

export default function DedicatedCircuitDistanceModel({ profile, feet, onFeetChange, exterior, onExteriorChange }: Props) {
  const garageAllowance = dedicatedGarageAllowanceFeet(profile);
  const verticalPlan = dedicatedVerticalRoutePlan(profile);
  const measuredBeyondGarage = feet === "" ? "" : String(Math.max(0, Number(feet) - garageAllowance));
  const updateMeasuredDistance = (value: string) => {
    if (value === "") return onFeetChange("");
    const measured = Number(value);
    onFeetChange(Number.isFinite(measured) ? String(measured + garageAllowance) : "");
  };
  return (
    <div className="mt-5 rounded-[1.25rem] border border-sky-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-electric text-sm font-bold text-white" aria-hidden="true">⌂</span>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Your home and wire path</p>
      </div>
      <div className="mx-auto mt-3 max-w-2xl rounded-xl bg-sky-50/50 p-2"><HouseDiagram profile={profile} /></div>
      <div className="mx-auto mt-3 flex max-w-2xl flex-wrap justify-center gap-x-5 gap-y-2 text-xs font-semibold text-navy">
        <span className="flex items-center gap-2"><span className="w-8 border-t-[3px] border-dashed border-electric" />You measure this blue section</span>
        <span className="flex items-center gap-2"><span className="w-8 border-t-[3px] border-dashed border-slate-400" />Included automatically</span>
      </div>
      <p className="mx-auto mt-2 max-w-2xl text-center text-xs leading-5 text-slate">Drag the panel and outlet to match their left-to-right positions. The route redraws to show exactly which horizontal section to measure.</p>
      <div className="mx-auto mt-4 max-w-xl">
        {verticalPlan.cableFeet ? <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-navy">
          <p className="font-bold">Basement-to-attic route included automatically</p>
          <p>{verticalPlan.cableFeet} ft of vertical wire · {verticalPlan.platePenetrations} plate penetrations · {verticalPlan.drywallAccessOpenings} finished-wall access opening{verticalPlan.drywallAccessOpenings === 1 ? "" : "s"}</p>
        </div> : null}
        <label className="text-sm font-semibold text-navy">
          {garageAllowance ? "About how far is it from the far side of the garage to the new outlet?" : "About how far is it from the panel area to the new outlet?"}
          <input type="number" min={garageAllowance ? "0" : "1"} max={String(200 - garageAllowance)} step="0.1" inputMode="decimal" value={measuredBeyondGarage} onChange={(event) => updateMeasuredDistance(event.target.value)} className="mt-2 w-full rounded-card border border-cardline bg-white px-4 py-3 text-base font-normal text-navy focus:border-electric" placeholder={garageAllowance ? "e.g. 20" : "e.g. 35"} />
        </label>
        <p className="mt-2 text-xs leading-5 text-slate">{garageAllowance ? `We already included ${garageAllowance} feet for the garage from the exterior panel. Enter only the remaining distance beyond the garage. ` : "Measure across the home following the route shown. "}{verticalPlan.cableFeet ? "The basement-to-attic riser, drilling, access openings, and final outlet drop are included by the formula." : "Don’t include the up-and-down wire at the panel or outlet—we include both ends automatically."}</p>

        <fieldset className="mt-5 rounded-xl border border-cardline bg-warmwhite p-4">
          <legend className="px-1 text-base font-bold text-navy">Will the new outlet be on an exterior-facing wall?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {([['no', 'No'], ['yes', 'Yes'], ['unsure', "I’m not sure"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={exterior === value} onClick={() => onExteriorChange(value)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${exterior === value ? "border-electric bg-sky-50 text-electric ring-1 ring-electric" : "border-cardline bg-white text-navy"}`}>{label}</button>)}
          </div>
          {exterior === "yes" || exterior === "unsure" ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-navy">{EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT}</p> : null}
        </fieldset>
      </div>
    </div>
  );
}
