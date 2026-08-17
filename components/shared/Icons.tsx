// Custom line-art icon set — hand-built to match the logo's minimalist,
// single-stroke style rather than pulling in an icon library. Every icon
// shares the same viewBox, stroke weight, and rounded line caps so they
// feel like one consistent set regardless of subject.
//
// Usage: <ServiceIcon icon="outlet" className="h-8 w-8 text-navy" />
// If `icon` doesn't match a known key, falls back to a generic bolt icon
// rather than rendering nothing — every service always shows something.

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

function Outlet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="12" y="8" width="24" height="32" rx="4" />
      <line x1="19" y1="18" x2="19" y2="24" />
      <line x1="29" y1="18" x2="29" y2="24" />
      <path d="M20 30a4 4 0 0 0 8 0" />
    </svg>
  );
}

function NewOutlet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="10" width="22" height="28" rx="4" />
      <line x1="15" y1="19" x2="15" y2="24" />
      <line x1="24" y1="19" x2="24" y2="24" />
      <path d="M16 29a3.5 3.5 0 0 0 7 0" />
      <circle cx="36" cy="34" r="7" />
      <line x1="36" y1="31" x2="36" y2="37" />
      <line x1="33" y1="34" x2="39" y2="34" />
    </svg>
  );
}

function ExteriorOutlet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="12" y="14" width="24" height="26" rx="4" />
      <line x1="19" y1="24" x2="19" y2="29" />
      <line x1="29" y1="24" x2="29" y2="29" />
      <path d="M20 33a4 4 0 0 0 8 0" />
      <path d="M12 14v-3a5 5 0 0 1 5-5h14" />
    </svg>
  );
}

function Switch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="14" y="8" width="20" height="32" rx="4" />
      <rect x="19" y="13" width="10" height="14" rx="2" />
    </svg>
  );
}

function Light(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <line x1="24" y1="6" x2="24" y2="14" />
      <path d="M15 14h18l-3 14H18z" />
      <line x1="19" y1="33" x2="19" y2="38" />
      <line x1="24" y1="33" x2="24" y2="40" />
      <line x1="29" y1="33" x2="29" y2="38" />
    </svg>
  );
}

function Recessed(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="24" cy="18" r="10" />
      <circle cx="24" cy="18" r="4" />
      <line x1="24" y1="30" x2="24" y2="35" />
      <line x1="18" y1="29" x2="15" y2="33" />
      <line x1="30" y1="29" x2="33" y2="33" />
    </svg>
  );
}

function UnderCabinet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="14" width="32" height="6" rx="3" />
      <line x1="14" y1="26" x2="14" y2="31" />
      <line x1="24" y1="26" x2="24" y2="33" />
      <line x1="34" y1="26" x2="34" y2="31" />
    </svg>
  );
}

function Landscape(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <line x1="8" y1="38" x2="40" y2="38" />
      <line x1="24" y1="38" x2="24" y2="18" />
      <path d="M17 18a7 7 0 0 1 14 0z" />
    </svg>
  );
}

function Fan(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <line x1="24" y1="6" x2="24" y2="12" />
      <circle cx="24" cy="24" r="3" />
      <path d="M24 24C24 16 18 12 12 14c0 7 6 11 12 10z" />
      <path d="M24 24c7 2 14-1 15-8-7-3-13 1-15 8z" />
      <path d="M24 24c-2 7 2 13 9 15 4-6 1-13-9-15z" />
    </svg>
  );
}

function ExhaustFan(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="30" height="30" rx="4" />
      <circle cx="24" cy="24" r="8" />
      <path d="M24 24c0-4 3-6 6-5" />
      <path d="M24 24c-4 1-6-2-5-6" />
      <path d="M24 24c1 4-1 7-5 7" />
    </svg>
  );
}

function Tv(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="14" y="10" width="28" height="20" rx="2" />
      <line x1="28" y1="36" x2="28" y2="30" />
      <line x1="22" y1="36" x2="34" y2="36" />
      <path d="M6 16h6M6 22h6M6 10h4" />
    </svg>
  );
}

function Mount(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <line x1="10" y1="8" x2="10" y2="40" />
      <path d="M10 16h10a4 4 0 0 1 4 4v4" />
      <rect x="24" y="20" width="14" height="10" rx="2" />
    </svg>
  );
}

function KitchenAppliance(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="8" width="28" height="32" rx="3" />
      <line x1="10" y1="18" x2="38" y2="18" />
      <circle cx="18" cy="13" r="1.6" fill="currentColor" stroke="none" />
      <rect x="15" y="24" width="18" height="12" rx="2" />
    </svg>
  );
}

function Laundry(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="8" width="28" height="32" rx="3" />
      <circle cx="24" cy="26" r="9" />
      <circle cx="24" cy="26" r="4" />
      <line x1="16" y1="13" x2="20" y2="13" />
    </svg>
  );
}

function SmokeDetector(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <line x1="24" y1="6" x2="24" y2="11" />
      <circle cx="24" cy="24" r="13" />
      <circle cx="24" cy="24" r="6" />
      <circle cx="19" cy="19" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="29" cy="19" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="19" cy="29" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="29" cy="29" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

function Surge(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="12" y="7" width="24" height="34" rx="3" />
      <path d="M26 14l-8 12h6l-4 10 12-14h-7z" />
    </svg>
  );
}

function Inspection(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="11" y="9" width="26" height="32" rx="3" />
      <rect x="18" y="6" width="12" height="6" rx="2" />
      <path d="M17 24l5 5 9-11" />
    </svg>
  );
}

function Doorbell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="16" y="6" width="16" height="26" rx="4" />
      <circle cx="24" cy="19" r="4" />
      <path d="M12 38c2-5 6-8 12-8s10 3 12 8" />
    </svg>
  );
}

function Camera(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="17" width="26" height="17" rx="3" />
      <circle cx="20" cy="25.5" r="6" />
      <path d="M33 22l8-4v13l-8-4z" />
    </svg>
  );
}

function Thermostat(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="24" cy="24" r="15" />
      <circle cx="24" cy="24" r="6" />
      <line x1="24" y1="13" x2="24" y2="16" />
    </svg>
  );
}

function Breaker(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="9" width="28" height="30" rx="3" />
      <rect x="19" y="17" width="10" height="16" rx="2" />
      <line x1="24" y1="17" x2="24" y2="21" />
    </svg>
  );
}

function Panel(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="6" width="28" height="36" rx="3" />
      <line x1="17" y1="13" x2="17" y2="35" />
      <line x1="24" y1="13" x2="24" y2="35" />
      <line x1="31" y1="13" x2="31" y2="35" />
    </svg>
  );
}

function Troubleshooting(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="21" cy="21" r="12" />
      <line x1="30" y1="30" x2="40" y2="40" />
      <path d="M18 21l3-5 2 8 3-5" />
    </svg>
  );
}

function Ev(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 30V22a3 3 0 0 1 3-3l4-6h14l4 6a3 3 0 0 1 3 3v8" />
      <rect x="4" y="30" width="34" height="6" rx="2" />
      <circle cx="13" cy="39" r="3" />
      <circle cx="31" cy="39" r="3" />
      <path d="M40 18v10M37 21h6" />
    </svg>
  );
}

function Circuit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10" cy="12" r="3" />
      <circle cx="38" cy="12" r="3" />
      <circle cx="24" cy="36" r="3" />
      <path d="M13 12h22M24 15v9M13 12l8 12M35 12l-8 12" />
    </svg>
  );
}

function Generator(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="7" y="16" width="34" height="20" rx="3" />
      <circle cx="16" cy="26" r="4" />
      <line x1="24" y1="20" x2="24" y2="32" />
      <line x1="30" y1="20" x2="34" y2="20" />
      <line x1="30" y1="26" x2="34" y2="26" />
      <line x1="30" y1="32" x2="34" y2="32" />
    </svg>
  );
}

function TransferSwitch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="8" width="28" height="32" rx="3" />
      <path d="M24 16v6M18 26l6-4 6 4" />
      <line x1="24" y1="26" x2="24" y2="34" />
    </svg>
  );
}

function Pool(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 18c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0" />
      <path d="M6 26c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0" />
      <path d="M6 34c3-3 6-3 9 0s6 3 9 0 6-3 9 0 6 3 9 0" />
    </svg>
  );
}

function Bolt(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M26 6L12 27h10l-4 15 18-24H26z" />
    </svg>
  );
}

const ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  outlet: Outlet,
  "new-outlet": NewOutlet,
  "exterior-outlet": ExteriorOutlet,
  switch: Switch,
  light: Light,
  lighting: Light,
  recessed: Recessed,
  "under-cabinet": UnderCabinet,
  landscape: Landscape,
  fan: Fan,
  "exhaust-fan": ExhaustFan,
  tv: Tv,
  mount: Mount,
  appliance: KitchenAppliance,
  "kitchen-appliance": KitchenAppliance,
  laundry: Laundry,
  shield: SmokeDetector,
  "smoke-detector": SmokeDetector,
  surge: Surge,
  inspection: Inspection,
  "smart-home": Doorbell,
  doorbell: Doorbell,
  camera: Camera,
  thermostat: Thermostat,
  breaker: Breaker,
  panel: Panel,
  troubleshooting: Troubleshooting,
  ev: Ev,
  circuit: Circuit,
  generator: Generator,
  "transfer-switch": TransferSwitch,
  pool: Pool,
  bolt: Bolt,
};

export function ServiceIcon({ icon, ...rest }: { icon?: string | null } & IconProps) {
  const Icon = (icon && ICONS[icon]) || Bolt;
  return <Icon {...rest} />;
}
