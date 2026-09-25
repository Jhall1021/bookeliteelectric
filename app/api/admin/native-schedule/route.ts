import { Prisma, type PrismaClient } from "@prisma/client";
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import { isServiceDate, serviceDateToStored } from "@/lib/serviceDate";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function cleanName(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function serializedBlock(block: {
  id: string; crewId: string; date: Date; startTime: string; endTime: string; note: string | null;
}) {
  return { ...block, date: block.date.toISOString().slice(0, 10) };
}

async function syncLegacyCapacity(db: PrismaClient, contractorId: string) {
  const active = await db.nativeCrew.count({ where: { contractorId, active: true } });
  await db.contractor.update({
    where: { id: contractorId },
    data: { nativeConcurrentJobs: active > 0 ? active : null },
  });
  return active;
}

export async function GET(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!from || !to || !DATE.test(from) || !DATE.test(to) || !isServiceDate(from) || !isServiceDate(to) || from > to) {
      return NextResponse.json({ error: "Choose a valid calendar date range." }, { status: 400 });
    }
    const fromDate = serviceDateToStored(from);
    const toDate = serviceDateToStored(to);
    if ((toDate.getTime() - fromDate.getTime()) / 86_400_000 > 62) {
      return NextResponse.json({ error: "Calendar ranges may be at most 63 days." }, { status: 400 });
    }
    const [crews, blocks] = await Promise.all([
      db.nativeCrew.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] }),
      db.nativeCrewBlock.findMany({
        where: { date: { gte: fromDate, lte: toDate } },
        orderBy: [{ date: "asc" }, { startTime: "asc" }],
      }),
    ]);
    return NextResponse.json({ crews, blocks: blocks.map(serializedBlock) });
  });
}

export async function POST(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Request body must be an object." }, { status: 400 });
    }

    if (body.kind === "crew") {
      const name = cleanName(body.name);
      if (!name || name.length > 60) {
        return NextResponse.json({ error: "Crew names must be 1–60 characters." }, { status: 400 });
      }
      try {
        const [contractor, rosterSize] = await Promise.all([
          db.contractor.findUnique({ where: { id: ctx.contractorId }, select: { nativeConcurrentJobs: true } }),
          db.nativeCrew.count({ where: { contractorId: ctx.contractorId } }),
        ]);
        const crew = await db.nativeCrew.create({ data: { contractorId: ctx.contractorId, name } });
        // Preserve an existing native contractor's declared capacity on first
        // adoption. The first real name replaces Crew 1; the remaining units
        // receive obvious placeholders the contractor can rename.
        if (rosterSize === 0 && (contractor?.nativeConcurrentJobs ?? 0) > 1) {
          const desired = contractor!.nativeConcurrentJobs!;
          for (let index = 2; index <= desired; index += 1) {
            const base = `Crew ${index}`;
            await db.nativeCrew.create({
              data: { contractorId: ctx.contractorId, name: base === name ? `${base} (unnamed)` : base },
            });
          }
        }
        await syncLegacyCapacity(db, ctx.contractorId);
        const crews = await db.nativeCrew.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
        return NextResponse.json({ ok: true, crew, crews });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
          return NextResponse.json({ error: "That crew name is already in use." }, { status: 409 });
        }
        throw error;
      }
    }

    if (body.kind === "block") {
      const crewId = typeof body.crewId === "string" ? body.crewId : "";
      const date = typeof body.date === "string" ? body.date : "";
      const startTime = typeof body.startTime === "string" ? body.startTime : "";
      const endTime = typeof body.endTime === "string" ? body.endTime : "";
      const note = cleanName(body.note);
      if (!crewId || !DATE.test(date) || !isServiceDate(date) || !TIME.test(startTime) || !TIME.test(endTime) || startTime >= endTime) {
        return NextResponse.json({ error: "Choose a crew, date, start time and later end time." }, { status: 400 });
      }
      if (note.length > 120) {
        return NextResponse.json({ error: "The optional note may be at most 120 characters." }, { status: 400 });
      }
      const crew = await db.nativeCrew.findUnique({ where: { id: crewId } });
      if (!crew || !crew.active) {
        return NextResponse.json({ error: "Choose an active crew from this business." }, { status: 400 });
      }
      const storedDate = serviceDateToStored(date);
      const overlapping = await db.nativeCrewBlock.findFirst({
        where: { crewId, date: storedDate, startTime: { lt: endTime }, endTime: { gt: startTime } },
      });
      if (overlapping) {
        return NextResponse.json({ error: "That crew already has unavailable time during this period." }, { status: 409 });
      }
      const block = await db.nativeCrewBlock.create({
        data: { contractorId: ctx.contractorId, crewId, date: storedDate, startTime, endTime, note: note || null },
      });
      return NextResponse.json({ ok: true, block: serializedBlock(block) });
    }

    return NextResponse.json({ error: "Unknown schedule item." }, { status: 400 });
  });
}

export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    const name = cleanName(body?.name);
    const active = body?.active;
    if (!id || !name || name.length > 60 || typeof active !== "boolean") {
      return NextResponse.json({ error: "Choose a valid crew name and availability setting." }, { status: 400 });
    }
    const existing = await db.nativeCrew.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Crew not found." }, { status: 404 });
    try {
      const crew = await db.nativeCrew.update({ where: { id }, data: { name, active } });
      const activeCount = await syncLegacyCapacity(db, ctx.contractorId);
      return NextResponse.json({ ok: true, crew, activeCount });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        return NextResponse.json({ error: "That crew name is already in use." }, { status: 409 });
      }
      throw error;
    }
  });
}

export async function DELETE(req: Request) {
  return withAdminRoute(async (db) => {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const id = typeof body?.id === "string" ? body.id : "";
    if (!id) return NextResponse.json({ error: "Choose an unavailable-time block." }, { status: 400 });
    const existing = await db.nativeCrewBlock.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Unavailable time not found." }, { status: 404 });
    await db.nativeCrewBlock.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  });
}
