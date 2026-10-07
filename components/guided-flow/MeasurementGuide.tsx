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

function MultiRoomRouteDrawing({ sections }: { sections: RouteSection[] }) {
  const roomWidth = 170;
  const width = Math.max(600, sections.length * roomWidth + 60);
  const routeY = 142;

  return (
    <svg viewBox={`0 0 ${width} 230`} fill="none" aria-hidden="true" className="h-auto w-full">
      <defs>
        <marker id="multi-room-arrow" viewBox="0 0 12 12" refX="6" refY="6" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M1 1L11 6L1 11Z" fill={BLUE} />
        </marker>
      </defs>
      <rect x="2" y="2" width={width - 4} height="226" rx="20" fill="#FFFEFC" />
      {sections.map((section, index) => {
        const x = 30 + index * roomWidth;
        const routeStart = x + 24;
        const routeEnd = x + roomWidth - 24;
        return (
          <g key={section.id}>
            <rect x={x} y="38" width={roomWidth} height="152" fill="#FFFFFF" stroke={ROOM_LINE} strokeWidth="2" />
            <text x={x + roomWidth / 2} y="67" textAnchor="middle" fill={NAVY} fontSize="14" fontWeight="700">
              PART {index + 1}
            </text>
            <text x={x + roomWidth / 2} y="88" textAnchor="middle" fill={section.access === "accessible" ? BLUE : "#9A5B2E"} fontSize="11" fontWeight="700">
              {section.access === "accessible" ? "OPEN ACCESS" : "FINISHED WALLS"}
            </text>
            <path d={`M${routeStart} ${routeY}H${routeEnd}`} stroke="#FFFFFF" strokeWidth="9" strokeLinecap="round" />
            <path d={`M${routeStart} ${routeY}H${routeEnd}`} stroke={BLUE} strokeWidth="4" strokeDasharray="10 8" strokeLinecap="round" markerEnd="url(#multi-room-arrow)" />
            <text x={x + roomWidth / 2} y="112" textAnchor="middle" fill="#64748B" fontSize="13">
              {section.feet ? `${section.feet} ft` : "Enter feet below"}
            </text>
            {section.doorways > 0 ? (
              <g>
                <path d={`M${x + roomWidth - 25} 190V103H${x + roomWidth - 3}V190`} stroke={NAVY} strokeWidth="2.5" />
                <text x={x + roomWidth - 14} y="213" textAnchor="middle" fill={NAVY} fontSize="11" fontWeight="700">
                  {section.doorways} {section.doorways === 1 ? "DOOR" : "DOORS"}
                </text>
              </g>
            ) : null}
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
  useEffect(() => {
    setActiveSectionIndex(0);
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
  const doorwayActive = showDoorway && doorwayChecked;
  const doorway = doorwayActive ? <Doorway /> : null;

  let drawing: ReactNode;
  let labels: { left: string; right: string };
  let centeredTarget = false;
  const dedicatedFinishedRoute = serviceSlug === "dedicated-120v-circuit-outlet" && accessClass === "FINISHED";
  const fanFinishedRoute = serviceSlug === "new-ceiling-fan" &&
    (questionKey === "fan_finished_route_feet" || questionKey === "surface_route_feet");
  const coaxRoute = serviceSlug === "new-coax-line" && kind === "coax-route";

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
  } else if (coaxRoute) {
    if (accessClass === "ACCESSIBLE") {
      drawing = <AccessibleRouteDrawing endpoint="coax" />;
    } else {
      const route = doorwayActive
        ? `M135 185H235V${DOOR_ROUTE_Y}H385V185H455`
        : "M135 185H455";
      drawing = <Drawing>{doorway}<Route d={route} /><Router x={135} y={185} /><CoaxWallPlate x={455} y={185} /></Drawing>;
    }
    labels = { left: "Router or existing coax source", right: "New coax wall plate" };
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
        {routeSections ? <MultiRoomRouteDrawing sections={routeSections} /> : drawing}
        {routeSections ? (
          <div className="mt-1 flex justify-between text-xs font-semibold text-navy">
            <span>{labels.left}</span>
            <span>{labels.right}</span>
          </div>
        ) : (
          <Labels {...labels} centeredTarget={centeredTarget} />
        )}
      </div>
      {routeSections ? (
        <div className="mx-auto mt-4 max-w-xl space-y-3">
          <div className="rounded-xl bg-sky-50 px-4 py-3" aria-live="polite">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Your run so far</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {routeSections.map((section, index) => (
                <button key={section.id} type="button" onClick={() => { setActiveSectionIndex(index); onRouteBuildingCompleteChange?.(false); }} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${index === activeSectionIndex && !routeBuildingComplete ? "border-electric bg-white text-electric" : "border-sky-200 bg-white text-navy"}`}>
                  Part {index + 1}: {section.feet || "—"} ft · {section.access === "accessible" ? "open space" : "finished walls"}
                </button>
              ))}
            </div>
          </div>

          {!routeBuildingComplete ? (() => {
            const section = routeSections[activeSectionIndex] ?? routeSections[0];
            const feet = Number(section.feet);
            const sectionReady = Number.isFinite(feet) && feet > 0;
            return (
              <fieldset className="rounded-xl border border-cardline bg-warmwhite p-4">
                <legend className="px-1 text-base font-bold text-navy">Part {activeSectionIndex + 1} of the run</legend>
                <p className="mt-1 text-sm font-semibold text-navy">Where does the wire go for this part?</p>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <button type="button" aria-pressed={section.access === "accessible"} onClick={() => onRouteSectionAccessChange?.(section.id, "accessible")} className={`rounded-xl border px-4 py-3 text-left text-sm ${section.access === "accessible" ? "border-electric bg-sky-50 text-navy ring-1 ring-electric" : "border-cardline bg-white text-navy"}`}>
                    <span className="block font-bold">Open space</span>
                    <span className="mt-1 block text-xs leading-5 text-slate">Attic, basement, crawlspace, drop ceiling, or open framing</span>
                  </button>
                  <button type="button" aria-pressed={section.access === "finished"} onClick={() => onRouteSectionAccessChange?.(section.id, "finished")} className={`rounded-xl border px-4 py-3 text-left text-sm ${section.access === "finished" ? "border-electric bg-sky-50 text-navy ring-1 ring-electric" : "border-cardline bg-white text-navy"}`}>
                    <span className="block font-bold">Inside finished walls</span>
                    <span className="mt-1 block text-xs leading-5 text-slate">The wire needs to be fished through drywall or a finished ceiling</span>
                  </button>
                </div>
                <label className="mt-4 block text-sm font-semibold text-navy">
                  About how many feet does the wire travel here?
                  <input type="number" min="0.1" max="200" step="0.1" inputMode="decimal" value={section.feet} onChange={(event) => onRouteSectionFeetChange?.(section.id, event.target.value)} className="mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-3 text-base font-normal text-navy focus:border-electric" aria-label={`Feet through part ${activeSectionIndex + 1}`} placeholder="e.g. 12" />
                </label>
                {section.access === "finished" ? (
                  <label className="mt-4 block text-sm font-semibold text-navy">
                    How many doorways does this part cross?
                    <input type="number" min="0" max="4" step="1" inputMode="numeric" value={section.doorways} onChange={(event) => onRouteSectionDoorwaysChange?.(section.id, Math.min(4, Math.max(0, Number.parseInt(event.target.value || "0", 10))))} className="mt-1 w-full rounded-lg border border-cardline bg-white px-3 py-3 text-base font-normal text-navy focus:border-electric" aria-label={`Doorways crossed in part ${activeSectionIndex + 1}`} />
                  </label>
                ) : null}
                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                  <button type="button" disabled={!sectionReady || routeSections.length >= 6} onClick={() => { setActiveSectionIndex(routeSections.length); onAddRouteSection?.(); }} className="rounded-xl border border-electric px-4 py-3 text-sm font-bold text-electric disabled:cursor-not-allowed disabled:opacity-40">Add another part</button>
                  <button type="button" disabled={!sectionReady} onClick={() => onRouteBuildingCompleteChange?.(true)} className="rounded-xl bg-electric px-4 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">That’s the entire run</button>
                </div>
                {routeSections.length > 1 ? <button type="button" onClick={() => onRemoveRouteSection?.(section.id)} className="mt-2 w-full py-2 text-sm font-semibold text-rust">Remove this part</button> : null}
              </fieldset>
            );
          })() : (
            <div className="rounded-xl border border-cardline bg-warmwhite p-4">
              <div className="flex items-center justify-between gap-3">
                <div><p className="font-bold text-navy">Route complete</p><p className="text-sm text-slate">{routeSections.reduce((sum, section) => sum + Number(section.feet || 0), 0)} feet across {routeSections.length} {routeSections.length === 1 ? "part" : "parts"}</p></div>
                <button type="button" onClick={() => onRouteBuildingCompleteChange?.(false)} className="rounded-lg border border-cardline bg-white px-3 py-2 text-sm font-semibold text-electric">Edit parts</button>
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
      {kind === "accessible-route" && dedicatedFinishedRoute ? (
        <p className="mx-auto mt-3 max-w-xl text-center text-xs leading-5 text-slate">
          Measure from the electrical panel along the finished wall and ceiling to the new outlet. We add the doorway detour automatically when selected.
        </p>
      ) : kind === "accessible-route" ? (
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
      ) : coaxRoute ? (
        <p className="mt-3 text-center text-xs leading-5 text-slate">
          Measure the cable path from the router or existing coax source to the new coax wall plate—not a straight line through the room.
        </p>
      ) : fanFinishedRoute ? (
        <p className="mt-3 text-center text-xs leading-5 text-slate">
          Measure from the switch, up the wall, and across the ceiling to the fan location.
        </p>
      ) : (
        <p className="mt-3 text-center text-xs leading-5 text-slate">
          Follow the walls and ceiling the wire will travel—not a straight line through the room.
        </p>
      )}
    </div>
  );
}
