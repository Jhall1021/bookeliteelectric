"use client";

import { useStructure } from "@/components/theme/ThemeContext";

/**
 * A card, treated the way the variant asks — ADR-015 Phase 3.
 *
 * OUTLINED sits in the page behind a hairline. RAISED lifts off it with an
 * elevation and no border. The two are mutually exclusive: a bordered card
 * carrying a heavy shadow reads as a mistake rather than a choice.
 *
 * `border-cardline bg-white` was written inline at every card site, which is
 * why every variant had the same card however different it was meant to look —
 * and `bg-white` in particular bypasses the theme outright, so a variant with
 * a tinted surface would leave these panels stranded on pure white.
 */
export default function Card(
  { children, className = "" }: { children: React.ReactNode; className?: string },
) {
  const { card } = useStructure();
  const treatment = card === "raised"
    ? "bg-surface shadow-card"
    : "border border-line bg-surface shadow-card";
  return <div className={`rounded-card ${treatment} ${className}`.trim()}>{children}</div>;
}
