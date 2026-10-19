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
  type DedicatedHomeLayout,
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

function SplitLevelIllustration({ layout }: { layout: Exclude<DedicatedHomeLayout, "standard"> }) {
  if (layout === "bi-level") return (
    <svg viewBox="0 0 260 128" aria-hidden="true" className="h-auto w-full">
      <path d="M20 58 92 24h148v84H20Z" fill="#FFFEFC" stroke="#0D2B4D" strokeWidth="3" strokeLinejoin="round" />
      <path d="M20 82h88V58h132" fill="none" stroke="#94A3B8" strokeWidth="2" />
      <rect x="28" y="87" width="73" height="14" rx="4" fill="#EAF5FF" />
      <rect x="116" y="64" width="116" height="36" rx="4" fill="#EAF8F2" />
      <path d="m101 82 15-18" stroke="#1688F8" strokeWidth="4" strokeLinecap="round" />
      <text x="64" y="98" textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">LOWER</text>
      <text x="174" y="85" textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">UPPER</text>
    </svg>
  );
  return (
    <svg viewBox="0 0 260 128" aria-hidden="true" className="h-auto w-full">
      <path d="M18 77 72 49h58V32h112v78H18Z" fill="#FFFEFC" stroke="#0D2B4D" strokeWidth="3" strokeLinejoin="round" />
      <path d="M18 88h72V76h80V61h72" fill="none" stroke="#94A3B8" strokeWidth="2" />
      <rect x="25" y="92" width="60" height="12" rx="4" fill="#EAF5FF" />
      <rect x="96" y="81" width="68" height="23" rx="4" fill="#F4F1EB" />
      <rect x="176" y="66" width="60" height="38" rx="4" fill="#EAF8F2" />
      <path d="m85 88 12-8m67 1 12-15" stroke="#1688F8" strokeWidth="4" strokeLinecap="round" />
      <text x="55" y="102" textAnchor="middle" fill="#0D2B4D" fontSize="9" fontWeight="700">LOWER</text>
      <text x="130" y="97" textAnchor="middle" fill="#0D2B4D" fontSize="9" fontWeight="700">MAIN</text>
      <text x="206" y="86" textAnchor="middle" fill="#0D2B4D" fontSize="9" fontWeight="700">UPPER</text>
    </svg>
  );
}

export default function DedicatedCircuitHomeProfile({ options, onAnswer }: Props) {
  const [step, setStep] = useState(0);
  const [stories, setStories] = useState<DedicatedHomeStories | "">("");
  const [layout, setLayout] = useState<DedicatedHomeLayout | "">("");
  const [showSplitLayouts, setShowSplitLayouts] = useState(false);
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
  const resolvedPanelFloor: DedicatedPanelFloor | "" = panelLocation === "basement" ? "basement" : panelLocation === "garage" ? layout === "tri-level" ? "second" : "first" : panelFloor;
  const resolvedGarageSize: DedicatedGarageSize | null = hasGarage && garageSize ? garageSize : null;
  const homeBuilderComplete = Boolean(stories && layout && (!hasGarage || garageSize) && (!hasBasement || basementCeiling));
  const profile = homeBuilderComplete && stories && layout && destinationFloor && panelLocation && resolvedPanelFloor && resolvedPanelAccess
    ? { stories, layout, hasGarage, basementCeiling: hasBasement ? basementCeiling as DedicatedBasementCeiling : null, hasCrawlSpace, hasAttic, destinationFloor, homeAccess, panelLocation, panelFloor: resolvedPanelFloor, panelAccess: resolvedPanelAccess, garageSize: resolvedGarageSize } satisfies DedicatedHomeProfile
    : null;

  const advance = () => setStep((value) => Math.min(value + 1, stepNames.length - 1));
  const chooseStories = (value: DedicatedHomeStories) => {
    setStories(value);
    setLayout("standard");
    setShowSplitLayouts(false);
    setDestinationFloor(value === "one" ? "first" : "");
    setPanelFloor("");
  };
  const chooseSplitLayout = (value: Exclude<DedicatedHomeLayout, "standard">) => {
    const splitStories: DedicatedHomeStories = value === "bi-level" ? "two" : "three";
    setLayout(value);
    setStories(splitStories);
    setDestinationFloor("");
    setPanelFloor("");
  };
  const chooseFloor = (value: DedicatedDestinationFloor) => { setDestinationFloor(value); advance(); };
  const choosePanel = (value: DedicatedPanelLocation) => { setPanelLocation(value); setPanelFloor(value === "basement" ? "basement" : value === "garage" ? layout === "tri-level" ? "second" : "first" : ""); setPanelAccess(value === "garage" ? "accessible" : ""); advance(); };
  const choosePanelFloor = (value: DedicatedPanelFloor) => { setPanelFloor(value); advance(); };
  const choosePanelAccess = (value: DedicatedPanelAccess) => setPanelAccess(value);

  const submit = () => {
    if (!profile) return;
    const access = dedicatedHomeProfileRouteAccess(profile);
    const option = options.find((candidate) => candidate.value === access);
    if (!option) return;
    onAnswer(option, {
      [DEDICATED_HOME_ANSWER_KEYS.stories]: profile.stories,
      [DEDICATED_HOME_ANSWER_KEYS.layout]: profile.layout,
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
        <h3 className="mt-5 text-sm font-bold text-navy">What style is your home?</h3>
        <ChoiceGrid value={layout === "standard" ? stories : ""} onChange={chooseStories} choices={[{ value: "one", label: "One story" }, { value: "two", label: "Two stories" }, { value: "three", label: "Three stories" }]} />
        <button type="button" aria-pressed={showSplitLayouts || layout === "bi-level" || layout === "tri-level"} onClick={() => { setShowSplitLayouts(true); setLayout(""); setStories(""); setDestinationFloor(""); setPanelFloor(""); }} className={`mt-3 w-full rounded-xl border px-4 py-4 text-left transition ${showSplitLayouts || layout === "bi-level" || layout === "tri-level" ? "border-electric bg-sky-50 ring-1 ring-electric" : "border-cardline bg-white hover:border-electric"}`}>
          <span className="block font-bold text-navy">Split-level</span>
          <span className="mt-1 block text-xs leading-5 text-slate">The floors are offset by shorter half-level stairways.</span>
        </button>
        {showSplitLayouts ? <fieldset className="mt-5 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
          <legend className="px-2 text-sm font-bold text-navy">Which picture looks most like your home?</legend>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {([[
              "bi-level", "Bi-level / raised ranch", "Two living levels with the entrance between them.",
            ], [
              "tri-level", "Tri-level", "Lower, main, and upper living levels.",
            ]] as const).map(([value, label, detail]) => <button key={value} type="button" aria-pressed={layout === value} onClick={() => chooseSplitLayout(value)} className={`overflow-hidden rounded-xl border bg-white text-left transition ${layout === value ? "border-electric ring-2 ring-electric" : "border-cardline hover:border-electric"}`}>
              <span className="block bg-warmwhite px-3 pt-2"><SplitLevelIllustration layout={value} /></span>
              <span className="block px-4 pb-4 pt-3"><span className="block font-bold text-navy">{label}</span><span className="mt-1 block text-xs leading-5 text-slate">{detail}</span></span>
            </button>)}
          </div>
        </fieldset> : null}
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
        <ChoiceGrid value={destinationFloor} onChange={chooseFloor} choices={layout === "bi-level" ? [{ value: "first", label: "Lower level" }, { value: "second", label: "Upper level" }] : layout === "tri-level" ? [{ value: "first", label: "Lower level" }, { value: "second", label: "Main level" }, { value: "third", label: "Upper level" }] : [{ value: "first", label: "First floor" }, { value: "second", label: "Second floor" }, ...(stories === "three" ? [{ value: "third" as const, label: "Third floor" }] : [])]} />
      </> : null}

      {current === "Panel" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Where is your electrical panel?</h2>
        <ChoiceGrid value={panelLocation} onChange={choosePanel} choices={[...(hasGarage ? [{ value: "garage" as const, label: "Garage" }] : []), ...(hasBasement ? [{ value: "basement" as const, label: "Basement" }] : []), { value: "inside", label: "Somewhere inside the house" }]} />
      </> : null}

      {current === "Panel floor" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Which floor is the electrical panel on?</h2>
        <ChoiceGrid value={panelFloor} onChange={choosePanelFloor} choices={layout === "bi-level" ? [{ value: "first", label: "Lower level" }, { value: "second", label: "Upper level" }] : layout === "tri-level" ? [{ value: "first", label: "Lower level" }, { value: "second", label: "Main level" }, { value: "third", label: "Upper level" }] : [{ value: "first", label: "First floor" }, ...(stories !== "one" ? [{ value: "second" as const, label: "Second floor" }] : []), ...(stories === "three" ? [{ value: "third" as const, label: "Third floor" }] : [])]} />
      </> : null}

      {current === "Panel area" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">What is the area around the panel like?</h2>
        <ChoiceGrid value={panelAccess} onChange={(value) => { choosePanelAccess(value); advance(); }} choices={[{ value: "accessible", label: "Accessible from above or below" }, { value: "finished", label: "Finished walls and ceilings" }]} />
      </> : null}

      {current === "Review" ? <>
        <h2 className="mt-5 font-display text-xl font-bold text-navy">Your house is ready</h2>
        {profile ? <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-navy">
          <p>{profile.layout === "bi-level" ? `Bi-level / raised ranch · outlet on the ${profile.destinationFloor === "first" ? "lower" : "upper"} level` : profile.layout === "tri-level" ? `Tri-level home · outlet on the ${profile.destinationFloor === "first" ? "lower" : profile.destinationFloor === "second" ? "main" : "upper"} level` : profile.stories === "one" ? "One-story home" : `${profile.stories === "three" ? "Three" : "Two"}-story home · outlet on the ${profile.destinationFloor} floor`}</p>
          <p>{[profile.hasGarage ? `${profile.garageSize}-car garage` : null, profile.basementCeiling ? `${profile.basementCeiling} basement ceiling` : null, profile.hasCrawlSpace ? "crawl space" : null, profile.hasAttic ? "accessible attic" : null].filter(Boolean).join(" · ") || "No garage, basement, crawl space, or accessible attic selected."}</p>
          <p>Panel: {profile.panelLocation === "inside" ? profile.layout === "bi-level" ? `${profile.panelFloor === "first" ? "lower" : "upper"} level` : profile.layout === "tri-level" ? `${profile.panelFloor === "first" ? "lower" : profile.panelFloor === "second" ? "main" : "upper"} level` : `${profile.panelFloor} floor` : profile.panelLocation}.</p>
          <p>{dedicatedHomeProfileRouteAccess(profile) === "accessible" ? "An open-access route is available." : "A finished concealed route is assumed."}</p>
        </div> : null}
        <button type="button" disabled={!profile} onClick={submit} className="mt-5 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40">Place my panel and outlet</button>
      </> : null}

      {step > 0 ? <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} className="mt-4 w-full text-center text-sm font-semibold text-slate hover:text-navy">Back</button> : null}
    </div>
  );
}
