import type { SVGProps } from "react";

// A simplified, stylized New Jersey outline — matching the line-art style
// of the service icon set, NOT a survey-accurate map. Monmouth and Ocean
// counties are filled in the brand's electric blue to show the initial
// service territory; the rest of the state is outline only. As additional
// service areas are added later, more counties can be filled the same way.
export function NewJerseyMap(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 200 280" fill="none" {...props}>
      {/* State outline */}
      <path
        d="M58 8 L75 15 L95 35 L100 55 L115 62 L135 68 L128 78
           L135 110 L140 150 L135 190 L120 230 L105 265 L95 278
           L85 265 L65 230 L50 190 L40 150 L35 110 L30 75
           L35 45 L45 20 Z"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      {/* Monmouth County — northern-central coast */}
      <path
        d="M128 78 L135 68 Q140 90 136 108 Q118 115 100 108 Q96 92 104 80 Q116 74 128 78Z"
        fill="var(--map-fill, rgb(var(--t-accent)))"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      {/* Ocean County — directly south of Monmouth */}
      <path
        d="M136 108 Q140 130 138 152 Q120 168 98 158 Q90 135 96 112 Q118 102 136 108Z"
        fill="var(--map-fill, rgb(var(--t-accent)))"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
