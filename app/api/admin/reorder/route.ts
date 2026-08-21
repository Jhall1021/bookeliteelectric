import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";

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

  try {
    // One transaction so a half-applied order can't leave two things fighting
    // over the same position.
    if (body.kind === "categories") {
      await prisma.$transaction(
        ids.map((id, index) =>
          prisma.serviceCategory.update({ where: { id }, data: { sortOrder: index } })
        )
      );
    } else if (body.kind === "services") {
      await prisma.$transaction(
        ids.map((id, index) =>
          prisma.service.update({ where: { id }, data: { sortOrder: index } })
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
}
