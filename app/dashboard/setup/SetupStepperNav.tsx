"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Stepper, type Step } from "@/components/ui/Stepper";
import { Button } from "@/components/ui/Button";

/**
 * Guided Setup's own navigation — the compact stepper plus Back/Continue.
 *
 * MOVING BETWEEN STAGES RECORDS THE RESUME POINT, AND NOTHING ELSE — same
 * contract StageRail.tsx (retired) held: a PATCH to the one sanctioned
 * progress endpoint. Nothing here writes a business fact.
 *
 * NAVIGATES BY URL, NOT ROUTER.REFRESH() ALONE. StageRail's original
 * `fetch(...).then(() => router.refresh())` re-renders the CURRENT route —
 * observed unreliable here even on a clean load (the PATCH lands, current
 * stays stale until an unrelated hard navigation). Pushing `?stage=` is a
 * real URL change, which the App Router always re-fetches for; page.tsx
 * already reads `searchParams.stage` ahead of the stored resume point, so
 * this is not a new read path, just a more reliable way to reach the one
 * that already existed.
 */
export default function SetupStepperNav({
  steps, stageKeys, current,
}: {
  steps: Step[];
  /** Canonical stage order, for Back/Continue's prev/next math. */
  stageKeys: readonly string[];
  current: string;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function go(key: string) {
    setPending(true);
    try {
      await fetch("/api/admin/setup/progress", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
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

  return (
    <div>
      <Stepper steps={steps} onSelect={go} />
      <div className="mt-6 flex items-center justify-between border-t border-cardline pt-4">
        <Button variant="secondary" onClick={() => prevKey && go(prevKey)} disabled={!prevKey || pending}>
          Back
        </Button>
        <Button variant="primary" onClick={() => nextKey && go(nextKey)} disabled={!nextKey || pending}>
          Continue
        </Button>
      </div>
    </div>
  );
}
