/**
 * What a contractor is actually approving when they approve a derived price.
 *
 * A stored `approvedPriceCents` is stable because it is a number somebody
 * typed. A derived price is not: it moves when a labor calibration, a material
 * cost, a product selection, the material system, a policy value or
 * PricingSettings moves. So the approval has to be OF something — and what it
 * is of is this fingerprint.
 *
 * WHAT PARTICIPATES IS CODE, NOT A COMMENT
 *
 * The list below is the definition. A comment describing it would drift, and
 * the failure mode of drift here is an approval that keeps authorising numbers
 * nobody agreed to. Every field is price-relevant and provably so: remove any
 * one and you can change the customer's price without changing the
 * fingerprint.
 *
 * WHAT IS DELIBERATELY EXCLUDED, AND WHY THAT MATTERS AS MUCH
 *
 * Names, labels, notes, `nameOverride`, `declaredSystemLabel`, `costStatus`,
 * `costConfidence`, `createdAt`, `updatedAt`. None of them can move a price.
 * An invalidation that fires when somebody fixes a typo in a material name
 * teaches people to re-approve without reading, which is worse protection than
 * none — so the exclusions are asserted by the suite, not merely intended.
 *
 * PURE and DETERMINISTIC. Same inputs, same digest, on any machine, forever:
 * every collection is sorted by a stable key before hashing, because Prisma
 * row order is not a promise.
 */
import { createHash } from "node:crypto";

export type BasisComponentLabor = {
  componentKey: string;
  /** null is part of the fingerprint: "unestablished" is a state to approve out of. */
  addFieldLaborHours: number | null;
};

export type BasisOperationLabor = {
  operationKey: string;
  /** null means this operation has not been approved by the contractor. */
  hoursPerUnit: number | null;
};

export type BasisMaterial = {
  role: string;
  unitCostCents: number;
  packageQuantity: number | null;
  packageUnit: string | null;
  packagePriceCents: number | null;
  activeSupplierLinkId: string | null;
};

export type BasisSystem = {
  systemKey: string;
  groundingStrategy: string | null;
  supportSpacingFt: number | null;
  supportAtEachTerminus: boolean | null;
  sourceTermination: string | null;
  sourceTerminationRole: string | null;
  destinationTermination: string | null;
  destinationTerminationRole: string | null;
};

export type BasisPolicy = {
  key: string;
  choice: string | null;
  measurement: number | null;
  resolved: boolean;
};

export type BasisSettings = {
  crewHourRateCents: number | null;
  primaryMinimumCents: number | null;
  roundingIncrementCents: number | null;
  defaultPermitAdminCents: number | null;
};

export type BasisRecipeLine = {
  componentKey: string;
  role: string;
  perUnit: number;
};

export type DerivedPricingBasis = {
  componentLabor: BasisComponentLabor[];
  /** Present when derived pricing consumes the atomic labor authority. */
  operationLabor?: BasisOperationLabor[];
  materials: BasisMaterial[];
  systems: BasisSystem[];
  policies: BasisPolicy[];
  settings: BasisSettings;
  /** The canonical physical recipe — a changed recipe changes the takeoff. */
  recipe: BasisRecipeLine[];
};

/** Stable ordering, so row order can never change a digest. */
const sortBy = <T>(xs: T[], key: (x: T) => string): T[] =>
  [...xs].sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));

/**
 * The canonical serialization.
 *
 * Written out field by field rather than JSON.stringify over the whole object,
 * so that adding a field to one of the types above is a deliberate act here
 * too. A field that silently joined the fingerprint could start invalidating
 * approvals for reasons nobody chose.
 */
export function serializeBasis(basis: DerivedPricingBasis): string {
  const lines: string[] = [];

  for (const c of sortBy(basis.componentLabor, (x) => x.componentKey)) {
    lines.push(`labor|${c.componentKey}|${c.addFieldLaborHours ?? "null"}`);
  }
  for (const operation of sortBy(basis.operationLabor ?? [], (x) => x.operationKey)) {
    lines.push(`operation-labor|${operation.operationKey}|${operation.hoursPerUnit ?? "null"}`);
  }
  for (const m of sortBy(basis.materials, (x) => x.role)) {
    lines.push(
      `material|${m.role}|${m.unitCostCents}|${m.packageQuantity ?? "null"}|` +
        `${m.packageUnit ?? "null"}|${m.packagePriceCents ?? "null"}|${m.activeSupplierLinkId ?? "null"}`,
    );
  }
  for (const s of sortBy(basis.systems, (x) => x.systemKey)) {
    lines.push(
      `system|${s.systemKey}|${s.groundingStrategy ?? "null"}|${s.supportSpacingFt ?? "null"}|` +
        `${s.supportAtEachTerminus ?? "null"}|${s.sourceTermination ?? "null"}|` +
        `${s.sourceTerminationRole ?? "null"}|${s.destinationTermination ?? "null"}|` +
        `${s.destinationTerminationRole ?? "null"}`,
    );
  }
  for (const p of sortBy(basis.policies, (x) => x.key)) {
    lines.push(`policy|${p.key}|${p.choice ?? "null"}|${p.measurement ?? "null"}|${p.resolved}`);
  }
  const st = basis.settings;
  lines.push(
    `settings|${st.crewHourRateCents ?? "null"}|${st.primaryMinimumCents ?? "null"}|` +
      `${st.roundingIncrementCents ?? "null"}|${st.defaultPermitAdminCents ?? "null"}`,
  );
  for (const r of sortBy(basis.recipe, (x) => `${x.componentKey}|${x.role}`)) {
    lines.push(`recipe|${r.componentKey}|${r.role}|${r.perUnit}`);
  }

  return lines.join("\n");
}

/** The digest a contractor approves, and that a later change stops matching. */
export function fingerprintBasis(basis: DerivedPricingBasis): string {
  return createHash("sha256").update(serializeBasis(basis)).digest("hex").slice(0, 32);
}
