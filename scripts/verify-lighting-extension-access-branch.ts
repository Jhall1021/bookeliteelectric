import assert from "node:assert/strict";
import { lightingExtensionRouteTransitions } from "../prisma/seed-route-complete-extensions";

const transitions = lightingExtensionRouteTransitions({
  surface: "extension_route_surface",
  clear: "extension_route_clear",
});

assert.deepEqual(
  Object.keys(transitions),
  ["finished", "surface"],
  "source and distance are collected before access, so accessible routes can resolve immediately",
);

assert.deepEqual(
  [transitions.finished, transitions.surface],
  ["extension_route_surface", "extension_route_clear"],
  "only a finished-construction route must ask about finish and visible obstructions before resolving",
);

console.log("lighting extension routing: source-specific footage comes first; accessible skips finished-surface questions");
