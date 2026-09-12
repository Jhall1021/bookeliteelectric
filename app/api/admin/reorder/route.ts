import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

/**
 * Reordering categories, or services within a category.
 *
 * The whole list is sent at once rather than a single moved item. Sending one
 * position invites gaps and ties as things move around; rewriting the order
 * from the array index means what the admin sees is exactly what's stored.
 *
 * A service reorder is deliberately ONE CATEGORY at a time. `sortOrder` is
 * interpreted inside a category, so accepting a mixed-category batch would
 * write a plausible-looking set of numbers with no coherent customer order.
 */
export async function PATCH(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: { kind?: unknown; ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  if (!Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "No ids given" }, { status: 400 });
  }
  if (!body.ids.every((id): id is string => typeof id === "string" && id.trim() !== "")) {
    return NextResponse.json({ error: "Every reorder id must be a non-empty string" }, { status: 400 });
  }

  const ids = body.ids;
  if (new Set(ids).size !== ids.length) {
    return NextResponse.json({ error: "A reorder list cannot contain the same item more than once" }, { status: 400 });
  }

  if (body.kind !== "categories" && body.kind !== "services") {
    return NextResponse.json({ error: "kind must be 'categories' or 'services'" }, { status: 400 });
  }

  return withAdminContractor(async (db) => {
    try {
      if (body.kind === "categories") {
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
      } else {
        const ownedServices = await db.service.findMany({
          where: { id: { in: ids } },
          select: { id: true, contractorCategoryId: true },
        });
        if (ownedServices.length !== ids.length) {
          return NextResponse.json(
            { error: "One or more services do not belong to this contractor" },
            { status: 403 }
          );
        }

        const categoryIds = new Set(ownedServices.map((service) => service.contractorCategoryId));
        if (categoryIds.size !== 1 || categoryIds.has(null)) {
          return NextResponse.json(
            { error: "Services can only be reordered within a single category" },
            { status: 400 }
          );
        }

        await db.$transaction(
          ids.map((id, index) =>
            db.service.update({ where: { id }, data: { sortOrder: index } })
          )
        );
      }
    } catch (err) {
      console.error("[reorder]", body.kind, err);
      return NextResponse.json(
        { error: "Could not save the order. Nothing was changed." },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, count: ids.length });
  });
}
