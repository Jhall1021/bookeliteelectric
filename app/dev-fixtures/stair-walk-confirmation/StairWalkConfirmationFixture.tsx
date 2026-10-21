"use client";

import { useState } from "react";

import DedicatedCircuitStairWalk from "@/components/guided-flow/DedicatedCircuitStairWalk";
import type { AnswerOptionDTO } from "@/lib/flow-types";

const options = ["accessible", "finished"].map((value) => ({ value }) as AnswerOptionDTO);

export default function StairWalkConfirmationFixture() {
  const [completed, setCompleted] = useState<Record<string, string | null> | null>(null);
  const [run, setRun] = useState(1);

  if (completed) {
    return (
      <main className="min-h-screen bg-warmwhite px-4 py-10">
        <section className="mx-auto max-w-xl rounded-card border border-emerald-200 bg-white p-6 shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">Fixture complete</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-navy">The route was accepted</h1>
          <p className="mt-2 text-sm leading-6 text-slate">This local fixture stops where the real storefront continues to equipment and pricing.</p>
          <button type="button" onClick={() => { setCompleted(null); setRun((value) => value + 1); }} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white hover:bg-electric-hover">Test another route</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-8 sm:py-12">
      <div className="mx-auto mb-5 max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Local visual fixture</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-navy">Dedicated circuit Stair Walk</h1>
        <p className="mt-1 text-sm text-slate">Uses the real storefront component without connecting to customer or production data.</p>
      </div>
      <div className="mx-auto max-w-5xl">
        <DedicatedCircuitStairWalk
          key={run}
          storageKey={`stair-walk-confirmation-fixture-${run}`}
          options={options}
          onAnswer={(_option, supplementalAnswers) => setCompleted(supplementalAnswers ?? {})}
        />
      </div>
    </main>
  );
}
