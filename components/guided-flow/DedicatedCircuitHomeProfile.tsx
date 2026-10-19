"use client";

import { useState } from "react";

import type { AnswerOptionDTO } from "@/lib/flow-types";
import {
  DEDICATED_HOME_ANSWER_KEYS,
  dedicatedHomeProfileRouteAccess,
  dedicatedHomeProfileUsesSurfaceConduit,
  type DedicatedDestinationFloor,
  type DedicatedHomeAccess,
  type DedicatedHomeProfile,
  type DedicatedHomeStories,
  type DedicatedPanelAccess,
  type DedicatedPanelLocation,
} from "@/lib/electrical/dedicatedHomeProfile";

type Props = {
  options: AnswerOptionDTO[];
  onAnswer: (option: AnswerOptionDTO, supplementalAnswers?: Record<string, string | null>) => void;
};

type Choice<T extends string> = { value: T; label: string; detail?: string };

function ChoiceGrid<T extends string>({ choices, value, onChange }: { choices: Choice<T>[]; value: T | ""; onChange: (value: T) => void }) {
  return (
    <div className="mt-5 grid gap-3 sm:grid-cols-2">
      {choices.map((choice) => (
        <button
          key={choice.value}
          type="button"
          aria-pressed={value === choice.value}
          onClick={() => onChange(choice.value)}
          className={`rounded-xl border px-4 py-4 text-left transition ${value === choice.value ? "border-electric bg-sky-50 ring-1 ring-electric" : "border-cardline bg-white hover:border-electric"}`}
        >
          <span className="block font-bold text-navy">{choice.label}</span>
          {choice.detail ? <span className="mt-1 block text-xs leading-5 text-slate">{choice.detail}</span> : null}
        </button>
      ))}
    </div>
  );
}

export default function DedicatedCircuitHomeProfile({ options, onAnswer }: Props) {
  const [step, setStep] = useState(0);
  const [stories, setStories] = useState<DedicatedHomeStories | "">("");
  const [destinationFloor, setDestinationFloor] = useState<DedicatedDestinationFloor | "">("");
  const [homeAccess, setHomeAccess] = useState<DedicatedHomeAccess | "">("");
  const [panelLocation, setPanelLocation] = useState<DedicatedPanelLocation | "">("");
  const [panelAccess, setPanelAccess] = useState<DedicatedPanelAccess | "">("");

  const needsFloor = stories === "two";
  const stepNames = ["Home", ...(needsFloor ? ["Floor"] : []), "Access", "Panel", "Panel area"];
  const current = stepNames[step] ?? stepNames[stepNames.length - 1];
  const profile = stories && destinationFloor && homeAccess && panelLocation && panelAccess
    ? { stories, destinationFloor, homeAccess, panelLocation, panelAccess } satisfies DedicatedHomeProfile
    : null;

  const advance = () => setStep((value) => Math.min(value + 1, stepNames.length - 1));
  const chooseStories = (value: DedicatedHomeStories) => {
    setStories(value);
    setDestinationFloor(value === "one" ? "first" : "");
    setHomeAccess("");
    setStep(1);
  };
  const chooseFloor = (value: DedicatedDestinationFloor) => { setDestinationFloor(value); setHomeAccess(""); advance(); };
  const chooseHomeAccess = (value: DedicatedHomeAccess) => { setHomeAccess(value); advance(); };
  const choosePanel = (value: DedicatedPanelLocation) => { setPanelLocation(value); setPanelAccess(""); advance(); };
  const choosePanelAccess = (value: DedicatedPanelAccess) => setPanelAccess(value);

  const submit = () => {
    if (!profile) return;
    const access = dedicatedHomeProfileRouteAccess(profile);
    const option = options.find((candidate) => candidate.value === access);
    if (!option) return;
    onAnswer(option, {
      [DEDICATED_HOME_ANSWER_KEYS.stories]: profile.stories,
      [DEDICATED_HOME_ANSWER_KEYS.destinationFloor]: profile.destinationFloor,
      [DEDICATED_HOME_ANSWER_KEYS.homeAccess]: profile.homeAccess,
      [DEDICATED_HOME_ANSWER_KEYS.panelLocation]: profile.panelLocation,
      [DEDICATED_HOME_ANSWER_KEYS.panelAccess]: profile.panelAccess,
      [DEDICATED_HOME_ANSWER_KEYS.surfaceConduit]: dedicatedHomeProfileUsesSurfaceConduit(profile) ? "yes" : "no",
    });
  };

  const accessChoices: Choice<DedicatedHomeAccess>[] = stories === "one"
    ? [
        { value: "attic", label: "Accessible attic across the house" },
        { value: "below", label: "Accessible space below", detail: "Unfinished basement, removable drop ceiling, or crawlspace." },
        { value: "both", label: "Both above and below" },
        { value: "none", label: "Neither", detail: "The route is surrounded by finished walls and ceilings." },
      ]
    : destinationFloor === "second"
      ? [
          { value: "attic", label: "Yes — accessible attic above" },
          { value: "none", label: "No accessible attic above" },
        ]
      : [
          { value: "below", label: "Yes — accessible space below", detail: "Unfinished basement, removable drop ceiling, or crawlspace." },
          { value: "none", label: "No accessible space below" },
        ];

  const panelAccessChoices: Record<DedicatedPanelLocation, Choice<DedicatedPanelAccess>[]> = {
    garage: [
      { value: "open", label: "Open framing or accessible space above" },
      { value: "finished", label: "Finished drywall with no access above", detail: "The model will assume visible surface-mounted conduit in the garage." },
    ],
    basement: [
      { value: "open", label: "Unfinished, open ceiling" },
      { value: "drop", label: "Removable drop ceiling" },
      { value: "finished", label: "Finished drywall ceiling" },
    ],
    inside: [
      { value: "accessible", label: "Accessible from above or below" },
      { value: "finished", label: "Finished walls and ceilings" },
    ],
  };

  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Build your home profile</p>
        <p className="text-xs font-semibold text-slate">{step + 1} of {stepNames.length}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-electric transition-all" style={{ width: `${((step + 1) / stepNames.length) * 100}%` }} /></div>

      {current === "Home" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Is your home one or two stories?</h2>
        <ChoiceGrid value={stories} onChange={chooseStories} choices={[{ value: "one", label: "One story" }, { value: "two", label: "Two stories" }]} />
      </> : null}

      {current === "Floor" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Which floor will the new dedicated outlet be on?</h2>
        <ChoiceGrid value={destinationFloor} onChange={chooseFloor} choices={[{ value: "first", label: "First floor" }, { value: "second", label: "Second floor" }]} />
      </> : null}

      {current === "Access" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Is there open access {stories === "two" && destinationFloor === "second" ? "above the second floor" : stories === "two" ? "below the first floor" : "above or below the home"}?</h2>
        <p className="mt-1 text-sm text-slate">We’ll use this to choose the wiring route automatically.</p>
        <ChoiceGrid value={homeAccess} onChange={chooseHomeAccess} choices={accessChoices} />
      </> : null}

      {current === "Panel" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Where is your electrical panel?</h2>
        <ChoiceGrid value={panelLocation} onChange={choosePanel} choices={[{ value: "garage", label: "Garage" }, { value: "basement", label: "Basement" }, { value: "inside", label: "Somewhere inside the house" }]} />
      </> : null}

      {current === "Panel area" && panelLocation ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">What is the area around the panel like?</h2>
        <ChoiceGrid value={panelAccess} onChange={choosePanelAccess} choices={panelAccessChoices[panelLocation]} />
        {profile ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-navy">
          <p className="font-bold">Home profile ready</p>
          <p>{profile.stories === "two" ? `Two-story home · outlet on the ${profile.destinationFloor} floor` : "One-story home"}</p>
          <p>{dedicatedHomeProfileUsesSurfaceConduit(profile) ? "Finished garage segment shown as surface-mounted conduit." : dedicatedHomeProfileRouteAccess(profile) === "accessible" ? "Open-access route available." : "Finished concealed route assumed."}</p>
        </div> : null}
        <button type="button" disabled={!profile} onClick={submit} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">Build my wire path</button>
      </> : null}

      {step > 0 ? <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="mt-4 w-full text-center text-sm font-semibold text-slate hover:text-navy">Back</button> : null}
    </div>
  );
}

