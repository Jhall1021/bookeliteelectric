/**
 * Shared classification for template extraction — ADR-014.
 *
 * THREE OUTCOMES, kept strictly apart:
 *
 *   canonical automatically   high confidence it is electrical knowledge
 *   authored canonical        we know Elite's version is business-specific and
 *                             deliberately author what Price2Book says instead
 *   not template content      contractor policy or economics; it simply does
 *                             not enter the template
 *
 * The third is a legitimate result, not a gap. POLICY[new_outlet.standard_run_ft]
 * = 25 does not mean the template needs some universal number invented for it.
 * The template may correctly say only "included run length requires contractor
 * configuration".
 */
import { readFileSync, existsSync } from "node:fs";

export const MANIFEST_PATH = "prisma/template/electrical.wording.json";

/** Money in the forms a human writes it. */
export const MONEY = /\$\s?[\d,]+(\.\d+)?|\b\d+\s?(dollars?|bucks)\b/i;
/** Contractor names. Grows as more contractors are extracted from. */
export const BRAND = /\bElite(\s+Electric(\s+&\s+Lighting)?)?\b/i;
/**
 * A measurement threshold in customer-facing copy — but only the kind SOMEBODY
 * CHOSE.
 *
 * The continuum test (docs/decisions/TEMPLATE-CLASSIFICATION-RULES.md). A
 * boundary on a continuous quantity — feet, inches, pounds — is a contractor
 * allowance wearing a trade-fact costume: THAT distance matters belongs to the
 * trade, WHERE the line falls belongs to the contractor.
 *
 * A discrete standardized RATING is the opposite. Nobody chose 15 amp, 20 amp,
 * 120 volt, 240 volt or a 200 amp service — the NEC and the manufacturers did,
 * and no two contractors can differ about them. Those are trade knowledge and
 * extract as ordinary labels.
 *
 * Both read as "a number with a unit", which is why this stayed fail-closed
 * until the distinction was written down rather than guessed at per catalog.
 */
export const THRESHOLD = /\b\d+(\.\d+)?\s?(ft|feet|foot|in|inch(es)?|lb|lbs|pounds?)\b/i;

/**
 * Standardized electrical ratings. Present so the rule is legible and testable,
 * not because anything needs to match it: ratings are canonical, so the
 * classifier simply does not flag them.
 */
export const STANDARD_RATING = /\b\d+(\.\d+)?\s?(amps?|volts?|watts?|kw|va)\b/i;
/**
 * Scope wording that belongs to the contractor rather than the trade.
 *
 * The identity test (docs/decisions/TEMPLATE-CLASSIFICATION-RULES.md) splits
 * this finer than it first appears.
 *
 * "You supply the fixture; we run the wiring" and "Customer-Supplied Smart
 * Switch" describe a STANDARD SERVICE PATTERN. Customer supplies equipment,
 * electrician installs it, is a real and universal way to structure a trade
 * catalog — it distinguishes one service from another, so it is part of that
 * service's identity and extracts as canonical.
 *
 * "We supply the fan" is the opposite: this contractor choosing to stock fans.
 * A contractor who does not would inherit a promise they never made. So would
 * anyone inheriting "we don't", "not included" or "our policy" — by the mouth
 * test, a scope exclusion is a promise about what the contractor will refuse.
 *
 * Hence: who the CUSTOMER supplies is canonical; what the CONTRACTOR supplies
 * or refuses is policy.
 */
export const SCOPE_POLICY = /\b(we (don'?t|won'?t|do not|will not|supply|provide)|our policy|not included|unless we'?ve put it in writing)\b/i;

export type RefusalKind =
  | "branded-wording"
  | "economic-wording"
  | "policy-threshold"
  | "ambiguous-scope"
  | "material-quantity"
  | "disclaimer-policy"
  | "unclassifiable";

export type Refusal = {
  kind: RefusalKind;
  service: string;
  location: string;
  field: string;
  source: string;
  reason: string;
  key: string;
};

export type WordingEntry = { label?: string; prompt?: string; helpText?: string; reason?: string };

type WordingManifest = { entries?: Record<string, WordingEntry>; keys?: Record<string, string> };

function manifest(): WordingManifest {
  if (!existsSync(MANIFEST_PATH)) return {};
  return JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as WordingManifest;
}

export function loadWording(): Record<string, WordingEntry> {
  return manifest().entries ?? {};
}

/**
 * Elite service slug -> canonical template key.
 *
 * Only the TEMPLATE key changes. Elite's slug is a live URL and an operational
 * identifier; breaking it to tidy the template would be paying a real cost for
 * a cosmetic one.
 */
export function loadKeyRemap(): Record<string, string> {
  return manifest().keys ?? {};
}

export const POLICY_PATH = "prisma/template/electrical.policies.json";

export type PolicyDefinition = {
  type: "DISTANCE_BREAKPOINTS" | "HEIGHT_BREAKPOINTS" | "SUPPLY_ARRANGEMENT";
  unit?: string; boundaryCount: number; prompt: string; reason: string;
};
export type PolicyManifest = {
  definitions: Record<string, PolicyDefinition>;
  /** question key -> the band set it belongs to, and each option's label pattern. */
  questions: Record<string, { policyKey: string; patterns: Record<string, string> }>;
  /** service key -> policies it needs that no question introduces. */
  servicePolicies: Record<string, string[]>;
};

export function loadPolicies(): PolicyManifest {
  if (!existsSync(POLICY_PATH)) return { definitions: {}, questions: {}, servicePolicies: {} };
  const m = JSON.parse(readFileSync(POLICY_PATH, "utf8")) as Partial<PolicyManifest>;
  return { definitions: m.definitions ?? {}, questions: m.questions ?? {}, servicePolicies: m.servicePolicies ?? {} };
}

export const KIND_LABEL: Record<RefusalKind, string> = {
  "branded-wording": "CONTRACTOR-BRANDED WORDING",
  "economic-wording": "CUSTOMER-FACING ECONOMIC WORDING",
  "policy-threshold": "POLICY THRESHOLD OR ALLOWANCE",
  "ambiguous-scope": "AMBIGUOUS SCOPE WORDING",
  "material-quantity": "UNRESOLVED MATERIAL QUANTITY",
  "disclaimer-policy": "CONTRACTOR DISCLAIMER / POLICY TEXT",
  "unclassifiable": "CANNOT CONFIDENTLY CLASSIFY",
};

export const KIND_REASON: Record<RefusalKind, string> = {
  "branded-wording":
    "Names the contractor. Substituting a pronoun automatically produces copy nobody approved.",
  "economic-wording":
    "Carries a price. The sentence is built around a number that is unknown for any other contractor, so it has no mechanical rewrite.",
  "policy-threshold":
    "States a boundary on a continuous quantity. THAT the measurement matters is trade knowledge; WHERE the line falls is the contractor's decision, so the template holds the band shape and the contractor holds the number.",
  "ambiguous-scope":
    "States who supplies what, or what is refused. That is scope policy, which differs between contractors running the same trade.",
  "material-quantity":
    "An included allowance rather than a property of the job. The template records that the job consumes this material and leaves the amount to the contractor.",
  "disclaimer-policy":
    "Homeowner-facing disclaimer text is the contractor's policy statement (ADR-009), not trade knowledge.",
  "unclassifiable":
    "Could not be classified as universal trade knowledge with confidence.",
};

/** Classify a piece of customer-facing copy. Null means safe to take as-is. */
export function classify(text: string): RefusalKind | null {
  if (MONEY.test(text)) return "economic-wording";
  if (BRAND.test(text)) return "branded-wording";
  if (THRESHOLD.test(text)) return "policy-threshold";
  if (SCOPE_POLICY.test(text)) return "ambiguous-scope";
  return null;
}
