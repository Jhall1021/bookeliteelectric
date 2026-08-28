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
 * A measurement threshold in customer-facing copy. Usually a contractor
 * allowance wearing a trade-fact costume: THAT distance matters is the trade's,
 * WHERE the line falls is the contractor's.
 */
export const THRESHOLD = /\b\d+(\.\d+)?\s?(ft|feet|foot|in|inch(es)?|lb|lbs|pounds?|amps?|watts?)\b/i;
/** Wording that states who supplies what, or what the contractor will not do. */
export const SCOPE_POLICY = /\b(we (don'?t|won'?t|do not|will not|supply|provide)|you (supply|provide)|customer[- ]supplied|contractor[- ]supplied|our policy|not included)\b/i;

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

export function loadWording(): Record<string, WordingEntry> {
  if (!existsSync(MANIFEST_PATH)) return {};
  const m = JSON.parse(readFileSync(MANIFEST_PATH, "utf8")) as { entries?: Record<string, WordingEntry> };
  return m.entries ?? {};
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
    "States a measurement threshold. THAT the measurement matters is trade knowledge; WHERE the line falls is the contractor's decision.",
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
