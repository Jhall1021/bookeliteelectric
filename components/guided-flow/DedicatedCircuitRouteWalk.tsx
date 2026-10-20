"use client";

import { useState } from "react";

import type { AnswerOptionDTO } from "@/lib/flow-types";
import {
  customerFacts,
  pruneRouteWalkAnswers,
  routeWalkInferences,
  routeWalkSteps,
  routeWalkToDedicatedAnswers,
  type RouteWalkAnswers,
  type RwOption,
  type RwStep,
} from "@/lib/electrical/routeWalk";

type Props = {
  answers: Record<string, string>;
  options: AnswerOptionDTO[];
  onAnswer: (option: AnswerOptionDTO, supplementalAnswers?: Record<string, string | null>) => void;
};

const PROJECT_KEYS = new Set(["equipment", "amperage", "fireplaceAmperage"]);

function initialAnswers(answers: Record<string, string>): RouteWalkAnswers {
  return {
    equipment: answers.dedicated_equipment as RouteWalkAnswers["equipment"],
    amperage: answers.dedicated_amperage as RouteWalkAnswers["amperage"],
    fireplaceAmperage: answers.dedicated_fireplace_amperage as RouteWalkAnswers["fireplaceAmperage"],
  };
}

function HousePicture({ picture }: { picture: string }) {
  const floors = picture === "three" || picture === "tri-level" ? 3 : picture === "two" || picture === "bi-level" ? 2 : 1;
  const staggered = picture === "bi-level" || picture === "tri-level";
  return (
    <svg viewBox="0 0 150 76" aria-hidden="true" className="h-16 w-full">
      <path d="M12 32 75 7l63 25v36H12Z" fill="#F8FBFF" stroke="#0D2B4D" strokeWidth="2.5" strokeLinejoin="round" />
      {Array.from({ length: floors - 1 }, (_, index) => (
        <path key={index} d={`M13 ${66 - ((index + 1) * (staggered ? 14 : 17))}h124`} stroke="#AAB7C5" strokeWidth="2" strokeDasharray={staggered ? "45 7" : undefined} />
      ))}
      <rect x="65" y="47" width="20" height="21" rx="2" fill="#D9EEFF" stroke="#1688F8" strokeWidth="2" />
    </svg>
  );
}

function OptionCard({ option, onClick }: { option: RwOption; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="rounded-xl border border-cardline bg-white px-4 py-4 text-left transition hover:border-electric hover:bg-sky-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric">
      {option.picture && ["one", "two", "three", "bi-level", "tri-level"].includes(option.picture) ? <HousePicture picture={option.picture} /> : null}
      <span className="block font-bold text-navy">{option.label}</span>
      {option.detail ? <span className="mt-1 block text-xs leading-5 text-slate">{option.detail}</span> : null}
    </button>
  );
}

function Progress({ current, total, section }: { current: number; total: number; section: string }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Route Walk · {section}</p>
        <p className="text-xs font-semibold text-slate">{current} of {total}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-electric transition-all" style={{ width: `${Math.max(6, (current / total) * 100)}%` }} /></div>
    </>
  );
}

function DistanceQuestion({ step, onContinue }: { step: RwStep; onContinue: (answers: Partial<RouteWalkAnswers>) => void }) {
  const [method, setMethod] = useState<"feet" | "steps" | "estimate">("feet");
  const [value, setValue] = useState("");
  const [estimate, setEstimate] = useState<"near" | "across" | "far">("near");
  const numeric = Number(value);
  const valid = method === "estimate" || (Number.isFinite(numeric) && numeric > 0 && (method !== "steps" || Number.isInteger(numeric)));
  return (
    <>
      <h2 className="mt-5 font-display text-xl font-bold text-navy">{step.prompt}</h2>
      {step.help ? <p className="mt-2 text-sm leading-6 text-slate">{step.help}</p> : null}
      <div className="mt-5 grid grid-cols-3 gap-2" role="group" aria-label="How would you like to measure?">
        {([['feet', 'Tape measure'], ['steps', 'Count steps'], ['estimate', 'Estimate']] as const).map(([valueKey, label]) => (
          <button key={valueKey} type="button" aria-pressed={method === valueKey} onClick={() => { setMethod(valueKey); setValue(""); }} className={`rounded-xl border px-2 py-3 text-sm font-semibold ${method === valueKey ? "border-electric bg-sky-50 text-navy ring-1 ring-electric" : "border-cardline text-slate"}`}>{label}</button>
        ))}
      </div>
      {method === "estimate" ? (
        <div className="mt-4 grid gap-3">
          {([['near', 'Same room or next room'], ['across', 'Across the house'], ['far', 'Far end of a large house']] as const).map(([valueKey, label]) => (
            <button key={valueKey} type="button" aria-pressed={estimate === valueKey} onClick={() => setEstimate(valueKey)} className={`rounded-xl border px-4 py-4 text-left font-semibold ${estimate === valueKey ? "border-electric bg-sky-50 text-navy ring-1 ring-electric" : "border-cardline text-navy"}`}>{label}</button>
          ))}
        </div>
      ) : (
        <label className="mt-4 block text-sm font-bold text-navy">
          {method === "feet" ? "Distance in feet" : "Number of normal walking steps"}
          <input autoFocus inputMode="numeric" value={value} onChange={(event) => setValue(event.target.value)} placeholder={method === "feet" ? "e.g. 32" : "e.g. 14"} className="mt-2 w-full rounded-xl border border-cardline px-4 py-3 text-base font-normal focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric" />
        </label>
      )}
      <button type="button" disabled={!valid} onClick={() => onContinue(method === "feet" ? { distanceMethod: method, distanceFeet: value } : method === "steps" ? { distanceMethod: method, distanceSteps: value } : { distanceMethod: method, distanceEstimate: estimate })} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">Continue</button>
    </>
  );
}

export default function DedicatedCircuitRouteWalk({ answers, options, onAnswer }: Props) {
  const [routeAnswers, setRouteAnswers] = useState<RouteWalkAnswers>(() => initialAnswers(answers));
  const [history, setHistory] = useState<RouteWalkAnswers[]>([]);
  const visibleSteps = routeWalkSteps(routeAnswers).filter((step) => !PROJECT_KEYS.has(step.key));
  const currentIndex = visibleSteps.findIndex((step) => routeAnswers[step.key] === undefined);
  const current = currentIndex >= 0 ? visibleSteps[currentIndex] : null;
  const result = routeWalkToDedicatedAnswers(routeAnswers);

  const update = (partial: Partial<RouteWalkAnswers>) => {
    setHistory((items) => [...items, routeAnswers]);
    setRouteAnswers(pruneRouteWalkAnswers({ ...routeAnswers, ...partial }));
  };
  const choose = (step: RwStep, value: string) => {
    if (step.key === "estimateAck" && value === "measure") {
      setHistory((items) => [...items, routeAnswers]);
      const next = { ...routeAnswers };
      delete next.distanceMethod;
      delete next.distanceEstimate;
      delete next.estimateAck;
      setRouteAnswers(pruneRouteWalkAnswers(next));
      return;
    }
    update({ [step.key]: value } as Partial<RouteWalkAnswers>);
  };
  const goBack = () => {
    const previous = history.at(-1);
    if (!previous) return;
    setRouteAnswers(previous);
    setHistory((items) => items.slice(0, -1));
  };
  const sendToExistingFlow = (mapped: Record<string, string>) => {
    const access = mapped.dedicated_route_access ?? "finished";
    const option = options.find((candidate) => candidate.value === access) ?? options[0];
    if (!option) return;
    onAnswer(option, { ...mapped, dedicated_route_walk: "complete" });
  };

  if (result.kind === "REVIEW") {
    return (
      <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
        <Progress current={Math.max(1, currentIndex + 1)} total={Math.max(visibleSteps.length, 1)} section="Quick review" />
        <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-display text-xl font-bold text-navy">We need a quick look at this route</h2>
          <p className="mt-2 text-sm leading-6 text-slate">{result.reason}</p>
        </div>
        <button type="button" onClick={() => sendToExistingFlow({ dedicated_route_access: "finished", dedicated_distance: "over_50" })} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white hover:bg-electric-hover">Continue to photo review</button>
        {history.length ? <button type="button" onClick={goBack} className="mt-3 w-full text-sm font-semibold text-slate hover:text-navy">Back</button> : null}
      </div>
    );
  }

  if (current?.kind === "ack") {
    const facts = customerFacts(routeAnswers);
    const inferred = routeWalkInferences(routeAnswers);
    const reviewRows: Array<{ label: string; value: string; basis?: string }> = [...facts.slice(-5), ...inferred];
    return (
      <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
        <Progress current={visibleSteps.length} total={visibleSteps.length} section="Check and confirm" />
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Your wire route is ready</h2>
        <p className="mt-2 text-sm leading-6 text-slate">We’ll use what you told us to include the horizontal run, garage distance, every floor change, drilling, and required wall openings.</p>
        <dl className="mt-5 divide-y divide-cardline rounded-xl border border-cardline bg-warmwhite px-4">
          {reviewRows.map((item, index) => <div key={`${item.label}-${index}`} className="py-3"><dt className="text-xs font-bold uppercase tracking-wide text-slate">{item.label}</dt><dd className="mt-1 text-sm font-semibold text-navy">{item.value}</dd>{item.basis ? <dd className="mt-0.5 text-xs text-slate">{item.basis}</dd> : null}</div>)}
        </dl>
        <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-5 text-slate">Exterior-wall note: even with attic, basement, or crawl-space access, an exterior wall may require us to continue from the nearest reachable interior wall. Any drywall patching or painting is not included.</div>
        <button type="button" onClick={() => {
          const completed = { ...routeAnswers, finishAck: "accepted" as const };
          const completedResult = routeWalkToDedicatedAnswers(completed);
          if (completedResult.kind === "PRICE_INPUTS") sendToExistingFlow(completedResult.answers);
        }} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white hover:bg-electric-hover">Use this route and see my price</button>
        <button type="button" onClick={goBack} className="mt-3 w-full text-sm font-semibold text-slate hover:text-navy">Back</button>
      </div>
    );
  }

  if (!current) return null;
  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <Progress current={currentIndex + 1} total={visibleSteps.length} section={current.section} />
      {current.kind === "distance" ? <DistanceQuestion step={current} onContinue={update} /> : (
        <>
          <h2 className="mt-5 font-display text-xl font-bold text-navy">{current.prompt}</h2>
          {current.help ? <p className="mt-2 text-sm leading-6 text-slate">{current.help}</p> : null}
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {current.options?.map((option) => <OptionCard key={option.value} option={option} onClick={() => choose(current, option.value)} />)}
          </div>
        </>
      )}
      {history.length ? <button type="button" onClick={goBack} className="mt-4 w-full text-center text-sm font-semibold text-slate hover:text-navy">Back</button> : null}
    </div>
  );
}
