import { strict as assert } from "node:assert";
import { ELECTRICAL_LABOR_SCOPE_FACTS } from "../lib/electrical/laborScopeFactRegistry";
import { buildRouteAssistLaborFactRequests } from "../lib/electrical/routeAssistLaborFactRequests";

let checks = 0;
const ok = (condition: unknown, message: string) => { assert.ok(condition, message); checks += 1; console.log(`  ✓ ${message}`); };
const requests = buildRouteAssistLaborFactRequests();
const requestedFacts = new Set(requests.flatMap((request) => request.factKeys));
const authorizedFacts = ELECTRICAL_LABOR_SCOPE_FACTS.filter((fact) => fact.collectionPaths.some((path) => path.startsWith("ROUTE_ASSIST")));

ok(authorizedFacts.every((fact) => requestedFacts.has(fact.key)), "manifest includes every labor fact that authorizes a Route Assist source");
ok(requests.every((request) => request.factKeys.length > 0 && request.consumingServiceSlugs.length > 0), "every request names concrete facts and consuming services");
ok(requests.every((request) => request.automaticBindingAuthorized === false), "every Route Assist labor request remains evidence-only until a separate binding is reviewed");

ok(!requestedFacts.has("accessibleRouteFeet"), "Route Assist is excluded from accessible attic, basement and crawlspace measurement");

const finished = requests.find((request) => request.collectionGroupKey === "FINISHED_ROUTE_MEASUREMENT")!;
ok(finished.captureAuthority === "ROUTE_ASSIST_CONFIRMED" && finished.factKeys.includes("concealedRouteFeet") && finished.factKeys.includes("perpendicularFramingFeet"), "finished-route request carries measured path and framing-crossing distance");
ok(finished.consumingServiceSlugs.includes("new-120v-outlet") && finished.consumingServiceSlugs.includes("level-2-ev-charger"), "shared finished-route facts identify multiple consuming services");

const surface = requests.find((request) => request.collectionGroupKey === "SURFACE_RACEWAY_GEOMETRY")!;
ok(surface.factKeys.includes("surfaceRouteFeet") && surface.factKeys.includes("insideCornerCount") && surface.factKeys.includes("transitionCount"), "surface manifest requests route length, fittings and transitions together");
ok(surface.consumingServiceSlugs.length === 3, "one surface geometry request serves all three surface-mounted services");

ok(!requestedFacts.has("fanSupportRequired") && !requestedFacts.has("powerRemediationRequired"), "Route Assist is not granted diagnostic authority over support or power remediation");
ok(!requestedFacts.has("straightJointCount") && !requestedFacts.has("supportCount"), "Route Assist does not emit takeoffs that the system must derive");
ok(requestedFacts.has("concealedRouteFeet") && requestedFacts.has("surfaceRouteFeet"), "Route Assist remains authorized for inaccessible concealed and surface routes");

console.log(`\nROUTE ASSIST LABOR FACT REQUESTS — ${checks}/${checks} checks passed`);
