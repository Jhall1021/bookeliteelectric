"use client";

import { useState } from "react";
import RouteAssistCapture from "@/components/route-assist/RouteAssistCapture";
import { contractorSummary } from "@/lib/visual-assist/route-assist";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";

/**
 * A test fixture, not a product route — Route Assist isn't wired into any
 * real booking tree yet (docs/design/route-assist-v1.md §1.4). This page
 * exists so `RouteAssistCapture` can be driven by a human or by
 * scripts/verify-route-assist-browser.ts without waiting on that
 * integration. Query params select which of the four proof scenarios
 * (§25 of the Route Assist brief) to present, so the browser script can
 * exercise all four without four separate pages:
 *
 *   ?case=surface-receptacle | surface-switch | surface-ceiling-light | concealed
 */

const CASES: Record<string, { destinationType: RouteAssistDestinationType; sourceHint: string; destinationHint: string }> = {
  "surface-receptacle": {
    destinationType: "RECEPTACLE",
    sourceHint: "Tap the existing receptacle we'd start from.",
    destinationHint: "Tap where you'd like the new receptacle.",
  },
  "surface-switch": {
    destinationType: "SWITCH",
    sourceHint: "Tap the existing receptacle we'd start from.",
    destinationHint: "Tap where you'd like the new switch.",
  },
  "surface-ceiling-light": {
    destinationType: "CEILING_LIGHT",
    sourceHint: "Tap the existing receptacle we'd start from.",
    destinationHint: "Tap where you'd like the new ceiling light.",
  },
  concealed: {
    destinationType: "RECEPTACLE",
    sourceHint: "Tap the existing receptacle we'd start from.",
    destinationHint: "Tap where you'd like the new receptacle.",
  },
};

export default function RouteAssistFixturePage({
  searchParams,
}: {
  searchParams: { case?: string };
}) {
  const caseKey = searchParams.case && CASES[searchParams.case] ? searchParams.case : "surface-receptacle";
  const config = CASES[caseKey];
  const [result, setResult] = useState<RouteAssistResult | null>(null);

  async function fakeUpload(file: File): Promise<string> {
    return URL.createObjectURL(file);
  }

  return (
    <main className="min-h-screen bg-slate-100 p-6" data-testid="route-assist-fixture" data-case={caseKey}>
      <h1 className="mb-4 text-center text-xl font-bold">Route Assist fixture — {caseKey}</h1>
      {!result ? (
        <RouteAssistCapture
          key={caseKey}
          destinationType={config.destinationType}
          sourceHint={config.sourceHint}
          destinationHint={config.destinationHint}
          onUploadPhoto={fakeUpload}
          onComplete={setResult}
        />
      ) : (
        <pre data-testid="route-assist-result" className="mx-auto max-w-xl whitespace-pre-wrap rounded-xl bg-white p-4 text-xs">
          {contractorSummary(result)}
        </pre>
      )}
    </main>
  );
}
