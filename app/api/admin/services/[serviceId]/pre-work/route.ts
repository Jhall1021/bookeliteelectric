/**
 * Pre-work visit and deposit configuration for one service.
 *
 * Beside the pricing and materials routes rather than inside the general
 * service PATCH, for the same reason those are separate: they are different
 * decisions with different consequences. This one decides whether a homeowner
 * is asked for money at booking.
 *
 * WHAT THIS IS NOT
 *
 * It is not a price. `depositCents` is contractor configuration — like crew
 * hours — not a derived, approved, customer-facing price, so it does not go
 * through the publish/approval boundary and does not touch `basePrice` or
 * `publishedPriceApprovedAt`.
 *
 * NO NEW POLICY IS INVENTED HERE.
 *
 * The fields already existed and already had meanings. A deposit and a
 * pre-work visit stay independent: a service may require a visit without
 * taking a deposit, and the checkout path already refuses a deposit when the
 * contractor's Stripe is not ready. Adding a rule tying them together would
 * be deciding something nobody asked for.
 */

import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

/** Empty means "not set", which stays distinct from zero. */
function optionalInt(v: unknown): number | null | undefined {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) return undefined;
  return n;
}

function optionalText(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  // GUARD-ADOPTED (ADR-007a). Scoped by the guard, so a service id from
  // another contractor resolves to nothing and takes the 404 below.
  return withAdminContractor(async (db) => {
    const service = await db.service.findUnique({ where: { id: params.serviceId } });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    const depositCents = optionalInt(body.depositCents);
    if (depositCents === undefined) {
      return NextResponse.json(
        { error: "The deposit must be a whole amount of money, or empty for none." },
        { status: 400 }
      );
    }

    const preWorkVisitMinutes = optionalInt(body.preWorkVisitMinutes);
    if (preWorkVisitMinutes === undefined) {
      return NextResponse.json(
        { error: "The visit length must be a whole number of minutes, or empty." },
        { status: 400 }
      );
    }

    await db.service.update({
      where: { id: params.serviceId },
      data: {
        requiresPreWorkVisit: body.requiresPreWorkVisit === true,
        preWorkVisitMinutes,
        depositCents,
        depositCreditsToJob: body.depositCreditsToJob !== false,
        ctaLabel: optionalText(body.ctaLabel),
        preWorkCustomerNote: optionalText(body.preWorkCustomerNote),
      },
    });

    return NextResponse.json({ ok: true });
  });
}
