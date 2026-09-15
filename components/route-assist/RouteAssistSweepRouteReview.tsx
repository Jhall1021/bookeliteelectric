"use client";

import { useMemo, useState, type MouseEvent } from "react";
import type { RouteAssistPersistedSweepFrameV1 } from "@/lib/visual-assist/route-assist/captureHandoff";
import type { RouteAssistReviewCorrectionKindV1 } from "@/lib/visual-assist/route-assist/routeReviewCorrection";
import type { RouteAssistVisibleTrimRouteOverlayV1 } from "@/lib/visual-assist/route-assist/visibleTrimRouteOverlay";

type Props = {
  frames: RouteAssistPersistedSweepFrameV1[];
  overlay: RouteAssistVisibleTrimRouteOverlayV1;
  adjustmentMode?: boolean;
  correctionKind?: RouteAssistReviewCorrectionKindV1;
  onCorrectionPoint?: (correction: { imageId: string; kind: RouteAssistReviewCorrectionKindV1; point: { x: number; y: number } }) => void;
};
const ACCENT = "rgb(var(--t-accent))";
const INK = "rgb(var(--t-ink))";

export default function RouteAssistSweepRouteReview({ frames, overlay, adjustmentMode = false, correctionKind = "ROUTE_SHOULD_PASS_HERE", onCorrectionPoint }: Props) {
  const ordered = useMemo(() => [...frames].sort((a, b) => a.sequence - b.sequence), [frames]);
  const reviewFrames = useMemo(() => ordered.filter((frame) => overlay.paths.some((path) => path.imageId === frame.imageId)), [ordered, overlay]);
  const [index, setIndex] = useState(0);
  const safeIndex = reviewFrames.length ? Math.min(index, reviewFrames.length - 1) : 0;
  const frame = reviewFrames[safeIndex];
  const path = frame ? overlay.paths.find((candidate) => candidate.imageId === frame.imageId) : null;

  if (!frame || !path || !frame.width || !frame.height) return <div className="rounded-xl border border-cardline bg-white p-4 text-sm text-slate">No reviewable route overlay is available. Route Assist should request another capture or contractor review.</div>;
  const width = frame.width; const height = frame.height;
  const polyline = path.points.map((point) => `${point.x * width},${point.y * height}`).join(" ");

  function handleAdjustmentTap(event: MouseEvent<HTMLDivElement>) {
    if (!adjustmentMode || !onCorrectionPoint || !frame) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height));
    onCorrectionPoint({ imageId: frame.imageId, kind: correctionKind, point: { x, y } });
  }

  return <section className="overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm" data-testid="route-assist-sweep-route-review">
    <div className="border-b border-cardline p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">Proposed route</p><h2 className="mt-1 text-lg font-bold text-navy">Follow the route through your room</h2><p className="mt-2 text-sm text-slate">{adjustmentMode ? "Tap where the route should pass. Your tap requests a revised proposal; it does not accept or measure the route." : "Review each captured view. The blue line is a proposal from visible room evidence, not an accepted measurement."}</p></div>
    <div onClick={handleAdjustmentTap} className={`relative w-full bg-slate-100 ${adjustmentMode ? "cursor-crosshair ring-2 ring-inset ring-electric" : ""}`} style={{ aspectRatio: `${width} / ${height}` }}>
      <img src={frame.imageUrl} alt={`Route review view ${safeIndex + 1}`} className="absolute inset-0 h-full w-full object-fill" />
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" role="img" aria-label="Proposed route over captured room view">
        {path.points.length > 1 && <polyline points={polyline} fill="none" stroke={ACCENT} strokeWidth={Math.max(4, Math.min(width, height) * 0.012)} strokeLinecap="round" strokeLinejoin="round" />}
        {path.points.map((point, pointIndex) => <circle key={`${frame.imageId}-${pointIndex}`} cx={point.x * width} cy={point.y * height} r={(pointIndex === 0 || pointIndex === path.points.length - 1 ? 0.018 : 0.011) * Math.min(width, height)} fill={pointIndex === 0 ? INK : ACCENT} />)}
      </svg>
      <div className="absolute left-3 top-3 rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] font-semibold text-navy shadow-sm">View {safeIndex + 1} of {reviewFrames.length}</div>
    </div>
    <div className="flex items-center justify-between gap-3 border-t border-cardline p-3"><button type="button" disabled={safeIndex === 0} onClick={() => setIndex((value) => Math.max(0, value - 1))} className="rounded-xl border border-cardline px-4 py-2 text-sm font-semibold text-navy disabled:opacity-40">Previous</button><div className="flex gap-1">{reviewFrames.map((candidate, dotIndex) => <button key={candidate.imageId} type="button" onClick={() => setIndex(dotIndex)} aria-label={`Show route view ${dotIndex + 1}`} className={`h-2.5 w-2.5 rounded-full ${dotIndex === safeIndex ? "bg-electric" : "bg-slate-300"}`} />)}</div><button type="button" disabled={safeIndex === reviewFrames.length - 1} onClick={() => setIndex((value) => Math.min(reviewFrames.length - 1, value + 1))} className="rounded-xl bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Next</button></div>
    <div className="border-t border-cardline bg-slate-50 px-4 py-3 text-xs leading-5 text-slate">The overlay shares the exact persisted image plane and aspect ratio. No line is drawn between camera frames, and viewing or correcting this proposal does not accept or price the route.</div>
  </section>;
}
