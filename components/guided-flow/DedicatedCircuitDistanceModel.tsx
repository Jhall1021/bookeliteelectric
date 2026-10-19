"use client";

import { EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT } from "@/lib/electrical/exteriorWallContingency";
import {
  dedicatedHomeProfileRouteAccess,
  dedicatedHomeProfileUsesSurfaceConduit,
  type DedicatedHomeProfile,
} from "@/lib/electrical/dedicatedHomeProfile";

type RouteExterior = "" | "no" | "yes" | "unsure";

type Props = {
  profile: DedicatedHomeProfile;
  feet: string;
  onFeetChange: (feet: string) => void;
  exterior: RouteExterior;
  onExteriorChange: (value: RouteExterior) => void;
};

function HouseDiagram({ profile }: { profile: DedicatedHomeProfile }) {
  const twoStories = profile.stories === "two";
  const attic = profile.homeAccess === "attic" || profile.homeAccess === "both";
  const below = profile.homeAccess === "below" || profile.homeAccess === "both";
  const panelInBasement = profile.panelLocation === "basement";
  const panelInGarage = profile.panelLocation === "garage";
  const panelX = panelInGarage ? 90 : panelInBasement ? 245 : 170;
  const panelY = panelInBasement ? 239 : twoStories ? 171 : 135;
  const destinationY = twoStories && profile.destinationFloor === "second" ? 94 : twoStories ? 171 : 135;
  const surface = dedicatedHomeProfileUsesSurfaceConduit(profile);
  const accessY = attic ? 83 : below ? 231 : destinationY;
  const measuredPath = `M${panelX} ${accessY}H430`;
  const sourceAllowance = `M${panelX} ${panelY}V${accessY}`;
  const destinationAllowance = `M430 ${accessY}V${destinationY}`;

  return (
    <svg viewBox="0 0 520 300" role="img" aria-label="Tailored diagram of the selected home and dedicated circuit route" className="h-auto w-full">
      <rect x="22" y="55" width="476" height="205" rx="14" fill="#FFFEFC" stroke="#B6C2CC" strokeWidth="2" />
      <path d="M22 55L260 12L498 55" fill="#FFFEFC" stroke="#0D2B4D" strokeWidth="4" strokeLinejoin="round" />
      {attic ? <><path d="M47 61H473V91H47Z" fill="#EAF8F2" /><text x="260" y="72" textAnchor="middle" fill="#23664B" fontSize="11" fontWeight="700">ACCESSIBLE ATTIC</text></> : null}
      {twoStories ? <path d="M22 132H498" stroke="#A9B3BC" strokeWidth="2" /> : null}
      <path d="M22 210H498" stroke="#A9B3BC" strokeWidth="2" />
      {below ? <><rect x="35" y="219" width="450" height="35" rx="7" fill="#EAF8F2" /><text x="260" y="249" textAnchor="middle" fill="#23664B" fontSize="11" fontWeight="700">OPEN ACCESS BELOW</text></> : null}
      {panelInGarage ? <><path d="M130 132V210" stroke="#A9B3BC" strokeWidth="2" /><text x="76" y="202" textAnchor="middle" fill="#64748B" fontSize="11" fontWeight="700">GARAGE</text></> : null}
      <path d={sourceAllowance} fill="none" stroke="#94A3B8" strokeWidth="4" strokeDasharray="7 7" strokeLinecap="round" />
      <path d={destinationAllowance} fill="none" stroke="#94A3B8" strokeWidth="4" strokeDasharray="7 7" strokeLinecap="round" />
      <path d={measuredPath} fill="none" stroke="#FFFFFF" strokeWidth="11" strokeLinecap="round" />
      <path d={measuredPath} fill="none" stroke={surface ? "#6B7280" : "#1688F8"} strokeWidth={surface ? 8 : 6} strokeDasharray={surface ? undefined : "12 8"} strokeLinecap="round" strokeLinejoin="round" />
      <g transform={`translate(${panelX} ${panelY})`}><rect x="-19" y="-28" width="38" height="56" rx="3" fill="#FFF" stroke="#0D2B4D" strokeWidth="2.5" /><path d="M-12-17H12M-12-6H12M-12 5H12M-12 16H12" stroke="#1688F8" strokeWidth="2" /></g>
      <g transform={`translate(430 ${destinationY})`}><rect x="-15" y="-23" width="30" height="46" rx="3" fill="#FFF" stroke="#0D2B4D" strokeWidth="2.5" /><circle cy="-8" r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" /><circle cy="9" r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" /></g>
      <text x={panelX} y={panelInBasement ? 203 : panelY + 43} textAnchor="middle" fill="#0D2B4D" fontSize="11" fontWeight="700">PANEL</text>
      <text x="430" y={destinationY - 32} textAnchor="middle" fill="#0D2B4D" fontSize="11" fontWeight="700">NEW OUTLET</text>
      <text x="260" y={attic ? accessY + 21 : accessY - 9} textAnchor="middle" fill="#0D2B4D" fontSize="11" fontWeight="700">MEASURE ACROSS</text>
      <rect x="170" y="267" width="180" height="25" rx="12" fill={surface ? "#F1F5F9" : "#EAF5FF"} />
      <text x="260" y="284" textAnchor="middle" fill="#0D2B4D" fontSize="11" fontWeight="700">{surface ? "GARAGE CONDUIT · REVIEW" : dedicatedHomeProfileRouteAccess(profile) === "accessible" ? "OPEN-ACCESS ROUTE" : "FINISHED CONCEALED ROUTE"}</text>
    </svg>
  );
}

export default function DedicatedCircuitDistanceModel({ profile, feet, onFeetChange, exterior, onExteriorChange }: Props) {
  return (
    <div className="mt-5 rounded-[1.25rem] border border-sky-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-electric text-sm font-bold text-white" aria-hidden="true">⌂</span>
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-electric">Your home and wire path</p>
      </div>
      <div className="mx-auto mt-3 max-w-2xl rounded-xl bg-sky-50/50 p-2"><HouseDiagram profile={profile} /></div>
      <div className="mx-auto mt-4 max-w-xl">
        <label className="text-sm font-semibold text-navy">
          About how far is it from the panel area to the new outlet?
          <input type="number" min="1" max="200" step="0.1" inputMode="decimal" value={feet} onChange={(event) => onFeetChange(event.target.value)} className="mt-2 w-full rounded-card border border-cardline bg-white px-4 py-3 text-base font-normal text-navy focus:border-electric" placeholder="e.g. 35" />
        </label>
        <p className="mt-2 text-xs leading-5 text-slate">Measure across the home following the route shown. Don’t include the up-and-down wire at the panel or outlet—we include both ends automatically.</p>
        {dedicatedHomeProfileUsesSurfaceConduit(profile) ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-navy">This demo assumes visible surface-mounted conduit through the finished garage. Because conduit uses different materials, this route will be reviewed before the final price is confirmed.</p> : null}

        <fieldset className="mt-5 rounded-xl border border-cardline bg-warmwhite p-4">
          <legend className="px-1 text-base font-bold text-navy">Will the new outlet be on an exterior-facing wall?</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {([['no', 'No'], ['yes', 'Yes'], ['unsure', "I’m not sure"]] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={exterior === value} onClick={() => onExteriorChange(value)} className={`rounded-xl border px-4 py-3 text-sm font-bold ${exterior === value ? "border-electric bg-sky-50 text-electric ring-1 ring-electric" : "border-cardline bg-white text-navy"}`}>{label}</button>)}
          </div>
          {exterior === "yes" || exterior === "unsure" ? <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-navy">{EXTERIOR_GFCI_WALL_CONTINGENCY_TEXT}</p> : null}
        </fieldset>
      </div>
    </div>
  );
}
