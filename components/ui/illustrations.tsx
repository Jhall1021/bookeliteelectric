/**
 * The larger illustrations behind the setup journey — distinct from the
 * small stroked nav icons in icons.tsx, which stay small on purpose. These
 * are the "coordinated illustrations" the approved mockup shows: a soft
 * pale-blue backdrop, navy/electric-blue line art on top, one electric-blue
 * accent for a sense of life. Every one is TRADE-NEUTRAL — a generic
 * checklist, not a wrench or an outlet — because the shared setup journey
 * runs before a contractor's trade-specific catalog is even installed;
 * trade-specific imagery belongs to ServiceIcon.tsx, gated on the
 * SERVICE's own key, never baked into this shared chrome.
 *
 * Fixed viewBox (160x160), sized by the caller via a wrapping element —
 * `<div className="h-32 w-32">` — so one set of markup serves the journey's
 * 120–160px desktop size and a smaller mobile treatment alike.
 */
import type { SVGProps } from "react";

// Decorative only — every caller pairs this with real, separate caption
// text (see JourneyStep in app/dashboard/page.tsx), so the artwork itself
// carries nothing a screen reader needs to announce.
const wrap = (props: SVGProps<SVGSVGElement>) => ({
  viewBox: "0 0 160 160", fill: "none", "aria-hidden": true, ...props,
});

/** Business profile and owner invitation — a building with a person/ID card. */
export function BusinessIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="80" r="72" className="fill-electric/[0.07]" />
      <rect x="38" y="52" width="60" height="72" rx="6" className="fill-white stroke-navy" strokeWidth="2.5" />
      <path d="M50 68h12M50 80h12M50 92h12M74 68h12M74 80h12" className="stroke-navy/40" strokeWidth="2.5" strokeLinecap="round" />
      <rect x="60" y="104" width="16" height="20" className="fill-electric/15 stroke-navy" strokeWidth="2.5" />
      <g transform="translate(90,86)">
        <rect x="0" y="0" width="46" height="34" rx="6" className="fill-white stroke-electric" strokeWidth="2.5" />
        <circle cx="14" cy="14" r="7" className="fill-electric/20 stroke-electric" strokeWidth="2" />
        <path d="M5 27c1.5-6 6-8.5 9-8.5s7.5 2.5 9 8.5" className="stroke-electric" strokeWidth="2" strokeLinecap="round" />
        <path d="M28 12h12M28 19h9" className="stroke-navy/30" strokeWidth="2" strokeLinecap="round" />
      </g>
      <circle cx="122" cy="80" r="5" className="fill-electric" />
    </svg>
  );
}

/** Service selection — a checklist with an item being picked. */
export function ServicesIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="80" r="72" className="fill-electric/[0.07]" />
      <rect x="46" y="34" width="68" height="92" rx="8" className="fill-white stroke-navy" strokeWidth="2.5" />
      <rect x="62" y="26" width="36" height="16" rx="4" className="fill-navy/10 stroke-navy" strokeWidth="2" />
      <g strokeLinecap="round">
        <rect x="58" y="58" width="14" height="14" rx="3" className="fill-success/15 stroke-success" strokeWidth="2.5" />
        <path d="M61.5 65l2.5 2.5 5-5" className="stroke-success" strokeWidth="2.2" fill="none" />
        <path d="M80 65h24" className="stroke-navy/50" strokeWidth="2.5" />
        <rect x="58" y="80" width="14" height="14" rx="3" className="fill-electric/15 stroke-electric" strokeWidth="2.5" />
        <path d="M80 87h24" className="stroke-navy/50" strokeWidth="2.5" />
        <rect x="58" y="102" width="14" height="14" rx="3" className="fill-none stroke-cardline" strokeWidth="2.5" />
        <path d="M80 109h18" className="stroke-navy/25" strokeWidth="2.5" />
      </g>
      <g transform="translate(94,74)">
        <circle r="14" className="fill-white stroke-electric" strokeWidth="2.5" />
        <path d="M-5 0l3.5 3.5L6 -4" className="stroke-electric" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  );
}

/** Pricing and labor time — a stopwatch beside a rate card. */
export function PricingIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="80" r="72" className="fill-electric/[0.07]" />
      <g transform="translate(34,40)">
        <rect x="0" y="14" width="58" height="70" rx="8" className="fill-white stroke-navy" strokeWidth="2.5" />
        <path d="M10 30h38M10 42h38M10 54h24" className="stroke-navy/35" strokeWidth="2.5" strokeLinecap="round" />
        <circle cx="44" cy="66" r="12" className="fill-success/15 stroke-success" strokeWidth="2.5" />
        <path d="M40 66h8M44 62v8" className="stroke-success" strokeWidth="2.2" strokeLinecap="round" />
      </g>
      <g transform="translate(88,30)">
        <circle r="30" className="fill-white stroke-electric" strokeWidth="3" />
        <path d="M0 -30v-8M-6 -38h12" className="stroke-electric" strokeWidth="3" strokeLinecap="round" />
        <path d="M0 0v-18M0 0l12 8" className="stroke-electric" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <circle r="2.5" className="fill-electric" />
      </g>
      <circle cx="40" cy="120" r="4" className="fill-electric" />
    </svg>
  );
}

/** Customer booking / storefront — a storefront with a confirmed booking chip. */
export function BookingIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="80" r="72" className="fill-electric/[0.07]" />
      <path d="M40 60l4-24h72l4 24" className="fill-none stroke-navy" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M40 60a10 10 0 0020 0 10 10 0 0020 0 10 10 0 0020 0 10 10 0 0020 0" className="fill-white stroke-navy" strokeWidth="2.5" />
      <rect x="46" y="60" width="68" height="58" className="fill-white stroke-navy" strokeWidth="2.5" />
      <rect x="72" y="86" width="16" height="32" className="fill-electric/15 stroke-navy" strokeWidth="2.2" />
      <rect x="54" y="70" width="14" height="12" className="fill-navy/10 stroke-navy/50" strokeWidth="2" />
      <rect x="92" y="70" width="14" height="12" className="fill-navy/10 stroke-navy/50" strokeWidth="2" />
      <g transform="translate(102,96)">
        <rect x="0" y="0" width="40" height="28" rx="14" className="fill-success/15 stroke-success" strokeWidth="2.5" />
        <path d="M10 14l4 4 8-9" className="stroke-success" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <circle cx="34" cy="100" r="4" className="fill-electric" />
    </svg>
  );
}

/** An empty booking calendar — nothing scheduled yet, deliberately quiet. */
export function EmptyCalendarIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="80" r="72" className="fill-electric/[0.06]" />
      <rect x="36" y="42" width="88" height="76" rx="8" className="fill-white stroke-navy" strokeWidth="2.5" />
      <path d="M36 62h88" className="stroke-navy" strokeWidth="2.5" />
      <path d="M58 34v16M102 34v16" className="stroke-navy" strokeWidth="2.5" strokeLinecap="round" />
      {[0, 1, 2, 3].flatMap((row) =>
        [0, 1, 2, 3].map((col) => (
          <rect
            key={`${row}-${col}`}
            x={50 + col * 18} y={76 + row * 10} width="10" height="4" rx="2"
            className="fill-cardline"
          />
        ))
      )}
    </svg>
  );
}
