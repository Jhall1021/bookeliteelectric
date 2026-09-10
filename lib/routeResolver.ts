/**
 * Server-side route resolution.
 *
 * The browser used to walk the decision tree, work out a price, and POST it.
 * `/api/visit` checked `typeof computedPriceCents === "number"` and stored it,
 * which made anyone with dev tools an authority on what Elite charges.
 *
 * This module is now the only thing that decides a price. The browser sends
 * what the customer CHOSE — a service and an answer map — and the server
 * replays that route against the current database to decide what it COSTS.
 *
 * STATELESS BY DESIGN
 *
 * No server-side flow state, no session-held partial route. The answer
 * snapshot alone reproduces the result, which means any price can be
 * reconstructed later from three things: the contractor's configuration, the
 * service definition, and what the customer answered. Nothing hidden in a
 * browser or a session.
 *
 * FAILS CLOSED
 *
 * A missing question, an answer that no longer maps to an option, a cycle, an
 * unknown access classification, a component with no approved price — none of
 * these produce a guessed price. They produce a review. "Uncertain scope =
 * review; known scope = fixed price" applies to our own bugs as much as to a
 * customer's unusual house.
 */

import type { PrismaClient } from "@prisma/client";
// A NOTE ON THE PARAMETER NAME
//
// These take `db`, not `prisma`. The parameter used to be called `prisma`,
// which shadowed the module import of the same name — so a reader could not
// tell whether a query ran on the injected client or the global one, and
// static analysis could not either. The functions are dependency-injected:
// they run on whatever client the caller hands them, guarded or not, and the
// caller decides.
import {
  loadOwnComponents,
  canonicalComponentIdsIn,
  type OwnComponentMap,
} from "./contractorComponents";
import { findTroubleshootingService } from "./troubleshooting";
import {
  disclaimerIsActive,
  disclaimerAccessClass,
  disclaimerAccessSlot,
  requireContractorDisclaimer,
} from "./categories";
import { parseAccessSlot } from "./accessSlots";
import {
  startConfiguration,
  applyBranch,
  customerPrice,
  type JobConfiguration,
  type PricingSettings,
} from "./pricing";

export type ResolvedRoute =
  | {
      status: "PRICED";
      /** What the customer pays. Server-derived; never from the client. */
      priceCents: number;
      isPrimary: boolean;
      config: JobConfiguration;
      /** Photos to collect, when the route wants them but doesn't block. */
      photoLabels: string[];
      photoSafetyNotes: string[];
      disclaimers: string[];
      /** Which answers were actually consumed, in order. */
      consumed: { key: string; value: string; label: string }[];
    }
  | {
      status: "REVIEW";
      reason: string;
      photoLabels: string[];
      photoSafetyNotes: string[];
      /** The running total where the route stopped. A floor, never an estimate. */
      floorPriceCents: number | null;
      isPrimary: boolean;
      config: JobConfiguration;
    }
  | {
      status: "REROUTE";
      /**
       * WHY the hand-off happened, because the two kinds are not the same
       * journey and a caller that treats them alike gets one of them wrong.
       *
       *   SERVICE         the customer's answers still apply — they were
       *                   describing the destination's job all along, so the
       *                   answers travel with them.
       *   TROUBLESHOOTING the customer is being told we don't yet know what
       *                   the job IS. The diagnostic has its own tree and
       *                   none of these answers belong to it.
       */
      via: "SERVICE" | "TROUBLESHOOTING";
      targetServiceId: string;
      carriedAnswers: Record<string, string>;
    }
  | {
      status: "INVALID";
      /** Operator-facing. Never shown to a customer as-is. */
      reason: string;
    };

/**
 * Everything the resolver needs, loaded once.
 *
 * THREE QUERIES, DELIBERATELY.
 *
 *   1. the service's owning contractor
 *   2. the tree, rooted at Service — tenant-owned, so the guard scopes it and
 *      everything reachable below it is constrained by foreign key
 *   3. that contractor's component economics, rooted at ContractorComponent —
 *      tenant-owned, so the guard scopes that too
 *
 * Query 3 used to be a nested include hanging off CanonicalComponent, with a
 * hand-written contractor filter on it. It was correct, but only by diligence:
 * CanonicalComponent is a PLATFORM model, the guard waves it through, and
 * Prisma extensions do not fire on nested reads — so deleting that one `where`
 * would have exposed every contractor's economics with nothing failing. The
 * live harness demonstrated exactly that read.
 *
 * The rule this now follows: tenant-owned data is loaded from a tenant-owned
 * TOP-LEVEL query. See lib/contractorComponents.ts.
 *
 * Loading every contractor's economics and filtering in memory was never an
 * option either — a tenant boundary that holds only because the data was
 * discarded after loading is not one.
 */
export async function loadServiceForResolution(db: PrismaClient, serviceId: string) {
  const owner = await db.service.findUnique({
    where: { id: serviceId },
    select: { slug: true, contractorId: true, tradeKey: true },
  });
  if (!owner) return null;
  if (!owner.contractorId) {
    throw new Error(
      `${owner.slug} has no contractor. Its components cannot be resolved — ` +
        `run prisma/backfill-service-contractor-2026-08-25.ts.`
    );
  }

  const service = await db.service.findUnique({
    where: { id: serviceId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            include: {
              // Canonical roles only — platform data under a tenant-owned
              // root, which is safe. The contractor's figures arrive
              // separately, from their own tenant-rooted query.
              components: {
                include: {
                  // v1.1 §3.1 — what the component physically consumes. Platform
                  // data under a tenant-owned root, like canonicalComponent
                  // itself; the COST comes from the contractor's own query.
                  canonicalComponent: { include: { materials: { include: { canonicalMaterial: true } } } },
                },
              },
              photoGroups: { include: { photoGroup: true } },
              // ADR-009: the contractor's policy statement, not the shared
              // pre-split text. Service-rooted, so this traversal is safe.
              conditionalDisclaimers: {
                include: {
                  contractorDisclaimer: {
                    include: { canonicalDisclaimer: true },
                  },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!service) return null;

  const ownComponents = await loadOwnComponents(
    db,
    owner.contractorId,
    canonicalComponentIdsIn(service)
  );

  /**
   * This contractor's cost for every material role a selectable component
   * consumes — v1.1 §3.1.
   *
   * A FOURTH top-level query, for the same reason as the third: ContractorMaterial
   * is tenant-owned, so it is loaded from a tenant-owned top-level query where
   * the guard scopes it. Reaching it by nesting under CanonicalComponent would
   * put a hand-written contractor filter on a platform model, which is exactly
   * the shape that let a cross-tenant read through once already.
   */
  const roleIds = [
    ...new Set(
      service.questions.flatMap((q) =>
        q.options.flatMap((o) =>
          o.components.flatMap((c) =>
            (c.canonicalComponent?.materials ?? []).map((m) => m.canonicalMaterialId),
          ),
        ),
      ),
    ),
  ];
  const ownMaterialCosts = new Map<string, number>(
    roleIds.length
      ? (
          await db.contractorMaterial.findMany({
            where: { contractorId: owner.contractorId, canonicalMaterialId: { in: roleIds }, active: true },
            select: { canonicalMaterialId: true, unitCostCents: true },
          })
        ).map((m) => [m.canonicalMaterialId, m.unitCostCents])
      : [],
  );

  /**
   * The contractor's diagnostic service, when this tree can send anyone there.
   *
   * A FIFTH tenant-rooted top-level query, and only when it is needed: most
   * trees have no REROUTE_TROUBLESHOOTING option at all, and a query on every
   * resolution to answer a question the tree never asks is waste.
   *
   * `resolveRoute` is a pure function — it cannot look this up when it reaches
   * the answer, so the lookup happens here and the result travels with the
   * service. Scoped to `owner.contractorId`, which is what makes it impossible
   * for one contractor's tree to resolve to another's diagnostic.
   *
   * Both failure shapes stay distinguishable from "not needed": null with a
   * problem string means we asked and could not answer, and the resolver
   * refuses. Null with no problem means nothing in this tree ever asks.
   */
  const routesToTroubleshooting = service.questions.some((q) =>
    q.options.some((o) => o.routeAction === "REROUTE_TROUBLESHOOTING")
  );
  let troubleshootingServiceId: string | null = null;
  let troubleshootingProblem: string | null = null;
  if (routesToTroubleshooting) {
    // G2: scoped to THIS service's own trade. The originating service is the
    // authoritative source — nothing here infers a trade, and a service whose
    // trade was never established fails closed rather than resolving against
    // whatever diagnostic the contractor happens to have.
    if (!owner.tradeKey) {
      troubleshootingProblem =
        `${owner.slug} has no tradeKey, so its diagnostic destination is not resolvable`;
    } else {
      const found = await findTroubleshootingService(db, owner.contractorId, owner.tradeKey);
      if (found.ok) troubleshootingServiceId = found.service.id;
      else troubleshootingProblem = found.problem;
    }
  }

  return {
    ...service,
    ownComponents,
    ownMaterialCosts,
    troubleshootingServiceId,
    troubleshootingProblem,
  };
}

type LoadedService = NonNullable<Awaited<ReturnType<typeof loadServiceForResolution>>>;

/**
 * Replay a customer's answers through a service's tree.
 *
 * `isPrimary` is decided by the CALLER from the state of the open visit, never
 * by the client — it changes the price, so it's exactly the sort of thing a
 * browser shouldn't get to assert.
 */
/**
 * ROUTING V2 — what a NUMBER answer is allowed to mean as a component quantity.
 *
 * `null` binding: the authored static quantity, unchanged. Every row written
 * before this field behaves exactly as it did.
 *
 * A populated binding FAILS CLOSED in every direction. It never falls back to
 * the static quantity, because the fallback is the bug: a 31-foot route quietly
 * priced as one foot is worse than a refusal, and it looks like a price.
 *
 * TWO KINDS OF FAULT, DELIBERATELY SEPARATED.
 *
 *   broken  — the TREE is wrong. The question does not exist on the walked
 *             path, is not a NUMBER, or declares no authored range. No answer a
 *             customer could give would fix it, so it must never price.
 *   invalid — the ANSWER is wrong or missing. Review can resolve that.
 *
 * REACHABILITY IS STRUCTURAL, NOT ASSUMED. `visited` is the questions actually
 * consumed on THIS path, in order, so a binding cannot reach a NUMBER question
 * on an untaken branch, one that comes after the terminal, or one the walk
 * simply never passed through. Service-wide existence is not sufficient: the
 * answer map can carry values from a path the customer has since left.
 *
 * BOUNDS COME FROM THE QUESTION, NOT FROM HERE. A ceiling written into this
 * function would be an electrical-route assumption compiled into a generic
 * platform primitive; the same machinery has to serve counts of anything later.
 *
 * `omit` is the one non-error outcome that yields no component. Zero inside
 * corners is an ordinary answer and must not become `INSIDE_CORNER × 0`
 * (meaningless) or, through the shared `Math.max(q, 1)`, `× 1` (a charge for
 * geometry that is not there).
 */
/**
 * ROUTING V2 — choose a NUMBER question's option by the VALUE of the answer.
 *
 * Two modes, and which one applies is a fact about the authored options rather
 * than a flag anyone has to remember to set:
 *
 *   no option carries a predicate  -> legacy behaviour, options[0], untouched.
 *                                     Every NUMBER question written before this
 *                                     existed keeps working exactly as it did.
 *   any option carries one         -> numeric routing. EXACTLY ONE option must
 *                                     contain the validated answer.
 *
 * ORDER MUST NEVER DECIDE. A gap and an overlap are both authoring defects, and
 * both fail closed. "First match wins" would let a range overlap resolve
 * silently by accident of `order`, which is not a fact about the physical world
 * and would make two identically-authored trees behave differently.
 *
 * Entirely generic. This function knows nothing about feet, walls, eligibility
 * or price; it validates a number against the question's authored range and
 * returns the one authored range containing it.
 */
export type NumericOptionChoice<T> =
  | { kind: "option"; option: T }
  | { kind: "invalid"; reason: string }
  | { kind: "broken"; reason: string };

export function selectNumericOption<
  T extends { value: string; numberAtLeast: number | null; numberAtMost: number | null }
>(
  question: { key: string; numberMin: number | null; numberMax: number | null; options: readonly T[] },
  raw: string
): NumericOptionChoice<T> {
  const routing = question.options.filter(
    (o) => o.numberAtLeast !== null || o.numberAtMost !== null
  );
  if (routing.length === 0) {
    const first = question.options[0];
    if (!first) return { kind: "broken", reason: `"${question.key}" has no answer options` };
    return { kind: "option", option: first };
  }

  // In numeric-routing mode the question's own range is what "valid" means, so
  // it has to exist before any option can be judged against it.
  if (question.numberMin === null || question.numberMax === null) {
    return { kind: "broken", reason:
      `"${question.key}" routes on its number but declares no numberMin/numberMax` };
  }
  const unbounded = question.options.filter(
    (o) => o.numberAtLeast === null && o.numberAtMost === null
  );
  if (unbounded.length > 0) {
    return { kind: "broken", reason:
      `"${question.key}" mixes numeric routing with option(s) carrying no range: ` +
      unbounded.map((o) => o.value).join(", ") };
  }

  const text = String(raw ?? "").trim();
  if (!/^\d+$/.test(text)) {
    return { kind: "invalid", reason: `"${question.key}" is "${text}", which is not a whole number` };
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    return { kind: "invalid", reason: `"${question.key}" is "${text}", which is not a usable whole number` };
  }
  if (n < question.numberMin || n > question.numberMax) {
    return { kind: "invalid", reason:
      `"${question.key}" is ${n}, outside its authored range ${question.numberMin}\u2013${question.numberMax}` };
  }

  const matches = routing.filter(
    (o) => (o.numberAtLeast === null || n >= o.numberAtLeast) &&
           (o.numberAtMost === null || n <= o.numberAtMost)
  );
  if (matches.length === 0) {
    return { kind: "broken", reason:
      `"${question.key}" has no authored range containing ${n} \u2014 a gap in the tree` };
  }
  if (matches.length > 1) {
    return { kind: "broken", reason:
      `"${question.key}" has ${matches.length} ranges containing ${n} (${matches.map((m) => m.value).join(", ")}) ` +
      `\u2014 an overlap; option order must not decide this` };
  }
  return { kind: "option", option: matches[0] };
}

/**
 * ROUTING V2 \u2014 what a NUMBER answer is allowed to mean as a component quantity.
 */
export type BoundQuantity =
  | { kind: "quantity"; value: number }
  | { kind: "omit" }
  | { kind: "invalid"; reason: string }
  | { kind: "broken"; reason: string };

export type BoundQuestion = {
  key: string;
  inputType: string;
  numberMin: number | null;
  numberMax: number | null;
};

export function resolveBoundQuantity(
  binding: { quantity: number; quantityAnswerKey: string | null },
  answers: Record<string, string>,
  /** Questions CONSUMED on the current path, not every question on the service. */
  visited: readonly BoundQuestion[],
  componentKey: string
): BoundQuantity {
  if (binding.quantityAnswerKey === null || binding.quantityAnswerKey === undefined) {
    return { kind: "quantity", value: binding.quantity };
  }
  const key = binding.quantityAnswerKey;

  const q = visited.find((x) => x.key === key);
  if (!q) {
    return { kind: "broken", reason:
      `component ${componentKey} binds its quantity to "${key}", which this path never asked` };
  }
  if (q.inputType !== "NUMBER") {
    return { kind: "broken", reason:
      `component ${componentKey} binds its quantity to "${key}", a ${q.inputType} question, not NUMBER` };
  }
  if (q.numberMin === null || q.numberMin === undefined || q.numberMax === null || q.numberMax === undefined) {
    return { kind: "broken", reason:
      `component ${componentKey} binds its quantity to "${key}", which declares no authored range` };
  }

  const raw = answers[key];
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return { kind: "invalid", reason: `"${key}" has no answer, so ${componentKey} has no quantity` };
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    return { kind: "invalid", reason: `"${key}" is "${text}", which is not a whole number` };
  }
  const n = Number(text);
  if (!Number.isSafeInteger(n)) {
    return { kind: "invalid", reason: `"${key}" is "${text}", which is not a usable whole number` };
  }
  if (n < q.numberMin || n > q.numberMax) {
    return { kind: "invalid", reason:
      `"${key}" is ${n}, outside its authored range ${q.numberMin}\u2013${q.numberMax}` };
  }
  // Zero is a real answer for an optional count and no answer at all for a
  // measured scope. Which one it is comes from the question's authored minimum:
  // a route whose minimum is 1 refuses zero above, before reaching here.
  if (n === 0) return { kind: "omit" };
  return { kind: "quantity", value: n };
}

export function resolveRoute(
  service: LoadedService,
  answers: Record<string, string>,
  isPrimary: boolean,
  settings: PricingSettings
): ResolvedRoute {
  let config = startConfiguration({
    estimatedMinutes: service.estimatedMinutes,
    requiresTechCount: service.requiresTechCount,
    fieldLaborHours: service.fieldLaborHours,
    materialCostCents: service.materialCostCents,
  });

  // A required material role with no cost for this contractor.
  //
  //   A homeowner-facing price may never be calculated using an unresolved
  //   required material cost. Missing required cost = no price.
  //
  // Checked FIRST, before the tree is walked, because it is a fact about the
  // service rather than about the answers — and because the cached
  // materialCostCents that startConfiguration just consumed is exactly the
  // figure that must not be trusted while this flag is false. It is
  // deliberately left at its previous value rather than zeroed; zeroing would
  // be silent underpricing by another route, and this check is what prevents
  // the stale figure reaching a customer.
  //
  // This cannot happen for a service whose materials all resolve, which today
  // is all of them. It becomes reachable when a contractor holds template
  // services before entering their own costs, and when a cost is deleted,
  // deactivated or lost to a bad import after activation. Activation blocking
  // catches the first; this catches the rest.
  //
  // RESTORED 27 August. This block was deleted as collateral in 3ae9349,
  // whose subject was scoping pricing settings to the contractor and which
  // never mentioned it. scripts/verify-unresolved-guards.ts went red in the
  // same commit and stayed red, because nothing runs it on the way to a
  // deploy — `npm run build` type-checks the seeds but does not execute the
  // verify scripts, and the test's fixture is cast `as any`, so removing the
  // guard was not even a type error.
  if (service.materialCostResolved === false) {
    return {
      status: "REVIEW",
      reason: "A material this service needs has no cost recorded",
      photoLabels: [],
      photoSafetyNotes: [],
      // No floor either. A floor derived from a total that is missing a
      // material is not a floor.
      floorPriceCents: null,
      isPrimary,
      config,
    };
  }

  const consumed: { key: string; value: string; label: string }[] = [];
  const photoLabels: string[] = [];
  const photoSafetyNotes: string[] = [];
  const disclaimers: string[] = [];

  // A service with no tree is priced entirely from its published figures.
  if (service.questions.length === 0) {
    const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
    if (base === null) {
      return { status: "INVALID", reason: `${service.slug} has no published ${isPrimary ? "base" : "add-on"} price` };
    }
    return {
      status: "PRICED",
      priceCents: base,
      isPrimary,
      config,
      photoLabels: [],
      photoSafetyNotes: [],
      disclaimers: service.disclaimer ? [service.disclaimer] : [],
      consumed: [],
    };
  }

  let current = service.questions[0];
  // Guards against a tree that loops back on itself. A cycle used to be
  // possible to build in the editor and would hang the walk.
  const visited = new Set<string>();

  for (;;) {
    if (visited.has(current.id)) {
      return { status: "INVALID", reason: `Cycle at question "${current.key}" in ${service.slug}` };
    }
    visited.add(current.id);

    const given = answers[current.key];
    if (given === undefined) {
      return { status: "INVALID", reason: `No answer for "${current.key}"` };
    }

    // TEXT carries the typed value and has one option — unchanged.
    //
    // NUMBER may now ROUTE on that value. selectNumericOption keeps the old
    // behaviour for any NUMBER question whose options carry no ranges, so
    // nothing authored before this changes; a question that does carry them must
    // have exactly one range containing the answer, decided by the ranges and
    // never by option order.
    let option;
    if (current.inputType === "NUMBER") {
      const choice = selectNumericOption(current, given);
      // An authoring defect — a gap, an overlap, or a missing range. No answer
      // the customer could give would fix it.
      if (choice.kind === "broken") throw new Error(`${service.slug}: ${choice.reason}`);
      if (choice.kind === "invalid") return { status: "INVALID", reason: `${service.slug}: ${choice.reason}` };
      option = choice.option;
    } else if (current.inputType === "TEXT") {
      option = current.options[0];
    } else {
      option = current.options.find((o) => o.value === given);
    }

    if (!option) {
      // The answer doesn't map to anything on this question. Usually means
      // the tree changed under a customer mid-flow.
      return {
        status: "INVALID",
        reason: `"${given}" is not a valid answer to "${current.key}" in ${service.slug}`,
      };
    }

    consumed.push({ key: current.key, value: given, label: option.label });

    // Reroutes stop the walk. The target service prices it, with whatever
    // answers still apply carried across.
    //
    // The two reroute actions carry their destination DIFFERENTLY, and
    // collapsing them into one rule is what broke this. REROUTE_SERVICE names
    // a specific other service on the answer row. REROUTE_TROUBLESHOOTING
    // names a ROLE — "this is a diagnostic job" — and the contractor's own
    // diagnostic service is looked up from that role. Requiring an explicit id
    // for the second treated a deliberate design as missing data, and marked
    // 47 of the commonest answers a homeowner gives ("it stopped working",
    // "I'm not sure what's wrong") INVALID on the server while the storefront
    // showed the customer the hand-off.
    if (option.routeAction === "REROUTE_SERVICE") {
      if (!option.rerouteServiceId) {
        return { status: "INVALID", reason: `Reroute from "${current.key}" has no target service` };
      }
      return {
        status: "REROUTE",
        via: "SERVICE",
        targetServiceId: option.rerouteServiceId,
        carriedAnswers: answers,
      };
    }

    if (option.routeAction === "REROUTE_TROUBLESHOOTING") {
      // Resolved at load time against THIS service's contractor, so a
      // contractor can never be handed another contractor's diagnostic.
      if (!service.troubleshootingServiceId) {
        return {
          status: "INVALID",
          reason:
            `"${current.key}" routes to troubleshooting, but ` +
            `${service.troubleshootingProblem ?? "no diagnostic service was resolved"}`,
        };
      }
      return {
        status: "REROUTE",
        via: "TROUBLESHOOTING",
        targetServiceId: service.troubleshootingServiceId,
        // Deliberately empty. These answers describe a service the customer
        // turns out not to be booking; the diagnostic asks its own questions.
        // Carrying them would look like continuity and be noise.
        carriedAnswers: {},
      };
    }

    // ROUTING V2 — resolve bound quantities BEFORE the branch is applied.
    //
    // Done here rather than in pricing so pricing keeps receiving ordinary
    // `{ component, quantity }` pairs and never learns a number came from a
    // homeowner. One pipeline, one meaning of quantity.
    // Reachability, structurally: only questions this walk actually consumed.
    // `consumed` is appended as each answer is taken, so it holds this path and
    // nothing else — an answer left over from an abandoned branch is invisible.
    const visitedKeys = new Set(consumed.map((x) => x.key));
    const visitedQuestions = service.questions.filter((x) => visitedKeys.has(x.key));
    const boundQuantities = new Map<string, number>();
    for (const c of option.components) {
      const ckey = c.canonicalComponent?.key ?? "(unlinked)";
      const bq = resolveBoundQuantity(
        { quantity: c.quantity, quantityAnswerKey: c.quantityAnswerKey ?? null },
        answers,
        visitedQuestions,
        ckey
      );
      // Same class as an unlinked canonical role: the TREE is wrong, and no
      // answer the customer could give would make it right.
      if (bq.kind === "broken") throw new Error(`${service.slug}: ${bq.reason}`);
      // The answer is wrong or missing. Review can resolve that; a price cannot.
      if (bq.kind === "invalid") return { status: "INVALID", reason: `${service.slug}: ${bq.reason}` };
      // Absent, not zero — see the filter below.
      if (bq.kind === "omit") continue;
      boundQuantities.set(c.id, bq.value);
    }


    // applyBranch returns the new configuration directly — it isn't wrapped.
    config = applyBranch(
      config,
      {
        priceModifierCents: option.priceModifierCents,
        approvedComponentPriceCents: option.approvedComponentPriceCents,
        accessClassification: option.accessClassification,
        // G1. Absent on every row authored before scoped access, which the
        // column default resolves to PRIMARY — their existing meaning.
        accessSlot: parseAccessSlot(option.accessSlot),
        overrideEstimatedMinutes: option.overrideEstimatedMinutes,
        overrideTechCount: option.overrideTechCount,
        overrideFieldLaborHours: option.overrideFieldLaborHours,
        addFieldLaborHours: option.addFieldLaborHours,
        addMaterialCostCents: option.addMaterialCostCents,
        addScheduleMinutes: option.addScheduleMinutes,
        // A component whose bound quantity resolved to zero is ABSENT, not
        // zero-quantity: no inside corners means no corner work, and a `× 0`
        // line would be promoted to `× 1` by the shared pricing guard.
        components: option.components.filter((c) => boundQuantities.has(c.id)).map((c) => {
          const canonical = c.canonicalComponent;
          // A recipe line pointing at nothing. Post-migration this cannot
          // happen — the migration reported zero unlinked — but a broken
          // attachment must not price as though the work were free.
          if (!canonical) {
            throw new Error(
              `${service.slug}: an answer option attaches a component with no ` +
                `canonical role. The tree is broken and must not be priced.`
            );
          }

          // Possibly none: a role this contractor has never priced.
          const own = service.ownComponents.get(canonical.id);

          /**
           * The physical recipe, costed against THIS contractor's materials.
           *
           * Undefined when no recipe is authored — the component then falls
           * back to its dollar constant, so conversion can proceed one role at
           * a time without a half-converted library mispricing.
           *
           * A role the contractor has never costed makes the whole recipe
           * unresolved rather than cheaper: fails closed, like the approved
           * price above.
           */
          const recipe = canonical.materials ?? [];
          const materialRecipe = recipe.length
            ? recipe.reduce(
                (acc, line) => {
                  const cost = service.ownMaterialCosts.get(line.canonicalMaterialId);
                  if (cost === undefined) return { cents: acc.cents, resolved: false };
                  return { cents: acc.cents + cost * line.quantity, resolved: acc.resolved };
                },
                { cents: 0, resolved: true },
              )
            : null;

          return {
            // Resolved above: the authored static value, or the homeowner's
            // number. Never zero, never negative — those never reach here.
            quantity: boundQuantities.get(c.id)!,
            conditionAnswerKey: c.conditionAnswerKey,
            conditionAnswerValue: c.conditionAnswerValue,
            conditionAccessClass: c.conditionAccessClass,
            conditionAccessSlot: parseAccessSlot(c.conditionAccessSlot),
            component: {
              key: canonical.key,
              // The contractor's wording if they set one, else the shared
              // description of the work.
              customerFacingLabel:
                own?.labelOverride ?? canonical.customerFacingLabel,
              // FAILS CLOSED. No contractor row means this contractor has
              // never priced the component: null, not approved, and the route
              // goes to review via config.awaitingComponentApproval. Never
              // zero, and never another contractor's figure.
              approvedPriceCents: own ? own.approvedPriceCents : null,
              materialRecipe: materialRecipe
                ? { cents: Math.round(materialRecipe.cents), resolved: materialRecipe.resolved }
                : null,
              // Only reached when the price above is non-null, since a null
              // price stops the route before these are used.
              addFieldLaborHours: own?.addFieldLaborHours ?? 0,
              addMaterialCostCents: own?.addMaterialCostCents ?? 0,
              addScheduleMinutes: own?.addScheduleMinutes ?? 0,
              addTechCount: own?.addTechCount ?? 0,
            },
          };
        }),
      },
      answers
    );

    for (const g of option.photoGroups) {
      photoLabels.push(...g.photoGroup.labels);
      if (g.photoGroup.safetyNote) photoSafetyNotes.push(g.photoGroup.safetyNote);
    }
    photoLabels.push(...option.requiredPhotoLabels);
    if (option.disclaimer) disclaimers.push(option.disclaimer);
    for (const d of option.conditionalDisclaimers) {
      const policy = requireContractorDisclaimer(service.slug, d.contractorDisclaimer);
      if (!disclaimerIsActive(policy)) continue;
      const ac = disclaimerAccessClass(policy);
      // G1: the condition reads a NAMED slot. An unestablished slot reads as
      // undefined and matches nothing, exactly as a null accessClass did.
      if (ac === null || ac === config.accessBySlot[disclaimerAccessSlot(policy)]) {
        disclaimers.push(policy.text);
      }
    }

    const terminal =
      option.routeAction === "RESOLVE_INSTANT" ||
      option.routeAction === "RESOLVE_ADJUSTED" ||
      option.routeAction === "PHOTO_REVIEW";

    if (option.routeAction === "PHOTO_REVIEW" && option.photosBlockBooking) {
      const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
      // customerPrice returns a verdict, not a number: it can refuse to
      // price a route whose components aren't approved.
      const floor = base === null ? null : customerPrice(config, base).totalCents;
      return {
        status: "REVIEW",
        reason: "This route needs the office to price it",
        photoLabels: [...new Set(photoLabels)],
        photoSafetyNotes: [...new Set(photoSafetyNotes)],
        floorPriceCents: floor,
        isPrimary,
        config,
      };
    }

    if (terminal) break;

    if (!option.nextQuestionId) {
      return { status: "INVALID", reason: `"${option.value}" continues but has no next question` };
    }
    const next = service.questions.find((q) => q.id === option.nextQuestionId);
    if (!next) {
      return { status: "INVALID", reason: `"${option.value}" points at a question that doesn't exist` };
    }
    current = next;
  }

  // A selected component consumes material this contractor has never costed.
  // Same rule as a missing material on the service itself: no price.
  if (config.awaitingComponentMaterialCost) {
    return {
      status: "REVIEW",
      reason: "A component on this route consumes a material with no recorded cost",
      photoLabels: [...new Set(photoLabels)],
      photoSafetyNotes: [...new Set(photoSafetyNotes)],
      floorPriceCents: null,
      isPrimary,
      config,
    };
  }

  // Anything unresolved at this point becomes a review rather than a price.
  if (config.awaitingComponentApproval) {
    const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
    return {
      status: "REVIEW",
      reason: "A component on this route has no approved price",
      photoLabels: [...new Set(photoLabels)],
      photoSafetyNotes: [...new Set(photoSafetyNotes)],
      floorPriceCents: base === null ? null : customerPrice(config, base).totalCents,
      isPrimary,
      config,
    };
  }
  if (config.accessClass === "UNKNOWN") {
    const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
    return {
      status: "REVIEW",
      reason: "The wiring route isn't established",
      photoLabels: [...new Set(photoLabels)],
      photoSafetyNotes: [...new Set(photoSafetyNotes)],
      floorPriceCents: base === null ? null : customerPrice(config, base).totalCents,
      isPrimary,
      config,
    };
  }

  const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
  if (base === null) {
    return {
      status: "INVALID",
      reason: `${service.slug} has no published ${isPrimary ? "base" : "add-on"} price`,
    };
  }

  const verdict = customerPrice(config, base);
  if (verdict.mustReview || verdict.totalCents === null) {
    // The pricing library itself refused. Fail closed rather than reaching
    // past it for a number — its reasons are the same ones this resolver
    // checks, and any it catches that we don't is exactly the case worth
    // deferring to it on.
    return {
      status: "REVIEW",
      reason: verdict.reason ?? "This route can't be priced automatically",
      photoLabels: [...new Set(photoLabels)],
      photoSafetyNotes: [...new Set(photoSafetyNotes)],
      floorPriceCents: null,
      isPrimary,
      config,
    };
  }

  return {
    status: "PRICED",
    priceCents: verdict.totalCents,
    isPrimary,
    config,
    photoLabels: [...new Set(photoLabels)],
    photoSafetyNotes: [...new Set(photoSafetyNotes)],
    disclaimers: service.disclaimer ? [service.disclaimer, ...disclaimers] : disclaimers,
    consumed,
  };
}

/**
 * ONE contractor's pricing settings, or a thrown error.
 *
 * A missing row must not become a default price, and — now that there is more
 * than one contractor — it must not become somebody else's price either.
 * There is deliberately no fallback to Elite and no "first row" lookup. A
 * cross-tenant pricing fallback is worse than an error, because the error
 * stops a booking while the fallback completes one at the wrong rate.
 *
 * WHERE THE CONTRACTOR COMES FROM
 *
 * The service being priced. `loadServiceForResolution` uses `include`, so
 * `service.contractorId` is available at every call site that resolves a
 * route. That is a fact about the work rather than an inference: you are
 * pricing that contractor's service, so you use that contractor's rate.
 *
 * No site identifier, no session, no ambient context needed for this path.
 */
export async function loadPricingSettings(
  db: PrismaClient,
  contractorId: string
): Promise<PricingSettings> {
  if (!contractorId) {
    throw new Error("loadPricingSettings called with no contractor — cannot price anything.");
  }
  const s = await db.pricingSettings.findUnique({ where: { contractorId } });
  if (!s) {
    throw new Error(
      `No pricing settings for contractor ${contractorId} — cannot price anything. ` +
        `Onboarding must create them; they are not defaulted.`
    );
  }
  return s;
}

/**
 * The contractor that owns a service, or a thrown error.
 *
 * Small on purpose. Every pricing path needs this and every one of them must
 * fail the same way, rather than each inventing its own handling of a service
 * with no owner.
 */
export function contractorIdForService(service: {
  slug: string;
  contractorId: string | null;
}): string {
  if (!service.contractorId) {
    throw new Error(
      `${service.slug} has no contractor. It cannot be priced — run ` +
        `prisma/backfill-service-contractor-2026-08-25.ts.`
    );
  }
  return service.contractorId;
}
