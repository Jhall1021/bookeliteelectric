"use client";

import { useEffect, useRef, useState } from "react";
import RouteAssistWithHandoff from "./RouteAssistWithHandoff";
import { getRouteAssistInvocation } from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import { decideRouteAssistGroupedReuse } from "@/lib/visual-assist/route-assist/groupedReuse";
import { getGuidedFlowAnswerSnapshot, listVisualAssistTasks } from "@/lib/routeAssistHandoffClient";
import { useSiteFetch } from "@/components/site/SiteContext";
import { uploadPhoto } from "@/lib/upload";
import { selectNumericOption } from "@/lib/numericRouteRanges";
import type { AnswerOptionDTO, QuestionDTO } from "@/lib/flow-types";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";

type Props = {
  serviceSlug: string;
  question: QuestionDTO;
  guidedFlowSessionId: string | null;
  currentAnswer?: string;
  onResolved: (option: AnswerOptionDTO) => void;
};

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  const width = window.innerWidth;
  return width > 0 && width < 640;
}

function expectedModeForQuestion(questionKey: string): "SURFACE" | "CONCEALED" | null {
  if (questionKey.startsWith("surface_")) return "SURFACE";
  if (questionKey === "concealed_route_feet") return "CONCEALED";
  return null;
}

function autoUseMarker(sessionId: string, taskKey: string, questionKey: string): string {
  return `p2b:route-assist:auto-used:v1:${sessionId}:${taskKey}:${questionKey}`;
}
function storedMarkerExists(key: string): boolean { try { return sessionStorage.getItem(key) === "1"; } catch { return false; } }
function persistMarker(key: string): void { try { sessionStorage.setItem(key, "1"); } catch {} }

export default function RouteAssistQuestionAssist({ serviceSlug, question, guidedFlowSessionId, currentAnswer, onResolved }: Props) {
  const siteFetch = useSiteFetch();
  const [open, setOpen] = useState(false);
  const [unusable, setUnusable] = useState(false);
  const autoAttemptedRef = useRef<string | null>(null);
  const autoUsedRef = useRef<Set<string>>(new Set());
  const invocation = getRouteAssistInvocation(serviceSlug, question.key);

  useEffect(() => { setOpen(false); setUnusable(false); }, [question.id]);

  function alreadyAutoUsed(marker: string): boolean {
    if (autoUsedRef.current.has(marker)) return true;
    if (!storedMarkerExists(marker)) return false;
    autoUsedRef.current.add(marker); return true;
  }
  function markAutoUsed(marker: string): void { autoUsedRef.current.add(marker); persistMarker(marker); }

  function resolveForCurrentQuestion(result: RouteAssistResult, markAsAutoUsed: boolean): boolean {
    if (!invocation || !guidedFlowSessionId) return false;
    const value = invocation.resolveAnswerValue(result);
    if (value === null) { setUnusable(true); return false; }

    let resolved: AnswerOptionDTO | null = null;
    if (question.inputType === "NUMBER") {
      const choice = selectNumericOption(question, value);
      if (choice.kind === "option") resolved = { ...choice.option, value };
    } else {
      resolved = question.options.find((option) => option.value === value) ?? null;
    }
    if (!resolved) { setUnusable(true); return false; }
    if (markAsAutoUsed) markAutoUsed(autoUseMarker(guidedFlowSessionId, invocation.taskKey, question.key));
    setUnusable(false); onResolved(resolved); return true;
  }

  useEffect(() => {
    if (!invocation || !guidedFlowSessionId || open) return;
    const marker = autoUseMarker(guidedFlowSessionId, invocation.taskKey, question.key);
    if (alreadyAutoUsed(marker) || autoAttemptedRef.current === marker) return;
    autoAttemptedRef.current = marker;

    let cancelled = false;
    Promise.all([
      listVisualAssistTasks(siteFetch, guidedFlowSessionId),
      getGuidedFlowAnswerSnapshot(siteFetch, guidedFlowSessionId),
    ])
      .then(([tasks, persistedAnswers]) => {
        if (cancelled) return;
        const completed = tasks.find((task) => task.taskType === "ROUTE_ASSIST" && task.taskKey === invocation.taskKey && task.status === "COMPLETED" && task.result);
        if (!completed?.result) return;
        const scanValue = invocation.resolveAnswerValue(completed.result);
        const answerToProtect = currentAnswer !== undefined ? currentAnswer : persistedAnswers[question.key];
        const decision = decideRouteAssistGroupedReuse(answerToProtect, scanValue);
        if (decision.kind === "SCAN_UNAVAILABLE") { setUnusable(true); return; }
        if (decision.kind === "PRESERVE_PERSISTED") { markAutoUsed(marker); return; }
        resolveForCurrentQuestion(completed.result, true);
      })
      .catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedFlowSessionId, invocation?.taskKey, question.id, open, currentAnswer]);

  if (!invocation || !guidedFlowSessionId) return null;

  function handleComplete(result: RouteAssistResult) {
    setOpen(false);
    resolveForCurrentQuestion(result, true);
  }

  if (!open) {
    return (
      <div className="mt-3 text-center">
        <button type="button" onClick={() => setOpen(true)} className="text-sm font-medium text-electric hover:underline">{invocation.actionLabel}</button>
        {unusable && <p className="mt-2 text-sm text-slate-500">That measurement wasn't clear enough to answer automatically. Pick the option above that's closest, or try again.</p>}
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
        expectedMode={expectedModeForQuestion(question.key)}
      />
      <button type="button" onClick={() => setOpen(false)} className="mt-2 w-full text-center text-xs text-slate-500 hover:underline">Cancel — answer the question above instead</button>
    </div>
  );
}
