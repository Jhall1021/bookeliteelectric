/**
 * The contractor's own labor calibration — the supported write path.
 *
 * Authentication, tenant resolution and HTTP shaping only. The behaviour lives
 * in lib/admin/onboardingActions so it can be exercised without a running
 * server; this file is deliberately thin enough that there is nothing in it to
 * test separately.
 *
 * REFERENCE EVIDENCE IS NOT CALIBRATION. GET returns the published figure
 * alongside the contractor's own, clearly separated. It becomes calibration
 * only through `accept-reference`, which writes a contractor-owned value with
 * provenance — and which refuses outright when the evidence is DISPUTED.
 */
import { pilotLog } from "@/lib/electrical/pilotLog";
import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";
import { withAdminContractor } from "@/lib/adminContext";
import { readComponentLabor, writeComponentLabor } from "@/lib/admin/onboardingActions";

export async function GET(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const keys = (new URL(req.url).searchParams.get("keys") ?? "")
    .split(",").map((k) => k.trim()).filter(Boolean);
  return withAdminContractor(async (db, ctx) =>
    NextResponse.json(await readComponentLabor(db, ctx, keys)));
}

export async function POST(req: Request) {
  if (!(await isAdminAuthenticated())) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const body = await req.json();
  return withAdminContractor(async (db, ctx) => {
    const r = await writeComponentLabor(db, ctx, body);
    pilotLog("setup_write", { contractorId: ctx.contractorId, step: "labor", outcome: r.ok ? "ok" : "refused", status: r.ok ? 200 : r.status });
    return r.ok
      ? NextResponse.json({ ok: true, ...r.data })
      : NextResponse.json({ error: r.error }, { status: r.status });
  });
}
