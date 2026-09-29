import assert from "node:assert/strict";
import { lightingExtensionRouteTransitions } from "../prisma/seed-route-complete-extensions";

const transitions = lightingExtensionRouteTransitions({
  surface: "extension_route_surface",
  clear: "extension_route_clear",
  feet: "extension_route_feet",
  control: "extension_control",
});

assert.deepEqual(
  [transitions.accessible, transitions.feet],
  ["extension_route_feet", "extension_control"],
  "an accessible route must ask only for route length before the control question",
);

assert.deepEqual(
  [transitions.finished, transitions.surface, transitions.clear, transitions.feet],
  ["extension_route_surface", "extension_route_clear", "extension_route_feet", "extension_control"],
  "only a finished-construction route must ask about finish and visible obstructions",
);

console.log("lighting extension routing: accessible skips finished-surface questions; finished route retains them");
