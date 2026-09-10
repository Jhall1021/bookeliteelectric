/**
 * §12/§13 of the brief — the two summaries, built from the same result.
 * Pure string formatting, deterministic, no branching on anything the
 * customer didn't place or tag. The wording discipline in §21 is enforced
 * structurally here (never write "we determined," "code compliant," an
 * exact hole count, or a hidden-path claim) and checked mechanically in
 * invariants.ts against the proof-scenario fixtures.
 */

import type { RouteAssistResult } from "./types";

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function titleCase(value: string): string {
  return value.charAt(0) + value.slice(1).toLowerCase();
}

/** §12 — short, plain-language, no confidence numbers, no field names. */
export function homeownerSummaryLines(result: RouteAssistResult): string[] {
  const lines: string[] = [];

  if (result.mode === "SURFACE" || result.mode === "UNSURE") {
    if (result.estimatedTotalRouteLengthFt != null) {
      lines.push(`Approx. ${result.estimatedTotalRouteLengthFt} ft`);
    }
    const turns = result.insideCornersCount + result.outsideCornersCount;
    if (turns > 0) lines.push(pluralize(turns, "turn"));
    if (result.doorwayBypassesCount > 0) lines.push(pluralize(result.doorwayBypassesCount, "doorway"));
    if (result.windowBypassesCount > 0) lines.push(pluralize(result.windowBypassesCount, "window"));
    if (result.wallToCeilingTransitionsCount > 0) lines.push("Wall-to-ceiling transition");
    if (result.wallToFloorTransitionsCount > 0) lines.push("Wall-to-floor transition");
    if (result.mode === "SURFACE") lines.push("Surface-mounted installation");
  }

  if (result.mode === "CONCEALED") {
    lines.push(
      result.sameWall === true
        ? "Same wall"
        : result.sameWall === false
          ? "Different walls"
          : "Wall layout not fully confirmed"
    );
    if (result.doorwayBypassesCount > 0) {
      lines.push(`${pluralize(result.doorwayBypassesCount, "doorway")} between locations`);
    }
    if (result.concealedRouteComplexity) {
      lines.push(`${titleCase(result.concealedRouteComplexity)} routing complexity`);
    }
    if (result.drywallAccessAllowed === true) lines.push("Drywall access allowed");
  }

  lines.push("The electrician will confirm the final route onsite.");
  return lines;
}

/** §13 — richer, structured, for the contractor's view of the job. */
export function contractorSummary(result: RouteAssistResult): string {
  const lines: string[] = ["ROUTE ASSIST", ""];
  lines.push("Destination:", `  ${titleCase(result.destinationType.replace(/_/g, " "))}`, "");
  lines.push("Route mode:", `  ${titleCase(result.mode)}`, "");

  if (result.mode === "SURFACE" || result.mode === "UNSURE") {
    if (result.estimatedTotalRouteLengthFt != null) {
      lines.push("Estimated route:", `  ${result.estimatedTotalRouteLengthFt} ft`, "");
    }
    lines.push("Geometry:");
    const turns = result.insideCornersCount + result.outsideCornersCount;
    if (turns > 0) lines.push(`  ${pluralize(turns, "direction change")}`);
    if (result.insideCornersCount > 0) lines.push(`  ${pluralize(result.insideCornersCount, "inside corner")}`);
    if (result.outsideCornersCount > 0) lines.push(`  ${pluralize(result.outsideCornersCount, "outside corner")}`);
    if (result.doorwayBypassesCount > 0) lines.push(`  ${pluralize(result.doorwayBypassesCount, "doorway bypass")}`);
    if (result.windowBypassesCount > 0) lines.push(`  ${pluralize(result.windowBypassesCount, "window bypass")}`);
    if (result.wallToCeilingTransitionsCount > 0) lines.push(`  ${pluralize(result.wallToCeilingTransitionsCount, "wall-to-ceiling transition")}`);
    if (result.wallToFloorTransitionsCount > 0) lines.push(`  ${pluralize(result.wallToFloorTransitionsCount, "wall-to-floor transition")}`);
    if (result.verticalTransitionsCount > 0) lines.push(`  ${pluralize(result.verticalTransitionsCount, "vertical run")}`);
    lines.push("");
  }

  if (result.mode === "CONCEALED") {
    lines.push(
      "Same wall:",
      `  ${result.sameWall === true ? "Yes" : result.sameWall === false ? "No" : "Not fully confirmed"}`,
      ""
    );
    lines.push("Doorways:", `  ${result.doorwayBypassesCount}`, "");
    lines.push("Wall transitions:", `  ${result.wallTransitionsCount}`, "");
    if (result.estimatedTotalRouteLengthFt != null) {
      lines.push("Estimated visible path:", `  ${result.estimatedTotalRouteLengthFt} ft`, "");
    }
    lines.push(
      "Access:",
      `  ${result.drywallAccessAllowed === true ? "Customer permits drywall cuts" : result.drywallAccessAllowed === false ? "Customer prefers no drywall cuts" : "Not yet confirmed"}`,
      ""
    );
    if (result.concealedRouteComplexity) {
      lines.push("Route complexity:", `  ${titleCase(result.concealedRouteComplexity)}`, "");
    }
    if (result.suggestedAccessOpeningsMin != null && result.suggestedAccessOpeningsMax != null) {
      lines.push(
        "Suggested access-opening range:",
        `  ${result.suggestedAccessOpeningsMin}–${result.suggestedAccessOpeningsMax}`,
        ""
      );
    }
  }

  lines.push("Customer:", `  ${result.customerConfirmedRoute ? "Confirmed route" : "Has not confirmed route"}`);
  if (result.mode === "SURFACE") lines.push("  Surface raceway acceptable");
  lines.push("");
  lines.push("Photos:", `  ${result.captureArtifacts.imageIds.length}`, "");
  lines.push("Review:", `  ${result.needsContractorReview ? "Required" : "Not required"}`);
  if (result.customerNotes) lines.push("", "Customer notes:", `  ${result.customerNotes}`);

  return lines.join("\n");
}
