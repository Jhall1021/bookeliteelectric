"use client";

import { useState } from "react";
import RouteAssistWithHandoff from "./RouteAssistWithHandoff";
import { getRouteAssistInvocation } from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import { uploadPhoto } from "@/lib/upload";
import type { AnswerOptionDTO, QuestionDTO } from "@/lib/flow-types";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

/**
 * The ONLY place GuidedFlow rendering touches Route Assist — and even here,
 * it doesn't know which service or question is involved. `GuidedFlowEngine`
 * renders this unconditionally next to every question; whether anything
 * appears is entirely decided by `getRouteAssistInvocation` (lib/visual-
 * assist/route-assist/guidedFlowInvocation.ts), a plain data lookup. Adding
 * a second service's invocation means adding an entry there, never a
 * conditional here or in QuestionStep.
 *
 * Optional and additive: the existing distance question (or whichever
 * question a future entry targets) renders exactly as before, unaffected,
 * whether or not the customer ever opens this.
 */
type Props = {
  serviceSlug: string;
  question: QuestionDTO;
  guidedFlowSessionId: string | null;
  onResolved: (option: AnswerOptionDTO) => void;
};

/**
 * A width of 0 means "not actually rendered yet" (a hidden pane, a
 * not-yet-laid-out frame) rather than "narrow" — treated as unknown, which
 * defaults to the desktop/handoff path. A wrong "mobile" guess strands a
 * desktop customer at a capture screen with no camera; a wrong "desktop"
 * guess just shows an actual phone a QR code, which still works.
 */
function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth;
  return width > 0 && width < 640;
}

export default function RouteAssistQuestionAssist({ serviceSlug, question, guidedFlowSessionId, onResolved }: Props) {
  const [open, setOpen] = useState(false);
  const [unusable, setUnusable] = useState(false);

  const invocation = getRouteAssistInvocation(serviceSlug, question.key);
  if (!invocation || !guidedFlowSessionId) return null;

  function handleComplete(result: RouteAssistResult) {
    setOpen(false);
    // The task/result is already persisted by RouteAssistWithHandoff
    // regardless of what happens next — contractor context survives even
    // when nothing here can safely use it.
    const value = invocation!.resolveAnswerValue(result);
    if (value === null) {
      setUnusable(true);
      return;
    }
    // The mapping's contract is "one of this question's real values" —
    // resolved against the ACTUAL tree here, never assumed. A mismatch
    // (a configuration error, not a customer-facing one) falls back to
    // manual rather than guessing.
    const option = question.options.find((o) => o.value === value);
    if (!option) {
      setUnusable(true);
      return;
    }
    setUnusable(false);
    onResolved(option);
  }

  if (!open) {
    return (
      <div className="mt-3 text-center">
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-electric hover:underline">
          {invocation.actionLabel}
        </button>
        {unusable && (
          <p className="mt-2 text-sm text-slate-500">
            That measurement wasn't clear enough to answer automatically. Pick the option above that's closest, or try again.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="mt-4">
      <RouteAssistWithHandoff
        guidedFlowSessionId={guidedFlowSessionId}
        taskKey={invocation.taskKey}
        autoStart={isMobileViewport() ? "capture-here" : "handoff"}
        destinationType={invocation.destinationType}
        sourceHint={invocation.sourceHint}
        destinationHint={invocation.destinationHint}
        onUploadPhoto={uploadPhoto}
        onComplete={handleComplete}
      />
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="mt-2 w-full text-center text-xs text-slate-500 hover:underline"
      >
        Cancel — answer the question above instead
      </button>
    </div>
  );
}
