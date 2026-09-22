/**
 * Does this service PROMISE a fixed customer-facing price?
 *
 * §1.4 used to read "a public service shows a real starting price, or it is
 * not public", which quietly treats *active* and *priced* as synonyms. They
 * are not. A remote-quote service is legitimately customer-visible with
 * nothing in the price slot — collecting photos and coming back with a number
 * IS its outcome, not a gap in it.
 *
 * The question that actually matters is narrower:
 *
 *   Can a homeowner walk this service's tree and arrive at a fixed price?
 *
 * If yes, that price must exist and must have been approved by a human. If no,
 * the service has to satisfy its own outcome's requirements instead, and
 * demanding a `basePrice` of it is demanding the wrong thing.
 *
 * ASKED OF THE AUTHORED TREE, NOT OF A LABEL OR CURRENT SETUP STATE
 *
 * `bookingType` is a declaration; the tree is the behavior. A service declared
 * ADJUSTED whose every route reaches review promises nothing, and a service
 * with no tree at all promises a price on its first tap. So this walks every
 * reachable authored route and reports its terminal action.
 *
 * It deliberately does not ask the runtime resolver for a price. During
 * onboarding, that resolver must return REVIEW while materials, labor or an
 * approval are missing. Treating that temporary refusal as the service's
 * product promise labeled ordinary replacements "quote only" before the
 * contractor had even selected them. Setup readiness and authored outcome are
 * different questions: this function owns only the latter.
 *
 * A RESOLVE_INSTANT or RESOLVE_ADJUSTED terminal therefore promises a price
 * whether or not the contractor has completed its economics yet. PHOTO_REVIEW
 * promises a price only when its photos do not block booking; blocking photo
 * review and REMOTE_QUOTE remain honest review outcomes.
 */

export type PricePromise = {
  /** A homeowner can reach a fixed price on at least one route. */
  promisesFixedPrice: boolean;
  reason: string;
  routes: { priced: number; review: number; handoff: number; dead: number };
  /** Why each dead route died, deduplicated. Empty when `routes.dead` is 0. */
  deadReasons: string[];
  /** At least one authored branch hands the customer to diagnostics. */
  routesToTroubleshooting: boolean;
  /**
   * Service ids a customer route hands off to, via REROUTE_SERVICE.
   *
   * Collected because the resolver does NOT check whether the destination is
   * available — it returns REROUTE with the id, and a hand-off to a service
   * the contractor has not launched counts as a route that works. Only the
   * caller has the database to answer that, so the ids come out here.
   */
  handoffTargets: string[];
};

/** Guards a tree whose nextQuestionId happens to point backwards. */
const MAX_DEPTH = 40;

export function pricePromiseOf(
  full: {
    questions: { id: string; key: string; options: {
      routeAction: string;
      nextQuestionId: string | null;
      value: string;
      photosBlockBooking?: boolean;
      rerouteServiceId?: string | null;
    }[] }[];
    bookingType?: string;
  } | null,
  _settings: unknown
): PricePromise {
  // No tree is not "no promise" — it is the strongest promise there is. The
  // customer taps once and is quoted the base price, so a service with no
  // questions and a pricing booking type owes a real number.
  if (!full || full.questions.length === 0) {
    const quoteOnly = full?.bookingType === "REMOTE_QUOTE";
    return {
      promisesFixedPrice: !quoteOnly,
      reason: quoteOnly
        ? "no tree, and remote quote resolves by quote rather than by amount"
        : "no tree, so the service books directly against its published amount",
      routes: { priced: 0, review: 0, handoff: 0, dead: 0 },
      deadReasons: [],
      routesToTroubleshooting: false,
      handoffTargets: [],
    };
  }

  const byId = new Map(full.questions.map((q) => [q.id, q]));
  const nextKey = (o: { routeAction: string; nextQuestionId: string | null }) =>
    o.routeAction === "CONTINUE" && o.nextQuestionId
      ? byId.get(o.nextQuestionId)?.key ?? null
      : null;

  const routes = { priced: 0, review: 0, handoff: 0, dead: 0 };
  const deadReasons: string[] = [];
  const handoffTargets = new Set<string>();
  let routesToTroubleshooting = false;

  const walk = (key: string | null, depth: number) => {
    if (depth > MAX_DEPTH) { routes.dead++; deadReasons.push("route exceeded maximum depth"); return; }
    if (!key) { routes.dead++; deadReasons.push("route ended without an authored outcome"); return; }
    const q = full.questions.find((x) => x.key === key);
    if (!q) { routes.dead++; deadReasons.push(`question "${key}" is missing`); return; }
    for (const o of q.options) {
      if (o.routeAction === "CONTINUE") {
        const next = nextKey(o);
        if (!next) {
          routes.dead++;
          deadReasons.push(`"${q.key}=${o.value}" continues without a valid next question`);
        } else {
          walk(next, depth + 1);
        }
      } else if (o.routeAction === "RESOLVE_INSTANT" || o.routeAction === "RESOLVE_ADJUSTED") {
        routes.priced++;
      } else if (o.routeAction === "PHOTO_REVIEW") {
        // Non-blocking photos prepare the technician after the amount is
        // locked. Blocking photos ask the office to establish the amount.
        if (o.photosBlockBooking === false) routes.priced++;
        else routes.review++;
      } else if (o.routeAction === "REMOTE_QUOTE") {
        routes.review++;
      } else if (o.routeAction === "REROUTE_SERVICE" || o.routeAction === "REROUTE_TROUBLESHOOTING") {
        routes.handoff++;
        if (o.rerouteServiceId) handoffTargets.add(o.rerouteServiceId);
        if (o.routeAction === "REROUTE_TROUBLESHOOTING") routesToTroubleshooting = true;
      } else {
        routes.dead++;
        deadReasons.push(`"${q.key}=${o.value}" has unknown route action "${o.routeAction}"`);
      }
    }
  };

  walk(full.questions[0]?.key ?? null, 0);

  return {
    promisesFixedPrice: routes.priced > 0,
    reason: routes.priced > 0
      ? `${routes.priced} route(s) resolve to a published amount`
      : `no route resolves to an amount — ${routes.review} review, ${routes.handoff} hand-off`,
    routes,
    deadReasons: [...new Set(deadReasons)],
    routesToTroubleshooting,
    handoffTargets: [...handoffTargets],
  };
}

/**
 * A price a customer can reach does not have to belong to the service they
 * are looking at.
 *
 * An answer option may reference ANOTHER service, and the option is then
 * priced from that service's `basePrice` — with `priceModifierCents` forced to
 * zero, so the referenced price is the only number in play. The two Elite TV
 * mounts work exactly this way: both are `active: false` and undiscoverable
 * on their own, and both are offered inside two live TV installations.
 *
 * That made them invisible to a guard that walked active services and checked
 * each one's OWN price. Their $200.00 and $125.00 reached homeowners with no
 * approval behind either, and §1.4 was green the whole time. Inactive is not
 * the same as unreachable.
 *
 * So the rule is about price SOURCES, not about services: everything a
 * customer route can put in front of someone must have been approved,
 * including the ones reached by reference.
 */
export function unapprovedPriceSources(
  referenced: readonly { slug: string; basePrice: number | null; publishedPriceApprovedAt: Date | null }[]
): string[] {
  return referenced
    .filter((r) => r.basePrice !== null && r.publishedPriceApprovedAt === null)
    .map((r) => r.slug);
}

/** Dead routes are a separate defect from an unkept price promise. */
export function deadRouteCount(p: PricePromise): number {
  return p.routes.dead;
}
