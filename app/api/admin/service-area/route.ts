import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";

/**
 * The ZIP codes a contractor will travel to.
 *
 * Load-bearing: checkout rejects any booking whose ZIP isn't on the list, and
 * fails closed when no active area exists. Before that it would CREATE an area
 * with an empty list to get past its own validation, so every ZIP in the
 * country was accepted.
 *
 * Selection is by COUNTY, with individual ZIPs unticked where wanted — nobody
 * should have to paste seventy numbers, but a county the size of Ocean has a
 * southern end an hour and a half away, so the drill-down matters too.
 */

/** Five-digit codes out of any pasted text. Kept for the manual fallback. */
function parseZips(input: unknown): string[] {
  const raw = Array.isArray(input) ? input.join(",") : String(input ?? "");
  return [...new Set(raw.match(/\b\d{5}\b/g) ?? [])].sort();
}

export async function GET(req: Request) {
  return withAdminContractor(async (db) => {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state");
  const county = searchParams.get("county");

  // Drill-down: every ZIP in one county, with its town.
  if (county && state) {
    const zips = await prisma.zipCode.findMany({
      where: { state, county },
      orderBy: [{ city: "asc" }, { zip: "asc" }],
      select: { zip: true, city: true, type: true, population: true },
    });
    return NextResponse.json({ zips });
  }

  const areas = await db.serviceArea.findMany({ orderBy: { name: "asc" } });

  // Counties available to pick from, with how many ZIPs anyone could
  // actually live in. PO Box and single-entity codes are counted separately
  // because they can't be a service address.
  const all = await prisma.zipCode.findMany({
    select: { state: true, county: true, type: true, population: true },
  });
  const counties = new Map<string, { state: string; county: string; total: number; usable: number }>();
  for (const z of all) {
    const key = `${z.state}/${z.county}`;
    const c = counties.get(key) ?? { state: z.state, county: z.county, total: 0, usable: 0 };
    c.total++;
    if (z.type === "STANDARD" && (z.population ?? 0) > 0) c.usable++;
    counties.set(key, c);
  }

  return NextResponse.json({
    areas,
    counties: [...counties.values()].sort(
      (a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county)
    ),
    referenceLoaded: all.length,
  });
  });
}

export async function PATCH(req: Request) {
  return withAdminContractor(async (db) => {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: {
    id?: string;
    name?: string;
    active?: boolean;
    zipCodes?: unknown;
    /** Add every usable ZIP in these counties. */
    addCounties?: { state: string; county: string }[];
    /** Remove every ZIP in these counties. */
    removeCounties?: { state: string; county: string }[];
    /** Individual ZIPs to drop after a county was added. */
    excludeZips?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  const existing = body.id
    ? await db.serviceArea.findUnique({ where: { id: body.id } })
    : null;

  let zipCodes: string[] | undefined;

  if (body.zipCodes !== undefined) {
    zipCodes = parseZips(body.zipCodes);
  } else if (body.addCounties || body.removeCounties || body.excludeZips) {
    const current = new Set(existing?.zipCodes ?? []);

    for (const c of body.addCounties ?? []) {
      // Only ZIPs someone can live at. Adding a PO Box code would be adding
      // a ZIP no service address can ever have.
      const found = await prisma.zipCode.findMany({
        where: { state: c.state, county: c.county, type: "STANDARD", population: { gt: 0 } },
        select: { zip: true },
      });
      for (const z of found) current.add(z.zip);
    }

    for (const c of body.removeCounties ?? []) {
      const found = await prisma.zipCode.findMany({
        where: { state: c.state, county: c.county },
        select: { zip: true },
      });
      for (const z of found) current.delete(z.zip);
    }

    for (const z of body.excludeZips ?? []) current.delete(z);

    zipCodes = [...current].sort();
  }

  // Emptying the list, or deactivating the last area, closes online booking.
  // That may be deliberate — a holiday, a van off the road — but it shouldn't
  // happen without anyone noticing.
  let warning: string | null = null;
  if (zipCodes?.length === 0) {
    warning = "That leaves no ZIP codes, so nobody can book online until you add some.";
  }
  if (body.active === false) {
    const others = await db.serviceArea.count({
      where: { active: true, id: { not: body.id } },
    });
    if (others === 0) warning = "That was the only active area — online booking is now closed.";
  }

  try {
    const area = body.id
      ? await db.serviceArea.update({
          where: { id: body.id },
          data: {
            ...(body.name !== undefined ? { name: body.name } : {}),
            ...(zipCodes !== undefined ? { zipCodes } : {}),
            ...(body.active !== undefined ? { active: body.active } : {}),
          },
        })
      : await db.serviceArea.create({
          data: {
            name: body.name?.trim() || "Service Area",
            zipCodes: zipCodes ?? [],
            active: body.active ?? true,
          },
        });
    return NextResponse.json({ ok: true, area, warning });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown database error";
    console.error("[service-area]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
  });
}
