/**
 * The tenant-scoped BODY of each onboarding lifecycle endpoint.
 *
 * WHY THIS FILE EXISTS. The route handlers are `auth → withAdminContractor →
 * body`. A real HTTP smoke of the authenticated paths needs a running server,
 * and the preview tooling in this environment can only launch from the shared
 * checkout, which this workstream is not permitted to reconfigure. Testing the
 * routes by re-implementing their logic in a suite would prove the suite, not
 * the route.
 *
 * So the body moved here, each function taking the guarded client and the
 * resolved context the route already had. The route keeps authentication,
 * tenant resolution and HTTP shaping; this keeps the behaviour. A suite
 * exercising these is exercising the same code the endpoint runs, and the only
 * thing not covered is the cookie layer — which is reported as such rather
 * than claimed as an HTTP smoke.
 *
 * Every function takes `db` ALREADY SCOPED to the contractor and `ctx` for the
 * id. None of them resolves a tenant themselves: a function here that could
 * choose its own contractor would be a way around the guard.
 */
import type { PrismaClient } from "@prisma/client";

export type Ctx = { contractorId: string; userId?: string | null };

export type ActionResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; extra?: unknown };

const bad = (status: number, error: string, extra?: unknown): ActionResult<never> =>
  ({ ok: false, status, error, extra });

// ── component labor ─────────────────────────────────────────────────────────

export async function readComponentLabor(db: PrismaClient, ctx: Ctx, keys: string[]) {
  const components = await db.canonicalComponent.findMany({
    where: keys.length > 0 ? { key: { in: keys } } : {},
    select: {
      id: true, key: true, customerFacingLabel: true,
      referenceLaborHours: true, referenceLaborUnit: true, referenceLaborStatus: true,
      laborEvidence: {
        select: { source: true, edition: true, publishedLineItem: true, normalizedLabor: true,
                  normalizedUnit: true, scopeMatch: true, confidence: true, caution: true },
      },
    },
    orderBy: { key: "asc" },
  });
  const own = await db.contractorComponent.findMany({
    where: { contractorId: ctx.contractorId },
    select: { canonicalComponentId: true, addFieldLaborHours: true, notes: true },
  });
  const mine = new Map(own.map((o) => [o.canonicalComponentId, o]));
  return {
    components: components.map((c) => {
      const row = mine.get(c.id);
      return {
        key: c.key,
        label: c.customerFacingLabel,
        contractorLaborHours: row ? row.addFieldLaborHours : null,
        contractorLaborEstablished: row ? row.addFieldLaborHours !== null : false,
        notes: row?.notes ?? null,
        reference: {
          hours: c.referenceLaborHours, unit: c.referenceLaborUnit,
          status: c.referenceLaborStatus, evidence: c.laborEvidence,
        },
      };
    }),
  };
}

export async function writeComponentLabor(
  db: PrismaClient, ctx: Ctx,
  body: { action?: string; componentKey?: string; hours?: number | null; note?: string | null },
): Promise<ActionResult<Record<string, unknown>>> {
  if (!body.componentKey) return bad(400, "componentKey required");
  const canonical = await db.canonicalComponent.findUnique({
    where: { key: body.componentKey },
    select: { id: true, referenceLaborHours: true, referenceLaborUnit: true, referenceLaborStatus: true },
  });
  if (!canonical) return bad(404, `Unknown component ${body.componentKey}`);

  const upsert = async (hours: number | null, note: string | null) =>
    db.contractorComponent.upsert({
      where: { contractorId_canonicalComponentId: {
        contractorId: ctx.contractorId, canonicalComponentId: canonical.id } },
      update: { addFieldLaborHours: hours, ...(note !== null ? { notes: note } : {}) },
      create: { contractorId: ctx.contractorId, canonicalComponentId: canonical.id,
                addFieldLaborHours: hours, ...(note !== null ? { notes: note } : {}) },
      select: { addFieldLaborHours: true, notes: true },
    });

  if (body.action === "clear") {
    const r = await upsert(null, body.note ?? null);
    return { ok: true, data: { componentKey: body.componentKey, ...r, established: false } };
  }
  if (body.action === "set") {
    const h = body.hours;
    if (typeof h !== "number" || !Number.isFinite(h) || h < 0) {
      return bad(400, 'hours must be a number >= 0. Use action "clear" to unset.');
    }
    const r = await upsert(h, body.note ?? null);
    return { ok: true, data: { componentKey: body.componentKey, ...r, established: true } };
  }
  if (body.action === "accept-reference") {
    if (canonical.referenceLaborHours === null) {
      return bad(400, `No published reference exists for ${body.componentKey}.`);
    }
    // DISPUTED evidence is not a recommendation and must not be offered as one.
    if (canonical.referenceLaborStatus === "DISPUTED") {
      return bad(409,
        `The published evidence for ${body.componentKey} is disputed — sources disagree. ` +
        `Enter your own figure rather than accepting one we cannot stand behind.`);
    }
    const note =
      `Accepted published reference ${canonical.referenceLaborHours} ` +
      `${canonical.referenceLaborUnit ?? "hours"} on ${new Date().toISOString()}.`;
    const r = await upsert(canonical.referenceLaborHours, note);
    return { ok: true, data: { componentKey: body.componentKey, ...r, established: true, acceptedFromReference: true } };
  }
  return bad(400, 'action must be "set", "clear" or "accept-reference"');
}

// ── pricing settings, one decision at a time ────────────────────────────────

export const PRICING_FIELDS = [
  "crewHourRateCents", "primaryMinimumCents", "roundingIncrementCents", "defaultPermitAdminCents",
] as const;
export type PricingField = (typeof PRICING_FIELDS)[number];

export async function writePricingSettingsField(
  db: PrismaClient, ctx: Ctx, body: { action?: string; field?: string; value?: number },
): Promise<ActionResult<Record<string, unknown>>> {
  const field = body.field as PricingField | undefined;
  if (!field || !PRICING_FIELDS.includes(field)) {
    return bad(400, `field must be one of ${PRICING_FIELDS.join(", ")}`);
  }
  if (body.action === "clear") {
    await db.pricingSettings.upsert({
      where: { contractorId: ctx.contractorId },
      update: { [field]: null }, create: { contractorId: ctx.contractorId },
    });
    return { ok: true, data: { field, value: null, decided: false } };
  }
  const v = body.value;
  // Zero is a decision and must persist as zero.
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    return bad(400, 'value must be a whole number of cents >= 0. Use action "clear" to undecide.');
  }
  await db.pricingSettings.upsert({
    where: { contractorId: ctx.contractorId },
    update: { [field]: v }, create: { contractorId: ctx.contractorId, [field]: v },
  });
  return { ok: true, data: { field, value: v, decided: true } };
}

// ── product selection ───────────────────────────────────────────────────────

export async function selectMaterialProduct(
  db: PrismaClient, ctx: Ctx,
  body: { action?: string; contractorMaterialId?: string; supplierLinkId?: string | null },
): Promise<ActionResult<Record<string, unknown>>> {
  if (!body.contractorMaterialId) return bad(400, "contractorMaterialId required");
  const material = await db.contractorMaterial.findFirst({
    where: { id: body.contractorMaterialId, contractorId: ctx.contractorId },
    select: { id: true, canonicalMaterial: { select: { key: true } } },
  });
  if (!material) return bad(404, "No such material for this contractor.");

  if (body.action === "clear") {
    await db.contractorMaterial.update({ where: { id: material.id }, data: { activeSupplierLinkId: null } });
    return { ok: true, data: { role: material.canonicalMaterial.key, selected: null } };
  }
  if (!body.supplierLinkId) return bad(400, "supplierLinkId required");

  // BOTH owners checked: the link must belong to this contractor AND to this
  // material. Either alone lets the wrong product through.
  const link = await db.materialSupplierLink.findFirst({
    where: { id: body.supplierLinkId, contractorMaterialId: material.id,
             contractorMaterial: { contractorId: ctx.contractorId } },
    select: { id: true, productName: true, packageQuantity: true, packageUnit: true, packagePriceCents: true },
  });
  if (!link) return bad(403, "That supplier link does not belong to this contractor's material.");

  await db.contractorMaterial.update({
    where: { id: material.id },
    data: {
      activeSupplierLinkId: link.id,
      packageQuantity: link.packageQuantity, packageUnit: link.packageUnit,
      packagePriceCents: link.packagePriceCents,
    },
  });
  return { ok: true, data: { role: material.canonicalMaterial.key, selected: link } };
}

// ── material system ─────────────────────────────────────────────────────────

const GROUNDING = ["SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR", "SYSTEM_PROVIDES_GROUNDING_PATH"];
const TERMINATION = ["FITTING_REQUIRED", "DIRECT_ENTRY"];

export async function writeMaterialSystem(
  db: PrismaClient, ctx: Ctx, body: Record<string, unknown>,
): Promise<ActionResult<Record<string, unknown>>> {
  const systemKey = body.systemKey as string | undefined;
  if (!systemKey) return bad(400, "systemKey required");
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const data: Record<string, unknown> = {};

  if (has("declaredSystemLabel")) data.declaredSystemLabel = body.declaredSystemLabel ?? null;
  if (has("groundingStrategy")) {
    const v = body.groundingStrategy;
    if (v !== null && !GROUNDING.includes(v as string)) return bad(400, `groundingStrategy must be null or one of ${GROUNDING.join(", ")}`);
    data.groundingStrategy = v;
  }
  if (has("supportSpacingFt")) {
    const v = body.supportSpacingFt;
    if (v !== null && (typeof v !== "number" || !(v > 0))) return bad(400, "supportSpacingFt must be null or a number > 0");
    data.supportSpacingFt = v;
  }
  if (has("supportAtEachTerminus")) {
    const v = body.supportAtEachTerminus;
    if (v !== null && typeof v !== "boolean") return bad(400, "supportAtEachTerminus must be null or boolean");
    data.supportAtEachTerminus = v;
  }
  for (const end of ["sourceTermination", "destinationTermination"] as const) {
    if (!has(end)) continue;
    const v = body[end];
    if (v !== null && !TERMINATION.includes(v as string)) return bad(400, `${end} must be null or one of ${TERMINATION.join(", ")}`);
    data[end] = v;
  }
  for (const [field, col] of [
    ["sourceTerminationRole", "sourceTerminationMaterialId"],
    ["destinationTerminationRole", "destinationTerminationMaterialId"],
  ] as const) {
    if (!has(field)) continue;
    const key = body[field] as string | null;
    if (key === null) { data[col] = null; continue; }
    const role = await db.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    if (!role) return bad(400, `Unknown canonical material role ${key}`);
    data[col] = role.id;
  }

  const row = await db.contractorMaterialSystem.upsert({
    where: { contractorId_systemKey: { contractorId: ctx.contractorId, systemKey } },
    update: { ...data, declaredAt: new Date() },
    create: { contractorId: ctx.contractorId, systemKey, ...data, declaredAt: new Date() },
    select: { id: true, systemKey: true, groundingStrategy: true, supportSpacingFt: true,
              supportAtEachTerminus: true, sourceTermination: true, destinationTermination: true, declaredAt: true },
  });
  return { ok: true, data: { system: row } };
}

// ── guided material cost, for the wizard ────────────────────────────────────

/**
 * Set a contractor's cost for one canonical role, by ROLE KEY.
 *
 * The wizard's simplified view writes through here, and it writes the SAME
 * ContractorMaterial row the Materials & Costs screen edits — one row per
 * (contractor, role), enforced by the schema. There is deliberately no
 * onboarding-only material table: a cost entered during setup and a cost
 * edited a year later are the same number in the same place, or the product
 * has two prices for one material and no way to say which is real.
 *
 * Package geometry is REQUIRED, not optional, because a package-aware takeoff
 * cannot round without it. A bare per-unit cost would produce the linear
 * arithmetic this whole workstream exists to stop.
 */
export async function writeMaterialCost(
  db: PrismaClient, ctx: Ctx,
  body: { roleKey?: string; packagePriceCents?: number; packageQuantity?: number; packageUnit?: string },
): Promise<ActionResult<Record<string, unknown>>> {
  const { roleKey, packagePriceCents, packageQuantity, packageUnit } = body;
  if (!roleKey) return bad(400, "roleKey required");
  if (typeof packagePriceCents !== "number" || !Number.isInteger(packagePriceCents) || packagePriceCents < 0) {
    return bad(400, "packagePriceCents must be a whole number of cents >= 0");
  }
  if (typeof packageQuantity !== "number" || !(packageQuantity > 0)) {
    return bad(400, "packageQuantity must be a number > 0 — how much one purchased package contains");
  }
  const role = await db.canonicalMaterial.findUnique({
    where: { key: roleKey }, select: { id: true, unit: true, name: true } });
  if (!role) return bad(404, `Unknown canonical material role ${roleKey}`);

  const row = await db.contractorMaterial.upsert({
    where: { contractorId_canonicalMaterialId: {
      contractorId: ctx.contractorId, canonicalMaterialId: role.id } },
    update: {
      packagePriceCents, packageQuantity, packageUnit: packageUnit ?? role.unit,
      unitCostCents: Math.round(packagePriceCents / packageQuantity),
      costSource: "CUSTOM", costUpdatedAt: new Date(),
    },
    create: {
      contractorId: ctx.contractorId, canonicalMaterialId: role.id,
      packagePriceCents, packageQuantity, packageUnit: packageUnit ?? role.unit,
      unitCostCents: Math.round(packagePriceCents / packageQuantity),
      costSource: "CUSTOM", costUpdatedAt: new Date(),
    },
    select: { id: true, unitCostCents: true, packageQuantity: true,
              packageUnit: true, packagePriceCents: true },
  });
  return { ok: true, data: { roleKey, name: role.name, ...row } };
}
