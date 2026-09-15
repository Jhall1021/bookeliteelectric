"use client";

import { useEffect, useRef, useState } from "react";
import RouteAssistWithHandoff from "./RouteAssistWithHandoff";
import { getRouteAssistInvocation } from "@/lib/visual-assist/route-assist/guidedFlowInvocation";
import { decideRouteAssistGroupedReuse } from "@/lib/visual-assist/route-assist/groupedReuse";
import {
  getGuidedFlowAnswerSnapshot,
  listVisualAssistTasks,
} from "@/lib/routeAssistHandoffClient";
import { useSiteFetch } from "@/components/site/SiteContext";
import { uploadPhoto } from "@/lib/upload";
import { selectNumericOption } from "@/lib/numericRouteRanges";
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

/**
 * A completed grouped capture may answer several consecutive canonical
 * questions. Auto-use each answer exactly once in this browser session so the
 * first forward walk is seamless, but Back remains trustworthy: returning to
 * an auto-filled question does NOT immediately bounce forward again.
 *
 * This is UI bookkeeping only. Canonical answers still travel through
 * GuidedFlowEngine's normal `handleAnswer` path and are persisted there.
 */
function autoUseMarker(sessionId: string, taskKey: string, questionKey: string): string {
  return `p2b:route-assist:auto-used:v1:${sessionId}:${taskKey}:${questionKey}`;
}

function storedMarkerExists(key: string): boolean {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function persistMarker(key: string): void {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // The component-level in-memory set still protects Back for this live flow.
    // Storage only carries that protection across a component remount/reload.
  }
}

export default function RouteAssistQuestionAssist({ serviceSlug, question, guidedFlowSessionId, onResolved }: Props) {
  const siteFetch = useSiteFetch();
  const [open, setOpen] = useState(false);
  const [unusable, setUnusable] = useState(false);
  const autoAttemptedRef = useRef<string | null>(null);
  // Always available even when sessionStorage is disabled/unavailable. This is
  // what makes Back safe within the live Guided Flow rather than making that UX
  // depend on browser storage policy.
  const autoUsedRef = useRef<Set<string>>(new Set());

  const invocation = getRouteAssistInvocation(serviceSlug, question.key);

  // A question prop change can reuse this same component instance. UI state
  // belongs to the question, not to the component's position in the tree.
  useEffect(() => {
    setOpen(false);
    setUnusable(false);
  }, [question.id]);

  function alreadyAutoUsed(marker: string): boolean {
    if (autoUsedRef.current.has(marker)) return true;
    if (!storedMarkerExists(marker)) return false;
    // Hydrate the in-memory guard so subsequent Back/forward movement does not
    // keep consulting storage for a marker already established this session.
    autoUsedRef.current.add(marker);
    return true;
  }

  function markAutoUsed(marker: string): void {
    // Set memory FIRST. `onResolved` immediately advances Guided Flow and can
    // synchronously lead to a new render/question before a storage write is of
    // any value. The in-memory guard is therefore the primary same-tab rule.
    autoUsedRef.current.add(marker);
    persistMarker(marker);
  }

  /**
   * Resolve one already-persisted/captured RouteAssistResult through THIS
   * question's authored contract. Returns true only when a real authored option
   * was selected and handed back to Guided Flow.
   */
  function resolveForCurrentQuestion(result: RouteAssistResult, markAsAutoUsed: boolean): boolean {
    if (!invocation || !guidedFlowSessionId) return false;

    // The task/result is already persisted regardless of what happens next —
    // contractor context survives even when nothing here can safely use it.
    const value = invocation.resolveAnswerValue(result);
    if (value === null) {
      setUnusable(true);
      return false;
    }

    let resolved: AnswerOptionDTO | null = null;
    // NUMBER questions do not author one option per possible numeric value.
    // They carry routing options (often a single `__number__` sentinel, or
    // explicit numeric ranges), while the customer's typed/measured number is
    // the answer value. Resolve Route Assist through the SAME numeric selector
    // QuestionStep and the server use, then substitute the measured value just
    // as QuestionStep does.
    if (question.inputType === "NUMBER") {
      const choice = selectNumericOption(question, value);
      if (choice.kind === "option") resolved = { ...choice.option, value };
    } else {
      resolved = question.options.find((option) => option.value === value) ?? null;
    }

    if (!resolved) {
      setUnusable(true);
      return false;
    }

    if (markAsAutoUsed) {
      markAutoUsed(autoUseMarker(guidedFlowSessionId, invocation.taskKey, question.key));
    }
    setUnusable(false);
    onResolved(resolved);
    return true;
  }

  /**
   * GROUPED CAPTURE REUSE.
   *
   * When feet has already opened/completed the shared surface capture, the
   * inside/outside/flat questions should not ask the homeowner to open Route
   * Assist three more times. Reuse the same completed task once per question.
   *
   * Crucially this still calls `onResolved`, i.e. GuidedFlowEngine's normal
   * handleAnswer path. That creates the ordinary history snapshot before each
   * auto-filled question. The marker above then makes Back stop on that
   * question instead of immediately auto-advancing it again.
   *
   * A persisted answer always outranks an older capture when they disagree.
   * This matters after a homeowner uses Back to manually change an auto-filled
   * fact and later reloads/continues on another device: the completed scan still
   * exists, but it may not overwrite the newer manual choice. When the stored
   * answer equals the scan value, reuse is idempotent and can safely bridge the
   * generic NUMBER-resume gap until GuidedFlowEngine adopts the shared replay
   * helper directly.
   */
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
        const completed = tasks.find(
          (task) =>
            task.taskType === "ROUTE_ASSIST" &&
            task.taskKey === invocation.taskKey &&
            task.status === "COMPLETED" &&
            task.result
        );
        if (!completed?.result) return;

        const scanValue = invocation.resolveAnswerValue(completed.result);
        const decision = decideRouteAssistGroupedReuse(persistedAnswers[question.key], scanValue);
        if (decision.kind === "SCAN_UNAVAILABLE") {
          setUnusable(true);
          return;
        }
        if (decision.kind === "PRESERVE_PERSISTED") {
          // Newer/more specific customer intent wins. Mark this question as
          // consumed for the old capture so a remount in this tab does not keep
          // attempting to replace the manual answer.
          markAutoUsed(marker);
          return;
        }

        resolveForCurrentQuestion(completed.result, true);
      })
      .catch(() => {
        // Reuse is an enhancement. A read failure leaves the normal question
        // and its explicit Route Assist button fully usable.
      });

    return () => {
      cancelled = true;
    };
    // `siteFetch` is stable storefront context; resolveForCurrentQuestion is
    // deliberately scoped to the current render/question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [guidedFlowSessionId, invocation?.taskKey, question.id, open]);

  if (!invocation || !guidedFlowSessionId) return null;

  function handleComplete(result: RouteAssistResult) {
    setOpen(false);
    // Mark the question that actually opened/confirmed the capture too. If the
    // customer later presses Back into it, the completed task must not bounce
    // them forward before they can change the answer.
    resolveForCurrentQuestion(result, true);
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
