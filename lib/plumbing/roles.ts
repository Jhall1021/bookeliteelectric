/**
 * What a plumbing service REQUIRES of whoever performs it.
 *
 * THE LINE THIS FILE HOLDS
 *
 * That gas work requires a gas credential is trade knowledge: no contractor
 * chose it, it is the same in every market that regulates it at all, and it
 * belongs in the canonical template. WHETHER A GIVEN CONTRACTOR HOLDS ONE is
 * that contractor's configuration and is not in this directory, not in the
 * template, and not implied by anything here. The same continuum test as
 * ADR-014's policy separation, applied to people instead of boundaries.
 *
 * So this file is a list of requirement KINDS and which services carry them.
 * It contains no contractor, no license number, no expiry, and no boolean
 * saying anyone satisfies anything.
 *
 * NOT THE ContractorRole ENUM
 *
 * prisma/schema.prisma's ContractorRole is OWNER/ADMIN — who may operate the
 * panel. That is authorization for the software. This is competence for the
 * work, and conflating them would let an ADMIN seat imply a gas certification.
 * The two are unrelated and must stay unrelated.
 *
 * JURISDICTION IS NOT MODELED, DELIBERATELY
 *
 * Requirements vary by state and municipality, and a canonical template that
 * asserted "New Jersey requires X" would be wrong somewhere within a year.
 * What is canonical is that the CATEGORY of requirement exists and which work
 * it attaches to. Which jurisdiction demands what is contractor configuration,
 * checked where the contractor's service area is known.
 */

export type PlumbingRequirementKey =
  | "licensed_plumber"
  | "gas_fitting"
  | "backflow_prevention"
  | "medical_gas"
  | "confined_space"
  | "excavation";

export type PlumbingRoleRequirement = {
  key: PlumbingRequirementKey;
  label: string;
  /** Why the work needs it, in terms of the work rather than the paperwork. */
  because: string;
  /**
   * What happens to a service carrying this requirement when the contractor
   * has not recorded that they satisfy it.
   *
   * BLOCK_PUBLICATION throughout. There is no "warn and publish anyway" value,
   * because the failure mode is a homeowner booking regulated work from
   * somebody not permitted to do it, and a warning nobody reads is how that
   * happens.
   */
  unsatisfied: "BLOCK_PUBLICATION";
};

export const PLUMBING_ROLE_REQUIREMENTS: readonly PlumbingRoleRequirement[] = [
  {
    key: "licensed_plumber",
    label: "Licensed plumber",
    because:
      "Work on potable water and sanitary drainage inside a dwelling is licensed work almost everywhere it is regulated.",
    unsatisfied: "BLOCK_PUBLICATION",
  },
  {
    key: "gas_fitting",
    label: "Gas fitting credential",
    because:
      "Cutting, extending, pressure-testing or reconnecting a fuel gas line is separately credentialed from water work in most jurisdictions, and the failure mode of getting it wrong is not a leak of water.",
    unsatisfied: "BLOCK_PUBLICATION",
  },
  {
    key: "backflow_prevention",
    label: "Backflow prevention certification",
    because:
      "Any device that keeps a building's water from re-entering the supply is inspected and certified work, because what it protects is everyone else on the main.",
    unsatisfied: "BLOCK_PUBLICATION",
  },
  {
    key: "medical_gas",
    label: "Medical gas certification",
    because:
      "Present for completeness of the vocabulary. No service in the residential plumbing template carries it, and one that did would not be a residential service.",
    unsatisfied: "BLOCK_PUBLICATION",
  },
  {
    key: "confined_space",
    label: "Confined space entry",
    because:
      "Crawl spaces, pits and vaults with restricted egress are entered under their own rules regardless of what the plumbing work is.",
    unsatisfied: "BLOCK_PUBLICATION",
  },
  {
    key: "excavation",
    label: "Excavation and utility locate",
    because:
      "Breaking ground to reach a service line means a utility locate first. That is a legal obligation attached to digging, not to plumbing.",
    unsatisfied: "BLOCK_PUBLICATION",
  },
] as const;

export const PLUMBING_REQUIREMENT_KEYS: readonly PlumbingRequirementKey[] =
  PLUMBING_ROLE_REQUIREMENTS.map((r) => r.key);

export function requirement(key: PlumbingRequirementKey): PlumbingRoleRequirement {
  const found = PLUMBING_ROLE_REQUIREMENTS.find((r) => r.key === key);
  if (!found) throw new Error(`Unknown plumbing role requirement "${key}".`);
  return found;
}
