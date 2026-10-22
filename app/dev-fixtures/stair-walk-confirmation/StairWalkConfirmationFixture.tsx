"use client";

import { useState } from "react";

import DedicatedCircuitStairWalk from "@/components/guided-flow/DedicatedCircuitStairWalk";
import type { AnswerOptionDTO } from "@/lib/flow-types";
import type { DedicatedCategoryStairWalkSlug } from "@/lib/electrical/dedicatedCategoryStairWalk";
import type { LowVoltageStairWalkSlug } from "@/lib/electrical/lowVoltageStairWalk";

type FixtureService = DedicatedCategoryStairWalkSlug | LowVoltageStairWalkSlug;
const services: { slug: FixtureService; label: string }[] = [
  { slug: "dedicated-120v-circuit-outlet", label: "Dedicated circuit" },
  { slug: "electric-fireplace-circuit", label: "Electric fireplace" },
  { slug: "new-240v-appliance-circuit", label: "Dryer or range" },
  { slug: "new-ethernet-line", label: "Ethernet" },
  { slug: "new-coax-line", label: "Coax" },
];

export default function StairWalkConfirmationFixture() {
  const [completed, setCompleted] = useState<Record<string, string | null> | null>(null);
  const [run, setRun] = useState(1);
  const [serviceSlug, setServiceSlug] = useState<FixtureService>("dedicated-120v-circuit-outlet");
  const lowVoltage = serviceSlug === "new-ethernet-line" || serviceSlug === "new-coax-line";
  const optionValues = lowVoltage
    ? ["accessible", "finished", "exposed_baseboard"]
    : serviceSlug === "dedicated-120v-circuit-outlet"
      ? ["accessible", "finished"]
      : ["unfinished_basement", "accessible_attic", "combination", "not_accessible_or_unsure"];
  const options = optionValues.map((value) => ({ value }) as AnswerOptionDTO);
  const serviceLabel = services.find((service) => service.slug === serviceSlug)?.label ?? "Route";

  if (completed) {
    return (
      <main className="min-h-screen bg-warmwhite px-4 py-10">
        <section className="mx-auto max-w-xl rounded-card border border-emerald-200 bg-white p-6 shadow-card">
          <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">Fixture complete</p>
          <h1 className="mt-2 font-display text-2xl font-bold text-navy">The route was accepted</h1>
          <p className="mt-2 text-sm leading-6 text-slate">This local fixture stops where the real storefront continues to equipment and pricing.</p>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs leading-5 text-slate-100">{JSON.stringify(completed, null, 2)}</pre>
          <button type="button" onClick={() => { setCompleted(null); setRun((value) => value + 1); }} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white hover:bg-electric-hover">Test another route</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-warmwhite px-4 py-8 sm:py-12">
      <div className="mx-auto mb-5 max-w-5xl">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Local visual fixture</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-navy">{serviceLabel} Stair Walk</h1>
        <p className="mt-1 text-sm text-slate">Uses the real storefront component without connecting to customer or production data.</p>
        <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Route type">
          {services.map((service) => (
            <button
              key={service.slug}
              type="button"
              aria-pressed={serviceSlug === service.slug}
              onClick={() => { setServiceSlug(service.slug); setCompleted(null); setRun((value) => value + 1); }}
              className={`rounded-pill border px-4 py-2 text-sm font-semibold ${serviceSlug === service.slug ? "border-electric bg-electric text-white" : "border-cardline bg-white text-navy"}`}
            >
              {service.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mx-auto max-w-5xl">
        <DedicatedCircuitStairWalk
          key={run}
          serviceSlug={serviceSlug}
          storageKey={`stair-walk-confirmation-fixture-${serviceSlug}-${run}`}
          options={options}
          onAnswer={(_option, supplementalAnswers) => setCompleted(supplementalAnswers ?? {})}
        />
      </div>
    </main>
  );
}
