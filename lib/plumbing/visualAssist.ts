/**
 * The one place plumbing touches Visual Assist — and it is a contract, not a
 * dependency.
 *
 * WHAT THIS FILE IS NOT
 *
 * It is not a provider client, not a prompt, not an image pipeline, and not a
 * confidence policy. Visual Assist owns all of that in lib/visual-assist/**,
 * and duplicating any of it here would create a second place that decides
 * whether a photograph may be believed. There would then be two answers to
 * "did we accept this observation", and the expensive one would be whichever
 * the pricing engine happened to read.
 *
 * WHAT IT IS
 *
 * The consumer side of one boundary:
 *
 *   Visual Assist / manual answer
 *     -> VALIDATED CANONICAL GUIDED PRICING INPUT   <- this file
 *     -> plumbing scope logic
 *     -> deterministic Price2Book pricing engine
 *
 * Plumbing accepts a value only once somebody else has already decided it may
 * be trusted AND a human has confirmed it. Both, not either. Visual Assist's
 * acceptance says the observation is coherent and well-evidenced; the human's
 * confirmation says the person who owns the outcome looked at it. A price is a
 * promise, and a promise made on an unconfirmed reading of a photograph is one
 * nobody agreed to.
 *
 * STRUCTURALLY TYPED ON PURPOSE
 *
 * Nothing here imports from lib/visual-assist. The shape below is what
 * plumbing REQUIRES, stated independently, so that Visual Assist's internals
 * can change without moving plumbing and so this module can be exercised with
 * no provider at all. The adapter that maps Visual Assist's own accepted
 * output onto this shape belongs on the Visual Assist side of the boundary —
 * see docs/design/plumbing-shared-integrations.md.
 */

import type { CombustionClass, FixtureCondition, ShutoffCondition } from "./gates";

/**
 * How a canonical fact came to be known.
 *
 * Recorded on the fact rather than inferred later, because after the pricing
 * engine has run there is no way to tell a customer's answer from a
 * photograph's, and "which of these did a person actually assert" is exactly
 * the question an audit asks.
 */
export type FactProvenance =
  /** The customer chose an answer in the guided flow. */
  | "CUSTOMER_ANSWER"
  /** Visual Assist read it, and a human confirmed the reading. */
  | "VISUAL_ASSIST_CONFIRMED";

/**
 * The only shape plumbing accepts from Visual Assist.
 *
 * `accepted` is Visual Assist's decision and `confirmedByHuman` is the
 * operator's or customer's. Plumbing reads both and neither is defaulted:
 * an object arriving with these absent is treated as a refusal, not as an
 * optimistic yes.
 *
 * There is deliberately NO confidence field. A number here would invite this
 * module to apply its own threshold, which is the second decision-maker this
 * boundary exists to prevent.
 */
export type ValidatedVisualInput<T> = {
  value: T | null;
  accepted: boolean;
  confirmedByHuman: boolean;
};

/** A canonical fact, however it was established. */
export type CanonicalFact<T> = {
  value: T;
  provenance: FactProvenance;
};

/**
 * The facts plumbing prices from. This is the whole vocabulary, and it is the
 * same whether a person typed it or a photograph produced it.
 *
 * `manufacturer`, `model` and `capacity` are here because Visual Assist reads
 * them off a rating plate. Only `capacity` reaches a gate; the other two are
 * evidence carried onto the job sheet, and nothing prices from them. A model
 * number is a string read off a photograph — treating it as a lookup key into
 * anything is the injection surface lib/visual-assist/observation.ts already
 * warns about, and plumbing does not open a second one.
 */
export type PlumbingFacts = {
  combustionClass?: CanonicalFact<CombustionClass>;
  shutoffCondition?: CanonicalFact<ShutoffCondition>;
  fixtureCondition?: CanonicalFact<FixtureCondition>;
  capacityGallons?: CanonicalFact<number>;
  /** Evidence only. Never an input to a price, never a lookup key. */
  manufacturer?: CanonicalFact<string>;
  /** Evidence only. Never an input to a price, never a lookup key. */
  model?: CanonicalFact<string>;
};

export type FactRefusal = {
  factKey: keyof PlumbingFacts;
  /** Operator-facing. Recorded so an audit can tell WHY a fact was dropped. */
  reason: string;
};

export type FactIntake = {
  facts: PlumbingFacts;
  /** Every input that did not become a fact, and why. Not an error channel. */
  refusals: FactRefusal[];
};

/**
 * Take one validated input and turn it into a canonical fact, or refuse it.
 *
 * The three refusals, in the order they are checked:
 *
 *   not accepted        Visual Assist's own policy declined it. Plumbing does
 *                       not get a second opinion.
 *   not confirmed       Nobody looked. An unconfirmed reading may inform a
 *                       question's default; it may not price a job.
 *   null value          Accepted and confirmed as "we could not tell", which
 *                       is a real and useful answer, and is not a value.
 *
 * There is no path through this function that produces a fact from an input
 * missing any of the three.
 */
export function acceptVisualFact<T>(
  factKey: keyof PlumbingFacts,
  input: ValidatedVisualInput<T> | null | undefined
): { fact: CanonicalFact<T> | null; refusal: FactRefusal | null } {
  if (!input || typeof input !== "object")
    return { fact: null, refusal: { factKey, reason: "no visual input supplied" } };
  if (input.accepted !== true)
    return { fact: null, refusal: { factKey, reason: "Visual Assist did not accept the observation" } };
  if (input.confirmedByHuman !== true)
    return { fact: null, refusal: { factKey, reason: "the observation was not confirmed by a person" } };
  if (input.value === null || input.value === undefined)
    return { fact: null, refusal: { factKey, reason: "accepted, but nothing was observed" } };
  return { fact: { value: input.value, provenance: "VISUAL_ASSIST_CONFIRMED" }, refusal: null };
}

/**
 * WHEN THE SOURCE VOCABULARY IS FINER THAN THIS ONE.
 *
 * Visual Assist's own taxonomy distinguishes things plumbing does not need —
 * tank from tankless, standard from hybrid — while CombustionClass asks only
 * how the appliance burns. That is deliberate: a coarser consumer vocabulary
 * is what stops every new taxonomy word from becoming a new gate.
 *
 * It leaves one case, and the answer to it is the rule. A source value that
 * does NOT determine a single CombustionClass — a gas tankless, which may be
 * power-vented or sealed — maps to UNKNOWN. Not to the more common of the two,
 * and not to a preference: choosing one would invent exactly the fact
 * combustionGate exists to establish, and the gate would then pass on a value
 * nobody observed.
 *
 * UNKNOWN is not a failure of the adapter. It is the adapter declining to
 * answer a question the photograph did not answer, and the flow then asks the
 * homeowner, which is what it would have done with no photograph at all.
 *
 * The adapter itself lives on the Visual Assist side, because lib/plumbing
 * imports nothing from lib/visual-assist and that direction is the point.
 */

/** A fact the customer asserted themselves. Always accepted; they own it. */
export function answeredFact<T>(value: T): CanonicalFact<T> {
  return { value, provenance: "CUSTOMER_ANSWER" };
}

/**
 * THE HOOK.
 *
 * One function, one direction. Plumbing calls nothing in lib/visual-assist and
 * lib/visual-assist calls nothing here; the caller — the guided flow — holds
 * both sides and hands this the already-validated result.
 *
 * A CUSTOMER ANSWER ALWAYS WINS.
 *
 * Not because it is more likely to be right — it frequently is not — but
 * because it is the assertion the customer made, and a price is a promise
 * against what they said. Silently overriding a stated answer with a
 * photograph's reading produces a quote for a job the customer never
 * described, and they find out on the day.
 */
export function intakeFacts(input: {
  answered?: Partial<{
    combustionClass: CombustionClass;
    shutoffCondition: ShutoffCondition;
    fixtureCondition: FixtureCondition;
    capacityGallons: number;
  }>;
  visual?: Partial<{
    combustionClass: ValidatedVisualInput<CombustionClass>;
    shutoffCondition: ValidatedVisualInput<ShutoffCondition>;
    fixtureCondition: ValidatedVisualInput<FixtureCondition>;
    capacityGallons: ValidatedVisualInput<number>;
    manufacturer: ValidatedVisualInput<string>;
    model: ValidatedVisualInput<string>;
  }>;
}): FactIntake {
  const facts: PlumbingFacts = {};
  const refusals: FactRefusal[] = [];
  const answered = input.answered ?? {};
  const visual = input.visual ?? {};

  const take = <K extends keyof PlumbingFacts, T>(
    key: K,
    answeredValue: T | undefined,
    visualInput: ValidatedVisualInput<T> | undefined
  ) => {
    if (answeredValue !== undefined && answeredValue !== null) {
      (facts as Record<string, unknown>)[key] = answeredFact(answeredValue);
      return;
    }
    // A field nobody supplied is not a refusal, it is simply unestablished —
    // and it reads back as UNKNOWN, which every gate already stops on. Logging
    // one per absent field would bury the refusals that mean something: an
    // observation that WAS offered and was not good enough to price from.
    if (visualInput === undefined || visualInput === null) return;
    const { fact, refusal } = acceptVisualFact<T>(key, visualInput);
    if (fact) (facts as Record<string, unknown>)[key] = fact;
    else if (refusal) refusals.push(refusal);
  };

  take("combustionClass", answered.combustionClass, visual.combustionClass);
  take("shutoffCondition", answered.shutoffCondition, visual.shutoffCondition);
  take("fixtureCondition", answered.fixtureCondition, visual.fixtureCondition);
  take("capacityGallons", answered.capacityGallons, visual.capacityGallons);
  // Evidence-only fields. There is no answered counterpart because no customer
  // is asked to type a model number, and no gate reads them.
  take("manufacturer", undefined, visual.manufacturer);
  take("model", undefined, visual.model);

  return { facts, refusals };
}

/**
 * What a gate reads. Absent means UNKNOWN, and UNKNOWN stops.
 *
 * This is the whole reason the gates take a union with an UNKNOWN member
 * rather than a nullable value: there is exactly one way to say "we do not
 * know", every gate handles it, and it cannot be confused with a default.
 */
export function combustionOf(facts: PlumbingFacts): CombustionClass {
  return facts.combustionClass?.value ?? "UNKNOWN";
}

export function shutoffOf(facts: PlumbingFacts): ShutoffCondition {
  return facts.shutoffCondition?.value ?? "UNKNOWN";
}

export function conditionOf(facts: PlumbingFacts): FixtureCondition {
  return facts.fixtureCondition?.value ?? "UNKNOWN";
}

export function capacityOf(facts: PlumbingFacts): number | null {
  return facts.capacityGallons?.value ?? null;
}
