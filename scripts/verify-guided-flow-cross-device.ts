/**
 * End-to-end HTTP-layer proof for GuidedFlowSession + Device Handoff —
 * docs/design/guided-flow-session-v1.md §9/§15, run against a REAL running
 * dev server and a REAL service in the database (not a fixture). Simulates
 * two separate devices with two independent cookie jars — no browser
 * needed, since the thing being proven is server-side session/concurrency
 * behavior, not UI interaction (that's Route Assist's own
 * verify-route-assist-browser.ts, a different concern).
 *
 * NOT part of `npm run verify` — needs a running dev server and a real
 * contractor/service row, same posture as the other DB-touching scripts.
 *
 *   npx tsx scripts/verify-guided-flow-cross-device.ts \
 *     --base http://localhost:3425 --site <publicId> --service <slug>
 */

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const BASE = arg("base") ?? "http://localhost:3000";
const SITE = arg("site");
const SERVICE_SLUG = arg("service") ?? "replace-gfci-outlet";

if (!SITE) {
  console.error("Usage: --site <publicId> is required (a real ContractorSite.publicId)");
  process.exit(1);
}

let failures = 0;
function check(name: string, cond: boolean, detail?: string) {
  console.log(`  ${cond ? "ok" : "FAIL"} — ${name}${!cond && detail ? `: ${detail}` : ""}`);
  if (!cond) failures++;
}

/** A tiny cookie jar — enough to simulate one browser/device. */
class Device {
  private cookies = new Map<string, string>();
  constructor(readonly label: string) {}

  async call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }> {
    const headers: Record<string, string> = { "x-price2book-site": SITE! };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    }
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: "manual",
    });
    const setCookie = res.headers.get("set-cookie");
    if (setCookie) {
      const [pair] = setCookie.split(";");
      const [k, v] = pair.split("=");
      this.cookies.set(k, v);
    }
    const json = await res.json().catch(() => null);
    return { status: res.status, json };
  }
}

async function main() {
  const desktop = new Device("desktop");
  const phone = new Device("phone");

  console.log("\nSession creation and answer persistence");
  const created = await desktop.call("POST", "/api/guided-flow-sessions", { serviceSlug: SERVICE_SLUG });
  check("desktop creates a session", created.status === 200 && !!created.json?.id, JSON.stringify(created.json));
  const sessionId = created.json.id;

  const write1 = await desktop.call("PATCH", `/api/guided-flow-sessions/${sessionId}`, {
    expectedVersion: created.json.version,
    consumedAnswers: { first_question: "answer_one" },
  });
  check("desktop's first answer persists", write1.status === 200 && write1.json.version === 1, JSON.stringify(write1.json));

  console.log("\nDevice Handoff — QR creation and cross-device join");
  const handoff = await desktop.call("POST", "/api/device-handoffs", {
    guidedFlowSessionId: sessionId,
    taskType: "ROUTE_ASSIST",
  });
  check("desktop creates a handoff", handoff.status === 200 && !!handoff.json?.url, JSON.stringify(handoff.json));
  check(
    "the QR URL carries only an opaque token, no session/task id",
    !/sessionId|taskId|guidedFlowSessionId/i.test(handoff.json.url ?? "")
  );
  const token = (handoff.json.url as string).split("/").pop()!;

  const resolved = await phone.call("GET", `/api/device-handoffs/resolve?token=${token}`);
  check("phone resolves the handoff", resolved.status === 200 && resolved.json.guidedFlowSessionId === sessionId, JSON.stringify(resolved.json));

  console.log("\nConcurrency — the exact scenario from the brief");
  const phoneWrite = await phone.call("PATCH", `/api/guided-flow-sessions/${sessionId}`, {
    expectedVersion: 1,
    consumedAnswers: { first_question: "answer_one", second_question: "phone_advanced_this" },
  });
  check("phone (now joined) advances the session", phoneWrite.status === 200 && phoneWrite.json.version === 2, JSON.stringify(phoneWrite.json));

  const staleDesktopWrite = await desktop.call("PATCH", `/api/guided-flow-sessions/${sessionId}`, {
    expectedVersion: 1, // desktop is still on the OLD version — this is the stale write
    consumedAnswers: { overwritten: "should never land" },
  });
  check("stale desktop write is rejected with 409", staleDesktopWrite.status === 409, JSON.stringify(staleDesktopWrite.json));
  check(
    "the 409 response hands back the phone's newer state, not a bare error",
    staleDesktopWrite.json?.current?.consumedAnswers?.second_question === "phone_advanced_this"
  );

  const afterConflict = await desktop.call("GET", `/api/guided-flow-sessions/${sessionId}`);
  check(
    "the phone's advanced state survived the conflict — nothing lost",
    afterConflict.json?.consumedAnswers?.second_question === "phone_advanced_this"
  );

  console.log("\nRoute Assist task — one canonical result, visible to both devices");
  const taskCreate = await phone.call("POST", `/api/guided-flow-sessions/${sessionId}/visual-assist-tasks`, {
    taskType: "ROUTE_ASSIST",
  });
  check("phone creates a visual-assist task", taskCreate.status === 200, JSON.stringify(taskCreate.json));
  const taskComplete = await phone.call(
    "PATCH",
    `/api/guided-flow-sessions/${sessionId}/visual-assist-tasks/${taskCreate.json.id}`,
    { result: { mode: "SURFACE", estimatedTotalRouteLengthFt: 17 } }
  );
  check("phone completes it with a result", taskComplete.status === 200 && taskComplete.json.status === "COMPLETED");
  const desktopTaskRead = await desktop.call("GET", `/api/guided-flow-sessions/${sessionId}/visual-assist-tasks`);
  check(
    "desktop reads back the SAME canonical result — no separate desktop/mobile copy",
    desktopTaskRead.json?.tasks?.[0]?.result?.estimatedTotalRouteLengthFt === 17
  );

  console.log("\nHandoff completion and safe re-scan");
  const handoffComplete = await phone.call("POST", `/api/device-handoffs/${handoff.json.id}/complete`, {});
  check("phone completes the handoff", handoffComplete.status === 200 && handoffComplete.json.status === "COMPLETED");
  const desktopStatus = await desktop.call("GET", `/api/device-handoffs/${handoff.json.id}/status`);
  check("desktop observes TASK_COMPLETED via polling", desktopStatus.json?.status === "TASK_COMPLETED", JSON.stringify(desktopStatus.json));
  const rescan = await new Device("stranger").call("GET", `/api/device-handoffs/resolve?token=${token}`);
  check("re-scanning the completed handoff still resolves (not an error, not a new task)", rescan.status === 200);

  console.log("\nSecurity — invalid token exposes nothing");
  const invalid = await new Device("attacker").call("GET", "/api/device-handoffs/resolve?token=not-a-real-token");
  check("invalid token fails with a generic 404, no detail", invalid.status === 404 && !JSON.stringify(invalid.json).match(/session|contractor/i));

  console.log(`\n${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(`\n  ${e.message}\n`);
  process.exit(1);
});
