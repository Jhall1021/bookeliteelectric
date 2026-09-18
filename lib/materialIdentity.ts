import type { Prisma } from "@prisma/client";

/** Platform roles plus this contractor's private roles — never another tenant's. */
export function visibleMaterialRoleWhere(
  contractorId: string,
  options: { activeOnly?: boolean } = {},
): Prisma.CanonicalMaterialWhereInput {
  return {
    ...(options.activeOnly === false ? {} : { active: true }),
    OR: [{ ownerContractorId: null }, { ownerContractorId: contractorId }],
  };
}

/** Stable duplicate key for one contractor's custom catalog. */
export function normalizeCustomMaterialName(name: string): string {
  return name.normalize("NFKC").trim().replace(/\s+/g, " ").toLocaleLowerCase("en-US");
}

/**
 * Opaque and globally unique. Custom keys are internal identity only; unlike
 * platform role keys, no pricing or category behavior may be inferred from
 * contractor-entered wording.
 */
export function customMaterialKey(contractorId: string, id: string): string {
  return `CUSTOM_${contractorId}_${id}`.replace(/[^A-Za-z0-9_]/g, "_").toUpperCase();
}
