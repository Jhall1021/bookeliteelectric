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
 * IT OWNS EVERY ROW IT TOUCHES.
 *
 * This used to attach to whatever `contractor.findFirst()` returned and give
 * up if that contractor happened to have no services — which is exactly what
 * happened: the first row back was a Stripe/invitation probe tenant with zero
 * services, so the probe printed "nothing to verify" and exited 1 without
 * exercising a single line of persistence. A test that can silently skip is
 * worse than no test, because the red looks like a product failure and the
 * green never happened.
 *
 * So it creates its own contractor, category and service under a run-scoped
 * slug prefix, proves persistence against those, and deletes them. No ambient
 * ordering, no dependence on what else lives in the database, and nothing
 * belonging to anyone else is read or written.
 */
import { PrismaClient } from "@prisma/client";

async function main() {
  const p = new PrismaClient();
  let failures = 0;
  let CHECKS = 0;
  const check = (name: string, cond: boolean) => {
    CHECKS++;
    console.log(`  ${cond ? "ok" : "FAIL"} — ${name}`);
    if (!cond) failures++;
  };

  // Run-scoped so two concurrent runs cannot collide, and so anything left
  // behind by a crash is obviously this script's and obviously disposable.
  const RUN = `gfsverify-${process.pid.toString(36)}${Date.now().toString(36).slice(-5)}`;

  const category = await p.serviceCategory.create({
    data: { slug: `${RUN}-cat`, name: "GuidedFlowSession probe category" },
  });
  const contractor = await p.contractor.create({
    data: { slug: RUN, name: "GuidedFlowSession probe (TEST — disposable)" },
  });
  const service = await p.service.create({
    data: {
      slug: `${RUN}-svc`,
      name: "GuidedFlowSession probe service",
      categoryId: category.id,
      contractorId: contractor.id,
      bookingType: "INSTANT",
    },
    select: { id: true, slug: true, contractorId: true },
  });
  console.log(`  fixture: contractor ${contractor.slug} / service ${service.slug}`);

  const dropFixture = async () => {
    await p.service.deleteMany({ where: { contractorId: contractor.id } });
    await p.contractor.deleteMany({ where: { id: contractor.id } });
    await p.serviceCategory.deleteMany({ where: { id: category.id } });
  };

  // CONTROL. If the fixture were ever not usable, every check below would be
  // skipped and the run would still have to say so loudly rather than looking
  // like a product failure. Asserting it here means "0 checks ran" is
  // impossible to reach silently.
  check("the probe owns a usable fixture — checks below actually run", !!service.id);

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
  check("the probe's own contractor survived its session's cascade", !!contractorStillThere);

  console.log("\nFixture teardown");
  await dropFixture();
  check("the probe's contractor is gone", (await p.contractor.findUnique({ where: { id: contractor.id } })) === null);
  check("the probe's service is gone", (await p.service.findUnique({ where: { id: service.id } })) === null);
  check("the probe's category is gone", (await p.serviceCategory.findUnique({ where: { id: category.id } })) === null);
  check("no probe row of any run is left behind",
    (await p.contractor.count({ where: { slug: { startsWith: "gfsverify-" } } })) === 0);

  console.log(`\n${failures === 0 ? `ALL ${CHECKS} CHECKS PASSED` : `${failures} CHECK(S) FAILED`}`);
  await p.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}
main();
