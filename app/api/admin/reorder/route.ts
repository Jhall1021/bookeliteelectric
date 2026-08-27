import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { soleContractorId } from "@/lib/categories";
import { withContractor } from "@/lib/tenantRoute";

/**
 * Reordering categories, or services within a category.
 *
 * Services previously sorted by name, which put "200-Amp Service Upgrade" at
 * the top of Panel Upgrades regardless of how rarely anyone books one, and
 * buried the common work underneath.
 *
 * The whole list is sent at once rather than a single moved item. Sending one
 * position invites gaps and ties as things move around; rewriting the order
 * from the array index means what the admin sees is exactly what's stored.
 */
export async function PATCH(req: Request) {
  if (!isAdminAuthenticated()) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { kind?: string; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids) ? body.ids.filter((i): i is string => typeof i === "string") : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "No ids given" }, { status: 400 });
  }

  // GUARD-ADOPTED (ADR-007a). The hand-written contractor filter that used to
  // live in each `where` is gone: the guard enforces the same invariant
  // centrally, and a filter written by hand at every site is what it exists to
  // replace. Both `service` and `contractorCategory` are directly tenant-owned.
  const contractorId = await soleContractorId(prisma, "the reorder route");

  return withContractor(contractorId, "admin-session", async (db) => {
  try {
    // One transaction so a half-applied order can't leave two things fighting
    // over the same position. The guard survives $transaction, so tx is
    // scoped too.
    if (body.kind === "categories") {
      // ADR-006: ordering is contractor presentation, so it is written on
      // ContractorCategory.
      //
      // The ownership pre-check STAYS, and deliberately not for isolation —
      // the guard covers that now. A guarded update against a foreign id
      // throws a not-found this route would report as a 500. Refusing the
      // whole reorder with a 403 says what actually happened, and
      // all-or-nothing is right when a client has sent ids it should not have.
      const owned = await db.contractorCategory.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (owned.length !== ids.length) {
        return NextResponse.json(
          { error: "One or more categories do not belong to this contractor" },
          { status: 403 }
        );
      }
      await db.$transaction(
        ids.map((id, index) =>
          db.contractorCategory.update({ where: { id }, data: { sortOrder: index } })
        )
      );
    } else if (body.kind === "services") {
      // Same reasoning: refuse the batch rather than let a foreign id become a
      // 500 halfway through the transaction.
      const ownedServices = await db.service.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      if (ownedServices.length !== ids.length) {
        return NextResponse.json(
          { error: "One or more services do not belong to this contractor" },
          { status: 403 }
        );
      }
      await db.$transaction(
        ids.map((id, index) =>
          db.service.update({ where: { id }, data: { sortOrder: index } })
        )
      );
    } else {
      return NextResponse.json({ error: "kind must be 'categories' or 'services'" }, { status: 400 });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    console.error("[reorder]", body.kind, err);
    return NextResponse.json({ error: `Could not save the order: ${message}` }, { status: 500 });
  }

  return NextResponse.json({ ok: true, count: ids.length });
  });
}
