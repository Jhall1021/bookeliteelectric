// Custom line-art icon set — client-provided artwork, matching the logo's
// minimalist single-stroke style. Every icon shares the same viewBox,
// stroke weight, and rounded line caps so they read as one consistent set.
//
// Usage: <ServiceIcon icon="outlet" className="h-8 w-8 text-navy" />
// If `icon` doesn't match a known key, falls back to the bolt icon rather
// than rendering nothing — every service always shows something.

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

function Bolt(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M29 4L14 27h10l-5 17 15-24H24z"/>
    </svg>
  );
}

function Breaker(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="13" y="6" width="22" height="36" rx="3"/>
      <rect x="18" y="13" width="12" height="22" rx="2"/>
      <path d="M20 30l8-12"/>
      <circle cx="24" cy="10" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Camera(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 17h23l8 6v9l-8 6H7z"/>
      <circle cx="17" cy="27.5" r="5"/>
      <circle cx="17" cy="27.5" r="2"/>
      <path d="M38 24l5-3v13l-5-3"/>
    </svg>
  );
}

function Circuit(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 12h11v9h12v-9h11M7 36h11v-9h12v9h11"/>
      <circle cx="7" cy="12" r="2"/>
      <circle cx="41" cy="12" r="2"/>
      <circle cx="7" cy="36" r="2"/>
      <circle cx="41" cy="36" r="2"/>
      <circle cx="24" cy="24" r="2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Doorbell(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="15" y="6" width="18" height="36" rx="9"/>
      <circle cx="24" cy="24" r="5"/>
      <circle cx="24" cy="24" r="1.3" fill="currentColor" stroke="none"/>
      <path d="M20 11h8"/>
    </svg>
  );
}

function Ev(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 29l4-9h21l5 9M7 29h30v8H7z"/>
      <circle cx="14" cy="37" r="2.5"/>
      <circle cx="31" cy="37" r="2.5"/>
      <path d="M34 14h5v7M36 9v5M40 9v5M39 21c0 4-2 6-6 6"/>
    </svg>
  );
}

function ExhaustFan(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="30" height="30" rx="3"/>
      <circle cx="24" cy="24" r="10"/>
      <circle cx="24" cy="24" r="2"/>
      <path d="M24 14c5 1 8 4 8 8M34 24c-1 5-4 8-8 8M24 34c-5-1-8-4-8-8M14 24c1-5 4-8 8-8"/>
    </svg>
  );
}

function ExteriorOutlet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="12" y="12" width="24" height="29" rx="3"/>
      <path d="M13 14l7-9h15l-7 10H13zM35 5v29"/>
      <path d="M18 20c-2 2-2 4 0 6h12c2-2 2-4 0-6zM21 22v4M27 22v4"/>
      <circle cx="24" cy="30" r="1.1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Fan(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M24 5v9M20 5h8M21 14h6"/>
      <ellipse cx="24" cy="23" rx="4" ry="3"/>
      <path d="M20 21L8 15c-3-1-5 2-2 4l12 7M28 21l12-6c3-1 5 2 2 4l-12 7M21 25L9 34c-3 2-1 5 2 4l11-8M27 25l12 9c3 2 1 5-2 4l-11-8"/>
    </svg>
  );
}

function Generator(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="11" width="36" height="27" rx="4"/>
      <circle cx="18" cy="24.5" r="7"/>
      <circle cx="18" cy="24.5" r="3"/>
      <path d="M30 18h7M30 23h7M30 28h5M11 38v4M37 38v4"/>
    </svg>
  );
}

function Inspection(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14 9h20c2 0 3 1 3 3v29H11V12c0-2 1-3 3-3z"/>
      <path d="M19 9V6h10v3M17 24l4 4 9-10M17 34h14"/>
    </svg>
  );
}

function KitchenAppliance(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="7" width="32" height="34" rx="3"/>
      <path d="M8 17h32"/>
      <rect x="13" y="21" width="22" height="13" rx="2"/>
      <path d="M16 12h8"/>
      <circle cx="34" cy="12" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Landscape(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M15 12h18l-4 9H19zM24 21v16M19 41h10"/>
      <path d="M17 24l-7 4M31 24l7 4M18 30l-5 4M30 30l5 4"/>
    </svg>
  );
}

function Laundry(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="6" width="30" height="36" rx="3"/>
      <path d="M9 16h30"/>
      <circle cx="24" cy="28" r="9"/>
      <circle cx="24" cy="28" r="5"/>
      <path d="M14 11h9"/>
      <circle cx="34" cy="11" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Light(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M24 4v7M19 11h10M20 11l-8 18c4-2 8-3 12-3s8 1 12 3l-8-18"/>
      <path d="M12 29c4 2 8 3 12 3s8-1 12-3M24 32v5M17 34l-3 4M31 34l3 4"/>
    </svg>
  );
}

function Mount(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 8v32M36 8v32M12 14h4M12 24h4M12 34h4M32 14h4M32 24h4M32 34h4"/>
      <rect x="16" y="17" width="16" height="15" rx="2"/>
      <path d="M19 24h10"/>
      <circle cx="24" cy="24" r="2"/>
    </svg>
  );
}

function NewOutlet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="5" width="27" height="38" rx="3"/>
      <path d="M14 12c-2 2-3 4-3 7s1 5 3 7h15c2-2 3-4 3-7s-1-5-3-7zM18 16v5M26 16v5"/>
      <circle cx="22" cy="24" r="1.1" fill="currentColor" stroke="none"/>
      <circle cx="37" cy="35" r="7"/>
      <path d="M37 31v8M33 35h8"/>
    </svg>
  );
}

function Outlet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="5" width="28" height="38" rx="3"/>
      <path d="M16 12c-2 2-3 4-3 7s1 5 3 7h16c2-2 3-4 3-7s-1-5-3-7zM19 16v5M29 16v5"/>
      <circle cx="24" cy="24" r="1.1" fill="currentColor" stroke="none"/>
      <path d="M16 29c-2 2-3 4-3 6h22c0-2-1-4-3-6zM19 32v4M29 32v4"/>
    </svg>
  );
}

function Panel(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="8" y="5" width="32" height="38" rx="3"/>
      <rect x="14" y="10" width="20" height="28" rx="2"/>
      <path d="M18 15h6v6h-6zM26 15h4v6h-4zM18 24h6v6h-6zM26 24h4v6h-4zM18 33h12"/>
      <circle cx="37" cy="24" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Pool(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 19c4-3 8-3 12 0s8 3 12 0 8-3 12 0M6 27c4-3 8-3 12 0s8 3 12 0 8-3 12 0M6 35c4-3 8-3 12 0s8 3 12 0 8-3 12 0"/>
      <path d="M12 12h8M28 12h8"/>
    </svg>
  );
}

function Recessed(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 17h24l-3 10H15z"/>
      <ellipse cx="24" cy="28" rx="11" ry="5"/>
      <ellipse cx="24" cy="28" rx="6" ry="2.5"/>
      <path d="M17 14h14"/>
    </svg>
  );
}

function SmokeDetector(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <ellipse cx="24" cy="22" rx="15" ry="9"/>
      <path d="M12 22c2 8 7 12 12 12s10-4 12-12M17 22c2-3 4-4 7-4s5 1 7 4"/>
      <circle cx="24" cy="27" r="1.2" fill="currentColor" stroke="none"/>
      <path d="M19 38c2 2 3 3 5 3s3-1 5-3"/>
    </svg>
  );
}

function Surge(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="10" y="6" width="28" height="36" rx="3"/>
      <path d="M27 11l-8 13h7l-5 13 11-16h-7z"/>
      <circle cx="34" cy="37" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Switch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="12" y="5" width="24" height="38" rx="3"/>
      <circle cx="24" cy="10" r="1.2" fill="currentColor" stroke="none"/>
      <rect x="19" y="15" width="10" height="20" rx="2"/>
      <path d="M20.5 28h7"/>
      <circle cx="24" cy="39" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function Thermostat(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="24" cy="24" r="16"/>
      <circle cx="24" cy="24" r="9"/>
      <path d="M24 24l6-5M24 8v4M40 24h-4M24 40v-4M8 24h4"/>
      <circle cx="24" cy="24" r="1.2" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function TransferSwitch(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="6" width="30" height="36" rx="3"/>
      <path d="M16 13h16M16 35h16M24 17v14M20 21l4-4 4 4M20 27l4 4 4-4"/>
      <circle cx="24" cy="24" r="2"/>
    </svg>
  );
}

function Troubleshooting(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="20" cy="20" r="11"/>
      <path d="M28 28l11 11M22 12l-6 9h6l-5 8"/>
    </svg>
  );
}

function Tv(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="6" y="10" width="36" height="25" rx="2"/>
      <path d="M7 31h34M20 40h8M24 35v5"/>
      <circle cx="24" cy="32.5" r="1" fill="currentColor" stroke="none"/>
    </svg>
  );
}

function UnderCabinet(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M7 10h34v9H7zM11 19v5M37 19v5M10 27h28M14 31h20"/>
      <path d="M16 35h16M19 39h10"/>
    </svg>
  );
}

const ICONS: Record<string, (props: IconProps) => JSX.Element> = {
  "bolt": Bolt,
  "breaker": Breaker,
  "camera": Camera,
  "circuit": Circuit,
  "doorbell": Doorbell,
  "ev": Ev,
  "exhaust-fan": ExhaustFan,
  "exterior-outlet": ExteriorOutlet,
  "fan": Fan,
  "generator": Generator,
  "inspection": Inspection,
  "kitchen-appliance": KitchenAppliance,
  "landscape": Landscape,
  "laundry": Laundry,
  "light": Light,
  "mount": Mount,
  "new-outlet": NewOutlet,
  "outlet": Outlet,
  "panel": Panel,
  "pool": Pool,
  "recessed": Recessed,
  "smoke-detector": SmokeDetector,
  "surge": Surge,
  "switch": Switch,
  "thermostat": Thermostat,
  "transfer-switch": TransferSwitch,
  "troubleshooting": Troubleshooting,
  "tv": Tv,
  "under-cabinet": UnderCabinet,
};

export function ServiceIcon({ icon, ...rest }: { icon?: string | null } & IconProps) {
  const Icon = (icon && ICONS[icon]) || Bolt;
  return <Icon {...rest} />;
}
