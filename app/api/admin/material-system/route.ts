/**
 * The contractor's declaration of how a material system they install behaves.
 *
 * Read and write for ContractorMaterialSystem, which until now could only be
 * written by a script. Every physical field is nullable and means "not
 * established"; PATCHing a field to null is a supported way to withdraw a
 * declaration, and doing so must send affected routes back to review.
 *
 * The two termination material references are canonical ROLE KEYS on the wire,
 * not database ids: a caller should not have to know a row id to say "that
 * terminus takes an entrance fitting", and accepting keys keeps the API in the
 * same vocabulary as the takeoff.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

const GROUNDING = ["SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR", "SYSTEM_PROVIDES_GROUNDING_PATH"];
const TERMINATION = ["FITTING_REQUIRED", "DIRECT_ENTRY"];

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const systemKey = new URL(req.url).searchParams.get("systemKey");
  return withAdminContractor(async (db, ctx) => {
    const rows = await db.contractorMaterialSystem.findMany({
      where: { contractorId: ctx.contractorId, ...(systemKey ? { systemKey } : {}) },
      select: {
        id: true, systemKey: true, declaredSystemLabel: true, groundingStrategy: true,
        supportSpacingFt: true, supportAtEachTerminus: true,
        sourceTermination: true, destinationTermination: true, declaredAt: true,
        sourceTerminationMaterial: { select: { key: true, name: true } },
        destinationTerminationMaterial: { select: { key: true, name: true } },
      },
      orderBy: { systemKey: "asc" },
    });
    return NextResponse.json({
      systems: rows.map((r) => ({
        ...r,
        sourceTerminationRole: r.sourceTerminationMaterial?.key ?? null,
        destinationTerminationRole: r.destinationTerminationMaterial?.key ?? null,
        // Which declarations are still outstanding, named individually.
        outstanding: [
          r.groundingStrategy === null && "groundingStrategy",
          r.supportSpacingFt === null && "supportSpacingFt",
          r.supportAtEachTerminus === null && "supportAtEachTerminus",
          r.sourceTermination === null && "sourceTermination",
          r.destinationTermination === null && "destinationTermination",
        ].filter(Boolean),
      })),
    });
  });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as Record<string, unknown>;
  const systemKey = body.systemKey as string | undefined;
  if (!systemKey) return NextResponse.json({ error: "systemKey required" }, { status: 400 });

  // Only keys the caller actually sent are touched, so a partial declaration
  // does not blank the fields it did not mention.
  const has = (k: string) => Object.prototype.hasOwnProperty.call(body, k);
  const data: Record<string, unknown> = {};

  if (has("declaredSystemLabel")) data.declaredSystemLabel = body.declaredSystemLabel ?? null;

  if (has("groundingStrategy")) {
    const v = body.groundingStrategy;
    if (v !== null && !GROUNDING.includes(v as string)) {
      return NextResponse.json({ error: `groundingStrategy must be null or one of ${GROUNDING.join(", ")}` }, { status: 400 });
    }
    data.groundingStrategy = v;
  }
  if (has("supportSpacingFt")) {
    const v = body.supportSpacingFt;
    // Zero is not a spacing rule, it is a division by zero wearing one.
    if (v !== null && (typeof v !== "number" || !(v > 0))) {
      return NextResponse.json({ error: "supportSpacingFt must be null or a number > 0" }, { status: 400 });
    }
    data.supportSpacingFt = v;
  }
  if (has("supportAtEachTerminus")) {
    const v = body.supportAtEachTerminus;
    if (v !== null && typeof v !== "boolean") {
      return NextResponse.json({ error: "supportAtEachTerminus must be null or boolean" }, { status: 400 });
    }
    data.supportAtEachTerminus = v;
  }
  for (const end of ["sourceTermination", "destinationTermination"] as const) {
    if (has(end)) {
      const v = body[end];
      if (v !== null && !TERMINATION.includes(v as string)) {
        return NextResponse.json({ error: `${end} must be null or one of ${TERMINATION.join(", ")}` }, { status: 400 });
      }
      data[end] = v;
    }
  }

  return withAdminContractor(async (db, ctx) => {
    // Role keys resolved to canonical ids here, so a typo is a 400 rather than
    // a dangling declaration that silently produces no fitting.
    for (const [field, col] of [
      ["sourceTerminationRole", "sourceTerminationMaterialId"],
      ["destinationTerminationRole", "destinationTerminationMaterialId"],
    ] as const) {
      if (!has(field)) continue;
      const key = body[field] as string | null;
      if (key === null) { data[col] = null; continue; }
      const role = await db.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
      if (!role) return NextResponse.json({ error: `Unknown canonical material role ${key}` }, { status: 400 });
      data[col] = role.id;
    }

    const row = await db.contractorMaterialSystem.upsert({
      where: { contractorId_systemKey: { contractorId: ctx.contractorId, systemKey } },
      update: { ...data, declaredAt: new Date() },
      create: { contractorId: ctx.contractorId, systemKey, ...data, declaredAt: new Date() },
      select: { id: true, systemKey: true, groundingStrategy: true, supportSpacingFt: true,
                supportAtEachTerminus: true, sourceTermination: true,
                destinationTermination: true, declaredAt: true },
    });
    return NextResponse.json({ ok: true, system: row });
  });
}
