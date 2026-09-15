/**
 * The reroute handoff — extracted from RerouteNotice/GuidedFlowEngine so its
 * parsing/construction logic is testable without a DOM.
 *
 * Where a reroute (REROUTE_SERVICE, or a troubleshooting reroute — B.4) leaves
 * intake context for the target flow to pick up. Goes through sessionStorage
 * rather than the URL: answer maps get long, and a query string full of them
 * is ugly, capped in length, and ends up in browser history and server logs.
 *
 * Deliberately short-lived and single-use — tagged with the target service
 * and cleared the moment it's read (the CALLER clears it; this module never
 * touches sessionStorage directly, so it stays testable without one) — so a
 * stale payload can't leak into an unrelated service later in the session.
 * Reuse is right for THIS reroute and wrong for anything else.
 *
 * ANTI-LEAK, PRECISELY STATED
 *
 * `consumeHandoffForTarget` refuses anything not addressed to the EXACT
 * service id it's asked about. That's a same-service check, not a literal
 * same-tenant one — sessionStorage is scoped by browser origin, and if two
 * contractors' storefronts ever shared an origin, a stale key could
 * theoretically still be present. But service ids are unique across the
 * whole platform (no two contractors' services ever share an id), so the
 * same-service check is ALSO an effective same-tenant check: a handoff
 * written for one contractor's service can never match another's, because
 * the id it's tagged with never will.
 */

export const REROUTE_HANDOFF_KEY = "elite:reroute-handoff";

export type RerouteHandoffPayload = {
  targetServiceId: string;
  /** REROUTE_SERVICE only — answers to carry into the destination's OWN tree. */
  answers?: Record<string, string>;
  /**
   * A troubleshooting reroute only (B.4) — intake context, NOT an answer to
   * any question the destination asks. Kept in its own field rather than
   * folded into `answers` under a fake key: the destination's own
   * consumption logic below deliberately does not filter this against the
   * destination's question keys the way `answers` is filtered, because it
   * isn't one.
   */
  customerNote?: string;
};

export function serializeHandoff(payload: RerouteHandoffPayload): string {
  return JSON.stringify(payload);
}

/**
 * The one piece of context a troubleshooting reroute carries: what the
 * customer told the ORIGINATING service, in their own words. Built from
 * facts that are ALWAYS available (the service name, the answer's own
 * label) rather than gated on that specific answer having an authored
 * disclaimer — B.5's fix, alongside B.4's.
 */
export function buildTroubleshootingNote(
  originServiceName: string,
  answerLabel: string,
  answerDisclaimer?: string | null
): string {
  const base = `From ${originServiceName}: "${answerLabel}."`;
  return answerDisclaimer ? `${base} ${answerDisclaimer}` : base;
}

export type ConsumedHandoff = { answers: Record<string, string>; customerNote: string };

const EMPTY_HANDOFF: ConsumedHandoff = { answers: {}, customerNote: "" };

/**
 * Pure: given the raw sessionStorage value (or null/undefined — direct entry,
 * no handoff at all) and the target flow's own identity, returns what may
 * legitimately be applied. The caller owns actually reading and clearing
 * sessionStorage; this only decides what a given raw value means.
 *
 * Fails closed on every malformed shape: not JSON, not an object, wrong
 * target, `answers` not an object, an individual answer value not a string.
 * A customer answering fresh questions again is not ideal; applying a
 * corrupt or foreign payload is worse.
 */
export function consumeHandoffForTarget(
  raw: string | null | undefined,
  targetServiceId: string,
  /** This flow's own question keys — `answers` is filtered to these; a
   *  shared key like ceiling height transfers, one that happens to collide
   *  does not silently answer a question the customer never saw. */
  targetQuestionKeys: readonly string[]
): ConsumedHandoff {
  if (!raw) return EMPTY_HANDOFF;

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return EMPTY_HANDOFF;
  }
  if (!payload || typeof payload !== "object") return EMPTY_HANDOFF;
  const p = payload as Record<string, unknown>;

  // The anti-leak check. See the module docstring for why a same-SERVICE
  // check is also an effective same-TENANT one.
  if (p.targetServiceId !== targetServiceId) return EMPTY_HANDOFF;

  const keys = new Set(targetQuestionKeys);
  const rawAnswers = p.answers && typeof p.answers === "object" ? (p.answers as Record<string, unknown>) : {};
  const answers = Object.fromEntries(
    Object.entries(rawAnswers).filter(
      (entry): entry is [string, string] => keys.has(entry[0]) && typeof entry[1] === "string"
    )
  );

  // Deliberately NOT filtered against `targetQuestionKeys` — a note isn't an
  // answer to any question this flow asks, so there's nothing to match it
  // against. See the field's own doc comment on RerouteHandoffPayload.
  const customerNote = typeof p.customerNote === "string" ? p.customerNote : "";

  return { answers, customerNote };
}
