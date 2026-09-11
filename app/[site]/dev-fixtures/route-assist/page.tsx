"use client";

import { useEffect, useRef, useState } from "react";
import RouteAssistCapture from "@/components/route-assist/RouteAssistCapture";
import RouteAssistWithHandoff from "@/components/route-assist/RouteAssistWithHandoff";
import { contractorSummary } from "@/lib/visual-assist/route-assist";
import type { RouteAssistResult } from "@/lib/visual-assist/route-assist/types";
import type { RouteAssistDestinationType } from "@/lib/visual-assist/route-assist/taxonomy";
import { useSiteFetch } from "@/components/site/SiteContext";

/**
 * A test fixture, not a product route — Route Assist isn't wired into any
 * real booking tree yet (docs/design/route-assist-v1.md §1.4). This page
 * exists so `RouteAssistCapture` (and, with `?mode=handoff`,
 * `RouteAssistWithHandoff`'s real cross-device flow) can be driven by a
 * human or a script without waiting on that integration.
 *
 *   ?case=surface-receptacle | surface-switch | surface-ceiling-light | concealed
 *   ?mode=handoff&service=<slug>   — exercises the real GuidedFlowSession +
 *                                    Device Handoff path against a real
 *                                    service, instead of the plain
 *                                    single-device capture above.
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

async function fakeUpload(file: File): Promise<string> {
  return URL.createObjectURL(file);
}

function HandoffFixture({ serviceSlug }: { serviceSlug: string }) {
  const siteFetch = useSiteFetch();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [result, setResult] = useState<RouteAssistResult | null>(null);
  // Dev-only guard: React 18 Strict Mode double-invokes effects, and without
  // this, two concurrent first-visit POSTs (no session cookie set yet) each
  // mint their own GuidedFlowSession under a DIFFERENT anonymous session id
  // (lib/session.ts's getOrCreateSessionId is per-request, not locked) —
  // whichever Set-Cookie lands last silently orphans the other session, and
  // anything still holding its id 404s. Fired once per real mount is what a
  // production page already gets from a single, ungoverned effect; this just
  // makes the fixture behave the same way under Strict Mode.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    siteFetch("/api/guided-flow-sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceSlug }),
    })
      .then((r) => r.json())
      .then((body) => setSessionId(body.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serviceSlug]);

  if (result) {
    return (
      <pre data-testid="route-assist-result" className="mx-auto max-w-xl whitespace-pre-wrap rounded-xl bg-white p-4 text-xs">
        {contractorSummary(result)}
      </pre>
    );
  }
  if (!sessionId) return <p className="text-center text-slate-500">Starting session…</p>;
  return (
    <RouteAssistWithHandoff
      guidedFlowSessionId={sessionId}
      destinationType="RECEPTACLE"
      sourceHint="Tap the existing receptacle we'd start from."
      destinationHint="Tap where you'd like the new receptacle."
      onUploadPhoto={fakeUpload}
      onComplete={setResult}
    />
  );
}

export default function RouteAssistFixturePage({
  searchParams,
}: {
  searchParams: { case?: string; mode?: string; service?: string };
}) {
  const caseKey = searchParams.case && CASES[searchParams.case] ? searchParams.case : "surface-receptacle";
  const config = CASES[caseKey];
  const [result, setResult] = useState<RouteAssistResult | null>(null);

  if (searchParams.mode === "handoff") {
    return (
      <main className="min-h-screen bg-slate-100 p-6" data-testid="route-assist-fixture" data-mode="handoff">
        <h1 className="mb-4 text-center text-xl font-bold">Route Assist fixture — cross-device handoff</h1>
        <HandoffFixture serviceSlug={searchParams.service ?? "replace-gfci-outlet"} />
      </main>
    );
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
