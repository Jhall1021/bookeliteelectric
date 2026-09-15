/**
 * Thin client-side wrappers over the canonical GuidedFlowSession / Device
 * Handoff API — app/api/guided-flow-sessions/*, app/api/device-handoffs/*
 * (docs/design/guided-flow-session-v1.md). No new persistence format: this
 * module reads and writes exactly those endpoints, nothing else.
 *
 * Takes a `fetchFn` (the caller's `useSiteFetch()` result, or plain
 * `fetch`) rather than importing one, so this stays usable from any
 * context — a component, the handoff landing page, a script — without a
 * hard dependency on `SiteContext`.
 */

import type {
  DeviceHandoffTaskType,
  VisualAssistTaskType,
} from "@prisma/client";
import type { RouteAssistResult } from "./visual-assist/route-assist/types";

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>;

export type GuidedFlowVisualAssistTaskDTO = {
  id: string;
  taskType: string;
  taskKey: string | null;
  status: "PENDING" | "COMPLETED";
  result: RouteAssistResult | null;
  completedAt: string | null;
};

async function asJson<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.error ?? `Request failed: ${res.status}`);
  return body as T;
}

export async function createVisualAssistTask(
  fetchFn: FetchFn,
  guidedFlowSessionId: string,
  taskType: VisualAssistTaskType,
  taskKey?: string
): Promise<{ id: string; taskType: string; status: string }> {
  const res = await fetchFn(`/api/guided-flow-sessions/${guidedFlowSessionId}/visual-assist-tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ taskType, taskKey }),
  });
  return asJson(res);
}

export async function listVisualAssistTasks(
  fetchFn: FetchFn,
  guidedFlowSessionId: string
): Promise<GuidedFlowVisualAssistTaskDTO[]> {
  const res = await fetchFn(`/api/guided-flow-sessions/${guidedFlowSessionId}/visual-assist-tasks`);
  const body = await asJson<{ tasks: GuidedFlowVisualAssistTaskDTO[] }>(res);
  return body.tasks;
}

/**
 * Read the canonical answer map before a completed grouped capture auto-fills a
 * later question. If the stored answer differs from the scan-derived value, the
 * stored answer is newer/more specific intent and Route Assist must not replace
 * it merely because an older capture still exists.
 */
export async function getGuidedFlowAnswerSnapshot(
  fetchFn: FetchFn,
  guidedFlowSessionId: string
): Promise<Record<string, string>> {
  const res = await fetchFn(`/api/guided-flow-sessions/${guidedFlowSessionId}`);
  const body = await asJson<{ consumedAnswers?: Record<string, string> | null }>(res);
  return body.consumedAnswers ?? {};
}

export type VisualAssistTaskCompletion = {
  id: string;
  status: string;
  /** True only for the request that performed PENDING -> COMPLETED. */
  accepted: boolean;
  /**
   * The persisted first-winner result. A losing/retried caller MUST use this
   * rather than the result it happened to submit locally.
   */
  result: RouteAssistResult | null;
};

export async function completeVisualAssistTask(
  fetchFn: FetchFn,
  guidedFlowSessionId: string,
  taskId: string,
  result: RouteAssistResult
): Promise<VisualAssistTaskCompletion> {
  const res = await fetchFn(`/api/guided-flow-sessions/${guidedFlowSessionId}/visual-assist-tasks/${taskId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ result }),
  });
  return asJson(res);
}

export async function createDeviceHandoff(
  fetchFn: FetchFn,
  guidedFlowSessionId: string,
  taskType: DeviceHandoffTaskType,
  taskId?: string
): Promise<{ id: string; url: string; expiresAt: string }> {
  const res = await fetchFn("/api/device-handoffs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ guidedFlowSessionId, taskType, taskId }),
  });
  return asJson(res);
}

export type DesktopHandoffStatus =
  | "WAITING_FOR_PHONE"
  | "PHONE_CONNECTED"
  | "TASK_COMPLETED"
  | "HANDOFF_EXPIRED"
  | "HANDOFF_REVOKED";

export async function getDeviceHandoffStatus(fetchFn: FetchFn, handoffId: string): Promise<DesktopHandoffStatus> {
  const res = await fetchFn(`/api/device-handoffs/${handoffId}/status`);
  const body = await asJson<{ status: DesktopHandoffStatus }>(res);
  return body.status;
}

export async function completeDeviceHandoff(fetchFn: FetchFn, handoffId: string): Promise<void> {
  const res = await fetchFn(`/api/device-handoffs/${handoffId}/complete`, { method: "POST" });
  await asJson<{ id?: string; status?: string }>(res);
}

export type ResolvedHandoff = {
  guidedFlowSessionId: string;
  serviceSlug: string;
  /** Canonical path relative to the current storefront base. */
  continuationPath: string;
  taskType: string;
  taskId: string | null;
  taskKey: string | null;
  handoffId: string;
};

export async function resolveDeviceHandoff(fetchFn: FetchFn, token: string): Promise<ResolvedHandoff | null> {
  const res = await fetchFn(`/api/device-handoffs/resolve?token=${encodeURIComponent(token)}`);
  if (!res.ok) return null;
  return res.json();
}
