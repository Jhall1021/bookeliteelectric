"use client";

import { useState } from "react";
import RouteAssistPhotoCapture, { type RouteAssistPhotoFirstOutcomeV1 } from "@/components/route-assist/RouteAssistPhotoCapture";

type CompletionEventV1 = { kind: "PHOTO_SUFFICIENT"; outcome: RouteAssistPhotoFirstOutcomeV1 } | { kind: "SWEEP_REQUIRED" };

/**
 * Thin client wrapper around the existing RouteAssistPhotoCapture component
 * for the /dev-fixtures/route-assist-photo-first preview page. Callbacks are
 * deliberately minimal -- they only record which terminal callback fired so
 * it can be shown below the component for debugging, exactly as the task
 * asked. RouteAssistPhotoCapture itself already renders its own resolved-
 * facts/debug panel and per-leg escalation summary; this wrapper adds
 * nothing to that flow.
 */
export default function RouteAssistPhotoFirstPreviewClient() {
  const [completion, setCompletion] = useState<CompletionEventV1 | null>(null);

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-6">
      <div className="mx-auto w-full max-w-md">
        <header className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-[.18em] text-electric">Price2Book</p>
          <h1 className="mt-1 text-2xl font-bold text-navy">Route Assist photo-first preview</h1>
          <p className="mt-2 text-sm leading-6 text-slate">
            Preview-only test harness. Take one photo, tap the existing outlet (A) and the new outlet location (B),
            confirm, then interpret. This does not create pricing, material, or measurement authority.
          </p>
        </header>

        <RouteAssistPhotoCapture
          onComplete={(outcome) => setCompletion({ kind: "PHOTO_SUFFICIENT", outcome })}
          onEscalateToSweep={() => setCompletion({ kind: "SWEEP_REQUIRED" })}
        />

        {completion && (
          <section className="mt-6 rounded-xl border border-cardline bg-white p-4 text-xs text-slate" data-testid="route-assist-photo-first-completion">
            <p className="font-semibold text-navy">Terminal callback fired: {completion.kind}</p>
            {completion.kind === "PHOTO_SUFFICIENT" && (
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-[11px] text-slate-700">
                {JSON.stringify(completion.outcome.legEscalations, null, 2)}
              </pre>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
