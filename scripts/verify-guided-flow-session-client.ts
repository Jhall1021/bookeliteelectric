import { persistGuidedFlowAnswers, type GuidedFlowFetch } from "../lib/guidedFlowSessionClient";

let pass = 0;
let fail = 0;
function check(label: string, condition: boolean, detail = "") {
  condition ? pass++ : fail++;
  console.log(`  ${condition ? "ok  " : "FAIL"} ${label}${condition || !detail ? "" : `\n       ${detail}`}`);
}

function response(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

console.log("\nGUIDED FLOW SESSION CLIENT CONFLICT HANDLING\n");

async function successCase() {
  const seen: string[] = [];
  const fetchFn: GuidedFlowFetch = async (_input, init) => {
    seen.push(String(init?.body));
    return response(200, { id: "s1", version: 2, consumedAnswers: { a: "1", b: "2" } });
  };
  const out = await persistGuidedFlowAnswers(fetchFn, { id: "s1", version: 1 }, { a: "1" }, { a: "1", b: "2" });
  check("clean write persists once", seen.length === 1, JSON.stringify(seen));
  check("clean write advances version", out.session.version === 2 && out.persisted && !out.pendingLocalChanges, JSON.stringify(out));
}

async function unrelatedRaceCase() {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn: GuidedFlowFetch = async (_input, init) => {
    const parsed = JSON.parse(String(init?.body));
    bodies.push(parsed);
    if (bodies.length === 1) {
      return response(409, {
        error: "STALE_VERSION",
        current: { version: 2, consumedAnswers: { a: "1", phoneOnly: "yes" } },
      });
    }
    return response(200, {
      id: "s1",
      version: 3,
      consumedAnswers: parsed.consumedAnswers,
    });
  };
  const out = await persistGuidedFlowAnswers(fetchFn, { id: "s1", version: 1 }, { a: "1" }, { a: "1", b: "2" });
  check("stale original is not retried verbatim", bodies.length === 2 && JSON.stringify(bodies[0].consumedAnswers) !== JSON.stringify(bodies[1].consumedAnswers), JSON.stringify(bodies));
  check("bounded retry preserves phone answer and adds safe local edit", out.answers.b === "2" && out.answers.phoneOnly === "yes", JSON.stringify(out));
  check("bounded reconciled retry advances to version 3", out.session.version === 3 && out.persisted, JSON.stringify(out));
}

async function sameKeyConflictCase() {
  let calls = 0;
  const fetchFn: GuidedFlowFetch = async () => {
    calls++;
    return response(409, {
      error: "STALE_VERSION",
      current: { version: 2, consumedAnswers: { route: "16", phoneOnly: "yes" } },
    });
  };
  const out = await persistGuidedFlowAnswers(
    fetchFn,
    { id: "s1", version: 1 },
    { route: "14.6" },
    { route: "18" }
  );
  check("same-key conflict does not retry", calls === 1, String(calls));
  check("same-key conflict preserves server winner", out.answers.route === "16" && out.answers.phoneOnly === "yes", JSON.stringify(out));
  check("same-key conflict is surfaced", out.conflicts.length === 1 && out.conflicts[0].key === "route", JSON.stringify(out.conflicts));
}

async function secondRaceCase() {
  const bodies: Record<string, unknown>[] = [];
  const fetchFn: GuidedFlowFetch = async (_input, init) => {
    const parsed = JSON.parse(String(init?.body));
    bodies.push(parsed);
    if (bodies.length === 1) {
      return response(409, {
        error: "STALE_VERSION",
        current: { version: 2, consumedAnswers: { a: "1", phoneOnly: "yes" } },
      });
    }
    return response(409, {
      error: "STALE_VERSION",
      current: { version: 3, consumedAnswers: { a: "1", phoneOnly: "yes", secondPhone: "new" } },
    });
  };
  const out = await persistGuidedFlowAnswers(fetchFn, { id: "s1", version: 1 }, { a: "1" }, { a: "1", b: "2" });
  check("client stops after one reconciled retry", bodies.length === 2, JSON.stringify(bodies));
  check("second-race current state is preserved", out.answers.phoneOnly === "yes" && out.answers.secondPhone === "new", JSON.stringify(out));
  check("still-safe local edit remains pending rather than disappearing", out.answers.b === "2" && out.pendingLocalChanges && !out.persisted, JSON.stringify(out));
  check("client catches up to newest version after second race", out.session.version === 3, JSON.stringify(out.session));
}

async function run() {
  await successCase();
  await unrelatedRaceCase();
  await sameKeyConflictCase();
  await secondRaceCase();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
