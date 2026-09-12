"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Stepper, type Step } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/Button";

/**
 * Guided Setup's navigation records only the resume point. It never writes a
 * business fact; every stage continues to use its existing owner and writer.
 */
export default function SetupStepperNav({
  steps, stageKeys, current,
}: {
  steps: Step[];
  stageKeys: readonly string[];
  current: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(key: string) {
    if (pending || key === current) return;

    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/setup/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStage: key }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(
          typeof data.error === "string"
            ? data.error
            : "Price2Book couldn't save your setup progress. Try again before leaving this step."
        );
        return;
      }

      router.push(`/dashboard/setup?stage=${key}`);
      router.refresh();
    } catch {
      setError("Price2Book couldn't save your setup progress. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  const index = stageKeys.indexOf(current);
  const prevKey = index > 0 ? stageKeys[index - 1] : null;
  const nextKey = index >= 0 && index < stageKeys.length - 1 ? stageKeys[index + 1] : null;
  const currentStep = steps.find((step) => step.key === current);
  const progress = stageKeys.length > 0 ? Math.round(((Math.max(index, 0) + 1) / stageKeys.length) * 100) : 0;

  return (
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
      <div className="border-b border-cardline bg-warmwhite/60 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-electric">Guided setup</p>
            <p className="mt-1 text-sm font-semibold text-navy">
              Step {Math.max(index + 1, 1)} of {stageKeys.length}
              {currentStep?.title ? <span className="font-normal text-slate"> · {currentStep.title}</span> : null}
            </p>
          </div>
          <p className="text-xs leading-relaxed text-slate sm:max-w-[250px] sm:text-right">Your progress is saved as you move between steps.</p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-cardline" aria-hidden="true">
          <div className="h-full rounded-full bg-electric transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="overflow-x-auto px-4 py-4 sm:overflow-visible sm:px-5">
        <div className="min-w-[620px] sm:min-w-0">
          <Stepper steps={steps} onSelect={go} />
        </div>
      </div>

      <div className="border-t border-cardline bg-white px-4 py-3 sm:px-5">
        {error && (
          <p role="alert" className="mb-3 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </p>
        )}
        <div className="mb-2 text-center text-xs text-slate sm:hidden">
          {pending ? "Saving your place…" : nextKey ? "Continue when this step looks right." : "You’re at the final step."}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:justify-between sm:gap-3">
          <Button variant="secondary" onClick={() => prevKey && go(prevKey)} disabled={!prevKey || pending}>
            Back
          </Button>
          <div className="hidden text-center text-xs text-slate sm:block">
            {pending ? "Saving your place…" : nextKey ? "Continue when this step looks right." : "You’re at the final step."}
          </div>
          <Button variant="primary" onClick={() => nextKey && go(nextKey)} disabled={!nextKey || pending}>
            {pending ? "Saving…" : nextKey ? "Continue" : "Finished"}
          </Button>
        </div>
      </div>
    </div>
  );
}
