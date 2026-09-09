import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withAdminRoute } from "@/lib/adminContext";
import { ELECTRICAL_LABOR_TASKS, resolveTaskEligibilityForWrite } from "@/lib/laborWizard";
import { saveServicePricingInputs } from "@/lib/servicePricingInputs";

/**
 * Refused inside the accept transaction when a submitted service id is not
 * in its task's eligible set at write time — never at the top of the
 * route, on a snapshot read before the transaction opened. See the
 * transaction body below for why the timing matters.
 */
class NotEligibleError extends Error {
  constructor(public readonly rejected: string[]) {
    super(`Refused — not eligible: ${rejected.join(", ")}`);
  }
}

/**
 * Accept reviewed elapsed-task-time proposals from the labor wizard.
 *
 * ELIGIBILITY IS RE-RESOLVED HERE, NOT TRUSTED FROM THE CLIENT — WITH THE
 * CANDIDATE SERVICES' OWN ROWS LOCKED FIRST, NOT MERELY READ INSIDE A
 * TRANSACTION. A checkbox existing only for an eligible service in the
 * review screen is a UI convenience; the actual guarantee is
 * lib/laborWizard.ts's resolveTaskEligibilityForWrite, which takes
 * `SELECT ... FOR UPDATE` locks on every candidate service and its
 * existing recipe rows BEFORE resolving eligibility. An ordinary read
 * inside a transaction is not this: two transactions that never take a
 * lock can both read the same rows and both proceed as if nothing had
 * changed, because Postgres has no reason to make them conflict. A real
 * row lock does — any OTHER transaction (at any isolation level; row
 * locks are unconditional) trying to add, change, or remove a candidate's
 * recipe blocks until this one commits or rolls back, so the eligibility
 * this transaction decides on cannot be invalidated by something that
 * happens while it's still deciding. See resolveTaskEligibilityForWrite's
 * own comment for exactly what each lock blocks and why one alone isn't
 * enough.
 *
 * SERIALIZABLE ISOLATION, IN ADDITION. Matches this codebase's own
 * established convention for a write that must not race
 * (scripts/bootstrap-platform-admin.ts) — the locks above are what
 * actually close this specific race, but Serializable is retained as
 * defense in depth and its conflict is still handled explicitly:
 * Prisma's P2025/serialization-failure surfaces as a clear refusal
 * rather than a generic 500, and nothing partial is ever left committed.
 *
 * A cross-tenant id, an unrelated service, or a service whose recipe has
 * since diverged from its template — including one that diverged AFTER
 * this request arrived, caught by the locks above rather than the
 * snapshot this request started with — are all refused the same way, and
 * the response says exactly which ids were rejected.
 *
 * WRITES THROUGH THE SHARED PRICING-INPUT AUTHORITY
 * (lib/servicePricingInputs.ts), not a bespoke update — the same function
 * app/api/admin/services/[serviceId]/pricing/route.ts's "save" action uses.
 * Passing only `{ fieldLaborHours }` as the override means every OTHER
 * pricing input on that service (wwtLaborHours, requiresTechCount,
 * materialCostCents, ...) keeps its current value untouched — never
 * requiresTechCount, never wwtLaborHours, never any PricingSettings field.
 * Never publishes: this only ever reaches the "save" behavior, exactly like
 * a contractor typing a number into the Pricing Composition panel and NOT
 * clicking Publish.
 */
export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    // fieldLaborHours governs FLAT_RATE pricing only — a T&M contractor's
    // price comes entirely from estimateLowCrewHours/estimateHighCrewHours,
    // resolved through its own review-and-approve path. Refusing here too,
    // not just omitting the panel, means that path can never be reached by
    // a stale page or a direct call — the guarantee holds at the write
    // boundary, not just in the UI.
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { id: ctx.contractorId },
      select: { pricingStrategy: true },
    });
    if (contractor.pricingStrategy !== "FLAT_RATE") {
      return NextResponse.json(
        { error: "Labor time calibration is not used by time-and-materials estimating." },
        { status: 409 }
      );
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
    }
    const { acceptances } = (body ?? {}) as { acceptances?: unknown };
    const valid =
      Array.isArray(acceptances) &&
      acceptances.length > 0 &&
      acceptances.every(
        (a) =>
          a && typeof a === "object" &&
          typeof (a as { taskKey?: unknown }).taskKey === "string" &&
          typeof (a as { minutes?: unknown }).minutes === "number" &&
          Number.isFinite((a as { minutes: number }).minutes) &&
          (a as { minutes: number }).minutes > 0 &&
          Array.isArray((a as { serviceIds?: unknown }).serviceIds) &&
          (a as { serviceIds: unknown[] }).serviceIds.every((id) => typeof id === "string")
      );
    if (!valid) {
      return NextResponse.json(
        { error: "acceptances must be a non-empty array of { taskKey: string, minutes: number > 0, serviceIds: string[] }." },
        { status: 400 }
      );
    }
    const rows = acceptances as { taskKey: string; minutes: number; serviceIds: string[] }[];

    const knownKeys = new Set(ELECTRICAL_LABOR_TASKS.map((t) => t.key));
    const unknownKeys = rows.map((r) => r.taskKey).filter((k) => !knownKeys.has(k));
    if (unknownKeys.length > 0) {
      return NextResponse.json({ error: `Unknown task key(s): ${unknownKeys.join(", ")}` }, { status: 400 });
    }

    const results: { taskKey: string; servicesUpdated: number }[] = [];
    try {
      await db.$transaction(
        async (tx) => {
          // Locks every candidate's own row and its existing recipe rows
          // FIRST, then resolves eligibility against that now-immovable
          // state — see resolveTaskEligibilityForWrite and the header
          // comment above for why a lock, not just a transaction-scoped
          // read, is what actually closes this race.
          const eligibility = await resolveTaskEligibilityForWrite(tx, ctx.contractorId, ELECTRICAL_LABOR_TASKS);
          const eligibleIdsByTask = new Map(
            eligibility.map((e) => [e.task.key, new Set(e.eligible.map((s) => s.id))])
          );

          const rejected: string[] = [];
          for (const row of rows) {
            const eligibleIds = eligibleIdsByTask.get(row.taskKey) ?? new Set<string>();
            for (const id of row.serviceIds) {
              if (!eligibleIds.has(id)) rejected.push(`${id} (not eligible for ${row.taskKey})`);
            }
          }
          if (rejected.length > 0) throw new NotEligibleError(rejected);

          for (const row of rows) {
            const hours = row.minutes / 60;
            for (const id of row.serviceIds) {
              await saveServicePricingInputs(tx, id, { fieldLaborHours: hours });
            }
            results.push({ taskKey: row.taskKey, servicesUpdated: row.serviceIds.length });
          }
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (e) {
      if (e instanceof NotEligibleError) {
        return NextResponse.json({ error: e.message }, { status: 400 });
      }
      // P2034: Prisma's own code for a Postgres serialization failure
      // (SQLSTATE 40001) — the locks above are what should ordinarily
      // prevent ever reaching this, but a genuine one is still a refusal
      // to report cleanly, not a 500, and never a partial write: Prisma
      // rolls the whole transaction back before this ever surfaces.
      if ((e as { code?: string }).code === "P2034") {
        return NextResponse.json(
          { error: "A concurrent change was detected — nothing was saved. Please try again." },
          { status: 409 }
        );
      }
      throw e;
    }

    return NextResponse.json({ ok: true, results });
  });
}
