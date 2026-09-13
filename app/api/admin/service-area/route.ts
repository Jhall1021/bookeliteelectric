import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAdminRoute } from "@/lib/adminContext";

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
function parseZips(input: string | string[]): string[] {
  const raw = Array.isArray(input) ? input.join(",") : input;
  return [...new Set(raw.match(/\b\d{5}\b/g) ?? [])].sort();
}

type CountyRef = { state: string; county: string };

function optionalText(value: unknown, label: string): string | undefined | NextResponse {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.trim() === "") {
    return NextResponse.json({ error: `${label} must be non-empty text.` }, { status: 400 });
  }
  return value.trim();
}

function countyList(value: unknown, label: string): CountyRef[] | undefined | NextResponse {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) {
    return NextResponse.json({ error: `${label} must be a list of counties.` }, { status: 400 });
  }
  const parsed: CountyRef[] = [];
  for (const item of value) {
    if (
      typeof item !== "object" ||
      item === null ||
      Array.isArray(item) ||
      typeof (item as Record<string, unknown>).state !== "string" ||
      typeof (item as Record<string, unknown>).county !== "string" ||
      !(item as Record<string, string>).state.trim() ||
      !(item as Record<string, string>).county.trim()
    ) {
      return NextResponse.json(
        { error: `${label} contains an invalid county selection.` },
        { status: 400 }
      );
    }
    parsed.push({
      state: (item as Record<string, string>).state.trim(),
      county: (item as Record<string, string>).county.trim(),
    });
  }
  return parsed;
}

function isResponse(value: unknown): value is NextResponse {
  return value instanceof NextResponse;
}

export async function GET(req: Request) {
  return withAdminRoute(async (db) => {
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
  return withAdminRoute(async (db, ctx) => {
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

    const id = optionalText(body.id, "Service area id");
    if (isResponse(id)) return id;
    const name = optionalText(body.name, "Service area name");
    if (isResponse(name)) return name;
    if (body.active !== undefined && typeof body.active !== "boolean") {
      return NextResponse.json({ error: "active must be true or false." }, { status: 400 });
    }

    const addCounties = countyList(body.addCounties, "addCounties");
    if (isResponse(addCounties)) return addCounties;
    const removeCounties = countyList(body.removeCounties, "removeCounties");
    if (isResponse(removeCounties)) return removeCounties;

    let excludeZips: string[] | undefined;
    if (body.excludeZips !== undefined) {
      if (
        !Array.isArray(body.excludeZips) ||
        !body.excludeZips.every((z): z is string => typeof z === "string" && /^\d{5}$/.test(z))
      ) {
        return NextResponse.json(
          { error: "excludeZips must contain only five-digit ZIP codes." },
          { status: 400 }
        );
      }
      excludeZips = [...new Set(body.excludeZips)].sort();
    }

    let suppliedZips: string | string[] | undefined;
    if (body.zipCodes !== undefined) {
      if (
        typeof body.zipCodes !== "string" &&
        !(Array.isArray(body.zipCodes) && body.zipCodes.every((z) => typeof z === "string"))
      ) {
        return NextResponse.json(
          { error: "zipCodes must be text or a list of ZIP-code strings." },
          { status: 400 }
        );
      }
      suppliedZips = body.zipCodes as string | string[];
    }

    const existing = id ? await db.serviceArea.findUnique({ where: { id } }) : null;
    if (id && !existing) {
      return NextResponse.json({ error: "Service area not found" }, { status: 404 });
    }

    let zipCodes: string[] | undefined;

    if (suppliedZips !== undefined) {
      zipCodes = parseZips(suppliedZips);
    } else if (addCounties !== undefined || removeCounties !== undefined || excludeZips !== undefined) {
      const current = new Set(existing?.zipCodes ?? []);

      for (const c of addCounties ?? []) {
        // Only ZIPs someone can live at. Adding a PO Box code would be adding
        // a ZIP no service address can ever have.
        const found = await prisma.zipCode.findMany({
          where: { state: c.state, county: c.county, type: "STANDARD", population: { gt: 0 } },
          select: { zip: true },
        });
        for (const z of found) current.add(z.zip);
      }

      for (const c of removeCounties ?? []) {
        const found = await prisma.zipCode.findMany({
          where: { state: c.state, county: c.county },
          select: { zip: true },
        });
        for (const z of found) current.delete(z.zip);
      }

      for (const z of excludeZips ?? []) current.delete(z);

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
        where: { active: true, id: { not: id } },
      });
      if (others === 0) warning = "That was the only active area — online booking is now closed.";
    }

    try {
      const area = id
        ? await db.serviceArea.update({
            where: { id },
            data: {
              ...(name !== undefined ? { name } : {}),
              ...(zipCodes !== undefined ? { zipCodes } : {}),
              ...(body.active !== undefined ? { active: body.active as boolean } : {}),
            },
          })
        : await db.serviceArea.create({
            data: {
              // Explicit now that contract made the column required. The guard
              // stamps it anyway and refuses a value that disagrees with the
              // ambient context; the type cannot see runtime stamping.
              contractorId: ctx.contractorId,
              name: name ?? "Service Area",
              zipCodes: zipCodes ?? [],
              active: body.active === undefined ? true : (body.active as boolean),
            },
          });
      return NextResponse.json({ ok: true, area, warning });
    } catch (err) {
      // Keep database/provider details in server logs. Prisma errors can contain
      // table, constraint, connection and query information that should never be
      // reflected into the contractor UI.
      console.error("[service-area]", err);
      return NextResponse.json(
        { error: "Could not save the service area. Nothing was changed." },
        { status: 500 }
      );
    }
  });
}
