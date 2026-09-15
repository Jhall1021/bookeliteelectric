import { GuidedFlowAnswerWriter } from "../lib/guidedFlowAnswerWriter";
import type { GuidedFlowFetch } from "../lib/guidedFlowSessionClient";

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

console.log("\nGUIDED FLOW SERIAL ANSWER WRITER\n");

async function queuedLocalEditsPreserveRemoteState() {
  const requests: Record<string, unknown>[] = [];
  let call = 0;
  const fetchFn: GuidedFlowFetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    call++;
    if (call === 1) {
      // Another device landed `phoneOnly` before the first local write.
      return response(409, {
        error: "STALE_VERSION",
        current: { version: 2, consumedAnswers: { a: "1", phoneOnly: "yes" } },
      });
    }
    return response(200, {
      id: "s1",
      version: call + 1,
      consumedAnswers: body.consumedAnswers,
    });
  };

  const writer = new GuidedFlowAnswerWriter(fetchFn, { id: "s1", version: 1 }, { a: "1" });
  const first = writer.enqueue({
    localBaseAnswers: { a: "1" },
    attemptedAnswers: { a: "1", b: "2" },
  });
  // This second local edit was formed before the first network write necessarily
  // finished, so its local snapshots do not know about `phoneOnly` yet.
  const second = writer.enqueue({
    localBaseAnswers: { a: "1", b: "2" },
    attemptedAnswers: { a: "1", b: "2", c: "3" },
  });

  const firstResult = await first;
  const secondResult = await second;

  check(
    "first stale write merges remote answer and persists the safe local edit",
    firstResult.answers.b === "2" && firstResult.answers.phoneOnly === "yes",
    JSON.stringify(firstResult)
  );
  check(
    "queued second edit preserves remote answer it never saw locally",
    secondResult.answers.b === "2" && secondResult.answers.c === "3" && secondResult.answers.phoneOnly === "yes",
    JSON.stringify(secondResult)
  );
  check(
    "second request sent canonical remote state plus the new local delta",
    requests.some((r) => {
      const a = r.consumedAnswers as Record<string, string> | undefined;
      return a?.b === "2" && a?.c === "3" && a?.phoneOnly === "yes";
    }),
    JSON.stringify(requests)
  );
  const snapshot = writer.snapshot();
  check(
    "writer tracks the latest canonical state and version",
    snapshot.session.version >= 3 && snapshot.canonicalAnswers.phoneOnly === "yes" && snapshot.canonicalAnswers.c === "3",
    JSON.stringify(snapshot)
  );
}

async function queuedSameKeyConflictStopsBeforeNetwork() {
  let calls = 0;
  const fetchFn: GuidedFlowFetch = async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    return response(200, { id: "s1", version: calls + 1, consumedAnswers: body.consumedAnswers });
  };

  const writer = new GuidedFlowAnswerWriter(fetchFn, { id: "s1", version: 1 }, { route: "14.6" });
  const first = await writer.enqueue({
    localBaseAnswers: { route: "14.6" },
    attemptedAnswers: { route: "16" },
  });
  check("first same-key edit persists normally", first.persisted && first.answers.route === "16", JSON.stringify(first));

  // Simulate a queued edit that was authored from the old local base. By the
  // time it reaches the queue head, canonical state is already 16.
  const second = await writer.enqueue({
    localBaseAnswers: { route: "14.6" },
    attemptedAnswers: { route: "18" },
  });
  check("queued stale same-key edit is surfaced as conflict", second.conflictKeys.includes("route"), JSON.stringify(second));
  check("queued stale same-key edit keeps canonical value", second.answers.route === "16", JSON.stringify(second));
  check("preflight same-key conflict does not make another HTTP write", calls === 1, String(calls));
}

async function run() {
  await queuedLocalEditsPreserveRemoteState();
  await queuedSameKeyConflictStopsBeforeNetwork();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
