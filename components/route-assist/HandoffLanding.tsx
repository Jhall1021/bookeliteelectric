"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RouteAssistSmartCapture from "./RouteAssistSmartCapture";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import {
  completeDeviceHandoff,
  completeVisualAssistTask,
  resolveDeviceHandoff,
  type ResolvedHandoff,
} from "@/lib/routeAssistHandoffClient";
import { getRouteAssistCaptureContextByTaskKey } from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

type Props = { token: string; uploadPhoto: (file: File) => Promise<string> };
type State =
  | { kind: "resolving" }
  | { kind: "invalid" }
  | { kind: "ready"; handoff: ResolvedHandoff }
  | { kind: "done"; continuationPath: string };

function expectedModeForTaskKey(taskKey: string | null): "SURFACE" | "CONCEALED" | null {
  if (taskKey === "surface_route_capture_v1") return "SURFACE";
  if (taskKey === "concealed_route_feet") return "CONCEALED";
  return null;
}

export default function HandoffLanding({ token, uploadPhoto }: Props) {
  const siteFetch = useSiteFetch();
  const base = useStorefrontBase();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: "resolving" });
  const [continueChoice, setContinueChoice] = useState<"desktop" | null>(null);
  const [completionError, setCompletionError] = useState<string | null>(null);

  useEffect(() => {
    resolveDeviceHandoff(siteFetch, token)
      .then((handoff) => setState(handoff ? { kind: "ready", handoff } : { kind: "invalid" }))
      .catch(() => setState({ kind: "invalid" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function handleComplete(handoff: ResolvedHandoff, result: RouteAssistResult) {
    setCompletionError(null);
    try {
      if (handoff.taskId) {
        const completion = await completeVisualAssistTask(siteFetch, handoff.guidedFlowSessionId, handoff.taskId, result);
        if (completion.status !== "COMPLETED" || !completion.result) throw new Error("Route Assist task did not complete");
      }
      await completeDeviceHandoff(siteFetch, handoff.handoffId);
      setState({ kind: "done", continuationPath: handoff.continuationPath });
    } catch {
      setCompletionError("We couldn't save the route yet. Please try confirming it again.");
    }
  }

  if (state.kind === "resolving") return <p className="mx-auto mt-16 max-w-md text-center text-slate-500">Connecting…</p>;

  if (state.kind === "invalid") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-800">This link isn't valid or has expired.</p>
        <p className="mt-2 text-sm text-slate-500">Go back to the computer where you started and generate a new one.</p>
      </div>
    );
  }

  if (state.kind === "ready") {
    if (state.handoff.taskType !== "ROUTE_ASSIST" || !state.handoff.taskId) {
      return <p className="mx-auto mt-16 max-w-md text-center text-slate-500">Nothing to continue here yet.</p>;
    }

    const captureContext = state.handoff.taskKey
      ? getRouteAssistCaptureContextByTaskKey(state.handoff.serviceSlug, state.handoff.taskKey)
      : null;

    if (state.handoff.taskKey && !captureContext) {
      return (
        <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-medium text-slate-800">We couldn't restore this camera step.</p>
          <p className="mt-2 text-sm text-slate-500">Return to the computer where you started and answer the question there.</p>
        </div>
      );
    }

    const resolvedContext = captureContext ?? {
      destinationType: "OTHER" as const,
      sourceHint: "Tap the existing receptacle we'd start from.",
      destinationHint: "Tap where you'd like the new device.",
    };

    return (
      <div>
        <RouteAssistSmartCapture
          guidedFlowSessionId={state.handoff.guidedFlowSessionId}
          taskId={state.handoff.taskId}
          destinationType={resolvedContext.destinationType}
          sourceHint={resolvedContext.sourceHint}
          destinationHint={resolvedContext.destinationHint}
          onUploadPhoto={uploadPhoto}
          onComplete={(result) => handleComplete(state.handoff, result)}
          expectedMode={expectedModeForTaskKey(state.handoff.taskKey)}
        />
        {completionError && <p className="mx-auto mt-3 max-w-md text-center text-sm text-red-600">{completionError}</p>}
      </div>
    );
  }

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium text-emerald-700">Route added ✓</p>
      <p className="text-sm text-slate-600">How would you like to continue?</p>
      <button type="button" onClick={() => router.push(`${base}/${state.continuationPath}`)} className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white">Continue on this phone</button>
      <button type="button" onClick={() => setContinueChoice("desktop")} className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800">Return to my computer</button>
      {continueChoice === "desktop" && <p className="text-xs text-slate-500">You can close this tab — your computer will update automatically.</p>}
    </div>
  );
}
