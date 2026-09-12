import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { pricingSettingsImpact } from "@/lib/pricingSettingsImpact";
import type { PricingSettings } from "@/lib/pricing";

// Saving settings here does NOT change any live price — it only stores
// the rate/minimum/rounding for the NEXT time "Recalculate" is run. This
// separation is deliberate: typing a new rate shouldn't silently change
// what customers see until you explicitly confirm it.
//
// But it is not harmless either, and for a long time this route behaved as
// though it were. A rate change leaves every published price where it is while
// moving the model those prices are judged against — so a catalog that
// reconciled yesterday can be out by a hundred prices today with nothing on
// screen saying so. That happened: a rate typed in exploratorily on 29 August
// put 111 published price points out of agreement, and the only reason anyone
// found out was an unrelated audit.
//
// So a save that would do that now takes two steps. The first returns the
// impact and writes nothing; the second must acknowledge the exact number it
// was shown. Both are recorded in PricingSettingsChange with who made them.

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export async function PATCH(req: Request) {
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
  }
  const body = parsed as Record<string, unknown>;

  const crewHourRateCents = nonNegativeInteger(body.crewHourRateCents);
  const primaryMinimumCents = nonNegativeInteger(body.primaryMinimumCents);
  const roundingIncrementCents = nonNegativeInteger(body.roundingIncrementCents);
  const defaultPermitAdminCents = nonNegativeInteger(body.defaultPermitAdminCents);

  if (
    crewHourRateCents === null ||
    primaryMinimumCents === null ||
    roundingIncrementCents === null ||
    roundingIncrementCents < 1 ||
    defaultPermitAdminCents === null
  ) {
    return NextResponse.json(
      { error: "Pricing settings must be whole, non-negative cent amounts; rounding must be at least 1 cent." },
      { status: 400 }
    );
  }

  if (
    body.acknowledgeImpact !== undefined &&
    (!Number.isSafeInteger(body.acknowledgeImpact) || (body.acknowledgeImpact as number) < 0)
  ) {
    return NextResponse.json({ error: "Impact acknowledgement must be a non-negative whole number." }, { status: 400 });
  }
  if (body.note !== undefined && body.note !== null && typeof body.note !== "string") {
    return NextResponse.json({ error: "Change note must be text." }, { status: 400 });
  }

  const acknowledgeImpact = body.acknowledgeImpact as number | undefined;
  const note = typeof body.note === "string" ? body.note : null;

  return withAdminRoute(async (db, ctx) => {
    const before = await db.pricingSettings.findUnique({
      where: { contractorId: ctx.contractorId },
    });

    const proposed = {
      crewHourRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents,
    } as PricingSettings;

    // Only the figures that price work can put the book out of agreement.
    // Rounding and the permit default are stored the same way but do not move a
    // derived total on their own, so they never trigger the confirmation.
    const pricingFiguresMoved =
      !before ||
      before.crewHourRateCents !== crewHourRateCents ||
      before.primaryMinimumCents !== primaryMinimumCents;

    const impact = pricingFiguresMoved
      ? await pricingSettingsImpact(db, ctx.contractorId, proposed)
      : null;

    if (impact && impact.affected > 0 && acknowledgeImpact !== impact.affected) {
      // Nothing written. The count must come back exactly, so that what is
      // acknowledged is the impact that was actually shown — not a stale one
      // from a preview taken before somebody else changed a price.
      return NextResponse.json(
        {
          error: "IMPACT_CONFIRMATION_REQUIRED",
          impact,
          message:
            `${impact.affected} published price point(s) would no longer agree with ` +
            `the model. No customer price changes now; re-send with ` +
            `acknowledgeImpact: ${impact.affected} to save.`,
        },
        { status: 409 }
      );
    }

    // The setting and its audit row are one business event. If the history
    // write fails, the setting must not move without the record explaining who
    // changed it and what impact they acknowledged.
    await db.$transaction(async (tx) => {
      // ADR-007a: keyed by contractor. `id: "default"` meant one labor rate for
      // every contractor — and this route SETS the rate that prices their work.
      await tx.pricingSettings.upsert({
        where: { contractorId: ctx.contractorId },
        update: { crewHourRateCents, primaryMinimumCents, roundingIncrementCents, defaultPermitAdminCents },
        create: {
          contractorId: ctx.contractorId,
          crewHourRateCents,
          primaryMinimumCents,
          roundingIncrementCents,
          defaultPermitAdminCents,
        },
      });

      // Recorded even when nothing moved and even when the impact was zero: the
      // history is only trustworthy if it is complete. A gap in it reads as "no
      // change was made", which is the one thing it must never say wrongly.
      await tx.pricingSettingsChange.create({
        data: {
          contractorId: ctx.contractorId,
          changedByUserId: ctx.userId,
          changedByEmail: ctx.email,
          fromCrewHourRateCents: before?.crewHourRateCents ?? crewHourRateCents,
          toCrewHourRateCents: crewHourRateCents,
          fromPrimaryMinimumCents: before?.primaryMinimumCents ?? primaryMinimumCents,
          toPrimaryMinimumCents: primaryMinimumCents,
          fromRoundingIncrementCents: before?.roundingIncrementCents ?? roundingIncrementCents,
          toRoundingIncrementCents: roundingIncrementCents,
          fromDefaultPermitAdminCents: before?.defaultPermitAdminCents ?? defaultPermitAdminCents,
          toDefaultPermitAdminCents: defaultPermitAdminCents,
          publishedPricesAffected: impact?.affected ?? 0,
          impactAcknowledged: Boolean(impact && impact.affected > 0),
          note: note && note.trim() ? note.trim().slice(0, 500) : null,
        },
      });
    });

    return NextResponse.json({ ok: true, impact });
  });
}

/** The change history, newest first. */
export async function GET() {
  return withAdminRoute(async (db, ctx) => {
    const changes = await db.pricingSettingsChange.findMany({
      where: { contractorId: ctx.contractorId },
      orderBy: { changedAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ changes });
  });
}
