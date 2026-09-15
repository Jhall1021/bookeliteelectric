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
  const first = writer.enqueueAnswerEdit("b", "2");
  // This click happens before the first network write necessarily finishes.
  // enqueueAnswerEdit snapshots the writer's canonical state at CLICK time,
  // then enqueue() reconciles that edit again when it reaches the queue head.
  const second = writer.enqueueAnswerEdit("c", "3");

  const firstResult = await first;
  const secondResult = await second;

  check(
    "first stale write merges remote answer and persists the safe local edit",
    firstResult.answers.b === "2" && firstResult.answers.phoneOnly === "yes",
    JSON.stringify(firstResult)
  );
  check(
    "quick second local edit preserves remote answer it never saw at click time",
    secondResult.answers.b === "2" && secondResult.answers.c === "3" && secondResult.answers.phoneOnly === "yes",
    JSON.stringify(secondResult)
  );
  check(
    "second request sent canonical remote state plus the new explicit local edit",
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

async function explicitBackEditCanReplaceEarlierCanonicalAnswer() {
  let calls = 0;
  const fetchFn: GuidedFlowFetch = async (_input, init) => {
    calls++;
    const body = JSON.parse(String(init?.body));
    return response(200, {
      id: "s1",
      version: calls + 2,
      consumedAnswers: body.consumedAnswers,
    });
  };

  // The server already knows route=16. The UI may have moved Back to the
  // question and locally removed that key from its history snapshot, but a new
  // explicit click is still an intentional edit of the canonical answer.
  const writer = new GuidedFlowAnswerWriter(fetchFn, { id: "s1", version: 2 }, { route: "16", prior: "keep" });
  const changed = await writer.enqueueAnswerEdit("route", "18");
  check(
    "an explicit answer after Back can replace the prior canonical value",
    changed.persisted && changed.answers.route === "18" && changed.answers.prior === "keep",
    JSON.stringify(changed)
  );
  check("Back edit required exactly one canonical write", calls === 1, String(calls));
}

async function snapshotIntentPersistsRerouteCarryWithoutInventingAuthority() {
  const requests: Record<string, unknown>[] = [];
  const fetchFn: GuidedFlowFetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    requests.push(body);
    return response(200, {
      id: "s1",
      version: 2,
      consumedAnswers: body.consumedAnswers,
    });
  };

  const writer = new GuidedFlowAnswerWriter(fetchFn, { id: "s1", version: 1 }, { shared: "old" });
  const result = await writer.enqueueSnapshotIntent({ shared: "new", carried_only: "yes" });
  check(
    "bounded reroute carry is expressed as intentional snapshot input",
    result.persisted && result.answers.shared === "new" && result.answers.carried_only === "yes",
    JSON.stringify(result)
  );
  check(
    "snapshot intent preserves unrelated canonical answers while applying carried values",
    requests.length === 1 &&
      (requests[0].consumedAnswers as Record<string, string>)?.shared === "new" &&
      (requests[0].consumedAnswers as Record<string, string>)?.carried_only === "yes",
    JSON.stringify(requests)
  );
}

async function staleQueuedWholeSnapshotStillFailsClosed() {
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

  // Retain the lower-level fail-closed proof for callers that deliberately use
  // enqueue() with an old whole snapshot. UI question clicks should use
  // enqueueAnswerEdit() instead.
  const second = await writer.enqueue({
    localBaseAnswers: { route: "14.6" },
    attemptedAnswers: { route: "18" },
  });
  check("stale queued whole-snapshot edit is surfaced as conflict", second.conflictKeys.includes("route"), JSON.stringify(second));
  check("stale queued whole-snapshot edit keeps canonical value", second.answers.route === "16", JSON.stringify(second));
  check("preflight same-key conflict does not make another HTTP write", calls === 1, String(calls));
}

async function run() {
  await queuedLocalEditsPreserveRemoteState();
  await explicitBackEditCanReplaceEarlierCanonicalAnswer();
  await snapshotIntentPersistsRerouteCarryWithoutInventingAuthority();
  await staleQueuedWholeSnapshotStillFailsClosed();
  console.log(`\n${pass} passed, ${fail} failed\n`);
  process.exit(fail === 0 ? 0 : 1);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
