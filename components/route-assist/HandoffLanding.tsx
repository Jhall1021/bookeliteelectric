"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import RouteAssistCapture from "./RouteAssistCapture";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import {
  completeDeviceHandoff,
  completeVisualAssistTask,
  resolveDeviceHandoff,
  type ResolvedHandoff,
} from "@/lib/routeAssistHandoffClient";
import { getRouteAssistCaptureContextByTaskKey } from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

/**
 * What a scanned Device Handoff QR code lands on — the phone's side of
 * docs/design/guided-flow-session-v1.md's cross-device flow. Resolves the
 * opaque token (never anything identifying in the URL itself — that's
 * `lib/device-handoff/token.ts`'s own structural guarantee), and on
 * success becomes a genuine second holder of the same anonymous session
 * (the resolve API sets this browser's own session cookie), then renders
 * the exact same capture UI a same-device customer would see.
 */
type Props = { token: string; uploadPhoto: (file: File) => Promise<string> };

type State =
  | { kind: "resolving" }
  | { kind: "invalid" }
  | { kind: "ready"; handoff: ResolvedHandoff }
  | { kind: "done"; continuationPath: string };

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
        const completion = await completeVisualAssistTask(
          siteFetch,
          handoff.guidedFlowSessionId,
          handoff.taskId,
          result
        );
        // The endpoint returns the persisted first-winner result to every
        // caller. We do not need to use its value on the phone yet (the desktop
        // reads the canonical task), but we DO require that a canonical result
        // exists before declaring this handoff complete.
        if (completion.status !== "COMPLETED" || !completion.result) {
          throw new Error("Route Assist task did not complete");
        }
      }

      await completeDeviceHandoff(siteFetch, handoff.handoffId);
      setState({ kind: "done", continuationPath: handoff.continuationPath });
    } catch {
      // Leave the capture visible so the homeowner can retry confirmation. Do
      // not tell the desktop TASK_COMPLETED when canonical task persistence is
      // uncertain — that would let the two devices disagree about the route.
      setCompletionError("We couldn't save the route yet. Please try confirming it again.");
    }
  }

  if (state.kind === "resolving") {
    return <p className="mx-auto mt-16 max-w-md text-center text-slate-500">Connecting…</p>;
  }

  if (state.kind === "invalid") {
    // Neutral, per docs/design/device-handoff-v1.md's security section —
    // never distinguishes expired/revoked/wrong-token from here.
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

    /**
     * Real Guided Flow invocations create the task with a CAPTURE taskKey.
     * That key is intentionally independent of question identity: one surface
     * scan can feed feet + inside + outside + flat questions. Reconstruct only
     * capture context by searching every registry invocation that shares this
     * task identity and fail closed if they disagree.
     *
     * Null is retained only for the older dev fixture/legacy task shape that
     * predates taskKey; it keeps that generic cross-device mechanism proof
     * working without weakening keyed production handoffs.
     */
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
        <RouteAssistCapture
          destinationType={resolvedContext.destinationType}
          sourceHint={resolvedContext.sourceHint}
          destinationHint={resolvedContext.destinationHint}
          onUploadPhoto={uploadPhoto}
          onComplete={(result) => handleComplete(state.handoff, result)}
        />
        {completionError && (
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-red-600">{completionError}</p>
        )}
      </div>
    );
  }

  // done — the resolve endpoint already joined this phone to the desktop's
  // anonymous session. Navigating into the ordinary service page therefore
  // resumes the SAME Guided Flow via findOrCreateActiveSession(); there is no
  // second mobile flow and no transfer payload to reconcile.
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium text-emerald-700">Route added ✓</p>
      <p className="text-sm text-slate-600">How would you like to continue?</p>
      <button
        type="button"
        onClick={() => router.push(`${base}/${state.continuationPath}`)}
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
        <p className="text-xs text-slate-500">
          You can close this tab — your computer will update automatically.
        </p>
      )}
    </div>
  );
}
