/**
 * Incomplete is not missing, and neither is zero.
 *
 * PricingSettings used to be four required Ints, so a contractor either had
 * every business decision made or had no row at all. Provisioning could not
 * represent "installed the catalog, hasn't set a rate yet", so it created
 * nothing, and `loadPricingSettings` threw one message for two different
 * problems with two different fixes:
 *
 *   no row            this tenant's state is broken — provisioning failed
 *   row with nulls    this contractor has not decided yet — ordinary, expected
 *
 * The second is a setup step. Reporting it as the first sends someone to look
 * for a bug in onboarding instead of to the screen where they enter a rate.
 *
 * WHICH FIELDS ARE REQUIRED DEPENDS ON WHAT IS BEING PRICED.
 *
 * `compute()` reads `primaryMinimumCents` only when the service is primary and
 * primary-eligible, and `defaultPermitAdminCents` only when the service has no
 * permit figure of its own. Demanding all four everywhere would block a WWT
 * add-on on a minimum that can never apply to it. So the requirement is stated
 * per context, and a field nobody will read is not missing.
 *
 * PURE. No Prisma, no I/O.
 */
import type { PricingSettings } from "./pricing";

export type PricingSettingsRow = {
  crewHourRateCents: number | null;
  electricianHourRateCents?: number | null;
  fixtureHeight12Percent?: number | null;
  fixtureHeight14Percent?: number | null;
  primaryMinimumCents: number | null;
  roundingIncrementCents: number | null;
  defaultPermitAdminCents: number | null;
};

export type PricingSettingsField = keyof PricingSettingsRow;

/** What is being priced, which decides which decisions must already exist. */
export type PricingContext = {
  /** False for a While We're There add-on — the minimum can never apply. */
  isPrimary: boolean;
  /** False for an add-on-only item, same reason. */
  isPrimaryEligible: boolean;
  /** True when the service carries its own permit figure, so the default is unread. */
  servicePermitAdminEstablished: boolean;
};

export type PricingSettingsState =
  | { kind: "MISSING" }
  | { kind: "INCOMPLETE"; missing: PricingSettingsField[] }
  | { kind: "COMPLETE"; settings: PricingSettings };

/** Human wording for one undecided field, for a reason a contractor can act on. */
export const FIELD_PROMPT: Record<PricingSettingsField, string> = {
  crewHourRateCents: "your one-van electrician-and-helper rate",
  electricianHourRateCents: "your one-van electrician rate",
  fixtureHeight12Percent: "your 12-foot fixture labor adjustment",
  fixtureHeight14Percent: "your 14-foot fixture labor adjustment",
  primaryMinimumCents: "your service-call minimum",
  roundingIncrementCents: "how you round customer prices",
  defaultPermitAdminCents: "your default permit and admin charge",
};

/**
 * Which fields this context will actually read.
 *
 * `crewHourRateCents` and `roundingIncrementCents` are unconditional: every
 * price multiplies hours by a rate and rounds the result.
 */
export function requiredFields(ctx: PricingContext): PricingSettingsField[] {
  const required: PricingSettingsField[] = ["crewHourRateCents", "roundingIncrementCents"];
  if (ctx.isPrimary && ctx.isPrimaryEligible) required.push("primaryMinimumCents");
  if (!ctx.servicePermitAdminEstablished) required.push("defaultPermitAdminCents");
  return required;
}

/**
 * Resolve a row against a context.
 *
 * ZERO IS A DECISION. `?? 0` anywhere in here would erase the whole point:
 * a contractor who rounds to nothing sets 0, and one who has not thought
 * about rounding leaves null, and those must not arrive at `compute()` as the
 * same number. Only `!== null` decides.
 */
export function resolvePricingSettings(
  row: PricingSettingsRow | null,
  ctx: PricingContext,
): PricingSettingsState {
  if (row === null) return { kind: "MISSING" };

  const missing = requiredFields(ctx).filter((f) => row[f] === null || row[f] === undefined);
  if (missing.length > 0) return { kind: "INCOMPLETE", missing };

  // Fields this context does not read may still be null. They are filled with
  // zero HERE, at the boundary, only because `compute()` takes numbers — and
  // only for fields `requiredFields` has just proved nobody reads. A value
  // that is read is never defaulted.
  return {
    kind: "COMPLETE",
    settings: {
      crewHourRateCents: row.crewHourRateCents as number,
      electricianHourRateCents: row.electricianHourRateCents ?? row.crewHourRateCents as number,
      fixtureHeight12Percent: row.fixtureHeight12Percent ?? 15,
      fixtureHeight14Percent: row.fixtureHeight14Percent ?? 30,
      roundingIncrementCents: row.roundingIncrementCents as number,
      primaryMinimumCents: row.primaryMinimumCents ?? 0,
      defaultPermitAdminCents: row.defaultPermitAdminCents ?? 0,
    },
  };
}

/** A reason a contractor can act on, naming the decisions still owed. */
export function incompleteReason(missing: PricingSettingsField[]): string {
  const list = missing.map((f) => FIELD_PROMPT[f]);
  const joined = list.length === 1
    ? list[0]
    : `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
  return `Pricing is not set up yet — we still need ${joined}.`;
}

/** Thrown when the row exists but decisions are outstanding. Distinct on purpose. */
export class PricingSettingsIncompleteError extends Error {
  readonly missing: PricingSettingsField[];
  constructor(contractorId: string, missing: PricingSettingsField[]) {
    super(
      `Pricing settings for contractor ${contractorId} are incomplete: ` +
        `${missing.join(", ")} not decided. This is a setup step, not a broken tenant.`,
    );
    this.name = "PricingSettingsIncompleteError";
    this.missing = missing;
  }
}

/** Thrown when there is no row at all — provisioning did not complete. */
export class PricingSettingsMissingError extends Error {
  constructor(contractorId: string) {
    super(
      `No pricing settings row for contractor ${contractorId}. Onboarding must ` +
        `create one; they are not defaulted. This is broken tenant state, not an ` +
        `undecided contractor.`,
    );
    this.name = "PricingSettingsMissingError";
  }
}
