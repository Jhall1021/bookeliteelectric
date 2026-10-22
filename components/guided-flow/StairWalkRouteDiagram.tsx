"use client";

import { useState, useRef, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";

import { stairWalkDiagramModel } from "@/lib/electrical/stairWalkDiagram";
import { stairWalkRouteCopy, type SwAnswers, type SwMode, type SwRouteKind } from "@/lib/electrical/stairWalk";

type RouteMarker = "panel" | "outlet";
type Props = {
  answers: SwAnswers;
  mode?: SwMode;
  interactive?: boolean;
  onPositionChange?: (target: RouteMarker, value: number) => void;
};

const LIVING_TOP = 104;
const LIVING_BOTTOM = 260;
const BASEMENT_Y = 282;
const POSITION_BOUNDS = { minimum: 78, maximum: 562 } as const;
const clampPosition = (value: number) => Math.max(POSITION_BOUNDS.minimum, Math.min(POSITION_BOUNDS.maximum, value));
const savedPosition = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clampPosition(parsed) : fallback;
};

function DestinationDevice({ x, y, kind }: { x: number; y: number; kind: SwRouteKind }) {
  return (
    <g aria-hidden="true">
      <rect x={x - 15} y={y - 23} width="30" height="46" rx="3" fill="#FFFFFF" stroke="#0D2B4D" strokeWidth="2.5" />
      {kind === "coax" ? (
        <>
          <circle cx={x} cy={y} r="8" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.8" />
          <circle cx={x} cy={y} r="3.25" fill="#FFFFFF" stroke="#1688F8" strokeWidth="1.8" />
          <circle cx={x} cy={y} r="1.1" fill="#0D2B4D" />
        </>
      ) : kind === "ethernet" ? (
        <>
          <rect x={x - 9} y={y - 8} width="18" height="16" rx="2" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.8" />
          <path d={`M${x - 6} ${y - 3}H${x + 6}V${y + 4}H${x + 3}V${y + 7}H${x - 3}V${y + 4}H${x - 6}Z`} fill="#FFFFFF" stroke="#1688F8" strokeWidth="1.3" strokeLinejoin="round" />
          <path d={`M${x - 4} ${y - 1}V${y + 2}M${x - 1.3} ${y - 1}V${y + 2}M${x + 1.3} ${y - 1}V${y + 2}M${x + 4} ${y - 1}V${y + 2}`} stroke="#0D2B4D" strokeWidth="0.8" />
        </>
      ) : (
        <>
          <circle cx={x} cy={y - 8} r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" />
          <circle cx={x} cy={y + 9} r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" />
        </>
      )}
    </g>
  );
}

export default function StairWalkRouteDiagram({ answers, mode = {}, interactive = false, onPositionChange }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState<RouteMarker | null>(null);
  const model = stairWalkDiagramModel(answers, mode);
  const copy = stairWalkRouteCopy(mode);
  const firstLivingLevel = model.basementLevelZero ? 1 : 0;
  const livingLevels = Math.max(1, model.highestLevel - firstLivingLevel + 1);
  const livingHeight = (LIVING_BOTTOM - LIVING_TOP) / livingLevels;
  const levelY = (level: number) => {
    if (model.basementLevelZero && level === 0) return BASEMENT_Y;
    const livingIndex = Math.max(0, level - firstLivingLevel);
    return LIVING_BOTTOM - livingHeight * (livingIndex + 0.5);
  };
  const panelX = savedPosition(answers.panelPosition, model.splitFoyerBetween ? 350 : 102);
  const outletX = savedPosition(answers.outletPosition, 538);
  const panelY = model.splitFoyerBetween ? 265 : levelY(model.panelLevel);
  const outletY = model.splitFoyerBetween ? 150 : levelY(model.outletLevel);
  const routeY = model.plane === "attic"
    ? 76
    : model.plane === "below"
      ? model.splitFoyerBetween ? 205 : model.basementLevelZero ? 265 : 282
      : model.plane === "garage"
        ? panelY
        : panelY === outletY ? panelY : Math.max(LIVING_TOP + 10, Math.min(panelY, outletY) - 14);
  const floorLines = Array.from({ length: Math.max(0, livingLevels - 1) }, (_, index) => LIVING_TOP + livingHeight * (index + 1));
  const routeStart = Math.min(panelX, outletX);
  const routeEnd = Math.max(panelX, outletX);
  const routeWidth = routeEnd - routeStart;
  const partialWidth = model.partialOpen ? routeWidth * model.partialOpen.ratio : 0;
  const partialX = !model.partialOpen || model.partialOpen.position === "panel"
    ? panelX <= outletX ? panelX : panelX - partialWidth
    : model.partialOpen.position === "outlet"
      ? outletX >= panelX ? outletX - partialWidth : outletX
      : routeStart + ((routeWidth - partialWidth) / 2);
  const panelLabelY = panelY > 230 ? panelY - 36 : panelY + 42;
  const measurementTop = model.plane === "attic" ? routeY + 9 : routeY - 25;
  const measuredMidpoint = (panelX + outletX) / 2;
  const fullFlights = Number(answers.fullFlights ?? 0) || 0;
  const halfFlights = Number(answers.halfFlights ?? 0) || 0;
  const hasStairs = fullFlights + halfFlights > 0 && panelY !== outletY;
  const stairTop = Math.min(panelY, outletY);
  const stairBottom = Math.max(panelY, outletY);
  const stairStepHeight = (stairBottom - stairTop) / 6;
  const stairPath = Array.from({ length: 6 }, (_, index) => `h10v-${stairStepHeight}`).join("");
  const stairLabel = [
    fullFlights ? `${fullFlights} full` : null,
    halfFlights ? `${halfFlights} half-flight${halfFlights === 1 ? "" : "s"}` : null,
  ].filter(Boolean).join(" · ");
  const moveMarker = (target: RouteMarker, clientX: number) => {
    if (!interactive || !onPositionChange || !svgRef.current) return;
    const bounds = svgRef.current.getBoundingClientRect();
    const next = ((clientX - bounds.left) / bounds.width) * 640;
    onPositionChange(target, Math.round(clampPosition(next)));
  };
  const pointerDown = (target: RouteMarker) => (event: ReactPointerEvent<SVGGElement>) => {
    if (!interactive) return;
    event.preventDefault();
    setDragging(target);
    moveMarker(target, event.clientX);
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* Pointer capture is optional. */ }
  };
  const pointerMove = (target: RouteMarker) => (event: ReactPointerEvent<SVGGElement>) => {
    if (dragging === target) moveMarker(target, event.clientX);
  };
  const pointerDone = () => setDragging(null);
  const keyDown = (target: RouteMarker) => (event: KeyboardEvent<SVGGElement>) => {
    if (!interactive || (event.key !== "ArrowLeft" && event.key !== "ArrowRight")) return;
    event.preventDefault();
    const current = target === "panel" ? panelX : outletX;
    onPositionChange?.(target, clampPosition(current + (event.key === "ArrowLeft" ? -12 : 12)));
  };

  return (
    <figure className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">Your {mode.routeKind === "ethernet" || mode.routeKind === "coax" ? "cable" : "wire"} path</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate">Schematic · not to scale</p>
      </div>
      <svg ref={svgRef} viewBox="0 0 640 340" role={interactive ? "group" : "img"} aria-label={interactive ? `${model.description} Move the panel and destination left or right to match their positions.` : model.description} className={`h-auto w-full bg-[#fbfdfc] ${interactive ? "select-none touch-none" : ""}`}>
        <path d="M42 74 320 24 598 74" fill="#fffefc" stroke="#0D2B4D" strokeWidth="4" strokeLinejoin="round" />
        <rect x="42" y="74" width="556" height="226" rx="12" fill="#fffefc" stroke="#B6C2CC" strokeWidth="2" />

        {model.plane === "attic" ? (
          <>
            <path d="M64 73 320 34 576 73Z" fill="#EAF8F2" />
            <text x="320" y="62" textAnchor="middle" fill="#23664B" fontSize="11" fontWeight="700">ACCESSIBLE ATTIC</text>
          </>
        ) : null}

        {model.splitFoyerBetween ? (
          <>
            <rect x="54" y="176" width="250" height="84" rx="7" fill="#F8FAFC" />
            <text x="176" y="222" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">ENTRANCE / FOYER</text>
            <rect x="304" y="104" width="282" height="101" rx="7" fill="#F8FAFC" />
            <text x="445" y="124" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">MIDDLE LEVEL</text>
            <path d="M250 218h20l34-55h20" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M250 231h20l34 34h20" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <text x="258" y="208" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="700">6 UP</text>
            <text x="264" y="254" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="700">6 DOWN</text>
          </>
        ) : (
          <>
            <rect x="54" y={LIVING_TOP} width="532" height={LIVING_BOTTOM - LIVING_TOP} rx="7" fill="#F8FAFC" />
            {floorLines.map((y) => <path key={y} d={`M54 ${y}H586`} stroke="#CBD5E1" strokeWidth="2" />)}
            {hasStairs ? (
              <g aria-hidden="true">
                <path d={`M270 ${stairBottom}${stairPath}`} fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <rect x="250" y={(stairTop + stairBottom) / 2 - 12} width="100" height="24" rx="12" fill="#FFFFFF" stroke="#CBD5E1" />
                <text x="300" y={(stairTop + stairBottom) / 2 + 4} textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="700">{stairLabel.toUpperCase()}</text>
              </g>
            ) : null}
          </>
        )}

        {model.splitFoyerBetween ? (
          <>
            <path d="M304 205H598" stroke="#94A3B8" strokeWidth="2" />
            <rect x="316" y="211" width="270" height="82" rx="6" fill={model.plane === "below" ? "#EAF8F2" : "#F1F5F9"} />
            <text x="451" y="284" textAnchor="middle" fill={model.plane === "below" ? "#23664B" : "#64748B"} fontSize="10" fontWeight="700">BASEMENT UNDER MIDDLE LEVEL</text>
          </>
        ) : model.basementLevelZero ? (
          <>
            <path d="M42 260H598" stroke="#94A3B8" strokeWidth="2" />
            <rect x="54" y="266" width="532" height="27" rx="6" fill={model.plane === "below" ? "#EAF8F2" : "#F1F5F9"} />
            <text x="320" y="284" textAnchor="middle" fill={model.plane === "below" ? "#23664B" : "#64748B"} fontSize="10" fontWeight="700">BASEMENT</text>
          </>
        ) : model.plane === "below" ? (
          <>
            <rect x="54" y="266" width="532" height="27" rx="6" fill="#EAF8F2" />
            <text x="320" y="284" textAnchor="middle" fill="#23664B" fontSize="10" fontWeight="700">BASEMENT / CRAWLSPACE BELOW</text>
          </>
        ) : null}

        {model.partialOpen ? (
          <rect x={partialX} y={routeY - 13} width={partialWidth} height="26" rx="8" fill="#BBF7D0" opacity="0.8" />
        ) : null}

        <path d={`M${panelX} ${panelY}V${routeY}`} fill="none" stroke="#94A3B8" strokeWidth="5" strokeDasharray="8 7" strokeLinecap="round" />
        <path d={`M${outletX} ${routeY}V${outletY}`} fill="none" stroke="#94A3B8" strokeWidth="5" strokeDasharray="8 7" strokeLinecap="round" />
        <path d={`M${panelX} ${routeY}H${outletX}`} fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
        <path d={`M${panelX} ${routeY}H${outletX}`} fill="none" stroke="#1688F8" strokeWidth="6" strokeLinecap="round" />

        <g transform={`translate(${panelX} ${panelY})`} role={interactive ? "slider" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? "Panel horizontal position" : undefined} aria-orientation={interactive ? "horizontal" : undefined} aria-valuemin={interactive ? POSITION_BOUNDS.minimum : undefined} aria-valuemax={interactive ? POSITION_BOUNDS.maximum : undefined} aria-valuenow={interactive ? Math.round(panelX) : undefined} onPointerDown={pointerDown("panel")} onPointerMove={pointerMove("panel")} onPointerUp={pointerDone} onPointerCancel={pointerDone} onKeyDown={keyDown("panel")} style={interactive ? { cursor: "ew-resize", touchAction: "none" } : undefined}>
          {interactive ? <circle r="34" fill="transparent" /> : null}
          <rect x="-19" y="-28" width="38" height="56" rx="3" fill="#FFFFFF" stroke={dragging === "panel" ? "#1688F8" : "#0D2B4D"} strokeWidth="2.5" />
          <path d="M-12-17H12M-12-6H12M-12 5H12M-12 16H12" stroke="#1688F8" strokeWidth="2" />
          {interactive ? <path d="M-30 0h8m-4-4-4 4 4 4M30 0h-8m4-4 4 4-4 4" fill="none" stroke="#1688F8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </g>
        <text x={panelX} y={panelLabelY} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{model.panelLabel.toUpperCase()}</text>

        <g role={interactive ? "slider" : undefined} tabIndex={interactive ? 0 : undefined} aria-label={interactive ? `${copy.target} horizontal position` : undefined} aria-orientation={interactive ? "horizontal" : undefined} aria-valuemin={interactive ? POSITION_BOUNDS.minimum : undefined} aria-valuemax={interactive ? POSITION_BOUNDS.maximum : undefined} aria-valuenow={interactive ? Math.round(outletX) : undefined} onPointerDown={pointerDown("outlet")} onPointerMove={pointerMove("outlet")} onPointerUp={pointerDone} onPointerCancel={pointerDone} onKeyDown={keyDown("outlet")} style={interactive ? { cursor: "ew-resize", touchAction: "none" } : undefined}>
          {interactive ? <circle cx={outletX} cy={outletY} r="34" fill="transparent" /> : null}
          <DestinationDevice x={outletX} y={outletY} kind={mode.routeKind ?? "dedicated"} />
          {interactive ? <path d={`M${outletX - 30} ${outletY}h8m-4-4-4 4 4 4M${outletX + 30} ${outletY}h-8m4-4 4 4-4 4`} fill="none" stroke="#1688F8" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /> : null}
        </g>
        <text x={outletX} y={outletY - 32} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{model.outletLabel.toUpperCase()}</text>

        <rect x={measuredMidpoint - 94} y={measurementTop} width="188" height="20" rx="10" fill="#FFFFFF" stroke="#BFDBFE" />
        <text x={measuredMidpoint} y={measurementTop + 14} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{interactive ? "MEASURE THIS BLUE SECTION" : model.measurementLabel.toUpperCase()}</text>

        <rect x="215" y="308" width="210" height="23" rx="11" fill="#EAF8F2" />
        <text x="320" y="324" textAnchor="middle" fill="#23664B" fontSize="10" fontWeight="700">{model.routeLabel.toUpperCase()}</text>
      </svg>
      <div className="grid gap-2 border-t border-emerald-100 px-3 py-3 text-[11px] font-semibold text-navy sm:grid-cols-2">
        <span className="flex items-center gap-2"><span className="w-8 border-t-[4px] border-electric" />Your measured {copy.cable} route</span>
        <span className="flex items-center gap-2"><span className="w-8 border-t-[4px] border-dashed border-slate-400" />Included automatically</span>
      </div>
      {interactive ? <p className="border-t border-emerald-100 bg-sky-50 px-3 py-3 text-center text-xs font-semibold leading-5 text-navy">Drag the two markers left or right. {answers.outletOverBasement === "over" ? `The ${copy.target} is already placed directly above the basement.` : "Their height is already set from the stairs you counted."}</p> : null}
      <figcaption className="border-t border-emerald-100 px-3 py-2 text-[11px] leading-5 text-slate">Based on your answers. Your electrician will confirm the exact path before starting.</figcaption>
    </figure>
  );
}
