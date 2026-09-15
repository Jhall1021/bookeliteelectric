"use client";

import { useEffect, useRef, useState } from "react";
import { toDataURL as qrToDataURL } from "qrcode";
import RouteAssistSmartCapture from "./RouteAssistSmartCapture";
import { useSiteFetch } from "@/components/site/SiteContext";
import {
  completeVisualAssistTask,
  createDeviceHandoff,
  createVisualAssistTask,
  getDeviceHandoffStatus,
  listVisualAssistTasks,
} from "@/lib/routeAssistHandoffClient";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

type Props = {
  guidedFlowSessionId: string;
  destinationType: RouteAssistDestinationType;
  sourceHint: string;
  destinationHint: string;
  onUploadPhoto: (file: File) => Promise<string>;
  onComplete: (result: RouteAssistResult) => void;
  taskKey?: string;
  autoStart?: "capture-here" | "handoff";
  /** Surface questions can use the visible room-scan proposal; concealed questions cannot. */
  expectedMode?: "SURFACE" | "CONCEALED" | null;
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
  expectedMode = null,
}: Props) {
  const siteFetch = useSiteFetch();
  const [step, setStep] = useState<Step>({ kind: "choice" });
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startingRef = useRef(false);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

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
        startingRef.current = true;
        setStep({ kind: "capture-here", taskId: mine.id });
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedFlowSessionId, taskKey]);

  async function persistAndComplete(taskId: string, result: RouteAssistResult) {
    setError(null);
    try {
      const completion = await completeVisualAssistTask(siteFetch, guidedFlowSessionId, taskId, result);
      if (completion.status === "COMPLETED" && completion.result) {
        onComplete(completion.result);
        return;
      }
    } catch {
      // A write can succeed even if its response is lost; read the canonical row once below.
    }

    try {
      const tasks = await listVisualAssistTasks(siteFetch, guidedFlowSessionId);
      const current = tasks.find((task) => task.id === taskId && task.status === "COMPLETED" && task.result);
      if (current?.result) {
        onComplete(current.result);
        return;
      }
    } catch {
      // Visible retry below.
    }
    setError("We couldn't save this route yet. Please try confirming it again.");
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
                : prev,
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
          // Transient polling failure: next tick retries.
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
        <button type="button" onClick={startCaptureHere} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Open camera</button>
        <button type="button" onClick={startHandoff} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800">Continue on your phone</button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  if (step.kind === "capture-here") {
    return (
      <div>
        <RouteAssistSmartCapture
          guidedFlowSessionId={guidedFlowSessionId}
          taskId={step.taskId}
          destinationType={destinationType}
          sourceHint={sourceHint}
          destinationHint={destinationHint}
          onUploadPhoto={onUploadPhoto}
          onComplete={(result) => persistAndComplete(step.taskId, result)}
          expectedMode={expectedMode}
        />
        {error && <p className="mx-auto mt-3 max-w-md text-center text-sm text-red-600">{error}</p>}
      </div>
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

  return (
    <div className="mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <p className="text-sm font-medium text-emerald-700">Route received ✓</p>
      <button type="button" onClick={() => onComplete(step.result)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Continue</button>
    </div>
  );
}
