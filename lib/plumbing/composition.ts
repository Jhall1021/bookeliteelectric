/**
 * Assembling a service's question tree from the families it composes.
 *
 * This is the step between the canonical template and a contractor's real
 * `Question` / `AnswerOption` rows: provisioning asks for a service's ordered
 * questions, and gets them here rather than reading families itself. One
 * assembler means one ordering rule, and one place where a conflict between
 * two families is a refusal instead of a silent overwrite.
 *
 * WHY THIS EXISTS AS A LAYER AT ALL
 *
 * Composition is where two defects surfaced that neither the catalog nor the
 * families could see on their own, because both were properties of the
 * COMBINATION:
 *
 *   Sixteen services composed `fixture_access` AND `drain_route`, which both
 *   answer into the platform's single access slot. The customer was asked
 *   twice and whichever answer arrived second won. That is the electrical
 *   synonym bug — six access questions, three vocabularies, a component
 *   condition that matched none of them — reassembled from new parts.
 *
 *   Thirty-five services declared a gate whose fact no question in the
 *   template could establish. `conditionGate` and `capacityGate` had nothing
 *   to read, so in a live flow every one of those services would have refused
 *   forever. It went unnoticed because the reachability test supplied facts by
 *   hand instead of answering through the tree — a test that agreed with the
 *   code because it made the same assumption.
 *
 * Both are now structural refusals in `composeService`, and the verifier
 * answers services through the composed tree rather than injecting facts. A
 * test that cannot reach the fact any other way cannot make that mistake twice.
 *
 * PURE. No database, no clock, no network.
 */

import { PLUMBING_FAMILIES, family, type FamilyOption, type FamilyQuestion, type PlumbingFamilyKey } from "./families";
import { componentsForAnswer } from "./mappings";
import type { PlumbingGateKey } from "./gates";
import type { PlumbingService } from "./catalog";

/** Which canonical fact each gate reads. The gates' side of the contract. */
export const GATE_FACT: Readonly<Record<PlumbingGateKey, string>> = {
  access_gate: "access_class",
  shutoff_gate: "shutoff_condition",
  combustion_gate: "combustion_class",
  capacity_gate: "capacity",
  condition_gate: "fixture_condition",
};

export type CompositionProblem = {
  code: "DUPLICATE_QUESTION_KEY" | "DUPLICATE_FACT_WRITER" | "GATE_WITHOUT_SOURCE"
      | "DANGLING_NEXT_QUESTION" | "STRANDED_CONTINUE" | "NO_PRICED_TERMINAL";
  message: string;
};

/**
 * A brand, so a composed tree cannot be hand-rolled.
 *
 * `COMPOSED` is declared but never exported and never exists at runtime, so no
 * code outside this module can name it and therefore no code outside this
 * module can produce a value of this type by writing an object literal. The
 * seed and provisioning paths take `ComposedService`, which means the only
 * ordinary way to obtain one is to call `composeService`.
 *
 * Honest about its limits: a determined caller can still write `as
 * ComposedService`. The point is not to make bypassing composition impossible,
 * it is to make it a visible, deliberate act rather than something someone does
 * by reaching for `service.families` because it was right there.
 */
declare const COMPOSED: unique symbol;

/**
 * A question with its ROUTING RESOLVED for one particular service.
 *
 * A family option cannot know where it leads: "the stop valve holds" is the
 * middle of a faucet's tree and the end of a valve replacement's. So the family
 * declares what an answer MEANS and composition decides what it DOES — which
 * next question it advances to, or that it completes the workflow.
 */
export type ComposedOption = Omit<FamilyOption, "routeAction" | "nextQuestionKey"> & {
  /** Resolved for this service. May differ from the family's declaration. */
  routeAction: FamilyOption["routeAction"];
  /** Null only on a terminal. Every CONTINUE has one, or composition refuses. */
  nextQuestionKey: string | null;
};

export type ComposedQuestion = Omit<FamilyQuestion, "options"> & {
  options: readonly ComposedOption[];
};

export type ComposedService = {
  readonly [COMPOSED]: true;
  serviceKey: string;
  /** Every question the service asks, in the order it asks them. */
  questions: readonly ComposedQuestion[];
  /** factKey -> the question key that establishes it. Exactly one each. */
  factSources: Readonly<Record<string, string>>;
  /** Empty on a service that can actually be provisioned. */
  problems: readonly CompositionProblem[];
};

/** Which fact keys a family can establish. */
export function factsEstablishedBy(key: PlumbingFamilyKey): string[] {
  const out: string[] = [];
  for (const q of family(key).questions)
    for (const o of q.options)
      if (o.establishes && !out.includes(o.establishes.factKey)) out.push(o.establishes.factKey);
  return out;
}


/**
 * Which resolve action a completing answer takes.
 *
 * Reuses the platform's meaning rather than inventing a plumbing one:
 *
 *   INSTANT            one price, no branch adjustment  -> RESOLVE_INSTANT
 *   TROUBLESHOOT_ONLY  the visit fee itself (PL-SVC-001) -> RESOLVE_INSTANT
 *   ADJUSTED           adjustment on this branch?       -> RESOLVE_ADJUSTED
 *                      otherwise                        -> RESOLVE_INSTANT
 *   REMOTE_QUOTE       priced by a person, not a tree   -> REMOTE_QUOTE
 *
 * PL-SVC-001, the On-Site Plumbing Service Call, resolving is not a priced
 * repair. It is the known, contractor-approved VISIT FEE: no repair is
 * selected, no component is attached, no material role is inferred from the
 * symptom, and the visit is what produces the eventual scope. Pricing it is
 * what subjects it to §1.4 — a contractor should not be able to publish a
 * service-call fee without approving that price either.
 *
 * "Carries an adjustment" means this answer selects a canonical component. It
 * is read from the mapping rather than declared per option, so an answer cannot
 * claim an adjustment it does not actually make.
 *
 * ANSWER-LOCAL, NOT PATH-ACCUMULATED — AND THAT IS THE PLATFORM'S CHOICE.
 *
 * The question was whether a terminal reached by a path where an EARLIER answer
 * selected a component should be RESOLVE_ADJUSTED even when the final answer
 * selects nothing. The evidence says the distinction is descriptive and the
 * accumulation is handled independently:
 *
 *   1. lib/routeResolver.ts:517 folds both into one `terminal` boolean.
 *   2. components/guided-flow/GuidedFlowEngine.tsx:262 handles them in a single
 *      shared `case` with identical bodies.
 *   3. Every other consumer treats them as a PAIR — an OR in QuestionStep,
 *      capture-demo-flow and verify-storefront-price-promise; set membership in
 *      TreeEditor's PRICED_ACTIONS; a sum on the marketing pages. Nothing in the
 *      repository branches on RESOLVE_ADJUSTED alone.
 *   4. The price comes from `config`, accumulated by applyBranch over EVERY
 *      consumed answer (routeResolver.ts:420) and priced once by customerPrice
 *      at :598. The terminal's action does not enter that calculation.
 *   5. Elite's own catalog is internally inconsistent about it — 5
 *      RESOLVE_ADJUSTED on services where nothing can adjust, and 11
 *      RESOLVE_INSTANT on services where something can. Those would be
 *      mispricing bugs if the field were read; they are harmless because it is
 *      not.
 *
 * So an earlier component still reaches the price through the accumulator, and
 * labeling the terminal INSTANT costs nothing. Three electrical services
 * (new-coax-line, new-wall-sconce, new-ethernet-line) label that same shape
 * ADJUSTED, which is a weak descriptive convention plumbing does not follow —
 * a divergence in wording, not in behavior, and recorded here so the next
 * reader does not mistake it for a bug.
 */
function terminalActionFor(svc: PlumbingService, o: FamilyOption): FamilyOption["routeAction"] {
  if (svc.bookingType === "REMOTE_QUOTE") return "REMOTE_QUOTE";
  if (svc.bookingType === "ADJUSTED") {
    const est = o.establishes;
    const adjusts = est ? componentsForAnswer(est.factKey, est.value).length > 0 : false;
    return adjusts ? "RESOLVE_ADJUSTED" : "RESOLVE_INSTANT";
  }
  return "RESOLVE_INSTANT";
}

/**
 * Compose one service.
 *
 * Ordering is by the question's own `order`, tie-broken by the family's
 * position in `PLUMBING_FAMILIES`. The tie-break is there so composition is
 * DETERMINISTIC: two questions sharing an order would otherwise come out in
 * whatever sequence the service happened to list its families, and a template
 * that provisions a different tree on Tuesday is not a template.
 *
 * Problems are COLLECTED, not thrown. A service with two defects should report
 * both — stopping at the first is how the second one ships.
 */
export function composeService(svc: PlumbingService): ComposedService {
  const problems: CompositionProblem[] = [];
  const familyRank = new Map(PLUMBING_FAMILIES.map((f, i) => [f.key, i]));

  const entries = svc.families.flatMap((fk) =>
    family(fk).questions.map((q) => ({ familyKey: fk, question: q }))
  );
  entries.sort((a, b) =>
    a.question.order - b.question.order ||
    (familyRank.get(a.familyKey)! - familyRank.get(b.familyKey)!)
  );

  // A repeated question key means the customer is asked the same thing twice
  // and provisioning would upsert one row over the other.
  const seenKeys = new Map<string, string>();
  for (const e of entries) {
    const prior = seenKeys.get(e.question.key);
    if (prior)
      problems.push({
        code: "DUPLICATE_QUESTION_KEY",
        message: `question "${e.question.key}" comes from both ${prior} and ${e.familyKey}`,
      });
    seenKeys.set(e.question.key, e.familyKey);
  }

  // Two questions writing one fact: the second answer silently wins, and which
  // one is second depends on ordering nobody wrote down deliberately.
  const factSources: Record<string, string> = {};
  const factFamily = new Map<string, string>();
  for (const e of entries)
    for (const o of e.question.options) {
      if (!o.establishes) continue;
      const fk = o.establishes.factKey;
      const priorFamily = factFamily.get(fk);
      if (priorFamily && priorFamily !== e.familyKey) {
        problems.push({
          code: "DUPLICATE_FACT_WRITER",
          message: `fact "${fk}" is written by both ${priorFamily} and ${e.familyKey}`,
        });
        continue;
      }
      factFamily.set(fk, e.familyKey);
      factSources[fk] = e.question.key;
    }

  // A gate with no source refuses forever. Worse than no gate, because it
  // produces a review rather than an error and nobody investigates a review.
  for (const gate of svc.gates) {
    // Two gates are inert unless the service declares the thing they judge.
    if (gate === "combustion_gate" && !svc.expectsCombustion) continue;
    if (gate === "capacity_gate" && !svc.capacity) continue;
    const fact = GATE_FACT[gate];
    if (!(fact in factSources))
      problems.push({
        code: "GATE_WITHOUT_SOURCE",
        message: `${gate} reads "${fact}", which no composed question establishes`,
      });
  }

  // Routing is by KEY, and a key pointing outside the composed tree is the
  // dangling-nextQuestionId failure the module helpers were written for: the
  // engine fails safe by resolving to a price, so customers skip whole modules
  // and get quoted for work that was never qualified.
  for (const e of entries)
    for (const o of e.question.options)
      if (o.nextQuestionKey && !seenKeys.has(o.nextQuestionKey))
        problems.push({
          code: "DANGLING_NEXT_QUESTION",
          message: `${e.question.key}/${o.value} points at "${o.nextQuestionKey}", which this service does not ask`,
        });

  // ── TERMINAL RESOLUTION ────────────────────────────────────────────────
  //
  // The defect this closes: every plumbing answer was CONTINUE with no next
  // question, so a completed workflow ran off the end of its own tree. The
  // platform reads `routes.priced > 0` to decide whether a service promises a
  // fixed price, and with no RESOLVE anywhere it concluded that no plumbing
  // service ever quotes one — which silently disabled the §1.4
  // PRICE_NOT_APPROVED guard for the entire trade.
  //
  // Electrical's semantics are reused exactly, not reinterpreted:
  //   RESOLVE_INSTANT   terminate on the service's own price
  //   RESOLVE_ADJUSTED  terminate on that price plus this branch's adjustment
  // and an ADJUSTED service uses whichever fits the branch, which is why
  // Elite's catalog carries 34 RESOLVE_INSTANT on ADJUSTED services.
  //
  // An answer that already routes away — review, quote, service call — is left
  // exactly as the family declared it. Only CONTINUE is resolved here, because
  // only CONTINUE was ever ambiguous.
  const resolved: ComposedQuestion[] = entries.map((e, i) => {
    const isLast = i === entries.length - 1;
    const nextKey = isLast ? null : entries[i + 1].question.key;
    return {
      ...e.question,
      options: e.question.options.map((o): ComposedOption => {
        if (o.routeAction !== "CONTINUE") return { ...o, nextQuestionKey: o.nextQuestionKey ?? null };
        if (!isLast) return { ...o, nextQuestionKey: o.nextQuestionKey ?? nextKey };
        return { ...o, routeAction: terminalActionFor(svc, o), nextQuestionKey: null };
      }),
    };
  });

  // Nothing may run off the end of its own tree.
  for (const q of resolved)
    for (const o of q.options)
      if (o.routeAction === "CONTINUE" && !o.nextQuestionKey)
        problems.push({
          code: "STRANDED_CONTINUE",
          message: `${q.key}/${o.value} continues to nothing — a completed path with no terminal`,
        });

  // A service the platform should be able to price must have somewhere to
  // price. Quote-only services are exempt by nature, not by omission.
  if (svc.bookingType !== "REMOTE_QUOTE") {
    const priced = resolved.some((q) => q.options.some((o) => o.routeAction.startsWith("RESOLVE")));
    if (!priced)
      problems.push({
        code: "NO_PRICED_TERMINAL",
        message: `${svc.bookingType} service has no route that terminates in a price`,
      });
  }

  return {
    serviceKey: svc.key,
    questions: resolved,
    factSources,
    problems,
    // The brand has no runtime representation, so the object genuinely lacks
    // the property its type claims. That is the mechanism, not a workaround:
    // there is nothing to forge because there is nothing there.
  } as unknown as ComposedService;
}

/**
 * Compose the whole catalog. THE SEED PATH'S ENTRY POINT.
 *
 * Provisioning and seed generation consume this, not `PLUMBING_SERVICES`.
 * Walking `service.families` and reconstructing the ordering independently is
 * how both composition defects would come back on somebody else's schedule:
 * the duplicate access producer and the gate with no source were only ever
 * visible in the assembled tree, and a second assembler is a second place for
 * them to hide.
 *
 * Refuses as a whole. A catalog where one service cannot compose is not a
 * catalog to provision 62 services from and quietly skip the 63rd.
 */
export function composeAll(services: readonly PlumbingService[]): readonly ComposedService[] {
  const composed = services.map(composeService);
  const broken = composed.filter((c) => c.problems.length > 0);
  if (broken.length)
    throw new Error(
      `Cannot compose ${broken.length} service(s):\n` +
        broken.map((c) => `  ${c.serviceKey}: ${c.problems.map((p) => p.message).join("; ")}`).join("\n")
    );
  return composed;
}

/**
 * Answer a composed service the way the flow would, choosing the option that
 * establishes a given value for each fact.
 *
 * Exists so a test can reach a service's facts ONLY through its questions.
 * `prefer` names the value wanted per fact; anything unnamed takes the first
 * option that establishes a value other than UNKNOWN — the honest "customer
 * answered everything they were asked" case.
 *
 * A fact no question mentions is ABSENT from the result; a fact whose question
 * exists but cannot produce the preferred value is null. Both read as nullish,
 * and the distinction is deliberate — absent means the template never asks,
 * null means it asks and this answer is not on offer. Either way a caller that
 * wanted a fact and got nothing has found a gap rather than quietly proceeding
 * with an assumption.
 */
export function answerComposed(
  composed: ComposedService,
  prefer: Readonly<Record<string, string>> = {}
): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  for (const q of composed.questions)
    for (const o of q.options) {
      if (!o.establishes) continue;
      const { factKey, value } = o.establishes;
      const wanted = prefer[factKey];
      if (wanted !== undefined) {
        if (value === wanted) out[factKey] = value;
        else if (!(factKey in out)) out[factKey] = null;
      } else if (out[factKey] == null && value !== "UNKNOWN") {
        out[factKey] = value;
      }
    }
  return out;
}
