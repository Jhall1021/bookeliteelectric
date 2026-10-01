"use client";

import type { ReactNode, SVGProps } from "react";

import type { AccessClass } from "@/lib/accessSlots";
import { measurementCanCrossDoorway } from "@/lib/electrical/doorwayRouting";

type MeasurementKind =
  | "existing-switch-to-light"
  | "existing-fixture-to-light"
  | "power-to-new-switch"
  | "new-switch-to-light"
  | "outlet-to-tv-outlet"
  | "outlet-to-outlet";

type LightKind = "ceiling" | "wall" | "recessed" | "fan";

const KIND_BY_QUESTION_KEY: Record<string, MeasurementKind> = {
  extension_existing_switch_feet: "existing-switch-to-light",
  extension_existing_fixture_feet: "existing-fixture-to-light",
  extension_power_to_switch_feet: "power-to-new-switch",
  extension_switch_to_fixture_feet: "new-switch-to-light",
  tv_outlet_run_distance: "outlet-to-tv-outlet",
  concealed_route_feet: "outlet-to-outlet",
  surface_route_feet: "outlet-to-outlet",
  doorbell_route_feet: "outlet-to-outlet",
  "new-ethernet-line_distance": "outlet-to-outlet",
  "new-coax-line_distance": "outlet-to-outlet",
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

function Labels({ left, right }: { left: string; right: string }) {
  return (
    <div className="mt-1 grid grid-cols-2 gap-8 text-center text-xs font-semibold text-navy">
      <span>{left}</span>
      <span>{right}</span>
    </div>
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
}) {
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
  const doorwayActive = showDoorway && doorwayChecked;
  const doorway = doorwayActive ? <Doorway /> : null;

  let drawing: ReactNode;
  let labels: { left: string; right: string };

  if (kind === "existing-switch-to-light") {
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
    labels = { left: "Closest power source", right: "New location" };
  }

  return (
    <div className="mt-4 rounded-[1.25rem] border border-sky-200 bg-white px-4 pb-4 pt-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-electric text-sm font-bold text-white" aria-hidden="true">↔</span>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Measure this wiring path</p>
      </div>
      {showDoorway && (
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
      )}
      <div className="mx-auto mt-2 max-w-xl">
        {drawing}
        <Labels {...labels} />
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-slate">
        Follow the walls and ceiling the wire will travel—not a straight line through the room.
      </p>
    </div>
  );
}
