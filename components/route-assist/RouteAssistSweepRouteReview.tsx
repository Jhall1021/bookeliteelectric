"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { RouteAssistPersistedSweepFrameV1 } from "@/lib/visual-assist/route-assist/captureHandoff";
import type { RouteAssistReviewCorrectionKindV1, RouteAssistReviewCorrectionV1 } from "@/lib/visual-assist/route-assist/routeReviewCorrection";
import type { RouteAssistVisibleTrimRouteOverlayV1 } from "@/lib/visual-assist/route-assist/visibleTrimRouteOverlay";

type Props = {
  frames: RouteAssistPersistedSweepFrameV1[];
  overlay: RouteAssistVisibleTrimRouteOverlayV1;
  previousOverlay?: RouteAssistVisibleTrimRouteOverlayV1 | null;
  corrections?: readonly RouteAssistReviewCorrectionV1[];
  adjustmentMode?: boolean;
  correctionKind?: RouteAssistReviewCorrectionKindV1;
  onCorrectionPoint?: (correction: { imageId: string; kind: RouteAssistReviewCorrectionKindV1; point: { x: number; y: number } }) => void;
};
const ACCENT = "rgb(var(--t-accent))";
const INK = "rgb(var(--t-ink))";

export default function RouteAssistSweepRouteReview({ frames, overlay, previousOverlay = null, corrections = [], adjustmentMode = false, correctionKind = "ROUTE_SHOULD_PASS_HERE", onCorrectionPoint }: Props) {
  const ordered = useMemo(() => [...frames].sort((a, b) => a.sequence - b.sequence), [frames]);
  const reviewFrames = useMemo(() => ordered.filter((frame) => overlay.paths.some((path) => path.imageId === frame.imageId)), [ordered, overlay]);
  const [index, setIndex] = useState(0);
  const safeIndex = reviewFrames.length ? Math.min(index, reviewFrames.length - 1) : 0;
  const frame = reviewFrames[safeIndex];
  const path = frame ? overlay.paths.find((candidate) => candidate.imageId === frame.imageId) : null;
  const priorPath = frame && previousOverlay ? previousOverlay.paths.find((candidate) => candidate.imageId === frame.imageId) : null;
  const frameCorrections = frame ? corrections.filter((correction) => correction.imageId === frame.imageId && correction.point) : [];

  if (!frame || !path || !frame.width || !frame.height) return <div className="rounded-xl border border-cardline bg-white p-4 text-sm text-slate">No reviewable route overlay is available. Route Assist should request another capture or contractor review.</div>;
  const width = frame.width; const height = frame.height;
  const polyline = path.points.map((point) => `${point.x * width},${point.y * height}`).join(" ");
  const priorPolyline = priorPath?.points.map((point) => `${point.x * width},${point.y * height}`).join(" ") ?? "";
  const isRevision = Boolean(previousOverlay && corrections.length);
  const adjustmentInstruction = correctionKind === "ROUTE_SHOULD_AVOID_HERE"
    ? "Tap the area the route should avoid. Your tap requests a revised proposal; it does not establish an obstacle or measurement."
    : "Tap where the route should pass. Your tap requests a revised proposal; it does not accept or measure the route.";

  function handleAdjustmentTap(event: MouseEvent<HTMLDivElement>) {
    if (!adjustmentMode || !onCorrectionPoint || !frame) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onCorrectionPoint({ imageId: frame.imageId, kind: correctionKind, point: { x, y } });
  }

  return <section className="overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm" data-testid="route-assist-sweep-route-review">
    <div className="border-b border-cardline p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">{isRevision ? "Revised proposal" : "Proposed route"}</p><h2 className="mt-1 text-lg font-bold text-navy">{isRevision ? "Check the route after your change" : "Follow the route through your room"}</h2><p className="mt-2 text-sm text-slate">{adjustmentMode ? adjustmentInstruction : isRevision ? "The solid line is the revised proposal. The dashed line shows the earlier proposal so you can see what changed." : "Review each captured view. The blue line is a proposal from visible room evidence, not an accepted measurement."}</p></div>
    <div onClick={handleAdjustmentTap} className={`relative w-full bg-slate-100 ${adjustmentMode ? "cursor-crosshair ring-2 ring-inset ring-electric" : ""}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <img src={frame.imageUrl} alt={`Route review view ${safeIndex + 1}`} className="absolute inset-0 h-full w-full object-fill" />
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" role="img" aria-label="Proposed route over captured room view">
        {priorPath && priorPath.points.length > 1 && <polyline points={priorPolyline} fill="none" stroke={ACCENT} strokeOpacity="0.34" strokeWidth={Math.max(3, Math.min(width, height) * 0.009)} strokeDasharray={`${Math.max(8, Math.min(width, height) * 0.02)} ${Math.max(6, Math.min(width, height) * 0.014)}`} strokeLinecap="round" strokeLinejoin="round" />}
        {path.points.length > 1 && <polyline points={polyline} fill="none" stroke={ACCENT} strokeWidth={Math.max(4, Math.min(width, height) * 0.012)} strokeLinecap="round" strokeLinejoin="round" />}
        {path.points.map((point, pointIndex) => <circle key={`${frame.imageId}-${pointIndex}`} cx={point.x * width} cy={point.y * height} r={(pointIndex === 0 || pointIndex === path.points.length - 1 ? 0.018 : 0.011) * Math.min(width, height)} fill={pointIndex === 0 ? INK : ACCENT} />)}
        {frameCorrections.map((correction) => {
          if (!correction.point) return null;
          const cx = correction.point.x * width; const cy = correction.point.y * height; const radius = 0.026 * Math.min(width, height);
          if (correction.kind === "ROUTE_SHOULD_AVOID_HERE") return <g key={correction.correctionId}><circle cx={cx} cy={cy} r={radius} fill="white" stroke={INK} strokeWidth={Math.max(3, Math.min(width, height) * 0.007)} /><line x1={cx-radius*.52} y1={cy-radius*.52} x2={cx+radius*.52} y2={cy+radius*.52} stroke={INK} strokeWidth={Math.max(3, radius*.18)} strokeLinecap="round" /><line x1={cx+radius*.52} y1={cy-radius*.52} x2={cx-radius*.52} y2={cy+radius*.52} stroke={INK} strokeWidth={Math.max(3, radius*.18)} strokeLinecap="round" /></g>;
          return <g key={correction.correctionId}><circle cx={cx} cy={cy} r={radius} fill="white" stroke={INK} strokeWidth={Math.max(3, Math.min(width, height) * 0.007)} /><circle cx={cx} cy={cy} r={0.011 * Math.min(width, height)} fill={ACCENT} /></g>;
        })}
      </svg>
      <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-navy shadow-sm">View {safeIndex + 1} of {reviewFrames.length}</div>
      {frameCorrections.length > 0 && <div className="absolute bottom-3 left-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-navy shadow-sm">Your correction marked</div>}
    </div>
    <div className="flex items-center justify-between gap-3 border-t border-cardline p-3"><button type="button" disabled={safeIndex === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="rounded-xl border border-cardline px-4 py-2 text-sm font-semibold text-navy disabled:opacity-40">Previous</button><div className="flex gap-1">{reviewFrames.map((candidate, dotIndex) => <button key={candidate.imageId} type="button" onClick={() => setIndex(dotIndex)} aria-label={`Show route view ${dotIndex + 1}`} className={`h-2.5 w-2.5 rounded-full ${dotIndex === safeIndex ? "bg-electric" : "bg-slate-300"}`} />)}</div><button type="button" disabled={safeIndex === reviewFrames.length - 1} onClick={() => setIndex((value) => Math.min(reviewFrames.length - 1, value + 1))} className="rounded-xl bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button></div>
    <div className="border-t border-cardline bg-slate-50 px-4 py-3 text-xs leading-5 text-slate">The overlay shares the exact persisted image plane and aspect ratio. Correction markers are review guidance only; viewing or correcting this proposal does not accept, measure, detect obstacles, or price the route.</div>
  </section>;
}
