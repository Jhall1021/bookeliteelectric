/**
 * Pre-work visit and per-service deposit configuration.
 *
 * Deposit AMOUNT is contractor-wide. Checkout takes one deposit for one
 * booking, so this service can only say how it participates in that company
 * policy: always require it, never require it, or use the company rules.
 * `Service.depositCents` is retained in the schema for migration history but
 * is not a live checkout input and is deliberately not written here.
 */

import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

type OptionalValue<T> =
  | { ok: true; value: T | null | undefined }
  | { ok: false; error: string };

type DepositRuleValue = "USE_COMPANY_POLICY" | "ALWAYS_REQUIRE" | "NEVER_REQUIRE";

/** Omitted preserves the current value; null/empty explicitly clears it. */
function optionalInt(v: unknown, label: string): OptionalValue<number> {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null || v === "") return { ok: true, value: null };
  if (typeof v !== "number" || !Number.isFinite(v) || !Number.isInteger(v) || v < 0) {
    return { ok: false, error: `${label} must be a non-negative whole number, or empty.` };
  }
  return { ok: true, value: v };
}

function optionalText(v: unknown, label: string): OptionalValue<string> {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === null) return { ok: true, value: null };
  if (typeof v !== "string") {
    return { ok: false, error: `${label} must be text or null.` };
  }
  const text = v.trim();
  return { ok: true, value: text === "" ? null : text };
}

function optionalBoolean(v: unknown, label: string):
  | { ok: true; value: boolean | undefined }
  | { ok: false; error: string } {
  if (v === undefined) return { ok: true, value: undefined };
  if (typeof v !== "boolean") return { ok: false, error: `${label} must be true or false.` };
  return { ok: true, value: v };
}

function optionalDepositRule(v: unknown):
  | { ok: true; value: DepositRuleValue | undefined }
  | { ok: false; error: string } {
  if (v === undefined) return { ok: true, value: undefined };
  if (v === "USE_COMPANY_POLICY" || v === "ALWAYS_REQUIRE" || v === "NEVER_REQUIRE") {
    return { ok: true, value: v };
  }
  return { ok: false, error: "Choose a valid deposit rule." };
}

export async function PATCH(req: Request, { params }: { params: { serviceId: string } }) {
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

  const depositRule = optionalDepositRule(body.depositRule);
  if (!depositRule.ok) return NextResponse.json({ error: depositRule.error }, { status: 400 });

  const visitMinutes = optionalInt(body.preWorkVisitMinutes, "Visit length");
  if (!visitMinutes.ok) return NextResponse.json({ error: visitMinutes.error }, { status: 400 });

  const requiresVisit = optionalBoolean(body.requiresPreWorkVisit, "Site visit requirement");
  if (!requiresVisit.ok) return NextResponse.json({ error: requiresVisit.error }, { status: 400 });

  const creditsToJob = optionalBoolean(body.depositCreditsToJob, "Deposit credit setting");
  if (!creditsToJob.ok) return NextResponse.json({ error: creditsToJob.error }, { status: 400 });

  const cta = optionalText(body.ctaLabel, "Booking button label");
  if (!cta.ok) return NextResponse.json({ error: cta.error }, { status: 400 });

  const customerNote = optionalText(body.preWorkCustomerNote, "Customer note");
  if (!customerNote.ok) return NextResponse.json({ error: customerNote.error }, { status: 400 });

  return withAdminRoute(async (db) => {
    // Guarded: a service id from another contractor resolves to nothing here.
    const service = await db.service.findUnique({
      where: { id: params.serviceId },
      select: {
        id: true,
        requiresPreWorkVisit: true,
        preWorkVisitMinutes: true,
        depositRule: true,
        depositCreditsToJob: true,
        ctaLabel: true,
        preWorkCustomerNote: true,
      },
    });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    const nextRequiresVisit = requiresVisit.value ?? service.requiresPreWorkVisit;
    const nextVisitMinutes =
      visitMinutes.value === undefined ? service.preWorkVisitMinutes : visitMinutes.value;

    if (nextRequiresVisit && (!nextVisitMinutes || nextVisitMinutes <= 0)) {
      return NextResponse.json(
        { error: "Enter how long the required site visit takes before saving." },
        { status: 400 }
      );
    }

    await db.service.update({
      where: { id: service.id },
      data: {
        requiresPreWorkVisit: nextRequiresVisit,
        preWorkVisitMinutes: nextVisitMinutes,
        depositRule: depositRule.value ?? service.depositRule,
        depositCreditsToJob:
          creditsToJob.value === undefined ? service.depositCreditsToJob : creditsToJob.value,
        ctaLabel: cta.value === undefined ? service.ctaLabel : cta.value,
        preWorkCustomerNote:
          customerNote.value === undefined ? service.preWorkCustomerNote : customerNote.value,
      },
    });

    return NextResponse.json({ ok: true });
  });
}
