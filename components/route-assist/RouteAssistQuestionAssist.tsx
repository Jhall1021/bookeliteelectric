"use client";

import { useEffect, useRef, useState } from "react";
import RouteAssistWithHandoff from "./RouteAssistWithHandoff";
import { getRouteAssistInvocation } from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import { listVisualAssistTasks } from "@/lib/routeAssistHandoffClient";
import { uploadPhoto } from "@/lib/upload";
import { selectNumericOption } from "@/lib/numericRouteRanges";
import { useSiteFetch } from "@/components/site/SiteContext";
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
  const siteFetch = useSiteFetch();
  const [open, setOpen] = useState(false);
  const [unusable, setUnusable] = useState(false);
  const consumedTaskRef = useRef<string | null>(null);

  const invocation = getRouteAssistInvocation(serviceSlug, question.key);

  function handleComplete(result: RouteAssistResult) {
    setOpen(false);
    if (!invocation) return;

    // The task/result is already persisted by RouteAssistWithHandoff
    // regardless of what happens next — contractor context survives even
    // when nothing here can safely use it.
    const value = invocation.resolveAnswerValue(result);
    if (value === null) {
      setUnusable(true);
      return;
    }

    // NUMBER questions do not author one option per possible numeric value.
    // They carry routing options (often a single `__number__` sentinel, or
    // explicit numeric ranges), while the customer's typed/measured number is
    // the answer value. Resolve Route Assist through the SAME numeric selector
    // QuestionStep and the server use, then substitute the measured value just
    // as QuestionStep does. That keeps one routing authority and lets measured
    // footage survive as footage rather than being mistaken for an option id.
    if (question.inputType === "NUMBER") {
      const choice = selectNumericOption(question, value);
      if (choice.kind !== "option") {
        setUnusable(true);
        return;
      }
      setUnusable(false);
      onResolved({ ...choice.option, value });
      return;
    }

    // Non-numeric mappings still resolve to one of the question's real authored
    // option values. A mismatch is a configuration error, not something to
    // guess through.
    const option = question.options.find((o) => o.value === value);
    if (!option) {
      setUnusable(true);
      return;
    }
    setUnusable(false);
    onResolved(option);
  }

  // A completed capture can answer more than one later question when the
  // registry deliberately gives those questions the same taskKey. Reuse that
  // ONE persisted RouteAssistResult instead of asking the homeowner to reopen
  // the camera. Each question still applies its own resolveAnswerValue, so
  // sharing a capture never means sharing an answer or inventing a fact.
  useEffect(() => {
    consumedTaskRef.current = null;
    setOpen(false);
    setUnusable(false);
  }, [serviceSlug, question.key, invocation?.taskKey]);

  useEffect(() => {
    if (!invocation || !guidedFlowSessionId) return;
    let cancelled = false;

    listVisualAssistTasks(siteFetch, guidedFlowSessionId)
      .then((tasks) => {
        if (cancelled) return;
        const completed = tasks.find(
          (t) =>
            t.taskType === "ROUTE_ASSIST" &&
            t.taskKey === invocation.taskKey &&
            t.status === "COMPLETED" &&
            !!t.result
        );
        if (!completed?.result || consumedTaskRef.current === completed.id) return;
        consumedTaskRef.current = completed.id;
        handleComplete(completed.result);
      })
      .catch(() => {
        // Reuse is an optimization, never a dependency. If the task list can't
        // be read, the ordinary question and explicit Route Assist button stay.
      });

    return () => {
      cancelled = true;
    };
    // `handleComplete` intentionally follows the currently rendered question;
    // question.key/taskKey are the dependencies that define that identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedFlowSessionId, serviceSlug, question.key, invocation?.taskKey, siteFetch]);

  if (!invocation || !guidedFlowSessionId) return null;

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
