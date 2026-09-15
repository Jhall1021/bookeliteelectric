"use client";

import { useEffect, useState } from "react";
import RouteAssistWithHandoff from "./RouteAssistWithHandoff";
import { getRouteAssistInvocation } from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import { uploadPhoto } from "@/lib/upload";
import { useSiteFetch } from "@/components/site/SiteContext";
import type { AnswerOptionDTO, QuestionDTO } from "@/lib/flow-types";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

type Props = {
  serviceSlug: string;
  question: QuestionDTO;
  guidedFlowSessionId: string | null;
  onResolved: (option: AnswerOptionDTO) => void;
};

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth;
  return width > 0 && width < 640;
}

/**
 * Route Assist remains additive to the authored question. Prior answers decide
 * whether the camera experience is appropriate; the existing question is
 * always still available as fallback.
 */
export default function RouteAssistQuestionAssist({
  serviceSlug,
  question,
  guidedFlowSessionId,
  onResolved,
}: Props) {
  const siteFetch = useSiteFetch();
  const [open, setOpen] = useState(false);
  const [unusable, setUnusable] = useState(false);
  const [capturedOnly, setCapturedOnly] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [answersLoaded, setAnswersLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setAnswers({});
    setAnswersLoaded(false);
    setOpen(false);
    setUnusable(false);
    setCapturedOnly(false);

    if (!guidedFlowSessionId) return () => { cancelled = true; };

    // The Guided Flow mirrors answers to this same session asynchronously.
    // Read more than once so a just-completed prior answer (the access answer
    // that made Route Assist eligible) is not lost to a harmless network race.
    const delays = [0, 200, 700];
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (const delay of delays) {
      timers.push(
        setTimeout(() => {
          siteFetch(`/api/guided-flow-sessions/${guidedFlowSessionId}`)
            .then((response) => (response.ok ? response.json() : null))
            .then((body) => {
              if (cancelled || !body) return;
              if (body.consumedAnswers && typeof body.consumedAnswers === "object") {
                setAnswers(body.consumedAnswers as Record<string, string>);
              }
              setAnswersLoaded(true);
            })
            .catch(() => {
              if (!cancelled) setAnswersLoaded(true);
            });
        }, delay)
      );
    }

    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [guidedFlowSessionId, question.key, serviceSlug, siteFetch]);

  const invocation = answersLoaded
    ? getRouteAssistInvocation(serviceSlug, question.key, answers)
    : null;

  if (!invocation || !guidedFlowSessionId) return null;

  function handleComplete(result: RouteAssistResult) {
    setOpen(false);

    if (invocation!.completionMode === "CAPTURE_ONLY") {
      setCapturedOnly(true);
      setUnusable(false);
      return;
    }

    const value = invocation!.resolveAnswerValue(result);
    if (value === null) {
      setUnusable(true);
      return;
    }

    const option = question.options.find((candidate) => candidate.value === value);
    if (!option) {
      setUnusable(true);
      return;
    }

    setUnusable(false);
    setCapturedOnly(false);
    onResolved(option);
  }

  if (!open) {
    return (
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="text-sm font-medium text-electric hover:underline"
        >
          {capturedOnly ? "Update the saved location" : invocation.actionLabel}
        </button>
        {capturedOnly && (
          <p className="mt-2 text-sm text-emerald-700">
            Location saved. Answer the question above to continue your quote.
          </p>
        )}
        {unusable && (
          <p className="mt-2 text-sm text-slate-500">
            That capture wasn't clear enough to answer automatically. Pick the option above that's closest, or try again.
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
        captureKind={invocation.captureKind}
        placementHint={invocation.placementHint}
        minPlacements={invocation.minPlacements}
        maxPlacements={invocation.maxPlacements}
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
