"use client";

import { useEffect, useState } from "react";
import RouteAssistCapture from "./RouteAssistCapture";
import RouteAssistPlacementCapture from "./RouteAssistPlacementCapture";
import { useSiteFetch } from "@/components/site/SiteContext";
import {
  completeDeviceHandoff,
  completeVisualAssistTask,
  listVisualAssistTasks,
  resolveDeviceHandoff,
  type ResolvedHandoff,
} from "@/lib/routeAssistHandoffClient";
import {
  getRouteAssistInvocationByTaskKey,
  type RouteAssistQuestionInvocation,
} from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

type Props = { token: string; uploadPhoto: (file: File) => Promise<string> };

type State =
  | { kind: "resolving" }
  | { kind: "invalid" }
  | { kind: "ready"; handoff: ResolvedHandoff; invocation: RouteAssistQuestionInvocation | null }
  | { kind: "done" };

/**
 * Phone side of Device Handoff. The phone recovers the invocation from the
 * task key that the desktop already authorized, so it receives exactly the
 * same destination/capture semantics instead of the old hard-coded outlet
 * hints.
 */
export default function HandoffLanding({ token, uploadPhoto }: Props) {
  const siteFetch = useSiteFetch();
  const [state, setState] = useState<State>({ kind: "resolving" });
  const [continueChoice, setContinueChoice] = useState<"phone" | "desktop" | null>(null);

  useEffect(() => {
    let cancelled = false;
    resolveDeviceHandoff(siteFetch, token)
      .then(async (handoff) => {
        if (!handoff || cancelled) {
          if (!cancelled) setState({ kind: "invalid" });
          return;
        }

        let invocation: RouteAssistQuestionInvocation | null = null;
        if (handoff.taskId) {
          try {
            const tasks = await listVisualAssistTasks(siteFetch, handoff.guidedFlowSessionId);
            const task = tasks.find((candidate) => candidate.id === handoff.taskId);
            invocation = getRouteAssistInvocationByTaskKey(handoff.serviceSlug, task?.taskKey);
          } catch {
            // Fall back to legacy generic Route Assist below. A failure to
            // recover optional display context must not invalidate the handoff.
          }
        }

        if (!cancelled) setState({ kind: "ready", handoff, invocation });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "invalid" });
      });

    return () => {
      cancelled = true;
    };
  }, [siteFetch, token]);

  async function handleComplete(handoff: ResolvedHandoff, result: RouteAssistResult) {
    if (handoff.taskId) {
      await completeVisualAssistTask(siteFetch, handoff.guidedFlowSessionId, handoff.taskId, result).catch(() => {});
    }
    await completeDeviceHandoff(siteFetch, handoff.handoffId).catch(() => {});
    setState({ kind: "done" });
  }

  if (state.kind === "resolving") {
    return <p className="mx-auto mt-16 max-w-md text-center text-slate-500">Connecting…</p>;
  }

  if (state.kind === "invalid") {
    return (
      <div className="mx-auto mt-16 max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-800">This link isn't valid or has expired.</p>
        <p className="mt-2 text-sm text-slate-500">Go back to the computer where you started and generate a new one.</p>
      </div>
    );
  }

  if (state.kind === "ready") {
    if (state.handoff.taskType !== "ROUTE_ASSIST") {
      return <p className="mx-auto mt-16 max-w-md text-center text-slate-500">Nothing to continue here yet.</p>;
    }

    const invocation = state.invocation;
    if (invocation?.captureKind === "PLACEMENT_LAYOUT") {
      return (
        <RouteAssistPlacementCapture
          destinationType={invocation.destinationType}
          sourceHint={invocation.sourceHint}
          placementHint={invocation.placementHint ?? invocation.destinationHint}
          minPlacements={invocation.minPlacements ?? 1}
          maxPlacements={invocation.maxPlacements ?? 1}
          onUploadPhoto={uploadPhoto}
          onComplete={(result) => void handleComplete(state.handoff, result)}
        />
      );
    }

    return (
      <RouteAssistCapture
        destinationType={invocation?.destinationType ?? "OTHER"}
        sourceHint={invocation?.sourceHint ?? "Tap the existing receptacle or control we'd start from."}
        destinationHint={invocation?.destinationHint ?? "Tap where you'd like the new device."}
        onUploadPhoto={uploadPhoto}
        onComplete={(result) => void handleComplete(state.handoff, result)}
      />
    );
  }

  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium text-emerald-700">Capture added ✓</p>
      <p className="text-sm text-slate-600">How would you like to continue?</p>
      <button
        type="button"
        onClick={() => setContinueChoice("phone")}
        className="rounded-xl bg-blue-600 px-4 py-3 text-sm font-semibold text-white"
      >
        Continue on this phone
      </button>
      <button
        type="button"
        onClick={() => setContinueChoice("desktop")}
        className="rounded-xl border border-slate-300 px-4 py-3 text-sm font-semibold text-slate-800"
      >
        Return to my computer
      </button>
      {continueChoice === "desktop" && (
        <p className="text-xs text-slate-500">You can close this tab — your computer will update automatically.</p>
      )}
      {continueChoice === "phone" && (
        <p className="text-xs text-slate-500">
          Your capture is saved to this quote. Return to the original quote screen to continue the existing Guided Pricing flow.
        </p>
      )}
    </div>
  );
}
