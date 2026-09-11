"use client";

import { useEffect, useState } from "react";
import RouteAssistCapture from "./RouteAssistCapture";
import { useSiteFetch } from "@/components/site/SiteContext";
import {
  completeDeviceHandoff,
  completeVisualAssistTask,
  resolveDeviceHandoff,
  type ResolvedHandoff,
} from "@/lib/routeAssistHandoffClient";
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
  | { kind: "done" };

export default function HandoffLanding({ token, uploadPhoto }: Props) {
  const siteFetch = useSiteFetch();
  const [state, setState] = useState<State>({ kind: "resolving" });
  const [continueChoice, setContinueChoice] = useState<"phone" | "desktop" | null>(null);

  useEffect(() => {
    resolveDeviceHandoff(siteFetch, token)
      .then((handoff) => setState(handoff ? { kind: "ready", handoff } : { kind: "invalid" }))
      .catch(() => setState({ kind: "invalid" }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

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
    return (
      <RouteAssistCapture
        destinationType="OTHER"
        sourceHint="Tap the existing receptacle we'd start from."
        destinationHint="Tap where you'd like the new device."
        onUploadPhoto={uploadPhoto}
        onComplete={(result) => handleComplete(state.handoff, result)}
      />
    );
  }

  // done
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
      <p className="text-sm font-medium text-emerald-700">Route added ✓</p>
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
        <p className="text-xs text-slate-500">
          You can close this tab — your computer will update automatically.
        </p>
      )}
      {continueChoice === "phone" && (
        <p className="text-xs text-slate-500">
          Continuing the same quote on this phone isn't wired up yet — that's the next slice, once a service's
          question tree knows how to invoke Route Assist. Your route is already saved either way.
        </p>
      )}
    </div>
  );
}
