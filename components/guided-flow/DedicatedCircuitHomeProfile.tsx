"use client";

import { useState } from "react";

import type { AnswerOptionDTO } from "@/lib/flow-types";
import {
  DEDICATED_HOME_ANSWER_KEYS,
  dedicatedHomeProfileRouteAccess,
  type DedicatedDestinationFloor,
  type DedicatedBasementCeiling,
  type DedicatedGarageSize,
  type DedicatedHomeAccess,
  type DedicatedHomeProfile,
  type DedicatedHomeStories,
  type DedicatedPanelAccess,
  type DedicatedPanelFloor,
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
  const [hasGarage, setHasGarage] = useState(false);
  const [hasBasement, setHasBasement] = useState(false);
  const [hasCrawlSpace, setHasCrawlSpace] = useState(false);
  const [hasAttic, setHasAttic] = useState(false);
  const [basementCeiling, setBasementCeiling] = useState<DedicatedBasementCeiling | "">("");
  const [destinationFloor, setDestinationFloor] = useState<DedicatedDestinationFloor | "">("");
  const [panelLocation, setPanelLocation] = useState<DedicatedPanelLocation | "">("");
  const [panelFloor, setPanelFloor] = useState<DedicatedPanelFloor | "">("");
  const [panelAccess, setPanelAccess] = useState<DedicatedPanelAccess | "">("");
  const [garageSize, setGarageSize] = useState<DedicatedGarageSize | "">("");

  const needsFloor = stories === "two" || stories === "three";
  const stepNames = ["Home builder", ...(needsFloor ? ["Floor"] : []), "Panel", ...(panelLocation === "inside" ? ["Panel floor", "Panel area"] : []), "Review"];
  const current = stepNames[step] ?? stepNames[stepNames.length - 1];
  const topFloor: DedicatedDestinationFloor = stories === "three" ? "third" : stories === "two" ? "second" : "first";
  const openBelow = destinationFloor === "first" && (hasCrawlSpace || (hasBasement && basementCeiling !== "finished"));
  const openAbove = destinationFloor === topFloor && hasAttic;
  const homeAccess: DedicatedHomeAccess = openAbove && openBelow ? "both" : openAbove ? "attic" : openBelow ? "below" : "none";
  const resolvedPanelAccess = panelLocation === "garage" ? "accessible" : panelLocation === "basement" ? basementCeiling : panelAccess;
  const resolvedPanelFloor: DedicatedPanelFloor | "" = panelLocation === "basement" ? "basement" : panelLocation === "garage" ? "first" : panelFloor;
  const resolvedGarageSize: DedicatedGarageSize | null = hasGarage && garageSize ? garageSize : null;
  const homeBuilderComplete = Boolean(stories && (!hasGarage || garageSize) && (!hasBasement || basementCeiling));
  const profile = homeBuilderComplete && stories && destinationFloor && panelLocation && resolvedPanelFloor && resolvedPanelAccess
    ? { stories, hasGarage, basementCeiling: hasBasement ? basementCeiling as DedicatedBasementCeiling : null, hasCrawlSpace, hasAttic, destinationFloor, homeAccess, panelLocation, panelFloor: resolvedPanelFloor, panelAccess: resolvedPanelAccess, garageSize: resolvedGarageSize } satisfies DedicatedHomeProfile
    : null;

  const advance = () => setStep((value) => Math.min(value + 1, stepNames.length - 1));
  const chooseStories = (value: DedicatedHomeStories) => {
    setStories(value);
    setDestinationFloor(value === "one" ? "first" : "");
    setPanelFloor("");
  };
  const chooseFloor = (value: DedicatedDestinationFloor) => { setDestinationFloor(value); advance(); };
  const choosePanel = (value: DedicatedPanelLocation) => { setPanelLocation(value); setPanelFloor(value === "basement" ? "basement" : value === "garage" ? "first" : ""); setPanelAccess(value === "garage" ? "accessible" : ""); advance(); };
  const choosePanelFloor = (value: DedicatedPanelFloor) => { setPanelFloor(value); advance(); };
  const choosePanelAccess = (value: DedicatedPanelAccess) => setPanelAccess(value);

  const submit = () => {
    if (!profile) return;
    const access = dedicatedHomeProfileRouteAccess(profile);
    const option = options.find((candidate) => candidate.value === access);
    if (!option) return;
    onAnswer(option, {
      [DEDICATED_HOME_ANSWER_KEYS.stories]: profile.stories,
      [DEDICATED_HOME_ANSWER_KEYS.hasGarage]: profile.hasGarage ? "yes" : "no",
      [DEDICATED_HOME_ANSWER_KEYS.basementCeiling]: profile.basementCeiling,
      [DEDICATED_HOME_ANSWER_KEYS.hasCrawlSpace]: profile.hasCrawlSpace ? "yes" : "no",
      [DEDICATED_HOME_ANSWER_KEYS.hasAttic]: profile.hasAttic ? "yes" : "no",
      [DEDICATED_HOME_ANSWER_KEYS.destinationFloor]: profile.destinationFloor,
      [DEDICATED_HOME_ANSWER_KEYS.homeAccess]: profile.homeAccess,
      [DEDICATED_HOME_ANSWER_KEYS.panelLocation]: profile.panelLocation,
      [DEDICATED_HOME_ANSWER_KEYS.panelFloor]: profile.panelFloor,
      [DEDICATED_HOME_ANSWER_KEYS.panelAccess]: profile.panelAccess,
      [DEDICATED_HOME_ANSWER_KEYS.garageSize]: profile.garageSize,
      [DEDICATED_HOME_ANSWER_KEYS.surfaceConduit]: "no",
    });
  };

  const toggleFeature = (selected: boolean, onChange: (selected: boolean) => void, label: string, detail: string) => (
    <button type="button" aria-pressed={selected} onClick={() => onChange(!selected)} className={`rounded-xl border px-4 py-4 text-left transition ${selected ? "border-electric bg-sky-50 ring-1 ring-electric" : "border-cardline bg-white hover:border-electric"}`}>
      <span className="flex items-center gap-3"><span className={`flex h-5 w-5 items-center justify-center rounded border text-xs font-bold ${selected ? "border-electric bg-electric text-white" : "border-slate-300 bg-white text-transparent"}`}>✓</span><span className="font-bold text-navy">{label}</span></span>
      <span className="mt-1 block pl-8 text-xs leading-5 text-slate">{detail}</span>
    </button>
  );

  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Build your home profile</p>
        <p className="text-xs font-semibold text-slate">{step + 1} of {stepNames.length}</p>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-sky-100"><div className="h-full rounded-full bg-electric transition-all" style={{ width: `${((step + 1) / stepNames.length) * 100}%` }} /></div>

      {current === "Home builder" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Build your home</h2>
        <p className="mt-1 text-sm text-slate">Choose the structure that applies. We’ll use it to draw your house and calculate the wiring route.</p>
        <h3 className="mt-5 text-sm font-bold text-navy">How many stories?</h3>
        <ChoiceGrid value={stories} onChange={chooseStories} choices={[{ value: "one", label: "One story" }, { value: "two", label: "Two stories" }, { value: "three", label: "Three stories" }]} />
        <h3 className="mt-6 text-sm font-bold text-navy">What does your home have?</h3>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {toggleFeature(hasGarage, (selected) => { setHasGarage(selected); if (!selected) setGarageSize(""); }, "Garage", "Select this if the home has an attached garage.")}
          {toggleFeature(hasBasement, (selected) => { setHasBasement(selected); if (!selected) setBasementCeiling(""); }, "Basement", "Finished, drop-ceiling, and unfinished basements are supported.")}
          {toggleFeature(hasCrawlSpace, setHasCrawlSpace, "Crawl space", "An accessible area below the first floor.")}
          {toggleFeature(hasAttic, setHasAttic, "Accessible attic", "An attic that allows wiring across the home.")}
        </div>
        {hasGarage ? <div className="mt-5 rounded-xl border border-cardline bg-warmwhite p-4"><h3 className="text-sm font-bold text-navy">How many garage spaces?</h3><ChoiceGrid value={garageSize} onChange={setGarageSize} choices={[{ value: "one", label: "One car", detail: "Standard 12-foot width" }, { value: "two", label: "Two cars", detail: "Standard 24-foot width" }, { value: "three", label: "Three cars", detail: "Standard 36-foot width" }]} /></div> : null}
        {hasBasement ? <div className="mt-5 rounded-xl border border-cardline bg-warmwhite p-4"><h3 className="text-sm font-bold text-navy">What kind of basement ceiling?</h3><ChoiceGrid value={basementCeiling} onChange={setBasementCeiling} choices={[{ value: "open", label: "Unfinished/open" }, { value: "drop", label: "Removable drop ceiling" }, { value: "finished", label: "Finished drywall" }]} /></div> : null}
        <button type="button" disabled={!homeBuilderComplete} onClick={advance} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">Build this house</button>
      </> : null}

      {current === "Floor" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Which floor will the new dedicated outlet be on?</h2>
        <ChoiceGrid value={destinationFloor} onChange={chooseFloor} choices={[{ value: "first", label: "First floor" }, { value: "second", label: "Second floor" }, ...(stories === "three" ? [{ value: "third" as const, label: "Third floor" }] : [])]} />
      </> : null}

      {current === "Panel" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Where is your electrical panel?</h2>
        <ChoiceGrid value={panelLocation} onChange={choosePanel} choices={[...(hasGarage ? [{ value: "garage" as const, label: "Garage" }] : []), ...(hasBasement ? [{ value: "basement" as const, label: "Basement" }] : []), { value: "inside", label: "Somewhere inside the house" }]} />
      </> : null}

      {current === "Panel floor" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Which floor is the electrical panel on?</h2>
        <ChoiceGrid value={panelFloor} onChange={choosePanelFloor} choices={[{ value: "first", label: "First floor" }, ...(stories !== "one" ? [{ value: "second" as const, label: "Second floor" }] : []), ...(stories === "three" ? [{ value: "third" as const, label: "Third floor" }] : [])]} />
      </> : null}

      {current === "Panel area" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">What is the area around the panel like?</h2>
        <ChoiceGrid value={panelAccess} onChange={(value) => { choosePanelAccess(value); advance(); }} choices={[{ value: "accessible", label: "Accessible from above or below" }, { value: "finished", label: "Finished walls and ceilings" }]} />
      </> : null}

      {current === "Review" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Your house is ready</h2>
        {profile ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-navy">
          <p>{profile.stories === "one" ? "One-story home" : `${profile.stories === "three" ? "Three" : "Two"}-story home · outlet on the ${profile.destinationFloor} floor`}</p>
          <p>{[profile.hasGarage ? `${profile.garageSize}-car garage` : null, profile.basementCeiling ? `${profile.basementCeiling} basement ceiling` : null, profile.hasCrawlSpace ? "crawl space" : null, profile.hasAttic ? "accessible attic" : null].filter(Boolean).join(" · ") || "No garage, basement, crawl space, or accessible attic selected."}</p>
          <p>Panel: {profile.panelLocation === "inside" ? `${profile.panelFloor} floor` : profile.panelLocation}.</p>
          <p>{dedicatedHomeProfileRouteAccess(profile) === "accessible" ? "An open-access route is available." : "A finished concealed route is assumed."}</p>
        </div> : null}
        <button type="button" disabled={!profile} onClick={submit} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">Place my panel and outlet</button>
      </> : null}

      {step > 0 ? <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="mt-4 w-full text-center text-sm font-semibold text-slate hover:text-navy">Back</button> : null}
    </div>
  );
}
