/**
 * What a business-profile request MEANS, decided before anyone is authorized.
 *
 * Pulled out of the route so the decision can be exercised without a session.
 * The defect that made this necessary: the route answered "Nothing to change"
 * whenever no profile FIELD was sent, and only then looked for `tradeKey` — so
 * the trade picker, which sends `{ tradeKey }` and nothing else, could never
 * enrol a contractor through its real route. The onboarding verifier missed
 * it because it wrote ContractorTrade directly instead of exercising the
 * writer. Trade enrolment is one of the changes this route accepts, and it
 * has to count as one here, in the single place that counts.
 */

import { checkCountry } from "./contractorIdentity";

/** Contractor columns this request may set. */
export type BusinessProfileData = Partial<{
  name: string;
  countryCode: string | null;
  legalName: string | null;
  phone: string | null;
  supportEmail: string | null;
  licenseNumber: string | null;
  licenseLabel: string | null;
}>;

export type BusinessProfileRequest =
  | {
      ok: true;
      /** Column writes, possibly empty when only the trade is changing. */
      data: BusinessProfileData;
      /** `undefined` = not mentioned. `null` = withdraw the enrolment. */
      tradeKey: string | null | undefined;
    }
  | { ok: false; error: "NAME_REQUIRED" | "COUNTRY_UNSUPPORTED" | "NOTHING_TO_CHANGE"; message: string };

/** Trimmed; empty becomes null, which is distinct from "not sent". */
function optionalText(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

export function readBusinessProfileRequest(body: Record<string, unknown>): BusinessProfileRequest {
  const name = optionalText(body.name);
  if (name === null) {
    return {
      ok: false, error: "NAME_REQUIRED",
      message: "Your business name is what a homeowner sees. It cannot be empty.",
    };
  }

  // The country decides whether payments can be set up at all, so a value that
  // would fail later is refused here with the reason the payment system gives.
  const countryRaw = optionalText(body.countryCode);
  let countryCode: string | null | undefined = countryRaw;
  if (typeof countryRaw === "string") {
    const check = checkCountry(countryRaw);
    if (!check.ok) return { ok: false, error: "COUNTRY_UNSUPPORTED", message: check.reason };
    countryCode = countryRaw.trim().toUpperCase();
  }

  const data: BusinessProfileData = {};
  if (name !== undefined) data.name = name;
  if (countryCode !== undefined) data.countryCode = countryCode;
  for (const field of ["legalName", "phone", "supportEmail", "licenseNumber", "licenseLabel"] as const) {
    const v = optionalText(body[field]);
    if (v !== undefined) data[field] = v;
  }

  const tradeKey = optionalText(body.tradeKey);

  // A trade-only request IS a change. Deciding this from `data` alone is the
  // exact defect described above.
  if (Object.keys(data).length === 0 && tradeKey === undefined) {
    return { ok: false, error: "NOTHING_TO_CHANGE", message: "Nothing to change." };
  }

  return { ok: true, data, tradeKey };
}
