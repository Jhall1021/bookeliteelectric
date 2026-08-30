/**
 * Where a contractor operates.
 *
 * Contractor identity, not payment configuration. Stripe exposed it — a v2
 * account refuses `configuration.merchant` without `identity.country` — but it
 * was missing from a model that already carried a street address, a city, a
 * state and a postal code without one.
 *
 * The onboarding wizard will need it for addresses, tax, phone formatting and
 * possibly service-area rules. Stripe just asked first.
 *
 * WHY THE LIST LIVES HERE AND NOT IN THE STRIPE CODE
 *
 * "Price2Book currently supports contractors in the United States" is a
 * product decision. Written as a constant in the Connect route it would read
 * as a Stripe requirement, and the day the second country opens somebody would
 * go looking for it in the payment code.
 *
 * It is also the difference between a policy and an assumption. Elite is
 * American; hard-coding "US" at the point of the Stripe call would turn one
 * tenant's location into a platform truth, which is the same error as shipping
 * their crew-hours in the template.
 */

/** ISO 3166-1 alpha-2 codes Price2Book can currently onboard. */
export const SUPPORTED_COUNTRIES = ["US"] as const;

export type SupportedCountry = (typeof SUPPORTED_COUNTRIES)[number];

export type CountryCheck =
  | { ok: true; countryCode: SupportedCountry }
  | { ok: false; reason: string };

/**
 * May this contractor be onboarded for payments?
 *
 * FAILS CLOSED in both directions. An unknown country is refused because
 * nobody has said where they operate; an unsupported one is refused because
 * Price2Book has not opened there yet. Neither is a default.
 *
 * Pure, so the refusals are provable without touching Stripe — which matters,
 * because the whole point is that they happen BEFORE any Stripe call.
 */
export function checkCountry(countryCode: string | null | undefined): CountryCheck {
  if (!countryCode || !countryCode.trim()) {
    return {
      ok: false,
      reason: "this contractor has no country recorded, so payments cannot be set up",
    };
  }
  const normalized = countryCode.trim().toUpperCase();
  if (normalized.length !== 2) {
    return {
      ok: false,
      reason: `"${countryCode}" is not an ISO 3166-1 alpha-2 country code`,
    };
  }
  if (!(SUPPORTED_COUNTRIES as readonly string[]).includes(normalized)) {
    return {
      ok: false,
      reason:
        `Price2Book does not yet support contractors in ${normalized} — ` +
        `currently ${SUPPORTED_COUNTRIES.join(", ")}`,
    };
  }
  return { ok: true, countryCode: normalized as SupportedCountry };
}
