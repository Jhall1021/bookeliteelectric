"use client";

type Props = { destinationKind: "OUTLET" | "SWITCH" | "LIGHT_FIXTURE" };

export default function RouteAssistSurfaceRacewayPreview({ destinationKind }: Props) {
  const hasLight = destinationKind === "LIGHT_FIXTURE";
  const destinationLabel = destinationKind === "OUTLET" ? "New outlet" : "New switch";

  return (
    <div className="overflow-hidden rounded-xl border border-cardline bg-slate-50" data-testid="route-assist-wiremold-route-preview">
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        <svg viewBox="0 0 400 300" className="absolute inset-0 h-full w-full" role="img" aria-label="Proposed surface raceway route following baseboard and door casing">
          <rect x="0" y="0" width="400" height="300" fill="#f5f1e9" />
          <line x1="0" y1="244" x2="400" y2="244" stroke="#c8bba9" strokeWidth="12" />
          <rect x="168" y="92" width="104" height="152" fill="#e7ded1" stroke="#b6a58f" strokeWidth="4" />
          <line x1="158" y1="244" x2="158" y2="80" stroke="#b6a58f" strokeWidth="9" />
          <line x1="158" y1="80" x2="282" y2="80" stroke="#b6a58f" strokeWidth="9" />
          <line x1="282" y1="80" x2="282" y2="244" stroke="#b6a58f" strokeWidth="9" />
          <rect x="55" y="178" width="28" height="38" rx="3" fill="white" stroke="#0F1E3C" strokeWidth="3" />
          <polyline points="69,216 69,238 158,238 158,80 282,80 282,238 335,238 335,178" fill="none" stroke="#2452D9" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="321" y="150" width="28" height="38" rx="3" fill="white" stroke="#2452D9" strokeWidth="3" />
          {hasLight && <polyline points="335,150 335,42 235,42" fill="none" stroke="#2452D9" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />}
          {hasLight && <circle cx="220" cy="42" r="15" fill="white" stroke="#2452D9" strokeWidth="3" />}
          <circle cx="69" cy="216" r="7" fill="#0F1E3C" />
          <circle cx="335" cy="178" r="7" fill="#2452D9" />
        </svg>
        <div className="absolute left-3 top-3 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-navy shadow-sm">Existing outlet to starter box</div>
        <div className="absolute bottom-3 right-3 rounded-lg bg-white px-2.5 py-1.5 text-[11px] font-semibold text-electric shadow-sm">{destinationLabel}{hasLight ? " to light" : ""}</div>
      </div>
      <div className="border-t border-cardline bg-white px-3 py-2 text-xs leading-5 text-slate">Proposed path follows the baseboard and door casing. Actual geometry and distance must come from reviewed scan evidence.</div>
    </div>
  );
}
