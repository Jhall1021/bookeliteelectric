import { NextResponse } from "next/server";
import { withAdminRoute } from "@/lib/adminContext";
import {
  saveLaborOperationDecisions,
  saveLaborScenarioAnswers,
  type OperationDecisionInput,
  type ScenarioAnswerInput,
} from "@/lib/laborCalibrationPersistence";

const TRADE = "electrical";

export async function GET() {
  return withAdminRoute(async (db, ctx) => {
    const [answers, decisions] = await Promise.all([
      db.contractorLaborScenarioAnswer.findMany({
        where: { contractorId: ctx.contractorId, trade: TRADE },
        select: { scenarioKey: true, scenarioHours: true, scopeVersion: true, answeredAt: true, updatedAt: true },
        orderBy: { scenarioKey: "asc" },
      }),
      db.contractorLaborOperationDecision.findMany({
        where: { contractorId: ctx.contractorId, trade: TRADE },
        select: { operationKey: true, hoursPerUnit: true, source: true, basis: true, approvedAt: true, updatedAt: true },
        orderBy: { operationKey: "asc" },
      }),
    ]);
    return NextResponse.json({ trade: TRADE, answers, decisions });
  });
}

export async function PATCH(req: Request) {
  return withAdminRoute(async (db, ctx) => {
    let body: { kind?: unknown; answers?: unknown; decisions?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Expected JSON." }, { status: 400 });
    }
    try {
      if (body.kind === "scenario-answers") {
        const saved = await db.$transaction((tx) =>
          saveLaborScenarioAnswers(tx, ctx.contractorId, TRADE, body.answers as ScenarioAnswerInput[]));
        return NextResponse.json({ ok: true, trade: TRADE, ...saved });
      }
      if (body.kind === "operation-decisions") {
        const saved = await db.$transaction((tx) =>
          saveLaborOperationDecisions(tx, ctx.contractorId, TRADE, body.decisions as OperationDecisionInput[]));
        return NextResponse.json({ ok: true, trade: TRADE, decisions: saved });
      }
      return NextResponse.json({ error: 'kind must be "scenario-answers" or "operation-decisions".' }, { status: 400 });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid labor calibration." }, { status: 400 });
    }
  });
}
