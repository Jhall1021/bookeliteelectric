/**
 * Each business decision, independently settable and independently clearable.
 *
 * The existing pricing-settings form writes all four at once, which was the
 * only option while all four were required. Now that a contractor may have
 * decided two of them, onboarding needs to write one at a time and read back
 * which remain outstanding.
 *
 * null and 0 are different answers here, and the API keeps them different:
 * `{value: 0}` sets a deliberate zero, `action: "clear"` returns a field to
 * undecided. There is no way to express "undecided" by sending a number.
 */
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { FIELD_PROMPT, requiredFields, type PricingSettingsField } from "@/lib/pricingSettingsState";

const FIELDS: PricingSettingsField[] = [
  "crewHourRateCents", "primaryMinimumCents", "roundingIncrementCents", "defaultPermitAdminCents",
];

export async function GET() {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  return withAdminContractor(async (db, ctx) => {
    // Created empty rather than demanded complete: a contractor who has
    // installed a catalog and decided nothing is a real, expected state.
    const row = await db.pricingSettings.upsert({
      where: { contractorId: ctx.contractorId },
      update: {},
      create: { contractorId: ctx.contractorId },
      select: { crewHourRateCents: true, primaryMinimumCents: true,
                roundingIncrementCents: true, defaultPermitAdminCents: true },
    });
    // The strictest context, so a setup screen shows every decision that any
    // service might need rather than only the ones some particular one does.
    const required = requiredFields({
      isPrimary: true, isPrimaryEligible: true, servicePermitAdminEstablished: false });
    return NextResponse.json({
      fields: FIELDS.map((f) => ({
        field: f,
        value: row[f],
        decided: row[f] !== null,
        required: required.includes(f),
        prompt: FIELD_PROMPT[f],
      })),
      complete: required.every((f) => row[f] !== null),
    });
  });
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = (await req.json()) as {
    action?: "set" | "clear"; field?: PricingSettingsField; value?: number;
  };
  const field = body.field;
  if (!field || !FIELDS.includes(field)) {
    return NextResponse.json({ error: `field must be one of ${FIELDS.join(", ")}` }, { status: 400 });
  }
  return withAdminContractor(async (db, ctx) => {
    if (body.action === "clear") {
      const r = await db.pricingSettings.upsert({
        where: { contractorId: ctx.contractorId },
        update: { [field]: null }, create: { contractorId: ctx.contractorId },
        select: { [field]: true } as never,
      });
      return NextResponse.json({ ok: true, field, value: null, decided: false, row: r });
    }
    const v = body.value;
    if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
      return NextResponse.json(
        { error: "value must be a whole number of cents >= 0. Use action \"clear\" to undecide." },
        { status: 400 },
      );
    }
    const r = await db.pricingSettings.upsert({
      where: { contractorId: ctx.contractorId },
      update: { [field]: v }, create: { contractorId: ctx.contractorId, [field]: v },
      select: { [field]: true } as never,
    });
    return NextResponse.json({ ok: true, field, value: v, decided: true, row: r });
  });
}
