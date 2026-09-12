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

  async function go(key: string) {
    setPending(true);
    try {
      await fetch("/api/admin/setup/progress", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentStage: key }),
      });
      router.push(`/dashboard/setup?stage=${key}`);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  const index = stageKeys.indexOf(current);
  const prevKey = index > 0 ? stageKeys[index - 1] : null;
  const nextKey = index >= 0 && index < stageKeys.length - 1 ? stageKeys[index + 1] : null;
  const currentStep = steps.find((step) => step.key === current);

  return (
    <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
      <div className="border-b border-cardline bg-warmwhite/60 px-4 py-3 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-electric">Guided setup</p>
            <p className="mt-1 text-sm font-semibold text-navy">
              Step {Math.max(index + 1, 1)} of {stageKeys.length}
              {currentStep?.title ? <span className="font-normal text-slate"> · {currentStep.title}</span> : null}
            </p>
          </div>
          <p className="text-xs text-slate">Your progress is saved as you move between steps.</p>
        </div>
      </div>

      <div className="px-4 py-4 sm:px-5">
        <Stepper steps={steps} onSelect={go} />
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-cardline bg-white px-4 py-3 sm:px-5">
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
  );
}
