/**
 * One structured log line per pilot event — the operational log the app
 * already writes, not a new analytics system.
 *
 * Used for the facts the database does not keep: a validation that refused a
 * save, and a homeowner request that came back REVIEW rather than PRICED.
 * Everything else a pilot debrief needs (approval, activation, cost changes,
 * priced bookings) is durable state, read back by the pilot diagnostic.
 *
 * WHAT IS NEVER WRITTEN: credentials, session or cookie values, homeowner
 * answers, names, emails, addresses or phone numbers. Fields are an explicit
 * allowlist below, so adding something sensitive means changing this type,
 * not slipping a value into a free-form object.
 */
export type PilotEventName =
  | "setup_write"            // a wizard save, accepted or refused
  | "price_approval"         // approve pressed, accepted or refused
  | "activation"             // go-live pressed, accepted or refused
  | "homeowner_price";       // a homeowner request for the pilot service

export type PilotEventFields = {
  contractorId: string;
  serviceId?: string | null;
  /** materials | material_setup | labor | pricing | approval | activation | visit | quote */
  step?: string;
  outcome: "ok" | "refused" | "PRICED" | "REVIEW";
  /** HTTP status for a refused save. */
  status?: number;
  /** A machine code only — e.g. DERIVED_PRICING_APPROVAL_STALE, PRICE_CHANGED. Never free text from a request. */
  code?: string | null;
  /** Cents, for approval and priced outcomes. Prices are not sensitive; people are. */
  totalCents?: number | null;
};

export function pilotLog(event: PilotEventName, fields: PilotEventFields): void {
  const line = {
    event,
    at: new Date().toISOString(),
    contractorId: fields.contractorId,
    serviceId: fields.serviceId ?? undefined,
    step: fields.step,
    outcome: fields.outcome,
    status: fields.status,
    code: fields.code ?? undefined,
    totalCents: fields.totalCents ?? undefined,
  };
  console.info(`[onboarding-pilot] ${JSON.stringify(line)}`);
}
