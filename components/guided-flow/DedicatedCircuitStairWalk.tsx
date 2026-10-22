"use client";

import { useEffect, useRef, useState } from "react";

import type { AnswerOptionDTO } from "@/lib/flow-types";
import StairWalkRouteDiagram from "./StairWalkRouteDiagram";
import {
  SW_FEET_PER_STEP,
  pruneStairWalkAnswers,
  stairWalkInferences,
  stairWalkFacts,
  stairWalkRouteCopy,
  stairWalkRouteFeet,
  stairWalkScreenDone,
  stairWalkScreens,
  type SwAnswers,
  type SwField,
  type SwMode,
  type SwScreen,
} from "@/lib/electrical/stairWalk";
import {
  lowVoltageReviewAnswers,
  lowVoltageStairWalkMode,
  stairWalkToLowVoltageAnswers,
  type LowVoltageStairWalkSlug,
} from "@/lib/electrical/lowVoltageStairWalk";
import {
  dedicatedCategoryReviewAnswers,
  dedicatedCategoryStairWalkAccessKey,
  dedicatedCategoryStairWalkMarkerKey,
  stairWalkToDedicatedCategoryAnswers,
  type DedicatedCategoryStairWalkSlug,
} from "@/lib/electrical/dedicatedCategoryStairWalk";

type Props = {
  /** Per-question key for this tab's remembered walk, so Back from the next question doesn't wipe it. */
  storageKey: string;
  serviceSlug?: DedicatedCategoryStairWalkSlug | LowVoltageStairWalkSlug;
  options: AnswerOptionDTO[];
  onAnswer: (option: AnswerOptionDTO, supplementalAnswers?: Record<string, string | null>) => void;
};

// The dedicated-circuit tree asks "What will this power?" after this question,
// so the walk collects the route only and prices once the equipment arrives.
const MODE = { routeOnly: true } as const;
const ETHERNET_MODE = lowVoltageStairWalkMode("new-ethernet-line");
const COAX_MODE = lowVoltageStairWalkMode("new-coax-line");
// Six fixed stages, so the finish line never moves while screens come and go.
const STAGES: { label: string; screens: SwScreen["id"][] }[] = [
  { label: "Your panel", screens: ["panel", "projection"] },
  { label: "The walk", screens: ["walk"] },
  { label: "Stairs", screens: ["stairs"] },
  { label: "Open space", screens: ["space", "foundation"] },
  { label: "The wall", screens: ["wall"] },
  { label: "Confirm", screens: ["confirm"] },
];
const num = (value: string | undefined) => Number(value ?? 0) || 0;

function Progress({ screen }: { screen: SwScreen["id"] }) {
  const stage = Math.max(0, STAGES.findIndex((candidate) => candidate.screens.includes(screen)));
  return (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">{STAGES[stage].label}</p>
        <p className="text-xs font-semibold text-slate">{stage + 1} of {STAGES.length}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100">
        <div className="h-full rounded-full bg-electric transition-all" style={{ width: `${((stage + 1) / STAGES.length) * 100}%` }} />
      </div>
    </>
  );
}

// Browser storage can be missing or blocked; the walk still works without it.
function readSaved(key: string, mode: SwMode): SwAnswers | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === "object" ? pruneStairWalkAnswers(parsed as SwAnswers, mode) : null;
  } catch {
    return null;
  }
}
function writeSaved(key: string, answers: SwAnswers | null) {
  try {
    if (answers) window.sessionStorage.setItem(key, JSON.stringify(answers));
    else window.sessionStorage.removeItem(key);
  } catch {
    // Nothing to do: the walk just won't survive Back in this tab.
  }
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

function DirectDistanceField({ answers, mode, update }: { answers: SwAnswers; mode: SwMode; update: (patch: Partial<SwAnswers>) => void }) {
  const method = answers.directDistanceMethod;
  const noun = mode.routeKind === "ethernet" || mode.routeKind === "coax" ? "cable" : "wire";
  const stepsFeet = num(answers.directDistanceSteps) > 0 ? Math.ceil(num(answers.directDistanceSteps) * SW_FEET_PER_STEP) : 0;
  return (
    <div className="mt-5">
      <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Direct basement ceiling distance">
        {([[
          "near", "Almost directly above", "Within 5 ft; we’ll use 5 ft",
        ], [
          "feet", "Tape measure", "Measure along the basement ceiling",
        ], [
          "steps", "Count basement steps", "Walk beneath the outlet, not to the stairs",
        ]] as const).map(([value, label, detail]) => (
          <button key={value} type="button" aria-pressed={method === value} onClick={() => update({ directDistanceMethod: value })} className={optionClass(method === value)}>
            <span className="block font-semibold text-navy">{label}</span>
            <span className="mt-0.5 block text-xs leading-5 text-slate">{detail}</span>
          </button>
        ))}
      </div>
      {method === "feet" || method === "steps" ? (
        <label className="mt-3 block text-sm font-bold text-navy">
          {method === "feet" ? "Direct distance in feet" : "Normal walking steps in the basement"}
          <input
            inputMode="numeric"
            value={(method === "feet" ? answers.directDistanceFeet : answers.directDistanceSteps) ?? ""}
            onChange={(event) => update(method === "feet" ? { directDistanceMethod: "feet", directDistanceFeet: event.target.value } : { directDistanceMethod: "steps", directDistanceSteps: event.target.value })}
            placeholder={method === "feet" ? "e.g. 5" : "e.g. 2"}
            className="mt-2 w-full rounded-xl border border-cardline px-4 py-3 text-base font-normal tabular-nums focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric"
          />
          {method === "steps" ? <span className="mt-2 block text-xs font-semibold text-emerald-700">{stepsFeet ? `≈ ${stepsFeet} ft (${SW_FEET_PER_STEP} ft per step, rounded up)` : "We’ll convert these basement steps to feet."}</span> : null}
        </label>
      ) : null}
      <p className="mt-3 rounded-xl bg-sky-50 px-3 py-2 text-xs leading-5 text-slate">Measure beneath the destination instead of walking to the stairs. This is the only distance we’ll use for {noun} footage.</p>
    </div>
  );
}

function PartialFoundationField({ answers, field, mode, update }: { answers: SwAnswers; field: Extract<SwField, { kind: "feet" }>; mode: SwMode; update: (patch: Partial<SwAnswers>) => void }) {
  const totalFeet = stairWalkRouteFeet(answers) ?? 0;
  const accessibleFeet = num(answers.belowFeet);
  const finishedFeet = Math.max(0, totalFeet - accessibleFeet);
  const openPercent = totalFeet > 0 ? Math.min(92, Math.max(8, (accessibleFeet / totalFeet) * 100)) : 50;
  const openOrder = answers.belowPosition === "panel" ? "order-1" : answers.belowPosition === "outlet" ? "order-2" : "order-2";
  const openLabel = answers.panelPlace === "basement" ? "Open ceiling" : "Open below";
  const finishedLabel = answers.panelPlace === "basement" ? "Finished ceiling" : "Slab / finished";
  const slabOrder = answers.belowPosition === "panel" ? "order-2" : "order-1";
  return (
    <div className="mt-5">
      <label className="block text-sm font-bold text-navy">
        {field.label}
        <input
          inputMode="numeric"
          value={answers.belowFeet ?? ""}
          onChange={(event) => update({ belowFeet: event.target.value })}
          placeholder={totalFeet ? `Less than ${totalFeet}` : "e.g. 18"}
          className="mt-2 w-full rounded-xl border border-cardline px-4 py-3 text-base font-normal tabular-nums focus:border-electric focus:outline-none focus:ring-1 focus:ring-electric"
        />
      </label>
      {field.detail ? <p className="mt-2 text-xs leading-5 text-slate">{field.detail} The full walk is {totalFeet || "—"} ft.</p> : null}
      {accessibleFeet >= totalFeet && totalFeet > 0 ? <p className="mt-2 text-xs font-semibold text-amber-700">The open-space part must be shorter than the full walk.</p> : null}
      {accessibleFeet > 0 && accessibleFeet < totalFeet ? (
        <div role="img" className="mt-4 overflow-hidden rounded-xl border border-cardline bg-white" aria-label={`${accessibleFeet} feet open and ${finishedFeet} feet finished`}>
          <div className="flex h-12 items-center justify-between border-b border-cardline bg-sky-50 px-3 text-xs font-bold text-navy">
            <span>{stairWalkRouteCopy(mode).sourceShort}</span><span>Walk to the {stairWalkRouteCopy(mode).target}</span><span>{stairWalkRouteCopy(mode).target}</span>
          </div>
          {answers.belowPosition === "middle" ? (
            <div className="flex h-16">
              <div className="flex flex-1 items-center justify-center bg-stone-100 px-2 text-center text-[11px] font-semibold text-slate">{finishedLabel}</div>
              <div className="flex items-center justify-center bg-emerald-100 px-2 text-center text-[11px] font-bold text-emerald-900" style={{ width: `${openPercent}%` }}>{openLabel}<br />{accessibleFeet} ft</div>
              <div className="flex flex-1 items-center justify-center bg-stone-100 px-2 text-center text-[11px] font-semibold text-slate">{finishedLabel}</div>
            </div>
          ) : (
            <div className="flex h-16">
              <div className={`${openOrder} flex items-center justify-center bg-emerald-100 px-2 text-center text-[11px] font-bold text-emerald-900`} style={{ width: `${openPercent}%` }}>{openLabel}<br />{accessibleFeet} ft</div>
              <div className={`${slabOrder} flex flex-1 items-center justify-center bg-stone-100 px-2 text-center text-[11px] font-semibold text-slate`}>{finishedLabel}<br />{finishedFeet} ft</div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

export default function DedicatedCircuitStairWalk({ storageKey, serviceSlug = "dedicated-120v-circuit-outlet", options, onAnswer }: Props) {
  const lowVoltageSlug = serviceSlug === "new-ethernet-line" || serviceSlug === "new-coax-line" ? serviceSlug : null;
  // The two service families are disjoint. This typed view is only consumed
  // in the non-low-voltage branch below.
  const dedicatedCategorySlug = serviceSlug as DedicatedCategoryStairWalkSlug;
  const mode = serviceSlug === "new-ethernet-line" ? ETHERNET_MODE : serviceSlug === "new-coax-line" ? COAX_MODE : MODE;
  const [answers, setAnswers] = useState<SwAnswers>({ distanceMethod: "feet" });
  const [at, setAt] = useState<SwScreen["id"]>("panel");
  const restored = useRef(false);
  // The flow engine's Back restores the answers from before this walk was
  // sent, so the walk keeps its own copy for this tab and reopens on the
  // review screen instead of starting over.
  useEffect(() => {
    const saved = readSaved(storageKey, mode);
    if (saved) {
      setAnswers(saved);
      const restoredResult = lowVoltageSlug
        ? stairWalkToLowVoltageAnswers({ ...saved, finishAck: "accepted" }, lowVoltageSlug)
        : stairWalkToDedicatedCategoryAnswers({ ...saved, finishAck: "accepted" }, dedicatedCategorySlug);
      if (restoredResult.kind === "PRICE_INPUTS") setAt("confirm");
    }
    restored.current = true;
  }, [lowVoltageSlug, mode, storageKey]);
  useEffect(() => {
    if (restored.current) writeSaved(storageKey, answers);
  }, [answers, storageKey]);
  const startOver = () => { writeSaved(storageKey, null); setAnswers({ distanceMethod: "feet" }); setAt("panel"); };
  const screens = stairWalkScreens(answers, mode);
  const index = Math.max(0, screens.findIndex((screen) => screen.id === at));
  const screen = screens[index];
  const result = lowVoltageSlug
    ? stairWalkToLowVoltageAnswers({ ...answers, finishAck: "accepted" }, lowVoltageSlug)
    : stairWalkToDedicatedCategoryAnswers({ ...answers, finishAck: "accepted" }, dedicatedCategorySlug);

  const send = (mapped: Record<string, string>) => {
    const accessKey = lowVoltageSlug
      ? `${lowVoltageSlug}_route_access`
      : dedicatedCategoryStairWalkAccessKey(dedicatedCategorySlug);
    const option = options.find((candidate) => candidate.value === mapped[accessKey]);
    if (option) onAnswer(option, mapped);
  };
  const goTo = (id: SwScreen["id"]) => { setAt(id); if (typeof window !== "undefined") window.scrollTo({ top: 0 }); };
  const next = () => goTo((screens[index + 1] ?? screen).id);
  const update = (patch: Partial<SwAnswers>, advanceWhenDone = false) => {
    const nextAnswers = pruneStairWalkAnswers({ ...answers, ...patch }, mode);
    setAnswers(nextAnswers);
    const nextScreens = stairWalkScreens(nextAnswers, mode);
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
        <button type="button" onClick={() => send(lowVoltageSlug ? lowVoltageReviewAnswers(answers, lowVoltageSlug, result.code) : dedicatedCategoryReviewAnswers(dedicatedCategorySlug, result.code))} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white hover:bg-electric-hover">Continue to photo review</button>
        <button type="button" onClick={() => { const { panelPlace, ...rest } = answers; void panelPlace; setAnswers(pruneStairWalkAnswers({ ...rest, distanceMethod: rest.distanceMethod ?? "feet" }, mode)); goTo("panel"); }} className="mt-3 w-full text-sm font-semibold text-slate hover:text-navy">Change my answers</button>
      </div>
    );
  }

  const single = screen.fields.length === 1 && screen.fields[0].kind === "choice";
  const done = stairWalkScreenDone(screen, screen.id === "confirm" ? { ...answers, finishAck: "accepted" } : answers);
  const noStairs = screen.id === "stairs" && !num(answers.fullFlights) && !num(answers.halfFlights);

  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <Progress screen={screen.id} />
      <h2 className="mt-5 font-display text-xl font-bold text-navy">{screen.title}</h2>
      {screen.help ? <p className="mt-2 text-sm leading-6 text-slate">{screen.help}</p> : null}

      {screen.id === "confirm" ? (
        <>
          <div className="mt-5 grid gap-3 lg:grid-cols-2">
            <section className="rounded-xl border border-cardline bg-warmwhite p-4">
              <h3 className="text-xs font-bold uppercase tracking-[0.08em] text-electric">You told us</h3>
              <dl className="mt-2 grid gap-2">
                {stairWalkFacts(answers, mode).map((fact, position) => (
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
              <StairWalkRouteDiagram answers={answers} mode={mode} />
              <dl className="mt-4 grid gap-3">
                {stairWalkInferences(answers, mode).map((item, position) => (
                  <div key={`${item.label}-${position}`} className="rounded-lg border border-emerald-100 bg-white/70 px-3 py-2">
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
          <button type="button" disabled={result.kind !== "PRICE_INPUTS"} onClick={() => { if (result.kind === "PRICE_INPUTS") send({ ...result.answers, [lowVoltageSlug ? `${lowVoltageSlug}_stair_walk` : dedicatedCategoryStairWalkMarkerKey(dedicatedCategorySlug)]: "complete" }); }} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">Looks right — continue</button>
          <button type="button" onClick={startOver} className="mt-3 w-full text-center text-sm font-semibold text-slate hover:text-navy">Start over</button>
        </>
      ) : (
        <>
          {screen.fields.map((field) =>
            field.kind === "choice" ? <ChoiceField key={field.key} field={field} value={answers[field.key] as string | undefined} onChoose={(value) => update({ [field.key]: value } as Partial<SwAnswers>, single)} />
              : field.kind === "stepper" ? <StepperField key={field.key} field={field} value={num(answers[field.key] as string | undefined)} onChange={(value) => update({ [field.key]: String(value) } as Partial<SwAnswers>)} />
                : field.kind === "feet" ? <PartialFoundationField key={field.key} answers={answers} field={field} mode={mode} update={(patch) => update(patch)} />
                  : field.kind === "directDistance" ? <DirectDistanceField key={field.key} answers={answers} mode={mode} update={(patch) => update(patch)} />
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
