import type { SVGProps } from "react";

/**
 * A recognizable face for one of a contractor's own services — gated on the
 * service's own `templateKey`, never on the contractor's trade as a whole.
 * Electrical is the only catalog with templated services today, so every
 * specific case here is an electrical outcome; a plumbing (or any
 * hand-built) service simply falls through to the neutral tag, which is
 * the point — this file adds a face PER OUTCOME as trades gain templates,
 * it does not assume electrical everywhere. Purely decorative: it never
 * stands in for a name, a price, or what the service actually does.
 */
// Decorative only — the service's own name (rendered as real, separate
// text next to every icon) already says what it is. `aria-hidden` keeps
// a screen reader from announcing SVG innards (a "T"/"R" test/reset
// glyph, a stray shape label) as if they were content in their own right.
const base = (props: SVGProps<SVGSVGElement>) => ({ viewBox: "0 0 48 48", fill: "none", "aria-hidden": true, ...props });

function ReceptacleFace(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="8" y="4" width="32" height="40" rx="6" className="fill-electric/10 stroke-electric" strokeWidth="2" />
      <g className="stroke-navy" strokeWidth="2" strokeLinecap="round">
        <path d="M17 15v6M23 15v6" />
        <path d="M20 25v3" />
      </g>
      <g className="stroke-navy" strokeWidth="2" strokeLinecap="round">
        <path d="M25 30v6M31 30v6" />
        <path d="M28 40v3" />
      </g>
    </svg>
  );
}

function GfciFace(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="8" y="4" width="32" height="40" rx="6" className="fill-electric/10 stroke-electric" strokeWidth="2" />
      <g className="stroke-navy" strokeWidth="2" strokeLinecap="round">
        <path d="M17 13v5M23 13v5" />
        <path d="M20 22v2.5" />
      </g>
      <rect x="14" y="30" width="9" height="6" rx="1.5" className="fill-white stroke-navy" strokeWidth="1.6" />
      <rect x="25" y="30" width="9" height="6" rx="1.5" className="fill-white stroke-navy" strokeWidth="1.6" />
    </svg>
  );
}

function SwitchFace(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="8" y="4" width="32" height="40" rx="6" className="fill-electric/10 stroke-electric" strokeWidth="2" />
      <rect x="17" y="13" width="14" height="22" rx="4" className="fill-white stroke-navy" strokeWidth="2" />
      <path d="M24 17v6" className="stroke-navy" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

function LightFixtureFace(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <circle cx="24" cy="20" r="16" className="fill-electric/10 stroke-electric" strokeWidth="2" />
      <path d="M17 16a7 7 0 0114 0c0 4-3 5-3 9h-8c0-4-3-5-3-9z" className="fill-white stroke-navy" strokeWidth="2" />
      <path d="M20 25h8M21 29h6" className="stroke-navy" strokeWidth="2" strokeLinecap="round" />
      <path d="M24 6v3M12 20H9M39 20h-3M15 11l-2-2M33 11l2-2" className="stroke-navy/40" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function GenericServiceFace(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base(props)}>
      <rect x="6" y="6" width="36" height="36" rx="8" className="fill-slate/10 stroke-slate" strokeWidth="2" />
      <path d="M28.5 12.6a8 8 0 00-10.8 10.8L12 29.1V36h6.9l5.7-5.7a8 8 0 0010.8-10.8l-4.2 4.2-3.8-.8-.8-3.8 4.2-4.2z"
            className="fill-white stroke-slate" strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  );
}

export function ServiceIcon({ templateKey, ...props }: { templateKey: string | null } & SVGProps<SVGSVGElement>) {
  const key = templateKey ?? "";
  if (/gfci/i.test(key)) return <GfciFace {...props} />;
  if (/outlet|receptacle/i.test(key)) return <ReceptacleFace {...props} />;
  if (/switch/i.test(key)) return <SwitchFace {...props} />;
  if (/light|fixture|sconce|chandelier/i.test(key)) return <LightFixtureFace {...props} />;
  return <GenericServiceFace {...props} />;
}
