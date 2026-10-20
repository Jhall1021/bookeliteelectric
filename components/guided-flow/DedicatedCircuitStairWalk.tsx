"use client";

import { useState } from "react";

import type { AnswerOptionDTO } from "@/lib/flow-types";
import {
  SW_FEET_PER_STEP,
  pruneStairWalkAnswers,
  stairWalkInferences,
  stairWalkFacts,
  stairWalkScreenDone,
  stairWalkScreens,
  stairWalkToDedicatedAnswers,
  type SwAnswers,
  type SwField,
  type SwScreen,
} from "@/lib/electrical/stairWalk";

type Props = {
  options: AnswerOptionDTO[];
  onAnswer: (option: AnswerOptionDTO, supplementalAnswers?: Record<string, string | null>) => void;
};

// The dedicated-circuit tree asks "What will this power?" after this question,
// so the walk collects the route only and prices once the equipment arrives.
const MODE = { routeOnly: true } as const;
const SCREEN_LABELS: Record<SwScreen["id"], string> = {
  project: "Your project", panel: "Your panel", walk: "The walk", stairs: "Stairs", space: "Open space", wall: "The wall", confirm: "Confirm",
};
const num = (value: string | undefined) => Number(value ?? 0) || 0;

function Progress({ screens, index }: { screens: SwScreen[]; index: number }) {
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">{SCREEN_LABELS[screens[index].id]}</p>
        <p className="text-xs font-semibold text-slate">{index + 1} of {screens.length}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100">
        <div className="h-full rounded-full bg-electric transition-all" style={{ width: `${Math.max(6, ((index + 1) / screens.length) * 100)}%` }} />
      </div>
    </>
  );
}

const optionClass = (selected: boolean) =>
  `rounded-xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric ${selected ? "border-electric bg-sky-50 ring-1 ring-electric" : "border-cardline bg-white hover:border-electric"}`;

function ChoiceField({ field, value, onChoose }: { field: Extract<SwField, { kind: "choice" }>; value: string | undefined; onChoose: (value: string) => void }) {
  const compact = field.options.every((option) => !option.detail && option.label.length < 14);
  return (
    <div className="mt-5">
      {field.label ? <p className="text-sm font-bold text-navy">{field.label}</p> : null}
      <div className={`mt-2 grid gap-2 ${compact ? "grid-cols-3" : "sm:grid-cols-2"}`}>
        {field.options.map((option) => (
          <button key={option.value} type="button" aria-pressed={value === option.value} onClick={() => onChoose(option.value)} className={`${optionClass(value === option.value)} ${compact ? "text-center" : ""}`}>
            <span className="block font-semibold text-navy">{option.label}</span>
            {option.detail ? <span className="mt-0.5 block text-xs leading-5 text-slate">{option.detail}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function StepperField({ field, value, onChange }: { field: Extract<SwField, { kind: "stepper" }>; value: number; onChange: (value: number) => void }) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-cardline bg-white px-4 py-3">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-navy">{field.label}</span>
        {field.detail ? <span className="block text-xs text-slate">{field.detail}</span> : null}
      </span>
      <span className="flex flex-none items-center gap-3">
        <button type="button" aria-label={`Fewer ${field.label.toLowerCase()}`} disabled={value <= 0} onClick={() => onChange(value - 1)} className="h-10 w-10 rounded-xl border border-cardline text-lg font-semibold text-navy disabled:opacity-30">−</button>
        <output aria-live="polite" className="w-5 text-center font-display text-xl font-bold tabular-nums text-navy">{value}</output>
        <button type="button" aria-label={`More ${field.label.toLowerCase()}`} disabled={value >= field.max} onClick={() => onChange(value + 1)} className="h-10 w-10 rounded-xl border border-cardline text-lg font-semibold text-navy disabled:opacity-30">+</button>
      </span>
    </div>
  );
}

function DistanceField({ answers, update }: { answers: SwAnswers; update: (patch: Partial<SwAnswers>) => void }) {
  const method = answers.distanceMethod ?? "feet";
  const stepsFeet = num(answers.distanceSteps) > 0 ? Math.ceil(num(answers.distanceSteps) * SW_FEET_PER_STEP) : 0;
  return (
    <div className="mt-5">
      <p className="text-sm font-bold text-navy">How far? <span className="font-normal text-slate">Don’t count the stairs in the distance.</span></p>
      <div className="mt-2 grid grid-cols-3 gap-2" role="group" aria-label="How would you like to measure?">
        {([["feet", "Tape measure"], ["steps", "Count steps"], ["estimate", "I can’t measure"]] as const).map(([value, label]) => (
          <button key={value} type="button" aria-pressed={method === value} onClick={() => update({ distanceMethod: value })} className={`rounded-xl border px-2 py-3 text-sm font-semibold ${method === value ? "border-electric bg-sky-50 text-navy ring-1 ring-electric" : "border-cardline text-slate"}`}>{label}</button>
        ))}
      </div>
      {method === "estimate" ? (
        <div className="mt-3 grid gap-2">
          {([["near", "Same room or the next room over"], ["across", "Across the house"], ["far", "The far end of a large house"]] as const).map(([value, label]) => (
            <button key={value} type="button" aria-pressed={answers.distanceEstimate === value} onClick={() => update({ distanceEstimate: value })} className={optionClass(answers.distanceEstimate === value)}>
              <span className="block font-semibold text-navy">{label}</span>
            </button>
          ))}
          {answers.distanceEstimate && answers.distanceEstimate !== "far" ? (
            <button type="button" aria-pressed={answers.estimateAck === "accepted"} onClick={() => update({ estimateAck: "accepted" })} className={optionClass(answers.estimateAck === "accepted")}>
              <span className="block font-semibold text-navy">Yes, price it from my estimate</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate">We price the top of that range. If the run turns out longer, the electrician shows you any added price before starting.</span>
            </button>
          ) : null}
        </div>
      ) : (
        <label className="mt-3 block text-sm font-bold text-navy">
          {method === "feet" ? "Distance in feet" : "Normal walking steps"}
          <input
            inputMode="numeric"
            value={(method === "feet" ? answers.distanceFeet : answers.distanceSteps) ?? ""}
            onChange={(event) => update(method === "feet" ? { distanceMethod: "feet", distanceFeet: event.target.value } : { distanceMethod: "steps", distanceSteps: event.target.value })}
            placeholder={method === "feet" ? "e.g. 35" : "e.g. 14"}
            className="mt-2 w-full rounded-xl border border-cardline px-4 py-3 text-base font-normal tabular-nums focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric"
          />
          {method === "steps" ? <span className="mt-2 block text-xs font-semibold text-emerald-700">{stepsFeet ? `≈ ${stepsFeet} ft (${SW_FEET_PER_STEP} ft per step, rounded up)` : "We’ll convert steps to feet."}</span> : null}
        </label>
      )}
    </div>
  );
}

export default function DedicatedCircuitStairWalk({ options, onAnswer }: Props) {
  const [answers, setAnswers] = useState<SwAnswers>({ distanceMethod: "feet" });
  const [at, setAt] = useState<SwScreen["id"]>("panel");
  const screens = stairWalkScreens(answers, MODE);
  const index = Math.max(0, screens.findIndex((screen) => screen.id === at));
  const screen = screens[index];
  const result = stairWalkToDedicatedAnswers({ ...answers, finishAck: "accepted" }, MODE);

  const send = (mapped: Record<string, string>) => {
    const option = options.find((candidate) => candidate.value === mapped.dedicated_route_access) ?? options[0];
    if (option) onAnswer(option, mapped);
  };
  const goTo = (id: SwScreen["id"]) => { setAt(id); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const next = () => goTo((screens[index + 1] ?? screen).id);
  const update = (patch: Partial<SwAnswers>, advanceWhenDone = false) => {
    const nextAnswers = pruneStairWalkAnswers({ ...answers, ...patch });
    setAnswers(nextAnswers);
    const nextScreens = stairWalkScreens(nextAnswers, MODE);
    const current = nextScreens.find((candidate) => candidate.id === at);
    if (advanceWhenDone && current && stairWalkScreenDone(current, nextAnswers)) {
      const position = nextScreens.indexOf(current);
      goTo((nextScreens[position + 1] ?? current).id);
    }
  };

  if (result.kind === "REVIEW") {
    return (
      <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-display text-xl font-bold text-navy">We need a quick look at this route</h2>
          <p className="mt-2 text-sm leading-6 text-slate">{result.reason}</p>
          <p className="mt-2 text-sm leading-6 text-slate">Nothing you answered was wrong. An electrician will look at your answers and follow up with you.</p>
        </div>
        <button type="button" onClick={() => send({ dedicated_route_access: "finished", dedicated_distance: "over_50", dedicated_stair_walk: `review:${result.code}` })} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white hover:bg-electric-hover">Continue to photo review</button>
        <button type="button" onClick={() => { const { panelPlace, ...rest } = answers; void panelPlace; setAnswers(pruneStairWalkAnswers({ ...rest, distanceMethod: rest.distanceMethod ?? "feet" })); goTo("panel"); }} className="mt-3 w-full text-sm font-semibold text-slate hover:text-navy">Change my answers</button>
      </div>
    );
  }

  const single = screen.fields.length === 1 && screen.fields[0].kind === "choice";
  const done = stairWalkScreenDone(screen, screen.id === "confirm" ? { ...answers, finishAck: "accepted" } : answers);
  const noStairs = screen.id === "stairs" && !num(answers.fullFlights) && !num(answers.halfFlights);

  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <Progress screens={screens} index={index} />
      <h2 className="mt-5 font-display text-xl font-bold text-navy">{screen.title}</h2>
      {screen.help ? <p className="mt-2 text-sm leading-6 text-slate">{screen.help}</p> : null}

      {screen.id === "confirm" ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <section className="rounded-xl border border-cardline bg-warmwhite p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-electric">You told us</h3>
              <dl className="mt-2 grid gap-2">
                {stairWalkFacts(answers, MODE).map((fact, position) => (
                  <div key={`${fact.label}-${position}`}>
                    <dt className="text-xs text-slate">{fact.label}</dt>
                    <dd className="flex items-baseline justify-between gap-2 text-sm font-semibold text-navy">
                      <span>{fact.value}</span>
                      <button type="button" onClick={() => goTo(fact.screen)} className="flex-none text-xs font-semibold text-electric hover:underline">Change</button>
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">We figured out</h3>
              <dl className="mt-2 grid gap-2">
                {stairWalkInferences(answers).map((item, position) => (
                  <div key={`${item.label}-${position}`}>
                    <dt className="text-xs text-slate">{item.label}</dt>
                    <dd className="text-sm font-semibold text-navy">{item.value}</dd>
                    <dd className="text-xs text-slate">{item.basis}</dd>
                  </div>
                ))}
              </dl>
            </section>
          </div>
          {answers.wall === "unsure" ? <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-5 text-navy">You weren’t sure what the wall is made of, so we priced ordinary drywall. If it turns out to be plaster, brick or concrete, the electrician will show you any added price before starting.</p> : null}
          <p className="mt-4 rounded-xl bg-sky-50 px-4 py-3 text-xs leading-5 text-slate">If we need small openings in finished walls or ceilings, we keep the removed pieces and put them back in place. Patching and painting aren’t included.</p>
          <button type="button" disabled={result.kind !== "PRICE_INPUTS"} onClick={() => { if (result.kind === "PRICE_INPUTS") send({ ...result.answers, dedicated_stair_walk: "complete" }); }} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">Looks right — continue</button>
        </>
      ) : (
        <>
          {screen.fields.map((field) =>
            field.kind === "choice" ? <ChoiceField key={field.key} field={field} value={answers[field.key] as string | undefined} onChoose={(value) => update({ [field.key]: value } as Partial<SwAnswers>, single)} />
              : field.kind === "stepper" ? <StepperField key={field.key} field={field} value={num(answers[field.key] as string | undefined)} onChange={(value) => update({ [field.key]: String(value) } as Partial<SwAnswers>)} />
                : <DistanceField key={field.key} answers={answers} update={(patch) => update(patch)} />)}
          {single ? null : (
            <button type="button" disabled={!done} onClick={next} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">
              {noStairs ? "No stairs — continue" : "Continue"}
            </button>
          )}
        </>
      )}

      {index > 0 ? <button type="button" onClick={() => goTo(screens[index - 1].id)} className="mt-4 w-full text-center text-sm font-semibold text-slate hover:text-navy">Back</button> : null}
    </div>
  );
}
