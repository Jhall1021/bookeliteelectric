"use client";

import { useEffect, useRef, useState } from "react";
import { toDataURL as qrToDataURL } from "qrcode";
import RouteAssistCapture from "./RouteAssistCapture";
import { useSiteFetch } from "@/components/site/SiteContext";
import {
  completeDeviceHandoff,
  completeVisualAssistTask,
  createDeviceHandoff,
  createVisualAssistTask,
  getDeviceHandoffStatus,
  listVisualAssistTasks,
} from "@/lib/routeAssistHandoffClient";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

/**
 * Desktop→phone entry point for Route Assist — docs/design/
 * guided-flow-session-v1.md's cross-device flow, wired to the real,
 * canonical GuidedFlowSession/Device Handoff API. Not a second persistence
 * format: this component's only job is creating a
 * GuidedFlowVisualAssistTask, optionally a DeviceHandoff pointing at it,
 * and completing the task with RouteAssistCapture's own already-verified
 * RouteAssistResult once the customer confirms — on WHICHEVER device ends
 * up doing the capture.
 *
 * The caller supplies an ALREADY-EXISTING `guidedFlowSessionId` — this
 * component does not create a GuidedFlowSession itself. Deciding WHEN a
 * service's flow reaches this point is a catalog/product question,
 * deliberately still unanswered (route-assist-v1.md §1.4,
 * guided-flow-session-v1.md §10) — this component is the piece that
 * activates once something else has already decided Route Assist is
 * needed.
 */
type Props = {
  guidedFlowSessionId: string;
  destinationType: RouteAssistDestinationType;
  sourceHint: string;
  destinationHint: string;
  onUploadPhoto: (file: File) => Promise<string>;
  onComplete: (result: RouteAssistResult) => void;
  /**
   * Scopes task lookup/creation to ONE logical invocation on this session —
   * e.g. one question in one guided flow. Without it, any ROUTE_ASSIST task
   * on the session looks like "this" one, which is exactly right for the
   * one caller that predates this (the dev fixture, one task per session)
   * and exactly wrong once a real flow could plausibly have more than one
   * invocation. Omitted, behavior is unchanged from before this field.
   */
  taskKey?: string;
  /**
   * Skip the choice screen and start this step immediately on mount — for a
   * caller that has already decided which path makes sense (e.g. a phone
   * viewport shouldn't be asked to scan its own QR code). Omitted, the
   * customer sees both options exactly as before.
   */
  autoStart?: "capture-here" | "handoff";
};

type Step =
  | { kind: "choice" }
  | { kind: "capture-here"; taskId: string }
  | { kind: "handoff-waiting"; taskId: string; handoffId: string; qrDataUrl: string; url: string }
  | { kind: "handoff-connected"; taskId: string; handoffId: string }
  | { kind: "handoff-completed"; result: RouteAssistResult };

const POLL_INTERVAL_MS = 3000;

export default function RouteAssistWithHandoff({
  guidedFlowSessionId,
  destinationType,
  sourceHint,
  destinationHint,
  onUploadPhoto,
  onComplete,
  taskKey,
  autoStart,
}: Props) {
  const siteFetch = useSiteFetch();
  const [step, setStep] = useState<Step>({ kind: "choice" });
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards both React Strict Mode's double-invoke AND a genuine repeated
  // click landing before the first request resolves — either would
  // otherwise create two tasks/handoffs for one customer action.
  const startingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // Resume, not just "was it already finished": a task for THIS invocation
  // (taskKey-scoped, when given) that's still PENDING means a prior attempt
  // was interrupted (reload, closed tab) — reusing it, rather than starting
  // a fresh one, is what keeps a resume from ever creating a duplicate.
  useEffect(() => {
    listVisualAssistTasks(siteFetch, guidedFlowSessionId)
      .then((tasks) => {
        const mine = tasks.find((t) => t.taskType === "ROUTE_ASSIST" && (taskKey === undefined || t.taskKey === taskKey));
        if (!mine) {
          if (autoStart === "capture-here") startCaptureHere();
          else if (autoStart === "handoff") startHandoff();
          return;
        }
        if (mine.status === "COMPLETED" && mine.result) {
          setStep({ kind: "handoff-completed", result: mine.result });
          return;
        }
        // PENDING: reuse the existing task directly rather than create a
        // second one. Same-device capture always resolves this correctly;
        // it does mean a desktop resuming mid-QR-wait finishes via capture
        // here instead of a regenerated QR — an acceptable trade for never
        // duplicating a task, and the phone's own in-flight attempt (if
        // any) still completes this exact task normally either way.
        startingRef.current = true;
        setStep({ kind: "capture-here", taskId: mine.id });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedFlowSessionId, taskKey]);

  async function persistAndComplete(taskId: string, result: RouteAssistResult) {
    await completeVisualAssistTask(siteFetch, guidedFlowSessionId, taskId, result).catch(() => {
      // Best effort — the customer still sees their result even if the
      // write to the session failed; a returning device just won't see it.
    });
    onComplete(result);
  }

  async function startCaptureHere() {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const task = await createVisualAssistTask(siteFetch, guidedFlowSessionId, "ROUTE_ASSIST", taskKey);
      setStep({ kind: "capture-here", taskId: task.id });
    } catch {
      setError("Couldn't start Route Assist. Try again.");
      startingRef.current = false;
    }
  }

  async function startHandoff() {
    if (startingRef.current) return;
    startingRef.current = true;
    setError(null);
    try {
      const task = await createVisualAssistTask(siteFetch, guidedFlowSessionId, "ROUTE_ASSIST", taskKey);
      const handoff = await createDeviceHandoff(siteFetch, guidedFlowSessionId, "ROUTE_ASSIST", task.id);
      const qrDataUrl = await qrToDataURL(handoff.url, { margin: 1, width: 280 });
      setStep({ kind: "handoff-waiting", taskId: task.id, handoffId: handoff.id, qrDataUrl, url: handoff.url });

      pollRef.current = setInterval(async () => {
        try {
          const status = await getDeviceHandoffStatus(siteFetch, handoff.id);
          if (status === "PHONE_CONNECTED") {
            setStep((prev) =>
              prev.kind === "handoff-waiting" || prev.kind === "handoff-connected"
                ? { kind: "handoff-connected", taskId: task.id, handoffId: handoff.id }
                : prev
            );
          } else if (status === "TASK_COMPLETED") {
            if (pollRef.current) clearInterval(pollRef.current);
            const tasks = await listVisualAssistTasks(siteFetch, guidedFlowSessionId);
            const done = tasks.find((t) => t.id === task.id);
            if (done?.result) setStep({ kind: "handoff-completed", result: done.result });
          } else if (status === "HANDOFF_EXPIRED" || status === "HANDOFF_REVOKED") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError("That QR code expired. Generate a new one.");
            startingRef.current = false;
            setStep({ kind: "choice" });
          }
        } catch {
          // A transient polling failure isn't shown to the customer — the
          // next tick tries again.
        }
      }, POLL_INTERVAL_MS);
    } catch {
      setError("Couldn't create a handoff link. Try again, or capture here instead.");
      startingRef.current = false;
    }
  }

  if (step.kind === "choice") {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Show us the route</h2>
        <p className="text-sm text-slate-600">This step uses your camera.</p>
        <button
          type="button"
          onClick={startCaptureHere}
          className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
        >
          Open camera
        </button>
        <button
          type="button"
          onClick={startHandoff}
          className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800"
        >
          Continue on your phone
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (step.kind === "capture-here") {
    return (
      <RouteAssistCapture
        destinationType={destinationType}
        sourceHint={sourceHint}
        destinationHint={destinationHint}
        onUploadPhoto={onUploadPhoto}
        onComplete={(result) => persistAndComplete(step.taskId, result)}
      />
    );
  }

  if (step.kind === "handoff-waiting" || step.kind === "handoff-connected") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Continue on your phone</h2>
        {step.kind === "handoff-connected" ? (
          <p className="text-sm font-medium text-emerald-700">Connected to your phone ✓</p>
        ) : (
          <>
            <p className="text-sm text-slate-600">Scan the QR code to continue.</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={(step as Extract<Step, { kind: "handoff-waiting" }>).qrDataUrl} alt="QR code to continue on your phone" width={280} height={280} />
          </>
        )}
        <p className="text-xs text-slate-500">Your quote will stay open here.</p>
      </div>
    );
  }

  // handoff-completed
  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-emerald-700">Route received ✓</p>
      <button
        type="button"
        onClick={() => onComplete(step.result)}
        className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
      >
        Continue
      </button>
    </div>
  );
}
