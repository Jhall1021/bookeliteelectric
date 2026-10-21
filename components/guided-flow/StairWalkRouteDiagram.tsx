import { stairWalkDiagramModel } from "@/lib/electrical/stairWalkDiagram";
import type { SwAnswers } from "@/lib/electrical/stairWalk";

type Props = { answers: SwAnswers };

const LIVING_TOP = 104;
const LIVING_BOTTOM = 260;
const BASEMENT_Y = 282;

export default function StairWalkRouteDiagram({ answers }: Props) {
  const model = stairWalkDiagramModel(answers);
  const firstLivingLevel = model.basementLevelZero ? 1 : 0;
  const livingLevels = Math.max(1, model.highestLevel - firstLivingLevel + 1);
  const livingHeight = (LIVING_BOTTOM - LIVING_TOP) / livingLevels;
  const levelY = (level: number) => {
    if (model.basementLevelZero && level === 0) return BASEMENT_Y;
    const livingIndex = Math.max(0, level - firstLivingLevel);
    return LIVING_BOTTOM - livingHeight * (livingIndex + 0.5);
  };
  const panelX = model.splitFoyerBetween ? 350 : 102;
  const outletX = 538;
  const panelY = model.splitFoyerBetween ? 265 : levelY(model.panelLevel);
  const outletY = model.splitFoyerBetween ? 150 : levelY(model.outletLevel);
  const routeY = model.plane === "attic"
    ? 76
    : model.plane === "below"
      ? model.splitFoyerBetween ? 205 : model.basementLevelZero ? 265 : 282
      : model.plane === "garage"
        ? panelY
        : panelY === outletY ? panelY : Math.max(LIVING_TOP + 10, Math.min(panelY, outletY) - 14);
  const floorLines = Array.from({ length: Math.max(0, livingLevels - 1) }, (_, index) => LIVING_TOP + livingHeight * (index + 1));
  const partialWidth = model.partialOpen ? (outletX - panelX) * model.partialOpen.ratio : 0;
  const partialX = !model.partialOpen || model.partialOpen.position === "panel"
    ? panelX
    : model.partialOpen.position === "outlet"
      ? outletX - partialWidth
      : panelX + ((outletX - panelX - partialWidth) / 2);
  const panelLabelY = panelY > 230 ? panelY - 36 : panelY + 42;
  const measurementTop = model.plane === "attic" ? routeY + 9 : routeY - 25;

  return (
    <figure className="mt-3 overflow-hidden rounded-xl border border-emerald-200 bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/70 px-3 py-2">
        <p className="text-xs font-bold uppercase tracking-[0.08em] text-emerald-800">Your wire path</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-slate">Schematic · not to scale</p>
      </div>
      <svg viewBox="0 0 640 340" role="img" aria-label={model.description} className="h-auto w-full bg-[#fbfdfc]">
        <path d="M42 74 320 24 598 74" fill="#fffefc" stroke="#0D2B4D" strokeWidth="4" strokeLinejoin="round" />
        <rect x="42" y="74" width="556" height="226" rx="12" fill="#fffefc" stroke="#B6C2CC" strokeWidth="2" />

        {model.plane === "attic" ? (
          <>
            <path d="M64 73 320 34 576 73Z" fill="#EAF8F2" />
            <text x="320" y="62" textAnchor="middle" fill="#23664B" fontSize="11" fontWeight="700">ACCESSIBLE ATTIC</text>
          </>
        ) : null}

        {model.splitFoyerBetween ? (
          <>
            <rect x="54" y="176" width="250" height="84" rx="7" fill="#F8FAFC" />
            <text x="176" y="222" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">ENTRANCE / FOYER</text>
            <rect x="304" y="104" width="282" height="101" rx="7" fill="#F8FAFC" />
            <text x="445" y="124" textAnchor="middle" fill="#64748B" fontSize="10" fontWeight="700">MIDDLE LEVEL</text>
            <path d="M250 218h20l34-55h20" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M250 231h20l34 34h20" fill="none" stroke="#94A3B8" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <text x="258" y="208" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="700">6 UP</text>
            <text x="264" y="254" textAnchor="middle" fill="#64748B" fontSize="9" fontWeight="700">6 DOWN</text>
          </>
        ) : (
          <>
            <rect x="54" y={LIVING_TOP} width="532" height={LIVING_BOTTOM - LIVING_TOP} rx="7" fill="#F8FAFC" />
            {floorLines.map((y) => <path key={y} d={`M54 ${y}H586`} stroke="#CBD5E1" strokeWidth="2" />)}
          </>
        )}

        {model.splitFoyerBetween ? (
          <>
            <path d="M304 205H598" stroke="#94A3B8" strokeWidth="2" />
            <rect x="316" y="211" width="270" height="82" rx="6" fill={model.plane === "below" ? "#EAF8F2" : "#F1F5F9"} />
            <text x="451" y="284" textAnchor="middle" fill={model.plane === "below" ? "#23664B" : "#64748B"} fontSize="10" fontWeight="700">BASEMENT UNDER MIDDLE LEVEL</text>
          </>
        ) : model.basementLevelZero ? (
          <>
            <path d="M42 260H598" stroke="#94A3B8" strokeWidth="2" />
            <rect x="54" y="266" width="532" height="27" rx="6" fill={model.plane === "below" ? "#EAF8F2" : "#F1F5F9"} />
            <text x="320" y="284" textAnchor="middle" fill={model.plane === "below" ? "#23664B" : "#64748B"} fontSize="10" fontWeight="700">BASEMENT</text>
          </>
        ) : model.plane === "below" ? (
          <>
            <rect x="54" y="266" width="532" height="27" rx="6" fill="#EAF8F2" />
            <text x="320" y="284" textAnchor="middle" fill="#23664B" fontSize="10" fontWeight="700">BASEMENT / CRAWLSPACE BELOW</text>
          </>
        ) : null}

        {model.partialOpen ? (
          <rect x={partialX} y={routeY - 13} width={partialWidth} height="26" rx="8" fill="#BBF7D0" opacity="0.8" />
        ) : null}

        <path d={`M${panelX} ${panelY}V${routeY}`} fill="none" stroke="#94A3B8" strokeWidth="5" strokeDasharray="8 7" strokeLinecap="round" />
        <path d={`M${outletX} ${routeY}V${outletY}`} fill="none" stroke="#94A3B8" strokeWidth="5" strokeDasharray="8 7" strokeLinecap="round" />
        <path d={`M${panelX} ${routeY}H${outletX}`} fill="none" stroke="#FFFFFF" strokeWidth="12" strokeLinecap="round" />
        <path d={`M${panelX} ${routeY}H${outletX}`} fill="none" stroke="#1688F8" strokeWidth="6" strokeLinecap="round" />

        <rect x={panelX - 19} y={panelY - 28} width="38" height="56" rx="3" fill="#FFFFFF" stroke="#0D2B4D" strokeWidth="2.5" />
        <path d={`M${panelX - 12} ${panelY - 17}H${panelX + 12}M${panelX - 12} ${panelY - 6}H${panelX + 12}M${panelX - 12} ${panelY + 5}H${panelX + 12}M${panelX - 12} ${panelY + 16}H${panelX + 12}`} stroke="#1688F8" strokeWidth="2" />
        <text x={panelX} y={panelLabelY} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{model.panelLabel.toUpperCase()}</text>

        <rect x={outletX - 15} y={outletY - 23} width="30" height="46" rx="3" fill="#FFFFFF" stroke="#0D2B4D" strokeWidth="2.5" />
        <circle cx={outletX} cy={outletY - 8} r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" />
        <circle cx={outletX} cy={outletY + 9} r="5" fill="#DCEFFF" stroke="#0D2B4D" strokeWidth="1.5" />
        <text x={outletX} y={outletY - 32} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{model.outletLabel.toUpperCase()}</text>

        <rect x="231" y={measurementTop} width="178" height="20" rx="10" fill="#FFFFFF" stroke="#BFDBFE" />
        <text x="320" y={measurementTop + 14} textAnchor="middle" fill="#0D2B4D" fontSize="10" fontWeight="700">{model.measurementLabel.toUpperCase()}</text>

        <rect x="215" y="308" width="210" height="23" rx="11" fill="#EAF8F2" />
        <text x="320" y="324" textAnchor="middle" fill="#23664B" fontSize="10" fontWeight="700">{model.routeLabel.toUpperCase()}</text>
      </svg>
      <div className="grid gap-2 border-t border-emerald-100 px-3 py-3 text-[11px] font-semibold text-navy sm:grid-cols-2">
        <span className="flex items-center gap-2"><span className="w-8 border-t-[4px] border-electric" />Your measured route</span>
        <span className="flex items-center gap-2"><span className="w-8 border-t-[4px] border-dashed border-slate-400" />Included automatically</span>
      </div>
      <figcaption className="border-t border-emerald-100 px-3 py-2 text-[11px] leading-5 text-slate">Based on your answers. Your electrician will confirm the exact path before starting.</figcaption>
    </figure>
  );
}
