/**
 * Where the contractor got to, and what they have acknowledged.
 *
 * ONBOARDING STATE ONLY. It stores no readiness, no blocker list and no
 * launchability — those are derived on every call, so there is nothing here to
 * go stale. The resume point never gates anything either: the worst a wrong
 * value can do is open the wrong page.
 */
import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";

const STAGES = new Set([
  "business",
  "trade",
  "services",
  "pricing-foundation",
  "scheduling",
  "payments",
  "launch",
]);

export async function PATCH(req: Request) {
  let body: { currentStage?: unknown; acknowledge?: unknown };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Request body was not valid JSON" }, { status: 400 });
  }

  if (body.currentStage !== undefined) {
    if (typeof body.currentStage !== "string" || !STAGES.has(body.currentStage)) {
      return NextResponse.json({ error: "Choose a valid setup stage." }, { status: 400 });
    }
  }

  if (body.acknowledge !== undefined) {
    if (
      typeof body.acknowledge !== "string" ||
      body.acknowledge.trim() === "" ||
      body.acknowledge.length > 100
    ) {
      return NextResponse.json({ error: "Acknowledgement key is invalid." }, { status: 400 });
    }
  }

  if (body.currentStage === undefined && body.acknowledge === undefined) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  return withAdminRoute(async (db, ctx) => {
    const existing = await db.contractorOnboarding.findUnique({
      where: { contractorId: ctx.contractorId },
    });
    const acknowledged = { ...((existing?.acknowledged as Record<string, string>) ?? {}) };
    if (typeof body.acknowledge === "string") {
      acknowledged[body.acknowledge.trim()] = new Date().toISOString();
    }
    const currentStage =
      typeof body.currentStage === "string" ? body.currentStage : existing?.currentStage ?? "business";

    const row = await db.contractorOnboarding.upsert({
      where: { contractorId: ctx.contractorId },
      create: { contractorId: ctx.contractorId, currentStage, acknowledged },
      update: { currentStage, acknowledged },
    });
    return NextResponse.json({
      ok: true,
      currentStage: row.currentStage,
      acknowledged: row.acknowledged,
    });
  });
}
