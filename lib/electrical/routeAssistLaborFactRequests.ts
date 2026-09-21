import {
  ELECTRICAL_LABOR_SCOPE_FACTS,
  type LaborScopeFactCollectionPath,
} from "./laborScopeFactRegistry";
import { buildElectricalServiceLaborReadiness } from "./serviceLaborReadiness";

export type RouteAssistLaborFactRequest = {
  collectionGroupKey: string;
  captureAuthority: "ROUTE_ASSIST_CONFIRMED";
  factKeys: string[];
  consumingServiceSlugs: string[];
  fallbackPaths: LaborScopeFactCollectionPath[];
  automaticBindingAuthorized: false;
};

const routeAssistAuthorities = new Set<LaborScopeFactCollectionPath>([
  "ROUTE_ASSIST_CONFIRMED",
]);

/**
 * Stable request manifest for Route Assist. It describes facts the labor model
 * can consume without importing or changing Route Assist's evolving internals.
 */
export function buildRouteAssistLaborFactRequests(): RouteAssistLaborFactRequest[] {
  const readiness = buildElectricalServiceLaborReadiness();
  const consumersByFact = new Map<string, Set<string>>();
  for (const service of readiness) {
    for (const factKey of service.missingScopeFacts) {
      const consumers = consumersByFact.get(factKey) ?? new Set<string>();
      consumers.add(service.serviceSlug);
      consumersByFact.set(factKey, consumers);
    }
  }

  const grouped = new Map<string, RouteAssistLaborFactRequest>();
  for (const definition of ELECTRICAL_LABOR_SCOPE_FACTS) {
    const captureAuthority = definition.collectionPaths.find((path) => routeAssistAuthorities.has(path));
    if (captureAuthority !== "ROUTE_ASSIST_CONFIRMED") continue;
    const mapKey = `${captureAuthority}:${definition.collectionGroupKey}`;
    const request = grouped.get(mapKey) ?? {
      collectionGroupKey: definition.collectionGroupKey,
      captureAuthority,
      factKeys: [],
      consumingServiceSlugs: [],
      fallbackPaths: [],
      automaticBindingAuthorized: false as const,
    };
    request.factKeys.push(definition.key);
    for (const slug of consumersByFact.get(definition.key) ?? []) {
      if (!request.consumingServiceSlugs.includes(slug)) request.consumingServiceSlugs.push(slug);
    }
    for (const path of definition.collectionPaths) {
      if (!routeAssistAuthorities.has(path) && !request.fallbackPaths.includes(path)) request.fallbackPaths.push(path);
    }
    grouped.set(mapKey, request);
  }

  return [...grouped.values()]
    // Do not advertise speculative capture work for a fact that no current
    // unresolved service branch consumes. The authority may remain registered
    // for a future bounded branch without turning it into a Route Assist task.
    .filter((request) => request.consumingServiceSlugs.length > 0)
    .map((request) => ({
      ...request,
      factKeys: request.factKeys.sort(),
      consumingServiceSlugs: request.consumingServiceSlugs.sort(),
      fallbackPaths: request.fallbackPaths.sort(),
    }))
    .sort((a, b) => a.captureAuthority.localeCompare(b.captureAuthority)
      || a.collectionGroupKey.localeCompare(b.collectionGroupKey));
}
