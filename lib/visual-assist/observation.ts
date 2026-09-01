/**
 * What the model saw, and how well it could see it.
 *
 * Every field Visual Assist returns is wrapped in this rather than being a
 * bare value, for one reason: a bare value cannot distinguish "the label says
 * 50 gallons" from "it looks about that big". Those are the same JSON and
 * completely different facts, and only one of them may reach a price.
 *
 * PROVIDER CONFIDENCE IS EVIDENCE, NOT AUTHORITY
 *
 * The number in `confidence` is an input to Price2Book's own policy
 * (confidence.ts), never a decision. A model that is confidently wrong is the
 * failure mode this whole layer exists to survive, so nothing here treats a
 * high number as permission. `visibility` and `basis` matter more: they say
 * whether the claim rests on anything, and they are cheap for a model to
 * report honestly in a way a probability is not.
 *
 * THE CONTRADICTIONS ARE THE INTERESTING PART
 *
 * A model can return "NOT_VISIBLE, but it's a power vent, confidence 0.97".
 * That is not a low-confidence answer to be discounted — it is an incoherent
 * one, and discounting it would let it through at a threshold. It is dropped
 * to unobserved and the contradiction is recorded, because a field that
 * argues with itself is evidence about the model, not about the equipment.
 */

export type ObservationVisibility = "CLEAR" | "PARTIAL" | "NOT_VISIBLE";

export type ObservationBasis =
  /** Recognized by its shape/form alone. */
  | "VISIBLE_SHAPE"
  /** Read off printed text — a nameplate, a rating, a logo. */
  | "VISIBLE_TEXT"
  | "SHAPE_AND_TEXT"
  /** Nothing supported it. Must not carry a value. */
  | "NONE";

export const OBSERVATION_VISIBILITIES: readonly ObservationVisibility[] = [
  "CLEAR",
  "PARTIAL",
  "NOT_VISIBLE",
];

export const OBSERVATION_BASES: readonly ObservationBasis[] = [
  "VISIBLE_SHAPE",
  "VISIBLE_TEXT",
  "SHAPE_AND_TEXT",
  "NONE",
];

export type VisualObservation<T> = {
  value: T | null;
  /** The provider's own number. Advisory. See confidence.ts. */
  confidence: number;
  visibility: ObservationVisibility;
  basis: ObservationBasis;
  /**
   * The characters actually read, when the basis involved text.
   *
   * Observational evidence, never application input — §36. It is not a
   * lookup key, not a query fragment, and not an instruction. Sanitized on
   * the way in by `sanitizeRawText`.
   */
  rawText?: string | null;
};

/** A field nothing supported. The only shape a refusal takes. */
export function unobserved<T>(): VisualObservation<T> {
  return { value: null, confidence: 0, visibility: "NOT_VISIBLE", basis: "NONE", rawText: null };
}

/** Whether the basis rests on printed characters at all. */
export function basisIncludesText(basis: ObservationBasis): boolean {
  return basis === "VISIBLE_TEXT" || basis === "SHAPE_AND_TEXT";
}

/**
 * The longest a nameplate string may be.
 *
 * Model numbers run to about twenty characters and manufacturers to about
 * thirty. This is far above both, and far below anything that could carry a
 * paragraph of injected instructions out of an image and into a database
 * column somebody later prints.
 */
export const RAW_TEXT_MAX = 120;

/**
 * Make text read off a photograph safe to store and show.
 *
 * NOT html-escaped here, deliberately. Escaping at parse time stores escaped
 * entities that then get escaped again by React at render time, and the
 * customer sees `Square&amp;nbsp;D`. The rule that actually protects us is
 * that this value is never rendered as HTML and never concatenated into a
 * query — both enforced elsewhere. What this does is narrower and worth
 * doing anyway: normalize the encoding, remove the characters that have no
 * business on a nameplate, and cap the length.
 *
 * Angle brackets go because no equipment label contains one and their only
 * likely source is an image with markup painted on it.
 */
export function sanitizeRawText(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const cleaned = input
    .normalize("NFKC")
    // C0/C1 controls and the zero-width family. Invisible characters in a
    // value a human is asked to confirm mean the human confirms one string
    // and the database holds another.
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029\u202A-\u202E\uFEFF]/g, " ")
    .replace(/[<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, RAW_TEXT_MAX);
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * The result of reading one field out of a provider reply.
 *
 * `problems` is not an error channel — an analysis with three good fields and
 * one incoherent one is a success with a gap (§34). The problems are carried
 * so the audit row records WHY a field went unobserved, which is the only way
 * to tell a model that abstains well from one that abstains because its
 * output is malformed.
 */
export type ObservationParse<T> = {
  observation: VisualObservation<T>;
  problems: string[];
};

/**
 * Read one observation out of untrusted provider JSON.
 *
 * `parseValue` returns the typed value or null; null means "the value did not
 * belong to this field's taxonomy", which is a rejection rather than an
 * abstention — the model returned something outside the vocabulary it was
 * given, and that is worth recording separately from it saying UNKNOWN.
 */
export function parseObservation<T>(
  raw: unknown,
  parseValue: (v: unknown) => T | null
): ObservationParse<T> {
  const problems: string[] = [];
  const reject = (why: string): ObservationParse<T> => {
    problems.push(why);
    return { observation: unobserved<T>(), problems };
  };

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return reject("not an observation object");
  }
  const o = raw as Record<string, unknown>;

  // Confidence first: a non-finite or out-of-range number is malformed
  // output, not a low score, and must not be clamped into the valid range
  // where a threshold might later accept it.
  const confidence = o.confidence;
  if (typeof confidence !== "number" || !Number.isFinite(confidence)) {
    return reject("confidence is not a finite number");
  }
  if (confidence < 0 || confidence > 1) {
    return reject(`confidence ${confidence} outside 0..1`);
  }

  const visibility = o.visibility;
  if (
    typeof visibility !== "string" ||
    !OBSERVATION_VISIBILITIES.includes(visibility as ObservationVisibility)
  ) {
    return reject(`visibility ${JSON.stringify(visibility)} not recognized`);
  }
  const basis = o.basis;
  if (typeof basis !== "string" || !OBSERVATION_BASES.includes(basis as ObservationBasis)) {
    return reject(`basis ${JSON.stringify(basis)} not recognized`);
  }

  const rawText = sanitizeRawText(o.rawText);

  // An explicit null value is a clean abstention — keep the reported
  // visibility/basis so the retake copy can be chosen from them.
  if (o.value === null || o.value === undefined) {
    return {
      observation: {
        value: null,
        confidence,
        visibility: visibility as ObservationVisibility,
        basis: basis as ObservationBasis,
        rawText,
      },
      problems,
    };
  }

  const value = parseValue(o.value);
  if (value === null) {
    return reject(`value ${JSON.stringify(o.value).slice(0, 60)} is outside the field's taxonomy`);
  }

  // ── The coherence checks ────────────────────────────────────────────────
  //
  // Both of these are cases where the model has asserted a value and, in the
  // same breath, said it had nothing to assert it from. Dropped rather than
  // discounted: a contradiction scored 0.97 would otherwise clear a 0.95
  // threshold on the strength of the number it contradicts.
  if (visibility === "NOT_VISIBLE") {
    return reject("a value was returned for a field reported NOT_VISIBLE");
  }
  if (basis === "NONE") {
    return reject("a value was returned with no evidence basis");
  }

  return {
    observation: {
      value,
      confidence,
      visibility: visibility as ObservationVisibility,
      basis: basis as ObservationBasis,
      rawText,
    },
    problems,
  };
}
