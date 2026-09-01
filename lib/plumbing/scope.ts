/**
 * Plumbing scope logic — the layer between a validated answer and the price.
 *
 *   Visual Assist / manual answer
 *     -> validated canonical Guided Pricing input   (visualAssist.ts)
 *     -> PLUMBING SCOPE LOGIC                       <- this file
 *     -> deterministic Price2Book pricing engine    (lib/pricing.ts)
 *
 * This module decides WHAT THE JOB IS. It does not decide what it costs, and
 * it cannot: it holds no rate, no markup, no component price and no material
 * cost, and it returns roles and component keys for lib/pricing.ts to resolve
 * against the contractor's own economics. Two places that can produce a number
 * is one too many, and the browser already demonstrated what happens when the
 * second one is reachable.
 *
 * PURE. No database, no clock, no network. The same service and the same facts
 * produce the same scope forever, which is what makes a quote reconstructible
 * from the answer snapshot months later — the same property lib/routeResolver.ts
 * calls stateless by design.
 */

import { capacityGate, accessGate, combustionGate, conditionGate, shutoffGate, firstRefusal, type AccessClass, type GateOutcome, type PlumbingGateKey } from "./gates";
import { COMBUSTION_SCOPE, CONDITION_SCOPE, PIPE_MATERIAL_SCOPE, SHUTOFF_SCOPE, mergeScope, type PipeMaterial, type ScopeConsequence } from "./mappings";
import { capacityOf, combustionOf, conditionOf, shutoffOf, type PlumbingFacts } from "./visualAssist";
import type { PlumbingService } from "./catalog";

export type PlumbingScopeInput = {
  facts: PlumbingFacts;
  /** Established by the fixture_access or drain_route family. */
  accessClass: AccessClass;
  /** Established by the pipe_material family. */
  pipeMaterial: PipeMaterial;
};

export type PlumbingScopeResult =
  | {
      status: "SCOPED";
      scope: ScopeConsequence;
      /** Which gates ran and passed, in order. For the audit trail. */
      gatesPassed: readonly PlumbingGateKey[];
    }
  | {
      status: "REFUSED";
      /** What the caller should do with the route. Never a price. */
      outcome: GateOutcome;
      /** Which gate refused. */
      gate: PlumbingGateKey;
    };

/**
 * Whether a service already includes replacing the stop valve.
 *
 * Derived from the catalog rather than declared twice: a service whose whole
 * subject is a valve does not need shutoffGate to tell it a valve is broken.
 * Hard-coding a list of slugs here would go stale the moment a service is
 * renamed, and renaming is exactly what template keys are designed to survive.
 */
function valveReplacementIsInScope(svc: PlumbingService): boolean {
  return (
    svc.key === "fixture-shutoff-valve-replacement" ||
    svc.key === "main-water-shutoff-valve-replacement" ||
    svc.key === "gas-shutoff-valve-replacement"
  );
}

/**
 * Run one gate. Returns CONTINUE for a gate the service declares but whose
 * fact it does not use — a service with no `expectsCombustion` is not asking
 * about venting, and refusing it for an unestablished combustion class would
 * block every faucet in the catalog.
 */
function runGate(
  gate: PlumbingGateKey,
  svc: PlumbingService,
  input: PlumbingScopeInput
): GateOutcome {
  switch (gate) {
    case "access_gate":
      return accessGate(input.accessClass);
    case "shutoff_gate":
      return shutoffGate(shutoffOf(input.facts), {
        valveReplacementIsInScope: valveReplacementIsInScope(svc),
      });
    case "combustion_gate":
      if (!svc.expectsCombustion) return { action: "CONTINUE", reason: "", factKey: "combustion_class" };
      return combustionGate(combustionOf(input.facts), { serviceExpects: [...svc.expectsCombustion] });
    case "capacity_gate":
      if (!svc.capacity) return { action: "CONTINUE", reason: "", factKey: "capacity" };
      return capacityGate(capacityOf(input.facts), svc.capacity);
    case "condition_gate":
      return conditionGate(conditionOf(input.facts));
  }
}

/**
 * Scope a service against the facts established so far.
 *
 * Gates run in the order the SERVICE declares them, and the first refusal
 * wins. Order is the catalog's decision because the honest refusal depends on
 * it: asking about a water heater's capacity before establishing that it is
 * even a gas heater produces a confusing complaint about the wrong fact.
 *
 * FAILS CLOSED. There is no branch that returns SCOPED with a gate
 * outstanding, and no default that stands in for an unestablished fact.
 */
export function scopePlumbingService(
  svc: PlumbingService,
  input: PlumbingScopeInput
): PlumbingScopeResult {
  const passed: PlumbingGateKey[] = [];
  for (const gate of svc.gates) {
    const outcome = runGate(gate, svc, input);
    if (outcome.action !== "CONTINUE") return { status: "REFUSED", outcome, gate };
    passed.push(gate);
  }

  // Only facts the service actually asks about contribute. A faucet does not
  // acquire a vent connector because the combustion vocabulary has a member
  // for electric.
  const parts: ScopeConsequence[] = [];
  if (svc.expectsCombustion) parts.push(COMBUSTION_SCOPE[combustionOf(input.facts)]);
  if (svc.families.includes("shutoff_condition")) parts.push(SHUTOFF_SCOPE[shutoffOf(input.facts)]);
  if (svc.families.includes("pipe_material")) parts.push(PIPE_MATERIAL_SCOPE[input.pipeMaterial]);
  if (svc.gates.includes("condition_gate")) parts.push(CONDITION_SCOPE[conditionOf(input.facts)]);

  return { status: "SCOPED", scope: mergeScope(parts), gatesPassed: passed };
}

/**
 * The refusals a set of gates would produce, without scoping.
 *
 * Used by the verifier and by the admin preview. Kept separate from
 * scopePlumbingService so that asking "what would stop this" never has the
 * side effect of producing a scope.
 */
export function refusalsFor(
  svc: PlumbingService,
  input: PlumbingScopeInput
): GateOutcome {
  return firstRefusal(svc.gates.map((g) => runGate(g, svc, input)));
}
