"use client";

import { useStructure } from "@/components/theme/ThemeContext";

/**
 * A page section, separated and spaced the way the variant asks — ADR-015.
 *
 * HAIRLINE draws a rule between sections; BAND alternates the ground so the
 * boundary is a change of colour; SPACE uses neither and lets the rhythm do
 * the work. Density then decides how much rhythm there is.
 *
 * Sections used to carry `border-t border-cardline` and `py-16` inline, which
 * meant every variant got the same rule at the same interval however different
 * it was supposed to look.
 */
export default function Section(
  { children, divide = false, alt = false, className = "" }:
  { children: React.ReactNode; divide?: boolean; alt?: boolean; className?: string },
) {
  const { sectionBreak, density } = useStructure();
  const pad = density === "spacious" ? "py-24" : density === "compact" ? "py-10" : "py-16";
  // `divide` is opt-in, not the default. Not every section boundary is a break
  // — the original page drew a rule at two of its four, and applying one
  // everywhere handed Elite lines it never shipped with. Which boundaries are
  // breaks is a property of the CONTENT; how a break is drawn is the variant's.
  const rule = divide && sectionBreak === "hairline" ? "border-t border-line" : "";
  // Under BAND the alternation IS the separator, so alternate sections take a
  // different ground. Otherwise `alt` only picks the surface a design already
  // wanted there.
  const ground = sectionBreak === "band" && divide
    ? (alt ? "bg-surface" : "bg-canvas")
    : (alt ? "bg-surface" : "");
  return <section className={`${rule} ${ground} ${pad} ${className}`.trim()}>{children}</section>;
}
