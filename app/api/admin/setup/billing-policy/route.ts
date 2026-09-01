import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { validateRatePpm } from "@/lib/salesTax";

/**
 * The contractor's sales tax and deposit policy.
 *
 * BOTH ARE THE CONTRACTOR'S DECISIONS. Price2Book does not work out whether
 * tax applies, at what rate, or in which jurisdiction — it applies the figure
 * the contractor enters so the homeowner sees a truthful total. Deposits are
 * likewise theirs: which jobs, and how much.
 */
export async function PATCH(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  // A blank box means "no rule", which is a real answer and distinct from
  // zero: a $0 threshold would fire on every booking.
  const optionalCents = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Math.round(Number(v) * 100);
    return Number.isFinite(n) && n >= 0 ? n : undefined;
  };
  const optionalMinutes = (v: unknown): number | null | undefined => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    const n = Math.round(Number(v) * 60);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };

  const data: Record<string, unknown> = {};

  if (body.salesTaxEnabled !== undefined) data.salesTaxEnabled = body.salesTaxEnabled === true;
  if (body.salesTaxRatePercent !== undefined) {
    if (body.salesTaxRatePercent === null || body.salesTaxRatePercent === "") {
      data.salesTaxRatePpm = null;
    } else {
      // Percent in, parts per million stored — 6.625 becomes 66_250, and the
      // arithmetic downstream never touches a float.
      const ppm = Math.round(Number(body.salesTaxRatePercent) * 10_000);
      const problem = Number.isFinite(ppm) ? validateRatePpm(ppm) : "Enter a tax rate, like 6.625.";
      if (problem) return NextResponse.json({ error: problem }, { status: 400 });
      data.salesTaxRatePpm = ppm;
    }
  }

  const amount = optionalCents(body.depositAmountDollars);
  if (amount !== undefined) data.depositAmountCents = amount;
  if (body.depositOnEveryBooking !== undefined) {
    data.depositOnEveryBooking = body.depositOnEveryBooking === true;
  }
  const threshold = optionalCents(body.depositSubtotalThresholdDollars);
  if (threshold !== undefined) data.depositSubtotalThresholdCents = threshold;
  const duration = optionalMinutes(body.depositDurationThresholdHours);
  if (duration !== undefined) data.depositDurationThresholdMinutes = duration;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Nothing to change." }, { status: 400 });
  }

  // TAX ON WITH NO RATE IS NOT A SETTING, it is a half-finished one, and it
  // would quietly charge every customer 0% while the contractor believed they
  // were collecting.
  return withAdminRoute(async (db, ctx) => {
    const current = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: { salesTaxEnabled: true, salesTaxRatePpm: true },
    });
    const enabled = (data.salesTaxEnabled as boolean | undefined) ?? current.salesTaxEnabled;
    const ppm = (data.salesTaxRatePpm as number | null | undefined) ?? current.salesTaxRatePpm;
    if (enabled && !(ppm && ppm > 0)) {
      return NextResponse.json(
        { error: "Enter the tax rate you charge before turning sales tax on." },
        { status: 400 }
      );
    }

    await db.contractor.update({ where: { id: ctx.contractorId }, data });
    return NextResponse.json({ ok: true });
  });
}
