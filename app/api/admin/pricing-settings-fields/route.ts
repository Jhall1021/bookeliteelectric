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
import { writePricingSettingsField } from "@/lib/admin/onboardingActions";

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
  const body = await req.json();
  return withAdminContractor(async (db, ctx) => {
    const r = await writePricingSettingsField(db, ctx, body);
    return r.ok
      ? NextResponse.json({ ok: true, ...r.data })
      : NextResponse.json({ error: r.error }, { status: r.status });
  });
}
