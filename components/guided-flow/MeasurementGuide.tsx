"use client";

import { useEffect, useState, type ReactNode, type SVGProps } from "react";

import type { AccessClass } from "@/lib/accessSlots";
import { measurementCanCrossDoorway } from "@/lib/electrical/doorwayRouting";
import { EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT } from "@/lib/electrical/exteriorWallContingency";
import type { RouteAccess } from "@/lib/electrical/mixedRouteSections";

type MeasurementKind =
  | "existing-switch-to-light"
  | "existing-fixture-to-light"
  | "power-to-new-switch"
  | "new-switch-to-light"
  | "outlet-to-tv-outlet"
  | "outlet-to-outlet"
  | "coax-route"
  | "accessible-route";

type LightKind = "ceiling" | "wall" | "recessed" | "fan";
type RouteSection = { id: number; feet: string; access: RouteAccess; doorways: number };
type RouteExterior = "" | "no" | "yes" | "unsure";
type RouteWizardStep = "access" | "feet" | "more";

const KIND_BY_QUESTION_KEY: Record<string, MeasurementKind> = {
  extension_existing_switch_feet: "existing-switch-to-light",
  extension_existing_fixture_feet: "existing-fixture-to-light",
  extension_power_to_switch_feet: "power-to-new-switch",
  extension_switch_to_fixture_feet: "new-switch-to-light",
  tv_outlet_run_distance: "outlet-to-tv-outlet",
  accessible_route_feet: "accessible-route",
  dedicated_distance: "accessible-route",
  ext_gfci_distance: "outlet-to-outlet",
  concealed_route_feet: "outlet-to-outlet",
  fan_finished_route_feet: "outlet-to-outlet",
  surface_route_feet: "outlet-to-outlet",
  doorbell_route_feet: "outlet-to-outlet",
  "new-ethernet-line_distance": "outlet-to-outlet",
  "new-coax-line_distance": "coax-route",
  "new-ethernet-line_exposed_route_feet": "outlet-to-outlet",
  "new-coax-line_exposed_route_feet": "coax-route",
};

const NAVY = "#0D2B4D";
const BLUE = "#1688F8";
const PALE_BLUE = "#DCEFFF";
const ROOM_LINE = "#A9B3BC";
const DOOR_ROUTE_Y = 67;

function Drawing({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg viewBox="0 0 600 270" fill="none" aria-hidden="true" className="h-auto w-full" {...props}>
      <defs>
        <marker id="route-arrow" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L11 6L1 11Z" fill={BLUE} />
        </marker>
        <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
          <stop stopColor="#EDF8FF" />
          <stop offset="1" stopColor="#B9DFFF" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="596" height="266" rx="20" fill="#FFFEFC" />
      <path d="M18 35H582M70 35V221M530 35V221M18 221H582" stroke={ROOM_LINE} strokeWidth="2" />
      <path d="M70 204H530M70 212H530" stroke="#BBC4CB" strokeWidth="2" />
      <path d="M18 35L70 64V221L18 246V35ZM582 35L530 64V221L582 246V35Z" stroke={ROOM_LINE} strokeWidth="2" />
      <path d="M29 64L55 79V210L29 225M571 71L546 83V194L571 208" stroke="#C1C9CF" strokeWidth="2" />
      <path d="M551 88H570V188H551ZM555 94H570M555 181H570" stroke="#C1C9CF" strokeWidth="2" />
      {children}
    </svg>
  );
}

function AccessibleRouteDrawing({ endpoint }: { endpoint: "outlet" | "fan" | "panel-outlet" | "coax" }) {
  const endpointIsFan = endpoint === "fan";
  const sourceIsPanel = endpoint === "panel-outlet";
  const endpointIsCoax = endpoint === "coax";
  const sourceX = endpointIsFan ? 115 : 130;
  const sourceY = endpointIsFan ? 200 : sourceIsPanel ? 205 : 226;
  const targetX = endpointIsFan ? 300 : 470;
  const targetY = endpointIsFan ? 153 : 226;

  return (
    <svg viewBox="0 0 600 300" fill="none" aria-hidden="true" className="h-auto w-full">
      <defs>
        <marker id="accessible-route-arrow" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L11 6L1 11Z" fill={BLUE} />
        </marker>
        <pattern id="accessible-space-hatch" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(35)">
          <line x1="0" y1="0" x2="0" y2="12" stroke="#DCEFFF" strokeWidth="5" />
        </pattern>
      </defs>

      <rect x="2" y="2" width="596" height="296" rx="20" fill="#FFFEFC" />
      <path d="M45 112L300 28L555 112" stroke={ROOM_LINE} strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M67 112H533V264H67Z" stroke={ROOM_LINE} strokeWidth="2.5" />
      <path d="M67 112H533V153H67Z" fill="url(#accessible-space-hatch)" stroke="#B9DFFF" strokeWidth="2" />
      <path d="M112 264V153M488 264V153" stroke="#C2CBD3" strokeWidth="2" />

      <path d={`M${sourceX} ${sourceY}V133`} stroke="#9AA7B2" strokeWidth="4" strokeDasharray="7 7" strokeLinecap="round" />
      <path
        d={`M${targetX} 133V${targetY}`}
        stroke="#9AA7B2"
        strokeWidth="4"
        strokeDasharray="7 7"
        strokeLinecap="round"
      />
      <path d={`M${sourceX} 133H${targetX}`} stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" />
      <path
        d={`M${sourceX} 133H${targetX}`}
        stroke={BLUE}
        strokeWidth="5"
        strokeDasharray="11 8"
        strokeLinecap="round"
        markerStart="url(#accessible-route-arrow)"
        markerEnd="url(#accessible-route-arrow)"
      />

      <rect x="218" y="73" width="164" height="32" rx="16" fill="#EAF5FF" />
      <text x="300" y="94" textAnchor="middle" fill={NAVY} fontSize="14" fontWeight="700">
        OPEN ACCESSIBLE SPACE
      </text>

      {endpointIsFan ? <Switch x={sourceX} y={sourceY} /> : sourceIsPanel ? <ElectricalPanel x={sourceX} y={sourceY} /> : endpointIsCoax ? <Router x={sourceX} y={sourceY} /> : <Outlet x={sourceX} y={sourceY} />}
      {endpointIsFan ? <CeilingFan x={targetX} y={targetY} /> : endpointIsCoax ? <CoaxWallPlate x={targetX} y={targetY} /> : <Outlet x={targetX} y={targetY} />}
    </svg>
  );
}

function CeilingFanFinishedRouteDrawing({ method }: { method: "concealed" | "surface" }) {
  const concealed = method === "concealed";
  const sourceX = 115;
  const sourceY = 218;
  const fanX = 300;
  const ceilingY = 75;
  const route = `M${sourceX} ${sourceY}V${ceilingY}H${fanX}`;

  return (
    <svg viewBox="0 0 600 300" fill="none" aria-hidden="true" className="h-auto w-full">
      <defs>
        <marker id={`fan-${method}-route-arrow`} viewBox="0 0 12 12" refX="6" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L11 6L1 11Z" fill={BLUE} />
        </marker>
      </defs>
      <rect x="2" y="2" width="596" height="296" rx="20" fill="#FFFEFC" />
      <path d="M45 75H555M67 75V264H533V75" stroke={ROOM_LINE} strokeWidth="2.5" />
      <path d="M112 264V75M488 264V75" stroke="#C2CBD3" strokeWidth="2" />
      <path d="M67 247H533M67 255H533" stroke="#BBC4CB" strokeWidth="2" />

      {concealed ? (
        <>
          <rect x="91" y="63" width="48" height="24" rx="3" fill="#F7E5CE" stroke="#B89367" strokeWidth="1.5" />
          <path d="M98 68L132 82M98 82L132 68" stroke="#C9A77D" strokeWidth="1" />
          <rect x="276" y="63" width="48" height="24" rx="3" fill="#F7E5CE" stroke="#B89367" strokeWidth="1.5" />
          <path d="M283 68L317 82M283 82L317 68" stroke="#C9A77D" strokeWidth="1" />
          <path d={route} stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
          <path d={route} stroke={BLUE} strokeWidth="5" strokeDasharray="11 8" strokeLinecap="round" strokeLinejoin="round" markerStart="url(#fan-concealed-route-arrow)" markerEnd="url(#fan-concealed-route-arrow)" />
          <rect x="197" y="20" width="206" height="32" rx="16" fill="#EAF5FF" />
          <text x="300" y="41" textAnchor="middle" fill={NAVY} fontSize="14" fontWeight="700">HIDDEN ABOVE THE DRYWALL</text>
        </>
      ) : (
        <>
          <path d={route} stroke="#FFFFFF" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" />
          <path d={route} stroke="#C6CDD3" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
          <path d={route} stroke="#F8FAFC" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path d={route} stroke={BLUE} strokeWidth="3.5" strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" markerStart="url(#fan-surface-route-arrow)" markerEnd="url(#fan-surface-route-arrow)" />
          <rect x="203" y="20" width="194" height="32" rx="16" fill="#EAF5FF" />
          <text x="300" y="41" textAnchor="middle" fill={NAVY} fontSize="14" fontWeight="700">VISIBLE SURFACE RACEWAY</text>
        </>
      )}

      <Switch x={sourceX} y={sourceY} />
      <CeilingFan x={fanX} y={75} />
    </svg>
  );
}

function PlateScrew({ y }: { y: number }) {
  return (
    <g transform={`translate(0 ${y})`}>
      <circle r="2.5" fill="#FFFFFF" stroke={NAVY} strokeWidth="1.3" />
      <path d="M-1.5-1.5L1.5 1.5" stroke={NAVY} strokeWidth="1" />
    </g>
  );
}

function Outlet({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-17" y="-31" width="34" height="62" rx="2.5" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.3" />
      <path d="M-13-27L-10-24H10L13-27M-13 27L-10 24H10L13 27" stroke="#B8C6D0" strokeWidth="1.2" />
      <PlateScrew y={-25} />
      <PlateScrew y={25} />
      {[-10, 10].map((offset) => (
        <g key={offset} transform={`translate(0 ${offset})`}>
          <rect x="-8" y="-8" width="16" height="16" rx="4" fill="#FBFDFF" stroke={NAVY} strokeWidth="1.4" />
          <path d="M-4-4V1M4-4V1" stroke={NAVY} strokeWidth="2" strokeLinecap="round" />
          <path d="M-2 5C-2 3.5-1 3 0 3C1 3 2 3.5 2 5" stroke={NAVY} strokeWidth="1.5" strokeLinecap="round" />
        </g>
      ))}
    </g>
  );
}

function ElectricalPanel({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-25" y="-43" width="50" height="86" rx="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.5" />
      <rect x="-18" y="-34" width="36" height="68" rx="2" fill="#F7FBFF" stroke="#9FB2C2" strokeWidth="1.5" />
      {[-23, -8, 7, 22].map((offset) => (
        <g key={offset} transform={`translate(0 ${offset})`}>
          <rect x="-12" y="-5" width="10" height="10" rx="2" fill={PALE_BLUE} stroke={NAVY} strokeWidth="1.2" />
          <rect x="2" y="-5" width="10" height="10" rx="2" fill={PALE_BLUE} stroke={NAVY} strokeWidth="1.2" />
        </g>
      ))}
    </g>
  );
}

function Router({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-30" y="-19" width="60" height="38" rx="7" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.4" />
      <path d="M-18-19V-42M18-19V-42" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
      <path d="M-24 5H24" stroke="#B8C6D0" strokeWidth="1.5" />
      {[-15, -5, 5, 15].map((offset) => <circle key={offset} cx={offset} cy="11" r="2" fill={offset === 15 ? BLUE : PALE_BLUE} stroke={NAVY} strokeWidth="1" />)}
      <path d="M-11-31C-4-38 4-38 11-31M-6-26C-2-30 2-30 6-26" stroke={BLUE} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

function CoaxWallPlate({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-17" y="-31" width="34" height="62" rx="2.5" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.3" />
      <path d="M-13-27L-10-24H10L13-27M-13 27L-10 24H10L13 27" stroke="#B8C6D0" strokeWidth="1.2" />
      <PlateScrew y={-24} />
      <PlateScrew y={24} />
      <circle r="8" fill={PALE_BLUE} stroke={NAVY} strokeWidth="2" />
      <circle r="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="1.5" />
    </g>
  );
}

function DataWallPlate({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-19" y="-33" width="38" height="66" rx="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.3" />
      <PlateScrew y={-26} />
      <PlateScrew y={26} />
      <rect x="-10" y="-13" width="20" height="15" rx="2" fill={PALE_BLUE} stroke={NAVY} strokeWidth="1.8" />
      <path d="M-6-8H6M-5-4H5" stroke={NAVY} strokeWidth="1.4" strokeLinecap="round" />
      <circle cy="14" r="7" fill={PALE_BLUE} stroke={NAVY} strokeWidth="1.8" />
      <circle cy="14" r="2.5" fill="#FFFFFF" stroke={NAVY} strokeWidth="1.2" />
    </g>
  );
}

function ServiceRouteAnimation({ serviceSlug, access }: { serviceSlug?: string; access: RouteAccess }) {
  const [cycle, setCycle] = useState(0);
  const [openSpace, setOpenSpace] = useState<"attic" | "below">("attic");
  const dedicated = serviceSlug === "dedicated-120v-circuit-outlet";
  const accessible = access === "accessible";
  const sourceLabel = dedicated ? "ELECTRICAL PANEL" : "ROUTER / CABLE SPLITTER";
  const targetLabel = dedicated ? "DEDICATED OUTLET" : "CABLE / ETHERNET WALL PLATE";
  const below = accessible && openSpace === "below";
  const sourceY = below ? 168 : 286;
  const targetY = below ? 168 : 272;
  const route = below
    ? "M128 168H158V292H618V201"
    : accessible
      ? "M128 286H158V132H618V239"
      : "M128 286H158V190H618V239";
  const stepOne = below ? "1 · DOWN" : "1 · UP";
  const stepThree = below ? "3 · UP" : "3 · DOWN";

  return (
    <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/60 px-3 pb-3 pt-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-bold text-navy">Example: follow the wire’s actual path</p>
          <p className="mt-0.5 text-xs leading-5 text-slate">
            {accessible
              ? `Measure into the open ${below ? "unfinished basement or crawlspace" : "attic"}, across it, then back to the new ${dedicated ? "outlet" : "wall plate"}.`
              : `Measure up, along the line between the floors, then down to the new ${dedicated ? "outlet" : "wall plate"}.`}
          </p>
        </div>
        <button type="button" onClick={() => setCycle((value) => value + 1)} className="shrink-0 rounded-lg border border-sky-200 bg-white px-3 py-2 text-xs font-bold text-electric hover:border-electric">
          ↻ Replay
        </button>
      </div>
      {accessible ? (
        <div className="mt-3 grid grid-cols-2 gap-2" aria-label="Open-space example">
          <button type="button" aria-pressed={!below} onClick={() => { setOpenSpace("attic"); setCycle((value) => value + 1); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${!below ? "border-electric bg-white text-electric ring-1 ring-electric" : "border-cardline bg-white text-navy"}`}>Unfinished attic</button>
          <button type="button" aria-pressed={below} onClick={() => { setOpenSpace("below"); setCycle((value) => value + 1); }} className={`rounded-lg border px-3 py-2 text-xs font-bold ${below ? "border-electric bg-white text-electric ring-1 ring-electric" : "border-cardline bg-white text-navy"}`}>Basement / crawlspace</button>
        </div>
      ) : null}
      <svg key={`${cycle}-${openSpace}-${access}`} viewBox="0 0 720 390" className="mt-2 h-auto w-full" role="img" aria-label={`${dedicated ? "Dedicated circuit" : "Cable or Ethernet"} measurement example from ${sourceLabel.toLowerCase()} to ${targetLabel.toLowerCase()}`}>
        <style>{`
          .service-route-line { stroke-dasharray: 1; stroke-dashoffset: 1; animation: service-route-draw 3.2s ease-in-out forwards; }
          .service-route-step { opacity: 0; animation: service-route-label .35s ease-out forwards; }
          .service-route-step-1 { animation-delay: .65s; }
          .service-route-step-2 { animation-delay: 1.65s; }
          .service-route-step-3 { animation-delay: 2.75s; }
          @keyframes service-route-draw { to { stroke-dashoffset: 0; } }
          @keyframes service-route-label { to { opacity: 1; } }
          @media (prefers-reduced-motion: reduce) { .service-route-line { animation: none; stroke-dashoffset: 0; } .service-route-step { animation: none; opacity: 1; } }
        `}</style>
        <rect x="15" y="66" width="690" height="292" rx="12" fill="#FFFEFC" stroke="#D4DEE6" strokeWidth="2" />
        <path d="M15 66L360 15L705 66" fill="#FFFEFC" stroke={NAVY} strokeWidth="4" strokeLinejoin="round" />
        <path d="M360 15V66" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />

        {accessible && !below ? (
          <>
            <rect x="31" y="80" width="658" height="91" rx="8" fill="#EAF8F2" />
            <path d="M15 190H705M240 190V358M480 190V358" stroke={ROOM_LINE} strokeWidth="2.5" />
            <text x="360" y="104" textAnchor="middle" fill="#23664B" fontSize="13" fontWeight="700">UNFINISHED ATTIC — OPEN ACCESS</text>
          </>
        ) : below ? (
          <>
            <path d="M15 238H705M240 66V238M480 66V238" stroke={ROOM_LINE} strokeWidth="2.5" />
            <rect x="31" y="254" width="658" height="88" rx="8" fill="#EAF8F2" />
            <text x="360" y="329" textAnchor="middle" fill="#23664B" fontSize="13" fontWeight="700">UNFINISHED BASEMENT / CRAWLSPACE — OPEN ACCESS</text>
            <text x="127" y="105" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">FINISHED LIVING SPACE</text>
            <text x="360" y="105" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">FINISHED LIVING SPACE</text>
            <text x="592" y="105" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">FINISHED LIVING SPACE</text>
          </>
        ) : (
          <>
            <path d="M15 190H705M240 66V358M480 66V358M350 190V358" stroke={ROOM_LINE} strokeWidth="2" />
            <rect x="31" y="82" width="193" height="92" rx="8" fill="#F6F8FA" />
            <rect x="256" y="82" width="208" height="92" rx="8" fill="#F6F8FA" />
            <rect x="496" y="82" width="193" height="92" rx="8" fill="#F6F8FA" />
            <text x="127" y="112" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">FINISHED LIVING SPACE</text>
            <text x="360" y="112" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">FINISHED LIVING SPACE</text>
            <text x="592" y="112" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">FINISHED LIVING SPACE</text>
          </>
        )}

        {!below ? <>
          <text x="126" y="340" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">{dedicated ? "GARAGE" : "SOURCE ROOM"}</text>
          <text x="360" y="340" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">HALL / ROOMS</text>
          <text x="592" y="340" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">DESTINATION ROOM</text>
        </> : null}

        {dedicated ? <ElectricalPanel x={102} y={sourceY} /> : <Router x={102} y={sourceY} />}
        {dedicated ? <Outlet x={618} y={targetY} /> : <DataWallPlate x={618} y={targetY} />}
        <path d={route} fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
        <path pathLength="1" className="service-route-line" d={route} stroke={BLUE} strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />

        <g className="service-route-step service-route-step-1">
          <rect x="168" y={below ? 210 : 240} width="88" height="30" rx="15" fill="#FFFFFF" stroke={BLUE} strokeWidth="2" />
          <text x="212" y={below ? 230 : 260} textAnchor="middle" fill={NAVY} fontSize="12" fontWeight="700">{stepOne}</text>
        </g>
        <g className="service-route-step service-route-step-2">
          <rect x="319" y={below ? 254 : accessible ? 86 : 144} width="102" height="30" rx="15" fill="#FFFFFF" stroke={BLUE} strokeWidth="2" />
          <text x="370" y={below ? 274 : accessible ? 106 : 164} textAnchor="middle" fill={NAVY} fontSize="12" fontWeight="700">2 · ALONG</text>
        </g>
        <g className="service-route-step service-route-step-3">
          <rect x={below ? 450 : 493} y={below ? 210 : 226} width="88" height="30" rx="15" fill="#FFFFFF" stroke={BLUE} strokeWidth="2" />
          <text x={below ? 494 : 537} y={below ? 230 : 246} textAnchor="middle" fill={NAVY} fontSize="12" fontWeight="700">{stepThree}</text>
        </g>

        <text x="102" y={below ? 225 : 378} textAnchor="middle" fill={NAVY} fontSize="12" fontWeight="700">{sourceLabel}</text>
        <text x="618" y={below ? 225 : 378} textAnchor="middle" fill={NAVY} fontSize="12" fontWeight="700">{targetLabel}</text>
      </svg>
    </div>
  );
}

function Switch({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-17" y="-31" width="34" height="62" rx="2.5" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.3" />
      <path d="M-13-27L-10-24H10L13-27M-13 27L-10 24H10L13 27" stroke="#B8C6D0" strokeWidth="1.2" />
      <PlateScrew y={-24} />
      <PlateScrew y={24} />
      <rect x="-7" y="-14" width="14" height="28" fill="#FFFFFF" stroke={NAVY} strokeWidth="2" />
      <path d="M-4-9H4V9H-4Z" fill={PALE_BLUE} stroke={NAVY} strokeWidth="1.5" />
      <path d="M-4 2H4" stroke="#8BBFF0" strokeWidth="1.5" />
    </g>
  );
}

function CeilingLight({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="3" rx="25" ry="8" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.2" />
      <path d="M-25 3V10C-22 17 22 17 25 10V3" fill="#F7FBFF" stroke={NAVY} strokeWidth="2.2" />
      <path d="M0 12V48" stroke={NAVY} strokeWidth="4" />
      <rect x="-9" y="45" width="18" height="14" rx="4" fill="#FFFFFF" stroke={NAVY} strokeWidth="2" />
      <path d="M-30 87C-27 69-16 56 0 56C16 56 27 69 30 87Z" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.4" />
      <path d="M-30 87C-18 94 18 94 30 87" fill={PALE_BLUE} stroke={NAVY} strokeWidth="2.2" />
      <path d="M-8 88C-7 80 7 80 8 88" fill="#FFFDF2" stroke="#79B8F3" strokeWidth="1.3" />
    </g>
  );
}

function WallLight({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="18" cy="0" rx="11" ry="22" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.2" />
      <path d="M12-13C1-12-3-1-9 8" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <circle cx="-10" cy="9" r="4" fill="#FFFFFF" stroke={NAVY} strokeWidth="2" />
      <path d="M-8 7L11-12" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
      <path d="M-19 11V19" stroke={NAVY} strokeWidth="3" />
      <rect x="-25" y="17" width="12" height="11" rx="3" fill="#FFFFFF" stroke={NAVY} strokeWidth="2" />
      <path d="M-39 55C-37 39-30 26-19 26C-8 26-1 39 1 55Z" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.3" />
      <path d="M-39 55C-30 61-8 61 1 55" fill={PALE_BLUE} stroke={NAVY} strokeWidth="2" />
      <circle cx="-19" cy="56" r="6" fill="#FFFDF2" stroke="#79B8F3" strokeWidth="1.2" />
    </g>
  );
}

function RecessedLight({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <ellipse cx="0" cy="0" rx="32" ry="14" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.3" />
      <ellipse cx="0" cy="1" rx="22" ry="10" fill={PALE_BLUE} stroke={NAVY} strokeWidth="1.8" />
      <ellipse cx="0" cy="2" rx="10" ry="5" fill="#FFFDF2" stroke="#79B8F3" strokeWidth="1.3" />
    </g>
  );
}

function CeilingFan({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path d="M0 0V28" stroke={NAVY} strokeWidth="4" strokeLinecap="round" />
      <path d="M-15 0H15" stroke={NAVY} strokeWidth="5" strokeLinecap="round" />
      <circle cy="31" r="8" fill="#FFFFFF" stroke={NAVY} strokeWidth="2.2" />
      <path d="M-5 29C-42 15-66 21-72 32C-52 41-27 41-6 34ZM5 29C42 15 66 21 72 32C52 41 27 41 6 34Z" fill={PALE_BLUE} stroke={NAVY} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M0 39V49" stroke={NAVY} strokeWidth="3" />
      <path d="M-12 58C-10 48 10 48 12 58C8 65-8 65-12 58Z" fill="#FFFDF2" stroke={NAVY} strokeWidth="2" />
    </g>
  );
}

function Television({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x="-66" y="-42" width="132" height="78" rx="3" fill="#F8FCFF" stroke={NAVY} strokeWidth="3" />
      <rect x="-60" y="-36" width="120" height="66" rx="1" fill="url(#glass)" stroke={NAVY} strokeWidth="1.5" />
      <path d="M-18 21L20-18M-5 21L28-12" stroke="#82BEF7" strokeWidth="3" opacity="0.8" />
      <path d="M0 36V45M-15 45H15" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Doorway() {
  return (
    <g data-measurement-doorway="true">
      {/* The solid wall-colored backer hides the room's baseboard so the
          doorway reads as a real interruption in the wall, not an icon laid
          on top of it. */}
      <path d="M250 222V84H370V222Z" fill="#FFFEFC" />
      <path d="M254 222V88H366V222" stroke={NAVY} strokeWidth="3" strokeLinejoin="round" />
      <rect x="263" y="97" width="94" height="125" rx="1" fill="#F7FBFF" stroke={NAVY} strokeWidth="2.2" />
      <path d="M272 108H348V157H272ZM272 168H348V211H272Z" fill="#FFFFFF" stroke="#A9BBC9" strokeWidth="1.5" />
      <circle cx="342" cy="162" r="3.5" fill="#FFFFFF" stroke={NAVY} strokeWidth="1.7" />
      <path d="M247 222H373" stroke={NAVY} strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Light({ kind, ...props }: { kind: LightKind; x: number; y: number }) {
  if (kind === "wall") return <WallLight {...props} />;
  if (kind === "recessed") return <RecessedLight {...props} />;
  if (kind === "fan") return <CeilingFan {...props} />;
  return <CeilingLight {...props} />;
}

function Route({ d }: { d: string }) {
  return (
    <>
      <path d={d} stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} stroke={BLUE} strokeWidth="4" strokeDasharray="10 8" strokeLinecap="round" strokeLinejoin="round" markerStart="url(#route-arrow)" markerEnd="url(#route-arrow)" />
    </>
  );
}

function Labels({ left, right, centeredTarget = false }: { left: string; right: string; centeredTarget?: boolean }) {
  if (centeredTarget) {
    return (
      <div className="mt-1 grid grid-cols-3 gap-2 text-center text-xs font-semibold text-navy">
        <span>{left}</span>
        <span>{right}</span>
        <span aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="mt-1 grid grid-cols-2 gap-8 text-center text-xs font-semibold text-navy">
      <span>{left}</span>
      <span>{right}</span>
    </div>
  );
}

function RouteAccessChoiceGraphic({ access, animated = true }: { access: RouteAccess; animated?: boolean }) {
  const accessible = access === "accessible";
  const segmentClass = (position: 1 | 2 | 3) => animated
    ? `route-demo-segment${position > 1 ? ` route-demo-segment-${position}` : ""}`
    : "";
  const labelClass = (position: 1 | 2 | 3) => animated
    ? `route-demo-label route-demo-label-${position}`
    : "";

  return (
    <svg viewBox="0 0 210 112" className="h-auto w-full" fill="none" aria-hidden="true">
      <style>{`
        .route-demo-segment {
          stroke-dasharray: 1;
          stroke-dashoffset: 1;
          animation: route-demo-draw 1.05s ease-out forwards;
        }
        .route-demo-segment-2 { animation-delay: 1.05s; }
        .route-demo-segment-3 { animation-delay: 2.1s; }
        .route-demo-label {
          opacity: 0;
          animation: route-demo-label-in .35s ease-out forwards;
        }
        .route-demo-label-1 { animation-delay: .7s; }
        .route-demo-label-2 { animation-delay: 1.75s; }
        .route-demo-label-3 { animation-delay: 2.8s; }
        @keyframes route-demo-draw { to { stroke-dashoffset: 0; } }
        @keyframes route-demo-label-in { to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .route-demo-segment { animation: none; stroke-dashoffset: 0; }
          .route-demo-label { animation: none; opacity: 1; }
        }
      `}</style>
      <rect x="1" y="1" width="208" height="110" rx="15" fill="#FFFFFF" stroke="#E2E8F0" />
      {accessible ? (
        <>
          <rect x="18" y="19" width="174" height="59" rx="7" fill="#FFFFFF" stroke="#7FAE9A" strokeWidth="2.5" />
          <rect x="27" y="11" width="156" height="24" rx="5" fill="#D6F1E5" />
          <text x="105" y="27" textAnchor="middle" fill="#23664B" fontSize="9" fontWeight="700">Open space above this room</text>
          <path d="M27 78H183" stroke="#9CCDB8" strokeWidth="3" strokeLinecap="round" />
          <path d="M75 78V49H135V78" stroke="#B9C7C0" strokeWidth="2" />
          <circle cx="35" cy="72" r="5" fill="#FFFFFF" stroke={BLUE} strokeWidth="3" />
          <circle cx="175" cy="72" r="5" fill="#FFFFFF" stroke={BLUE} strokeWidth="3" />
          <path pathLength="1" className={segmentClass(1)} d="M35 67V35" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
          <path pathLength="1" className={segmentClass(2)} d="M35 35H175" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
          <path pathLength="1" className={segmentClass(3)} d="M175 35V67" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
          <text className={labelClass(1)} x="24" y="56" textAnchor="middle" fill="#23664B" fontSize="9" fontWeight="700">1  Up</text>
          <text className={labelClass(2)} x="105" y="47" textAnchor="middle" fill="#23664B" fontSize="9" fontWeight="700">2  Across</text>
          <text className={labelClass(3)} x="187" y="56" textAnchor="middle" fill="#23664B" fontSize="9" fontWeight="700">3  Down</text>
          <text x="105" y="99" textAnchor="middle" fill={NAVY} fontSize="10" fontWeight="700">Measure this section only</text>
        </>
      ) : (
        <>
          <path d="M18 77H192M18 18V77M192 18V77" stroke="#B9804B" strokeWidth="3" strokeLinecap="round" />
          <path d="M79 77V35H131V77" fill="#FFFFFF" stroke="#D5A678" strokeWidth="3" />
          <path d="M35 69H175" stroke="#AEB8C5" strokeWidth="2.5" strokeDasharray="5 5" strokeLinecap="round" />
          <circle cx="31" cy="69" r="5" fill="#FFFFFF" stroke={BLUE} strokeWidth="3" />
          <circle cx="179" cy="69" r="5" fill="#FFFFFF" stroke={BLUE} strokeWidth="3" />
          <path pathLength="1" className={segmentClass(1)} d="M31 64H68V26" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <path pathLength="1" className={segmentClass(2)} d="M68 26H142" stroke={BLUE} strokeWidth="5" strokeLinecap="round" />
          <path pathLength="1" className={segmentClass(3)} d="M142 26V64H179" stroke={BLUE} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <text className={labelClass(1)} x="47" y="58" textAnchor="middle" fill="#91511C" fontSize="9" fontWeight="700">1  Up</text>
          <text className={labelClass(2)} x="105" y="19" textAnchor="middle" fill="#91511C" fontSize="9" fontWeight="700">2  Over door</text>
          <text className={labelClass(3)} x="163" y="58" textAnchor="middle" fill="#91511C" fontSize="9" fontWeight="700">3  Down</text>
          <text x="105" y="98" textAnchor="middle" fill={NAVY} fontSize="10" fontWeight="700">Measure this hallway section</text>
        </>
      )}
    </svg>
  );
}

function MultiRoomRouteDrawing({ sections, activeIndex, complete }: { sections: RouteSection[]; activeIndex: number; complete: boolean }) {
  const cardWidth = 148;
  const gap = 18;
  const width = Math.max(320, sections.length * cardWidth + Math.max(0, sections.length - 1) * gap + 80);
  const cardsWidth = sections.length * cardWidth + Math.max(0, sections.length - 1) * gap;
  const startX = (width - cardsWidth) / 2;

  return (
    <svg
      viewBox={`0 0 ${width} 210`}
      fill="none"
      aria-hidden="true"
      className="h-auto w-full"
      style={{ minWidth: `${Math.min(width, 600)}px` }}
    >
      <defs>
        <marker id="multi-room-arrow" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L11 6L1 11Z" fill={BLUE} />
        </marker>
      </defs>
      <rect x="2" y="2" width={width - 4} height="206" rx="22" fill="#F8FBFE" />
      <text x={width / 2} y="25" textAnchor="middle" fill="#64748B" fontSize="12" fontWeight="700">
        {complete ? "YOUR COMPLETE WIRE PATH" : "BUILDING YOUR WIRE PATH"}
      </text>
      {sections.map((section, index) => {
        const accessible = section.access === "accessible";
        const x = startX + index * (cardWidth + gap);
        const selected = !complete && index === activeIndex;
        const cardFill = accessible ? "#EAF8F2" : "#FFF4E8";
        const cardStroke = selected ? BLUE : accessible ? "#9CCDB8" : "#E2B482";
        return (
          <g key={section.id}>
            {index > 0 ? (
              <path d={`M${x - gap + 3} 108H${x - 5}`} stroke={BLUE} strokeWidth="3" strokeLinecap="round" markerEnd="url(#multi-room-arrow)" />
            ) : null}
            <rect x={x} y="40" width={cardWidth} height="142" rx="18" fill={cardFill} stroke={cardStroke} strokeWidth={selected ? 4 : 2} />
            <circle cx={x + 26} cy="64" r="14" fill={selected ? BLUE : "#FFFFFF"} />
            <text x={x + 26} y="69" textAnchor="middle" fill={selected ? "#FFFFFF" : NAVY} fontSize="13" fontWeight="800">
              {index + 1}
            </text>
            <text x={x + 47} y="68" fill={NAVY} fontSize="12" fontWeight="800">PART</text>
            {accessible ? (
              <g transform={`translate(${x + 29} 82)`}>
                <path d="M0 25L22 6L44 25M8 25H36" stroke="#4E7A68" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M11 19H33" stroke={BLUE} strokeWidth="3.5" strokeDasharray="6 5" strokeLinecap="round" />
              </g>
            ) : (
              <g transform={`translate(${x + 33} 82)`}>
                <rect x="0" y="0" width="38" height="40" rx="3" fill="#FFFFFF" stroke="#B9804B" strokeWidth="2.5" />
                <path d="M8 34H18V25H30V9H36" stroke={BLUE} strokeWidth="3.5" strokeDasharray="6 5" strokeLinecap="round" strokeLinejoin="round" />
              </g>
            )}
            <text x={x + 101} y="99" textAnchor="middle" fill={accessible ? "#23664B" : "#91511C"} fontSize="11" fontWeight="800">
              {accessible ? "OPEN" : "FINISHED"}
            </text>
            <text x={x + 101} y="115" textAnchor="middle" fill="#526173" fontSize="10">
              {accessible ? "easy to reach" : "inside walls"}
            </text>
            <text x={x + cardWidth / 2} y="151" textAnchor="middle" fill={NAVY} fontSize="17" fontWeight="800">
              {section.feet ? `${section.feet} ft` : "— ft"}
            </text>
            <text x={x + cardWidth / 2} y="169" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">
              {section.doorways > 0 ? `${section.doorways} ${section.doorways === 1 ? "DOORWAY" : "DOORWAYS"}` : accessible ? "NO DOOR COUNT" : "NO DOORWAYS"}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function MeasurementGuide({
  questionKey,
  prompt,
  serviceSlug,
  accessClass,
  doorwayChecked = false,
  onDoorwayChange,
  showDoorway: showDoorwayOverride,
  routeSections,
  routeAccess,
  onRouteSectionFeetChange,
  onRouteSectionDoorwaysChange,
  onRouteSectionAccessChange,
  onAddRouteSection,
  onRemoveRouteSection,
  routeBuildingComplete = false,
  onRouteBuildingCompleteChange,
  routeExterior = "",
  onRouteExteriorChange,
}: {
  questionKey: string;
  prompt: string;
  serviceSlug?: string;
  accessClass?: AccessClass;
  doorwayChecked?: boolean;
  onDoorwayChange?: (checked: boolean) => void;
  /** Lets a server-validated continuation reuse this drawing outside a
   * QuestionDTO while ordinary question flows keep deriving the rule. */
  showDoorway?: boolean;
  routeSections?: RouteSection[];
  routeAccess?: RouteAccess;
  onRouteSectionFeetChange?: (id: number, feet: string) => void;
  onRouteSectionDoorwaysChange?: (id: number, doorways: number) => void;
  onRouteSectionAccessChange?: (id: number, access: RouteAccess) => void;
  onAddRouteSection?: () => void;
  onRemoveRouteSection?: (id: number) => void;
  routeBuildingComplete?: boolean;
  onRouteBuildingCompleteChange?: (complete: boolean) => void;
  routeExterior?: RouteExterior;
  onRouteExteriorChange?: (value: RouteExterior) => void;
}) {
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [routeAnimationCycle, setRouteAnimationCycle] = useState(0);
  const [routeWizardStep, setRouteWizardStep] = useState<RouteWizardStep>("feet");
  useEffect(() => {
    setActiveSectionIndex(0);
    setRouteAnimationCycle((cycle) => cycle + 1);
    setRouteWizardStep("feet");
  }, [questionKey]);
  useEffect(() => {
    if (routeSections && activeSectionIndex >= routeSections.length) {
      setActiveSectionIndex(Math.max(0, routeSections.length - 1));
    }
  }, [activeSectionIndex, routeSections]);

  const kind = KIND_BY_QUESTION_KEY[questionKey];
  if (!kind) return null;

  const firstRecessed = /first recessed light/i.test(prompt);
  const lightKind: LightKind = /ceiling fan/i.test(prompt)
    ? "fan"
    : firstRecessed
    ? "recessed"
    : /wall sconce|exterior light/i.test(prompt)
      ? "wall"
      : "ceiling";
  const lightLabel = lightKind === "fan"
    ? "New ceiling fan"
    : firstRecessed
    ? "First recessed light"
    : /wall sconce/i.test(prompt)
      ? "New wall sconce"
      : /exterior light/i.test(prompt)
        ? "New exterior light"
        : "New ceiling light";

  const targetX = 455;
  const switchX = 135;
  const switchY = 165;
  const lightY = lightKind === "wall" ? 106 : lightKind === "recessed" ? 44 : 36;
  const routeY = lightKind === "wall" ? 137 : 49;
  const showDoorway = showDoorwayOverride
    ?? measurementCanCrossDoorway({ questionKey, prompt, serviceSlug, accessClass });
  const usesRouteSections = routeSections !== undefined;
  const activeRouteSection = routeSections?.[activeSectionIndex] ?? routeSections?.[0];
  const effectiveAccessClass = activeRouteSection
    ? activeRouteSection.access === "finished" ? "FINISHED" : "ACCESSIBLE"
    : accessClass;
  const doorwayActive = usesRouteSections
    ? activeRouteSection?.access === "finished" && activeRouteSection.doorways > 0
    : showDoorway && doorwayChecked;
  const doorway = doorwayActive ? <Doorway /> : null;

  let drawing: ReactNode;
  let labels: { left: string; right: string };
  let centeredTarget = false;
  const dedicatedFinishedRoute = serviceSlug === "dedicated-120v-circuit-outlet" && effectiveAccessClass === "FINISHED";
  const fanFinishedRoute = serviceSlug === "new-ceiling-fan" &&
    (questionKey === "fan_finished_route_feet" || questionKey === "surface_route_feet");
  const lowVoltageRoute = (serviceSlug === "new-coax-line" || serviceSlug === "new-ethernet-line") &&
    (questionKey === `${serviceSlug}_distance` || questionKey === `${serviceSlug}_exposed_route_feet`);

  if (kind === "accessible-route") {
    const accessibleEndpoint = serviceSlug === "new-ceiling-fan"
      ? "fan"
      : serviceSlug === "dedicated-120v-circuit-outlet"
        ? "panel-outlet"
        : "outlet";
    if (dedicatedFinishedRoute) {
      const route = doorwayActive
        ? `M135 165V${DOOR_ROUTE_Y}H455V185`
        : "M135 165V185H455";
      drawing = <Drawing>{doorway}<Route d={route} /><ElectricalPanel x={135} y={165} /><Outlet x={455} y={185} /></Drawing>;
      labels = { left: "Electrical panel", right: "New outlet" };
    } else {
      centeredTarget = accessibleEndpoint === "fan";
      drawing = <AccessibleRouteDrawing endpoint={accessibleEndpoint} />;
      labels = {
        left: accessibleEndpoint === "fan" ? "Existing switch" : accessibleEndpoint === "panel-outlet" ? "Electrical panel" : "Existing power source",
        right: accessibleEndpoint === "fan" ? "New ceiling fan" : accessibleEndpoint === "panel-outlet" ? "New outlet" : "New location",
      };
    }
  } else if (lowVoltageRoute) {
    if (effectiveAccessClass === "ACCESSIBLE") {
      drawing = <AccessibleRouteDrawing endpoint="coax" />;
    } else {
      const route = doorwayActive
        ? `M135 185H235V${DOOR_ROUTE_Y}H385V185H455`
        : "M135 185H455";
      drawing = <Drawing>{doorway}<Route d={route} /><Router x={135} y={185} />{serviceSlug === "new-ethernet-line" ? <DataWallPlate x={455} y={185} /> : <CoaxWallPlate x={455} y={185} />}</Drawing>;
    }
    labels = serviceSlug === "new-ethernet-line"
      ? { left: "Router or network source", right: "New Ethernet wall plate" }
      : { left: "Router or existing coax source", right: "New coax wall plate" };
  } else if (fanFinishedRoute) {
    const method = questionKey === "fan_finished_route_feet" ? "concealed" : "surface";
    centeredTarget = true;
    drawing = <CeilingFanFinishedRouteDrawing method={method} />;
    labels = { left: "Existing switch", right: "New ceiling fan" };
  } else if (kind === "existing-switch-to-light") {
    const route = doorwayActive
      ? `M${switchX} ${switchY}V${DOOR_ROUTE_Y}H${targetX}V${routeY}`
      : `M${switchX} ${switchY}V${routeY}H${targetX}`;
    drawing = <Drawing>{doorway}<Route d={route} /><Switch x={switchX} y={switchY} /><Light kind={lightKind} x={targetX} y={lightY} /></Drawing>;
    labels = { left: "Existing switch", right: lightLabel };
  } else if (kind === "existing-fixture-to-light") {
    const route = doorwayActive && routeY >= 88
      ? `M145 ${routeY}V${DOOR_ROUTE_Y}H${targetX}V${routeY}`
      : `M145 ${routeY}H${targetX}`;
    drawing = <Drawing>{doorway}<Route d={route} /><Light kind={lightKind} x={145} y={lightY} /><Light kind={lightKind} x={targetX} y={lightY} /></Drawing>;
    labels = { left: "Existing light", right: lightLabel };
  } else if (kind === "power-to-new-switch") {
    const route = doorwayActive
      ? `M135 185H235V${DOOR_ROUTE_Y}H385V165H455`
      : "M135 185H330V165H455";
    drawing = <Drawing>{doorway}<Route d={route} /><Outlet x={135} y={185} /><Switch x={455} y={165} /></Drawing>;
    labels = { left: "Closest power source", right: "New switch" };
  } else if (kind === "new-switch-to-light") {
    const route = doorwayActive
      ? `M${switchX} ${switchY}V${DOOR_ROUTE_Y}H${targetX}V${routeY}`
      : `M${switchX} ${switchY}V${routeY}H${targetX}`;
    drawing = <Drawing>{doorway}<Route d={route} /><Switch x={switchX} y={switchY} /><Light kind={lightKind} x={targetX} y={lightY} /></Drawing>;
    labels = { left: "New switch", right: lightLabel };
  } else if (kind === "outlet-to-tv-outlet") {
    const route = doorwayActive
      ? `M135 185H235V${DOOR_ROUTE_Y}H385V151H455`
      : "M135 185H455V151";
    drawing = <Drawing>{doorway}<Route d={route} /><Outlet x={135} y={185} /><Outlet x={455} y={151} /><Television x={455} y={92} /></Drawing>;
    labels = { left: "Nearest existing outlet", right: "New outlet behind TV" };
  } else {
    const route = doorwayActive
      ? `M135 185H235V${DOOR_ROUTE_Y}H385V185H455`
      : "M135 185H455";
    drawing = <Drawing>{doorway}<Route d={route} /><Outlet x={135} y={185} /><Outlet x={455} y={185} /></Drawing>;
    labels = {
      left: "Closest power source",
      right: questionKey === "ext_gfci_distance" ? "New outdoor outlet" : "New location",
    };
  }

  return (
    <div className="mt-4 rounded-[1.25rem] border border-sky-200 bg-white px-4 pb-4 pt-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-electric text-sm font-bold text-white" aria-hidden="true">↔</span>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Measure this wiring path</p>
      </div>
      {routeSections ? <ServiceRouteAnimation serviceSlug={serviceSlug} access={routeAccess ?? (accessClass === "FINISHED" ? "finished" : "accessible")} /> : null}
      {showDoorway && !usesRouteSections ? (
        <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-navy">
          <input
            type="checkbox"
            checked={doorwayChecked}
            onChange={(event) => onDoorwayChange?.(event.target.checked)}
            readOnly={!onDoorwayChange}
            className="mt-0.5 h-5 w-5 rounded border-cardline text-electric focus:ring-electric"
          />
          <span>
            <span className="block font-semibold">There is a doorway between these two locations</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate">
              We’ll automatically include the extra wire and wall-opening time needed to route around it.
            </span>
          </span>
        </label>
      ) : null}
      <div className="mx-auto mt-2 max-w-xl">
        {routeSections && routeSections.length > 1 ? (
          <div className="overflow-x-auto pb-1">
            <MultiRoomRouteDrawing sections={routeSections} activeIndex={activeSectionIndex} complete={routeBuildingComplete} />
          </div>
        ) : routeSections ? null : drawing}
        {routeSections && routeSections.length > 1 ? (
          <div className="mt-1 flex justify-between text-xs font-semibold text-navy">
            <span>{labels.left}</span>
            <span>{labels.right}</span>
          </div>
        ) : routeSections ? null : (
          <Labels {...labels} centeredTarget={centeredTarget} />
        )}
      </div>
      {routeSections ? (
        <div className="mx-auto mt-4 max-w-xl space-y-3">
          {routeSections.length > 1 ? <div className="rounded-xl bg-sky-50 px-4 py-3" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Route parts</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {routeSections.map((section, index) => (
                <button key={section.id} type="button" onClick={() => { setActiveSectionIndex(index); setRouteWizardStep("feet"); onRouteBuildingCompleteChange?.(false); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${index === activeSectionIndex && !routeBuildingComplete ? "border-electric bg-white text-electric" : "border-sky-200 bg-white text-navy"}`}>
                  Part {index + 1}: {section.feet || "—"} ft · {section.access === "accessible" ? "open space" : "finished walls"}
                </button>
              ))}
            </div>
          </div> : null}

          {!routeBuildingComplete ? (() => {
            const section = routeSections[activeSectionIndex] ?? routeSections[0];
            const feet = Number(section.feet);
            const sectionReady = Number.isFinite(feet) && feet > 0;
            const partLabel = routeSections.length > 1 || activeSectionIndex > 0
              ? `Part ${activeSectionIndex + 1}`
              : "Route part 1";
            return (
              <section className="rounded-card bg-warmwhite p-4 sm:p-5" aria-labelledby={`route-part-${section.id}`}>
                <p id={`route-part-${section.id}`} className="text-xs font-bold uppercase tracking-[0.08em] text-electric">{partLabel}</p>

                {routeWizardStep === "access" ? <>
                  <p className="mt-2 font-display text-base font-bold text-navy">Where does the wire go next?</p>
                  <p className="mt-1 text-sm text-slate">Pick one. We’ll ask for the distance after.</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <button type="button" onClick={() => { onRouteSectionAccessChange?.(section.id, "accessible"); setRouteWizardStep("feet"); setRouteAnimationCycle((cycle) => cycle + 1); }} className="rounded-card border border-cardline bg-white px-4 py-3 text-left text-sm text-navy transition hover:border-electric">
                      <RouteAccessChoiceGraphic access="accessible" animated={false} />
                      <span className="block font-bold">Open space</span>
                      <span className="mt-1 block text-xs leading-5 text-slate">Attic, basement, crawlspace, drop ceiling, or open framing</span>
                    </button>
                    <button type="button" onClick={() => { onRouteSectionAccessChange?.(section.id, "finished"); setRouteWizardStep("feet"); setRouteAnimationCycle((cycle) => cycle + 1); }} className="rounded-card border border-cardline bg-white px-4 py-3 text-left text-sm text-navy transition hover:border-electric">
                      <RouteAccessChoiceGraphic access="finished" animated={false} />
                      <span className="block font-bold">Inside finished walls</span>
                      <span className="mt-1 block text-xs leading-5 text-slate">Drywall or a finished ceiling blocks direct access</span>
                    </button>
                  </div>
                </> : null}

                {routeWizardStep === "feet" ? <>
                  <div className="mt-2 flex items-start justify-between gap-3">
                    <div>
                      <p className="font-display text-base font-bold text-navy">How far does the wire travel here?</p>
                      <p className="mt-1 text-sm text-slate">Follow the blue path shown below.</p>
                    </div>
                    {activeSectionIndex > 0 ? <button type="button" onClick={() => setRouteWizardStep("access")} className="shrink-0 rounded-pill border border-cardline bg-white px-3 py-2 text-xs font-semibold text-electric">Change type</button> : null}
                  </div>
                  {section.access === "finished" ? <>
                    <label className="mt-3 flex cursor-pointer items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-navy">
                      <input
                        type="checkbox"
                        checked={section.doorways > 0}
                        onChange={(event) => onRouteSectionDoorwaysChange?.(section.id, event.target.checked ? 1 : 0)}
                        className="mt-0.5 h-5 w-5 rounded border-cardline text-electric focus:ring-electric"
                      />
                      <span>
                        <span className="block font-semibold">There is a doorway in this part of the route</span>
                        <span className="mt-0.5 block text-xs leading-5 text-slate">We’ll automatically include the extra wire and wall-opening time needed to route over it.</span>
                      </span>
                    </label>
                    <div className="mx-auto mt-3 max-w-xl">
                      {drawing}
                      <Labels left={labels.left} right={labels.right} centeredTarget={centeredTarget} />
                    </div>
                  </> : <>
                    <div className="mx-auto mt-4 max-w-xs">
                      <RouteAccessChoiceGraphic key={`${section.access}-${activeSectionIndex}-${routeAnimationCycle}`} access={section.access} />
                    </div>
                    <button type="button" onClick={() => setRouteAnimationCycle((cycle) => cycle + 1)} className="mx-auto mt-1 block rounded-pill px-4 py-2 text-xs font-semibold text-electric hover:bg-sky-50">↻ Replay</button>
                  </>}
                  <label className="mt-3 block text-sm font-semibold text-navy">
                    Feet for this part
                    <input type="number" min="0.1" max="200" step="0.1" inputMode="decimal" value={section.feet} onChange={(event) => onRouteSectionFeetChange?.(section.id, event.target.value)} className="mt-1 w-full rounded-card border border-cardline bg-white px-4 py-3 text-base font-normal text-navy focus:border-electric" aria-label={`Feet through part ${activeSectionIndex + 1}`} placeholder="e.g. 12" />
                  </label>
                  <button type="button" disabled={!sectionReady} onClick={() => setRouteWizardStep("more")} className="mt-4 w-full rounded-pill bg-electric px-4 py-3 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-40">Next</button>
                </> : null}

                {routeWizardStep === "more" ? <>
                  <div className="rounded-lg bg-sky-50 px-3 py-2 text-sm text-navy">
                    <strong>{section.feet} feet</strong> through {section.access === "accessible" ? "open space" : "finished walls"}{section.doorways > 0 ? `, crossing ${section.doorways} ${section.doorways === 1 ? "doorway" : "doorways"}` : ""}.
                  </div>
                  <p className="mt-4 font-display text-base font-bold text-navy">Does the route change after this?</p>
                  <p className="mt-1 text-sm text-slate">For example, it may leave a finished garage and enter an open attic.</p>
                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <button type="button" onClick={() => onRouteBuildingCompleteChange?.(true)} className="rounded-pill bg-electric px-4 py-3 text-sm font-semibold text-white transition hover:bg-electric-hover">No, that’s the full run</button>
                    <button type="button" disabled={routeSections.length >= 6} onClick={() => { setActiveSectionIndex(routeSections.length); setRouteWizardStep("access"); onAddRouteSection?.(); }} className="rounded-pill border border-electric bg-white px-4 py-3 text-sm font-semibold text-electric disabled:cursor-not-allowed disabled:opacity-40">Yes, add another part</button>
                  </div>
                  <button type="button" onClick={() => setRouteWizardStep("feet")} className="mt-2 w-full py-2 text-sm font-semibold text-slate">Change this distance</button>
                  {routeSections.length > 1 ? <button type="button" onClick={() => { onRemoveRouteSection?.(section.id); setRouteWizardStep("feet"); }} className="w-full py-2 text-sm font-semibold text-rust">Remove this part</button> : null}
                </> : null}
              </section>
            );
          })() : (
            <div className="rounded-xl border border-cardline bg-warmwhite p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-bold text-navy">Route complete</p><p className="text-sm text-slate">{routeSections.reduce((sum, section) => sum + Number(section.feet || 0), 0)} feet across {routeSections.length} {routeSections.length === 1 ? "part" : "parts"}</p></div>
                <button type="button" onClick={() => { setActiveSectionIndex(routeSections.length - 1); setRouteWizardStep("feet"); onRouteBuildingCompleteChange?.(false); }} className="rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-semibold text-electric">Edit</button>
              </div>
            </div>
          )}

          {routeBuildingComplete ? <fieldset className="rounded-xl border border-cardline bg-warmwhite p-4">
            <legend className="px-1 text-base font-bold text-navy">Does the run start or end on an exterior wall?</legend>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              {([['no', 'No'], ['yes', 'Yes'], ['unsure', "I’m not sure"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={routeExterior === value} onClick={() => onRouteExteriorChange?.(value)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${routeExterior === value ? "border-electric bg-sky-50 text-electric ring-1 ring-electric" : "border-cardline bg-white text-navy"}`}>{label}</button>)}
            </div>
            {routeExterior === "yes" || routeExterior === "unsure" ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-navy">{EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT}</p> : null}
          </fieldset> : null}
        </div>
      ) : null}
      {!routeSections && kind === "accessible-route" && dedicatedFinishedRoute ? (
        <p className="mx-auto mt-3 max-w-xl text-center text-xs leading-5 text-slate">
          Measure from the electrical panel along the finished wall and ceiling to the new outlet. We add the doorway detour automatically when selected.
        </p>
      ) : !routeSections && kind === "accessible-route" ? (
        <div className="mx-auto mt-3 flex max-w-xl flex-col gap-2 text-xs leading-5 text-slate">
          <p className="flex items-start gap-3">
            <span className="mt-2 block w-10 shrink-0 border-t-2 border-dashed border-electric" aria-hidden="true" />
            <span><strong className="text-navy">Estimate only this distance</strong> through the open attic, basement, or crawlspace.</span>
          </p>
          <p className="flex items-start gap-3">
            <span className="ml-5 mt-0.5 block h-7 shrink-0 border-l-2 border-dashed border-slate-400" aria-hidden="true" />
            <span><strong className="text-navy">Don’t include the ends.</strong> Your contractor’s standard allowance is added automatically.</span>
          </p>
        </div>
      ) : !routeSections && lowVoltageRoute ? (
        <p className="mt-3 text-center text-xs leading-5 text-slate">
          {`Measure the cable path from the ${serviceSlug === "new-ethernet-line" ? "router or network source to the new Ethernet wall plate" : "router or existing coax source to the new coax wall plate"}—not a straight line through the room.`}
        </p>
      ) : !routeSections && fanFinishedRoute ? (
        <p className="mt-3 text-center text-xs leading-5 text-slate">
          Measure from the switch, up the wall, and across the ceiling to the fan location.
        </p>
      ) : !routeSections ? (
        <p className="mt-3 text-center text-xs leading-5 text-slate">
          Follow the walls and ceiling the wire will travel—not a straight line through the room.
        </p>
      ) : null}
    </div>
  );
}
