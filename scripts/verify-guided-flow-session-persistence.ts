/**
 * Live-database proof for GuidedFlowSession's persistence and optimistic
 * concurrency — docs/design/guided-flow-session-v1.md §5, §9.
 *
 * NOT part of `npm run verify` — like the DB-touching capture scripts, this
 * needs a real Postgres connection and creates + deletes real rows. Run it
 * against a disposable rehearsal branch, never production:
 *
 *   DATABASE_URL="<a rehearsal branch, not production>" \
 *     npx tsx scripts/verify-guided-flow-session-persistence.ts
 *
 * It finds one existing contractor/service row to attach test data to, and
 * cleans up everything it creates (the final delete's cascade removes the
 * satellite rows too). It does not touch any other row.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  let failures = 0;
  const check = (name: string, cond: boolean) => {
    console.log(`  ${cond ? "ok" : "FAIL"} — ${name}`);
    if (!cond) failures++;
  };

  const contractor = await p.contractor.findFirst({ select: { id: true } });
  const service = await p.service.findFirst({
    where: { contractorId: contractor?.id },
    select: { id: true, slug: true, contractorId: true },
  });
  if (!contractor || !service) {
    console.log("No contractor/service row available to probe against — nothing to verify.");
    await p.$disconnect();
    process.exit(1);
  }

  console.log("\nPersistence — create, read back");
  const session = await p.guidedFlowSession.create({
    data: {
      contractorId: service.contractorId!,
      sessionId: "verify-guided-flow-session-token",
      serviceId: service.id,
      serviceSlug: service.slug,
      consumedAnswers: { some_question: "some_answer" },
    },
  });
  check("created a GuidedFlowSession row", !!session.id);
  check("starts at version 0", session.version === 0);
  check("starts ACTIVE", session.status === "ACTIVE");

  const read = await p.guidedFlowSession.findUnique({ where: { id: session.id } });
  check(
    "reads back with the same consumedAnswers",
    JSON.stringify(read?.consumedAnswers) === JSON.stringify({ some_question: "some_answer" })
  );

  console.log("\nOptimistic concurrency — §5/§8's proof");
  const goodWrite = await p.guidedFlowSession.updateMany({
    where: { id: session.id, version: 0, status: "ACTIVE" },
    data: {
      consumedAnswers: { some_question: "some_answer", next_question: "next_answer" },
      version: { increment: 1 },
    },
  });
  check("write with the correct expected version succeeds (count=1)", goodWrite.count === 1);

  // Simulates a stale desktop client still asserting the OLD version after a
  // phone (or any other client) already advanced the session.
  const staleWrite = await p.guidedFlowSession.updateMany({
    where: { id: session.id, version: 0, status: "ACTIVE" },
    data: { consumedAnswers: { overwritten: "should not land" }, version: { increment: 1 } },
  });
  check("stale write (old version) is rejected (count=0)", staleWrite.count === 0);

  // Postgres JSONB does not preserve key insertion order, so this compares
  // key/value pairs rather than the raw JSON string.
  const afterStale = await p.guidedFlowSession.findUnique({ where: { id: session.id } });
  const expected = { some_question: "some_answer", next_question: "next_answer" };
  const actual = (afterStale?.consumedAnswers ?? {}) as Record<string, unknown>;
  const matches =
    Object.keys(expected).length === Object.keys(actual).length &&
    Object.entries(expected).every(([k, v]) => actual[k] === v);
  check("the newer state survives the stale write attempt — nothing lost", matches);
  check("version is 1, not clobbered or double-incremented", afterStale?.version === 1);

  console.log("\nSatellites — GuidedFlowVisualAssistTask, DeviceHandoff");
  const task = await p.guidedFlowVisualAssistTask.create({
    data: { guidedFlowSessionId: session.id, taskType: "ROUTE_ASSIST", taskKey: "verify-task" },
  });
  check("created a GuidedFlowVisualAssistTask referencing the session", task.guidedFlowSessionId === session.id);

  const handoff = await p.deviceHandoff.create({
    data: {
      guidedFlowSessionId: session.id,
      taskType: "ROUTE_ASSIST",
      tokenHash: "verify-hash-" + Date.now(),
      expiresAt: new Date(Date.now() + 20 * 60_000),
    },
  });
  check("created a DeviceHandoff referencing the session", handoff.guidedFlowSessionId === session.id);

  console.log("\nCascade cleanup");
  await p.guidedFlowSession.delete({ where: { id: session.id } });
  const taskAfter = await p.guidedFlowVisualAssistTask.findUnique({ where: { id: task.id } });
  const handoffAfter = await p.deviceHandoff.findUnique({ where: { id: handoff.id } });
  check("deleting the session cascade-deletes its visual assist task", taskAfter === null);
  check("deleting the session cascade-deletes its device handoff", handoffAfter === null);

  const contractorStillThere = await p.contractor.findUnique({ where: { id: contractor.id } });
  check("the contractor row this probe used is still intact — nothing else touched", !!contractorStillThere);

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  await p.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}
main();
