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
 * ASKED OF THE TREE, NOT OF A LABEL
 *
 * `bookingType` is a declaration; the tree is the behavior. A service declared
 * ADJUSTED whose every route reaches review promises nothing, and a service
 * with no tree at all promises a price on its first tap. So this walks every
 * route the customer can actually take and reports what they reach.
 *
 * THE CASE THAT LOOKS LIKE A DEAD ROUTE AND ISN'T
 *
 * A route that would price, on a service with no published price, resolves
 * INVALID with "has no published base price". That is not a broken tree — it
 * is a tree PROMISING a price the service cannot deliver, which is precisely
 * the condition this exists to catch. It counts as a promise.
 */

import { resolveRoute } from "./routeResolver";

export type PricePromise = {
  /** A homeowner can reach a fixed price on at least one route. */
  promisesFixedPrice: boolean;
  reason: string;
  routes: { priced: number; review: number; handoff: number; dead: number };
};

/** Guards a tree whose nextQuestionId happens to point backwards. */
const MAX_DEPTH = 40;

export function pricePromiseOf(
  full: {
    questions: { id: string; key: string; options: { routeAction: string; nextQuestionId: string | null; value: string }[] }[];
    bookingType?: string;
  } | null,
  settings: unknown
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
    };
  }

  const byId = new Map(full.questions.map((q) => [q.id, q]));
  const nextKey = (o: { routeAction: string; nextQuestionId: string | null }) =>
    o.routeAction === "CONTINUE" && o.nextQuestionId
      ? byId.get(o.nextQuestionId)?.key ?? null
      : null;

  const routes = { priced: 0, review: 0, handoff: 0, dead: 0 };
  const deadReasons: string[] = [];

  const walk = (key: string | null, answers: Record<string, string>, depth: number) => {
    if (depth > MAX_DEPTH) { routes.dead++; deadReasons.push("route exceeded maximum depth"); return; }
    if (!key) {
      const r = resolveRoute(full as never, answers, true, settings as never);
      if (r.status === "PRICED") routes.priced++;
      else if (r.status === "REVIEW") routes.review++;
      else if (r.status === "REROUTE") routes.handoff++;
      // See the header: a promise the service cannot keep, not a dead route.
      else if (/has no published (base|add-on) price/.test(String(r.reason))) routes.priced++;
      else { routes.dead++; deadReasons.push(String(r.reason)); }
      return;
    }
    const q = full.questions.find((x) => x.key === key);
    if (!q) { routes.dead++; deadReasons.push(`question "${key}" is missing`); return; }
    for (const o of q.options) walk(nextKey(o), { ...answers, [q.key]: o.value }, depth + 1);
  };

  walk(full.questions[0]?.key ?? null, {}, 0);

  return {
    promisesFixedPrice: routes.priced > 0,
    reason: routes.priced > 0
      ? `${routes.priced} route(s) resolve to a published amount`
      : `no route resolves to an amount — ${routes.review} review, ${routes.handoff} hand-off`,
    routes,
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
