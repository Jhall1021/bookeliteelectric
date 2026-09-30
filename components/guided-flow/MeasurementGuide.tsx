import type { ReactNode, SVGProps } from "react";

type MeasurementKind =
  | "existing-switch-to-light"
  | "existing-fixture-to-light"
  | "power-to-new-switch"
  | "new-switch-to-light";

type LightKind = "ceiling" | "wall" | "recessed";

const KIND_BY_QUESTION_KEY: Record<string, MeasurementKind> = {
  extension_existing_switch_feet: "existing-switch-to-light",
  extension_existing_fixture_feet: "existing-fixture-to-light",
  extension_power_to_switch_feet: "power-to-new-switch",
  extension_switch_to_fixture_feet: "new-switch-to-light",
};

function Drawing({ children, ...props }: SVGProps<SVGSVGElement> & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 440 180"
      fill="none"
      aria-hidden="true"
      className="h-auto w-full"
      {...props}
    >
      <defs>
        <marker id="measure-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" className="fill-electric" />
        </marker>
      </defs>
      <path d="M28 146H412M28 24V146H412V24" className="stroke-cardline" strokeWidth="3" strokeLinecap="round" />
      <path d="M28 116H412" className="stroke-cardline/60" strokeWidth="2" strokeDasharray="5 7" />
      {children}
    </svg>
  );
}

function Switch({ x, y, isNew = false }: { x: number; y: number; isNew?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {isNew && <circle cx="0" cy="0" r="25" className="fill-electric/10" />}
      <rect x="-13" y="-21" width="26" height="42" rx="5" className="fill-white stroke-navy" strokeWidth="3" />
      <rect x="-4" y="-10" width="8" height="20" rx="3" className="fill-electric/25 stroke-electric" strokeWidth="2" />
    </g>
  );
}

function PowerSource({ x, y }: { x: number; y: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle cx="0" cy="0" r="25" className="fill-electric/10" />
      <rect x="-14" y="-18" width="28" height="36" rx="6" className="fill-white stroke-navy" strokeWidth="3" />
      <path d="M-6-5V2M6-5V2M-4 9Q0 13 4 9" className="stroke-navy" strokeWidth="2.5" strokeLinecap="round" />
    </g>
  );
}

function CeilingLight({ x, y, isNew = false }: { x: number; y: number; isNew?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {isNew && <circle cx="0" cy="12" r="31" className="fill-electric/10" />}
      <path d="M-18 0H18" className="stroke-navy" strokeWidth="4" strokeLinecap="round" />
      <path d="M0 0V14" className="stroke-navy" strokeWidth="3" strokeLinecap="round" />
      <path d="M-17 30Q0 8 17 30Z" className="fill-white stroke-navy" strokeWidth="3" strokeLinejoin="round" />
      <path d="M-10 37L-15 46M0 38V48M10 37L15 46" className="stroke-electric" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function WallLight({ x, y, isNew = false }: { x: number; y: number; isNew?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {isNew && <circle cx="0" cy="0" r="28" className="fill-electric/10" />}
      <rect x="8" y="-17" width="8" height="34" rx="3" className="fill-white stroke-navy" strokeWidth="3" />
      <path d="M8 0H-5V-7" className="stroke-navy" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-18-7H8M-15-7Q-13-25 0-25Q6-24 8-7" className="fill-white stroke-navy" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M-11 2L-14 10M-3 2V11M5 2L8 10" className="stroke-electric" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function RecessedLight({ x, y, isNew = false }: { x: number; y: number; isNew?: boolean }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      {isNew && <circle cx="0" cy="8" r="28" className="fill-electric/10" />}
      <path d="M-21 0H21" className="stroke-navy" strokeWidth="4" strokeLinecap="round" />
      <path d="M-15 1Q-11 20 0 20Q11 20 15 1" className="fill-white stroke-navy" strokeWidth="3" strokeLinejoin="round" />
      <path d="M-9 28L-13 37M0 29V39M9 28L13 37" className="stroke-electric" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

function Light({ kind, ...props }: { kind: LightKind; x: number; y: number; isNew?: boolean }) {
  if (kind === "wall") return <WallLight {...props} />;
  if (kind === "recessed") return <RecessedLight {...props} />;
  return <CeilingLight {...props} />;
}

function Route({ d }: { d: string }) {
  return (
    <>
      <path d={d} className="stroke-electric/20" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
      <path d={d} className="stroke-electric" strokeWidth="3" strokeDasharray="7 6" strokeLinecap="round" strokeLinejoin="round" markerStart="url(#measure-arrow)" markerEnd="url(#measure-arrow)" />
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

export default function MeasurementGuide({ questionKey, prompt }: { questionKey: string; prompt: string }) {
  const kind = KIND_BY_QUESTION_KEY[questionKey];
  if (!kind) return null;

  const firstRecessed = /first recessed light/i.test(prompt);
  const lightKind: LightKind = firstRecessed
    ? "recessed"
    : /wall sconce|exterior light/i.test(prompt)
      ? "wall"
      : "ceiling";
  const lightLabel = firstRecessed
    ? "First recessed light"
    : /wall sconce/i.test(prompt)
      ? "New wall sconce"
      : /exterior light/i.test(prompt)
        ? "New exterior light"
        : "New ceiling light";
  const targetX = 346;
  const targetY = lightKind === "wall" ? 76 : 42;
  const routeY = lightKind === "wall" ? 76 : 52;

  let drawing: ReactNode;
  let labels: { left: string; right: string };

  if (kind === "existing-switch-to-light") {
    drawing = <Drawing><Route d={`M92 105V${routeY}H${targetX}`} /><Switch x={92} y={105} /><Light kind={lightKind} x={targetX} y={targetY} isNew /></Drawing>;
    labels = { left: "Existing switch", right: lightLabel };
  } else if (kind === "existing-fixture-to-light") {
    drawing = <Drawing><Route d={`M94 ${routeY}H${targetX}`} /><Light kind={lightKind} x={94} y={targetY} /><Light kind={lightKind} x={targetX} y={targetY} isNew /></Drawing>;
    labels = { left: "Existing light", right: lightLabel };
  } else if (kind === "power-to-new-switch") {
    drawing = <Drawing><Route d="M92 119H250V76H346" /><PowerSource x={92} y={119} /><Switch x={346} y={76} isNew /></Drawing>;
    labels = { left: "Closest power source", right: "New switch" };
  } else {
    drawing = <Drawing><Route d={`M92 105V${routeY}H${targetX}`} /><Switch x={92} y={105} isNew /><Light kind={lightKind} x={targetX} y={targetY} isNew /></Drawing>;
    labels = { left: "New switch", right: lightLabel };
  }

  return (
    <div className="mt-4 rounded-card border border-electric/20 bg-electric/[0.035] px-4 pb-3 pt-3">
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Measure this wiring path</p>
      <div className="mx-auto mt-1 max-w-md">
        {drawing}
        <Labels {...labels} />
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-slate">
        Follow the walls and ceiling the wire will travel—not a straight line through the room.
      </p>
    </div>
  );
}
