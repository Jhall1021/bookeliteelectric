/**
 * The larger illustrations behind the setup journey — distinct from the
 * small stroked nav icons in icons.tsx, which stay small on purpose. These
 * are the "coordinated illustrations" the approved mockup shows. Every one
 * is TRADE-NEUTRAL — a generic checklist, not a wrench or an outlet —
 * because the shared setup journey runs before a contractor's trade-specific
 * catalog is even installed; trade-specific imagery belongs to
 * ServiceIcon.tsx, gated on the SERVICE's own key, never baked into this
 * shared chrome.
 *
 * ONE CONSISTENT STYLE, revised after the first pass read as "an enlarged
 * interface icon" rather than an illustration: a cluster of LAYERED blocks
 * (offset/rotated panels, a popped-out or overlapping accent shape) built
 * mostly from FILLED shapes rather than thin outlines, with the electric-blue
 * accent carrying real weight — a solid awning, header band or panel, not a
 * faint tint — against pale washes and navy line detail. Every illustration
 * shares that same vocabulary (a soft backdrop circle, layered rects, one
 * bold blue block, small accent dots) so the set reads as one family.
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

/** Business profile and owner invitation — a storefront front with an owner ID badge. */
export function BusinessIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="82" r="66" className="fill-electric/[0.08]" />
      <rect x="28" y="54" width="76" height="70" rx="8" className="fill-navy/[0.05] stroke-navy/60" strokeWidth="3" />
      <rect x="22" y="42" width="88" height="18" rx="9" className="fill-electric" />
      <circle cx="38" cy="61" r="4" className="fill-electric/50" />
      <circle cx="66" cy="61" r="4" className="fill-electric/50" />
      <circle cx="94" cy="61" r="4" className="fill-electric/50" />
      <rect x="38" y="68" width="20" height="20" rx="3" className="fill-electric/15 stroke-navy/50" strokeWidth="2" />
      <rect x="74" y="68" width="20" height="20" rx="3" className="fill-electric/15 stroke-navy/50" strokeWidth="2" />
      <rect x="47" y="68" width="2" height="20" className="fill-navy/30" />
      <rect x="83" y="68" width="2" height="20" className="fill-navy/30" />
      <rect x="60" y="94" width="22" height="30" rx="3" className="fill-navy/15 stroke-navy/60" strokeWidth="2.5" />
      <circle cx="76" cy="110" r="2" className="fill-navy/60" />
      <rect x="88" y="98" width="44" height="34" rx="7" className="fill-white stroke-navy/70" strokeWidth="3" />
      <circle cx="102" cy="112" r="7" className="fill-electric" />
      <rect x="113" y="107" width="14" height="3.5" rx="1.75" className="fill-navy/40" />
      <rect x="113" y="114" width="10" height="3.5" rx="1.75" className="fill-navy/25" />
      <circle cx="126" cy="104" r="3" className="fill-electric/50" />
      <rect x="26" y="126" width="80" height="5" rx="2.5" className="fill-navy/[0.08]" />
    </svg>
  );
}

/** Service selection — a checklist card with one item picked, and it popping onto its own card. */
export function ServicesIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="82" r="66" className="fill-electric/[0.08]" />
      <g transform="rotate(-8 80 90)">
        <rect x="34" y="46" width="68" height="88" rx="10" className="fill-navy/[0.04] stroke-navy/25" strokeWidth="2" />
        <path d="M90 46 L102 46 L102 58 Z" className="fill-navy/10" />
      </g>
      <g transform="rotate(-3 80 90)">
        <rect x="38" y="40" width="68" height="88" rx="10" className="fill-warmwhite stroke-navy/35" strokeWidth="2" />
      </g>
      <rect x="30" y="34" width="68" height="92" rx="10" className="fill-white stroke-navy/70" strokeWidth="3" />
      <rect x="42" y="48" width="8" height="8" rx="2" className="fill-electric/15 stroke-navy/40" strokeWidth="1.5" />
      <rect x="56" y="50" width="32" height="4" rx="2" className="fill-navy/20" />
      <rect x="42" y="66" width="8" height="8" rx="2" className="fill-electric/15 stroke-navy/40" strokeWidth="1.5" />
      <rect x="56" y="68" width="28" height="4" rx="2" className="fill-navy/15" />
      <rect x="42" y="84" width="8" height="8" rx="2" className="fill-electric" />
      <path d="M43.5 88 L46 90.5 L50.5 85" className="stroke-white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="56" y="86" width="34" height="4" rx="2" className="fill-electric/60" />
      <rect x="42" y="102" width="8" height="8" rx="2" className="fill-electric/15 stroke-navy/40" strokeWidth="1.5" />
      <rect x="56" y="104" width="24" height="4" rx="2" className="fill-navy/15" />
      <circle cx="92" cy="80" r="3" className="fill-electric/50" />
      <circle cx="100" cy="68" r="2.5" className="fill-electric/35" />
      <circle cx="106" cy="56" r="2" className="fill-electric/20" />
      <rect x="100" y="28" width="38" height="30" rx="7" className="fill-electric" />
      <path d="M110 43 L116 49 L128 37" className="stroke-white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Pricing and labor time — a rate card with a filled price block, beside a stopwatch. */
export function PricingIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="82" r="66" className="fill-electric/[0.08]" />
      <rect x="24" y="70" width="72" height="58" rx="9" className="fill-white stroke-navy/65" strokeWidth="3" />
      <rect x="32" y="78" width="40" height="18" rx="5" className="fill-electric" />
      <circle cx="32" cy="87" r="2.5" className="fill-white" />
      <rect x="32" y="102" width="48" height="4.5" rx="2.25" className="fill-navy/20" />
      <rect x="32" y="110" width="34" height="4.5" rx="2.25" className="fill-navy/15" />
      <rect x="32" y="118" width="40" height="4.5" rx="2.25" className="fill-navy/[0.1]" />
      <rect x="104" y="30" width="10" height="9" rx="3" className="fill-navy/70" />
      <g transform="rotate(-35 96 40)">
        <rect x="91" y="35" width="8" height="7" rx="2" className="fill-navy/50" />
      </g>
      <circle cx="110" cy="64" r="30" className="fill-electric/15 stroke-navy/70" strokeWidth="3" />
      <circle cx="110" cy="64" r="21" className="fill-white stroke-navy/25" strokeWidth="1.5" />
      <rect x="108" y="44" width="4" height="7" rx="2" className="fill-navy/40" />
      <rect x="108" y="77" width="4" height="7" rx="2" className="fill-navy/40" />
      <rect x="90" y="62" width="7" height="4" rx="2" className="fill-navy/40" />
      <rect x="123" y="62" width="7" height="4" rx="2" className="fill-navy/40" />
      <path d="M110 64 L110 50" className="stroke-navy" strokeWidth="3" strokeLinecap="round" />
      <path d="M110 64 L120 70" className="stroke-navy" strokeWidth="3" strokeLinecap="round" />
      <circle cx="110" cy="64" r="3" className="fill-electric" />
      <circle cx="98" cy="54" r="2.5" className="fill-electric/40" />
      <circle cx="90" cy="48" r="2" className="fill-electric/25" />
      <rect x="22" y="132" width="96" height="5" rx="2.5" className="fill-navy/[0.07]" />
    </svg>
  );
}

/** Customer booking / storefront — a storefront beside a confirmed-booking card. */
export function BookingIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="82" r="66" className="fill-electric/[0.08]" />
      <rect x="20" y="62" width="68" height="62" rx="8" className="fill-navy/[0.05] stroke-navy/60" strokeWidth="3" />
      <rect x="14" y="50" width="80" height="16" rx="8" className="fill-electric" />
      <circle cx="28" cy="66" r="3.5" className="fill-electric/50" />
      <circle cx="54" cy="66" r="3.5" className="fill-electric/50" />
      <circle cx="80" cy="66" r="3.5" className="fill-electric/50" />
      <rect x="30" y="76" width="20" height="18" rx="3" className="fill-electric/15 stroke-navy/45" strokeWidth="2" />
      <rect x="58" y="90" width="20" height="34" rx="3" className="fill-navy/15 stroke-navy/55" strokeWidth="2.5" />
      <circle cx="72" cy="108" r="2" className="fill-navy/60" />
      <rect x="78" y="82" width="54" height="44" rx="8" className="fill-white stroke-navy/70" strokeWidth="3" />
      <rect x="78" y="82" width="54" height="16" rx="8" className="fill-electric" />
      <rect x="86" y="104" width="10" height="9" rx="2" className="fill-navy/15" />
      <rect x="100" y="104" width="10" height="9" rx="2" className="fill-navy/15" />
      <rect x="114" y="104" width="10" height="9" rx="2" className="fill-success" />
      <circle cx="132" cy="82" r="10" className="fill-success" />
      <path d="M127 82 L130.5 85.5 L137 78" className="stroke-white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M132 68 L132 64" className="stroke-success/50" strokeWidth="2" strokeLinecap="round" />
      <path d="M144 82 L148 82" className="stroke-success/50" strokeWidth="2" strokeLinecap="round" />
      <rect x="16" y="128" width="76" height="5" rx="2.5" className="fill-navy/[0.08]" />
    </svg>
  );
}

/** An empty booking calendar — nothing scheduled yet, deliberately quiet. */
export function EmptyCalendarIllustration(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...wrap(props)}>
      <circle cx="80" cy="82" r="66" className="fill-electric/[0.07]" />
      <rect x="58" y="28" width="9" height="18" rx="4.5" className="fill-navy/50" />
      <rect x="93" y="28" width="9" height="18" rx="4.5" className="fill-navy/50" />
      <rect x="26" y="40" width="108" height="94" rx="12" className="fill-white stroke-navy/55" strokeWidth="3" />
      <rect x="26" y="40" width="108" height="26" rx="12" className="fill-electric" />
      <circle cx="62.5" cy="53" r="2.5" className="fill-white/60" />
      <circle cx="97.5" cy="53" r="2.5" className="fill-white/60" />
      <rect x="36" y="76" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <rect x="60" y="76" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <rect x="84" y="76" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <rect x="108" y="76" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <rect x="36" y="98" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <rect x="60" y="98" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <rect x="84" y="98" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <rect x="108" y="98" width="18" height="16" rx="3" className="fill-navy/[0.04] stroke-cardline" strokeWidth="1.5" />
      <circle cx="69" cy="84" r="3" className="fill-electric/40" />
      <circle cx="132" cy="124" r="8" className="stroke-navy/25" strokeWidth="2" />
      <rect x="24" y="138" width="112" height="5" rx="2.5" className="fill-navy/[0.06]" />
    </svg>
  );
}
