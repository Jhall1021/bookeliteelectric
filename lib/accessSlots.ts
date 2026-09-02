/**
 * Access slots — WHERE an access classification applies.
 *
 * THE ONE PLACE THAT KNOWS WHAT A SLOT IS
 *
 * Schema validation, provisioning, composition, API parsing, the template
 * verifiers and the client all import from here. The grammar in `parseAccessSlot`
 * only helps if exactly one module owns it; duplicated across six surfaces, the
 * copy that goes stale is the one that matters — which is the lesson
 * lib/permitPolicy.ts and lib/troubleshooting.ts were both written from.
 *
 * WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT
 *
 * A job used to hold ONE access classification. It now holds one PER SLOT. That
 * is a change of CARDINALITY AND SCOPE, not of the access taxonomy:
 * `AccessClassification` keeps its three members and their meanings, untouched.
 * A change that started redefining what ACCESSIBLE means would be broadening the
 * blast radius for no reason anybody asked for.
 *
 * WHY THIS EXISTS AT ALL
 *
 * Two trades hit the same ceiling independently. Plumbing found sixteen services
 * composing two access-establishing families and resolved it by narrowing —
 * deciding one route is THE route per service — and recorded that a service
 * genuinely needing two classified routes "is asking for a platform change, not
 * a second family". HVAC then found three routine tune-ups that work indoor AND
 * outdoor equipment in the same visit and cannot narrow: an air conditioner
 * tune-up that does not touch the indoor equipment is not a tune-up.
 *
 * One trade working around a limitation is a trade problem. Two independent
 * trades meeting the same wall is an incomplete abstraction.
 *
 * A STRING COLUMN, NOT A DATABASE ENUM
 *
 * Slots persist as validated strings. V1 accepts exactly the three keys below
 * and rejects everything else — there is no ordinal grammar, no wildcard, and no
 * "unknown slots pass through".
 *
 * The reason for the string is narrow and should stay narrow: a Postgres enum is
 * the one representation that would need a schema migration merely to make a
 * finer slot key DISCUSSABLE later. How multiple indoor equipment instances —
 * several mini-split heads with genuinely different access — will eventually be
 * represented is DELIBERATELY UNDECIDED. Ordinal keys are one candidate; access
 * belonging to equipment or component instances rather than to slot strings is
 * another, and may well be better. Nothing here promises either.
 *
 * Same shape of decision as TemplateVersion.trade being a String rather than a
 * foreign key: if a richer entity ever arrives, it becomes one, and nothing
 * already written is undone.
 */

/**
 * The V1 slots. Three, and three is the whole set.
 *
 * SHARED ACROSS TRADES, NOT OWNED BY ONE. A slot describes WHERE ACCESS APPLIES,
 * not which trade is asking. If plumbing ever needs INDOOR_EQUIPMENT it must mean
 * what HVAC means by it — trade-owned namespaces would rebuild the abstraction
 * problem this module exists to remove.
 */
export type AccessSlot = "PRIMARY" | "INDOOR_EQUIPMENT" | "OUTDOOR_EQUIPMENT";

/**
 * Declaration order, and it is load-bearing.
 *
 * `referencedAccessSlots` is sorted by this rather than by tree traversal, so a
 * service publishes the same slot list on Tuesday as it did on Monday. A list
 * whose order depended on which question happened to be authored first is not a
 * contract.
 */
export const ACCESS_SLOTS: readonly AccessSlot[] = [
  "PRIMARY",
  "INDOOR_EQUIPMENT",
  "OUTDOOR_EQUIPMENT",
] as const;

/**
 * The slot every existing row means.
 *
 * Electrical and Plumbing were authored when a job held one access class, and
 * that one class was the route to the work. `PRIMARY` is that, named. It is the
 * column default precisely so no backfill is needed: ~50 authored rows across the
 * seeds acquire their correct meaning without anybody editing them.
 */
export const PRIMARY_SLOT: AccessSlot = "PRIMARY";

/**
 * Parse a stored or supplied slot key. Returns null rather than guessing.
 *
 * NULL IS FINAL. There is no nearest match and no default, for the same reason
 * lib/visual-assist/bindings.ts refuses one: a fallback would mean an unrecognized
 * key silently resolving to whichever member happened to be first, and the caller
 * would price a job against a location nobody named.
 *
 * Ordinals are rejected here, deliberately and by omission — `INDOOR_EQUIPMENT#2`
 * is not a slot in V1, and accepting it "harmlessly" would turn an implementation
 * detail into an accidental API promise.
 */
export function parseAccessSlot(raw: string | null | undefined): AccessSlot | null {
  if (typeof raw !== "string") return null;
  return (ACCESS_SLOTS as readonly string[]).includes(raw) ? (raw as AccessSlot) : null;
}

/** Parse, or throw naming the value seen. For paths where a bad slot is a bug. */
export function assertValidAccessSlot(raw: string | null | undefined): AccessSlot {
  const slot = parseAccessSlot(raw);
  if (slot === null) {
    throw new Error(
      `Invalid access slot ${JSON.stringify(raw)}. Expected one of ${ACCESS_SLOTS.join(", ")}.`
    );
  }
  return slot;
}

export function isAccessSlot(raw: unknown): raw is AccessSlot {
  return typeof raw === "string" && (ACCESS_SLOTS as readonly string[]).includes(raw);
}

/**
 * Sort a set of slots into the canonical order above.
 *
 * De-duplicated and total: an unrecognized member is dropped rather than
 * appended, because a slot list is a contract and an unparseable entry in one is
 * not a thing to pass along to a client.
 */
export function orderAccessSlots(slots: Iterable<string>): AccessSlot[] {
  const seen = new Set<AccessSlot>();
  for (const raw of slots) {
    const slot = parseAccessSlot(raw);
    if (slot) seen.add(slot);
  }
  return ACCESS_SLOTS.filter((s) => seen.has(s));
}

/**
 * The access classifications, as the platform's own three terms.
 *
 * Re-declared structurally rather than imported from @prisma/client so this
 * module can be exercised — and its invariants proved — with no generated client
 * and no database. UNCHANGED BY G1: same three members, same meanings.
 */
export type AccessClass = "ACCESSIBLE" | "FINISHED" | "UNKNOWN";

/**
 * What a job has established, per slot.
 *
 * PARTIAL, AND THAT IS THE WHOLE POINT.
 *
 * A flow starts having established nothing and accumulates as the homeowner
 * answers. Most services reference only PRIMARY; an HVAC dual-location tune-up
 * references indoor and outdoor and never PRIMARY.
 *
 *   ABSENT   the flow has not established this fact. Nobody was asked, or the
 *            question has not been reached.
 *   UNKNOWN  the homeowner WAS asked, answered, and the honest answer is that
 *            they could not tell.
 *
 * THESE ARE DIFFERENT FACTS AND MUST NEVER BE COLLAPSED. Treating absent as
 * UNKNOWN would report that somebody answered when nobody did; treating UNKNOWN
 * as absent would lose an answer the customer actually gave. A full
 * `Record<AccessSlot, ...>` would force one of those two lies at initialization,
 * which is why this is `Partial`.
 */
export type AccessBySlot = Partial<Record<AccessSlot, AccessClass>>;

/** Has this slot been established? Distinguishes absent from UNKNOWN. */
export function slotEstablished(map: AccessBySlot, slot: AccessSlot): boolean {
  return map[slot] !== undefined;
}

/**
 * Read a slot. `undefined` means UNESTABLISHED — never coerced to UNKNOWN.
 *
 * Callers comparing a condition against this get the behavior the scalar had:
 * a condition of FINISHED against an unestablished slot does not match, exactly
 * as `FINISHED !== null` did not match before. Preserved deliberately, because
 * the migration's whole acceptance criterion is that no existing price moves.
 */
export function slotValue(map: AccessBySlot, slot: AccessSlot): AccessClass | undefined {
  return map[slot];
}

/**
 * Establish or REFINE a slot. The last applicable writer wins.
 *
 * SUCCESSIVE REFINEMENT IS THE DESIGN, NOT A DEFECT.
 *
 * An earlier draft of scoped access made a second write to one slot a conflict
 * that failed closed. That was wrong, and the Electrical catalog proved it:
 * eight active services deliberately write access more than once along a
 * route, and the later answer is the more specific one.
 *
 *   below_above_access         -> ACCESSIBLE   "there is a basement below"
 *   finished_space_both_sides  -> FINISHED     "...but both sides are finished"
 *
 * Each question narrows the classification, and the last one that applies is
 * the true one. Refusing that would have sent eight live services to review and
 * repriced five routes downward by dropping the refinement — which is exactly
 * what the ADR-021 baseline caught.
 *
 * So the rule is:
 *
 *   ACCESS FACTS ARE ISOLATED BY SLOT. WITHIN ONE SLOT, ORDERED SUCCESSIVE
 *   WRITES ARE VALID REFINEMENT AND THE LAST APPLICABLE WRITER WINS.
 *
 * There is no grandfathering here and no special case for PRIMARY: refinement
 * is legitimate in every slot, and a rule that applied to one slot and not
 * another would be a second semantics to keep in step.
 *
 * WHAT SLOTS ACTUALLY BUY, THEN
 *
 * Isolation, which is the whole point and is enough. INDOOR_EQUIPMENT and
 * OUTDOOR_EQUIPMENT are different keys, so no amount of refinement in one can
 * ever overwrite the other. The bug scoped access removes is a cross-location
 * collision, and that bug is removed structurally rather than by a refusal.
 *
 * VISIBILITY, NOT PROHIBITION
 *
 * Multi-writer refinement stays deliberate rather than accidental through
 * scripts/verify-access-writers.ts, which holds the reviewed baseline of
 * (service, slot) pairs that legitimately refine. A NEW one fails until somebody
 * looks at it. That is the honest control: the pattern is legitimate, so it is
 * reviewed rather than banned.
 */
export function writeSlot(
  map: AccessBySlot,
  slot: AccessSlot,
  value: AccessClass
): AccessBySlot {
  return { ...map, [slot]: value };
}

/**
 * Would this write CHANGE the slot rather than establish it?
 *
 * For reporting and for the writer baseline. Never used to refuse: a true here
 * means refinement happened, which is legitimate.
 */
export function isRefinement(
  map: AccessBySlot,
  slot: AccessSlot,
  value: AccessClass
): boolean {
  const existing = map[slot];
  return existing !== undefined && existing !== value;
}
