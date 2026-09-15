"use client";

import { useEffect, useState } from "react";
import RouteAssistRoomScanCamera, { type RouteAssistRoomScanCaptureV1 } from "@/components/route-assist/RouteAssistRoomScanCamera";
import RouteAssistSurfaceRacewayPreview from "@/components/route-assist/RouteAssistSurfaceRacewayPreview";
import { routeAssistBrowserCapturePersisterV1 } from "@/lib/visual-assist/route-assist/browserCapturePersister";
import { persistRouteAssistReviewFrameV1, type RouteAssistCaptureHandoffV1 } from "@/lib/visual-assist/route-assist/captureHandoff";
import { detectRouteAssistWebCaptureCapabilityV1, selectRouteAssistAcquisitionPathV1, type RouteAssistAcquisitionPathV1 } from "@/lib/visual-assist/route-assist/captureCapability";

type DemoKind = "OUTLET" | "SWITCH" | "LIGHT_FIXTURE";
type RouteReviewState = "PENDING" | "ACCEPTED" | "ADJUST";
type HandoffState = "IDLE" | "UPLOADING" | "READY" | "FAILED";

const LABELS: Record<DemoKind, string> = { OUTLET: "Outlet", SWITCH: "Switch", LIGHT_FIXTURE: "Light fixture" };
function destinationLabels(kind: DemoKind): string[] { if (kind === "SWITCH") return ["New switch location"]; if (kind === "LIGHT_FIXTURE") return ["New switch location", "New light fixture location"]; return ["New outlet location"]; }
function proposedRoute(kind: DemoKind): string[] {
  const route = ["Convert the selected existing outlet to the Wiremold starting box", "Run straight down to just above the baseboard", "Follow the baseboard/trim toward the new location", "If a doorway blocks the path, follow the side casing up, across the top casing, and down the opposite side"];
  if (kind === "OUTLET") route.push("Run vertically from the baseboard to the new surface outlet box");
  if (kind === "SWITCH") route.push("Run vertically from the baseboard to the new surface switch box");
  if (kind === "LIGHT_FIXTURE") { route.push("Run vertically from the baseboard to the new surface switch box"); route.push("Continue the surface raceway from the switch to the new surface light-fixture box"); }
  return route;
}

export default function RouteAssistCameraDemoPage() {
  const [kind, setKind] = useState<DemoKind>("OUTLET");
  const [capture, setCapture] = useState<RouteAssistRoomScanCaptureV1 | null>(null);
  const [handoff, setHandoff] = useState<RouteAssistCaptureHandoffV1 | null>(null);
  const [handoffState, setHandoffState] = useState<HandoffState>("IDLE");
  const [reviewState, setReviewState] = useState<RouteReviewState>("PENDING");
  const [acquisition, setAcquisition] = useState<RouteAssistAcquisitionPathV1 | null>(null);

  useEffect(() => {
    // Browser detection is deliberately conservative: it can select the
    // calibrated-camera fallback, but it can never grant world-geometry
    // authority. A native/spatial bridge will override this capability later.
    setAcquisition(selectRouteAssistAcquisitionPathV1(detectRouteAssistWebCaptureCapabilityV1()));
  }, []);

  function chooseKind(next: DemoKind) { setKind(next); setCapture(null); setHandoff(null); setHandoffState("IDLE"); setReviewState("PENDING"); }
  async function handleCapture(next: RouteAssistRoomScanCaptureV1) {
    setCapture(next); setHandoff(null); setReviewState("PENDING");
    if (!next.reviewFrame) { setHandoffState("FAILED"); return; }
    setHandoffState("UPLOADING");
    const persisted = await persistRouteAssistReviewFrameV1({ frame: next.reviewFrame, persister: routeAssistBrowserCapturePersisterV1 });
    if (!persisted) { setHandoffState("FAILED"); return; }
    setHandoff(persisted); setHandoffState("READY");
  }

  return <main className="min-h-screen bg-warmwhite px-4 py-6" data-testid="route-assist-camera-demo"><div className="mx-auto w-full max-w-md">
    <header className="mb-5"><p className="text-xs font-semibold uppercase tracking-[0.18em] text-electric">Price2Book</p><h1 className="mt-1 text-2xl font-bold text-navy">Route Assist camera preview</h1><p className="mt-2 text-sm leading-6 text-slate">This fixture previews automatic capture-path selection, durable media handoff, and homeowner review without changing production pricing or guided flows.</p></header>
    {acquisition && <div className="mb-4 rounded-xl border border-cardline bg-white p-3 text-xs leading-5 text-slate" data-testid="route-assist-acquisition-path"><strong className="text-navy">Capture path:</strong> {acquisition.path === "WORLD_GEOMETRY" ? "Measured spatial geometry" : acquisition.path === "CALIBRATED_CAMERA" ? "Camera scan with calibration" : "Contractor review"}<div>Measurement authority: {acquisition.measurementAuthority.toLowerCase()}</div></div>}
    <div className="mb-4 grid grid-cols-3 gap-2" data-testid="route-assist-camera-kind">{(Object.keys(LABELS) as DemoKind[]).map((option) => <button key={option} type="button" onClick={() => chooseKind(option)} className={`rounded-xl border px-2 py-2.5 text-xs font-semibold ${kind === option ? "border-electric bg-blue-50 text-electric" : "border-cardline bg-white text-slate"}`}>{LABELS[option]}</button>)}</div>
    {acquisition?.path === "CALIBRATED_CAMERA" && <RouteAssistRoomScanCamera key={kind} sourceLabel="Existing outlet" destinationLabels={destinationLabels(kind)} onScanComplete={handleCapture} />}
    {acquisition?.path === "REVIEW_ONLY" && <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-950" data-testid="route-assist-review-only">This device cannot provide the camera evidence Route Assist needs. The job should continue to contractor review rather than inventing route geometry.</div>}
    {acquisition?.path === "WORLD_GEOMETRY" && <div className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-navy" data-testid="route-assist-world-geometry">A calibrated spatial provider is available. Route Assist should launch that provider directly; homeowner scale calibration is not required.</div>}

    {capture && handoffState === "UPLOADING" && <div className="mt-4 rounded-xl border border-cardline bg-white p-4 text-sm text-slate" data-testid="route-assist-media-uploading"><strong className="text-navy">Saving room scan…</strong><div className="mt-1 text-xs">The captured frame is being persisted before geometry analysis or review.</div></div>}
    {capture && handoffState === "FAILED" && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950" data-testid="route-assist-media-failed"><strong>Room scan could not be saved.</strong><div className="mt-1 text-xs">No geometry or route facts were created. Please capture the room again.</div></div>}

    {capture && handoffState === "READY" && handoff && <section className="mt-4 overflow-hidden rounded-2xl border border-cardline bg-white shadow-sm" data-testid="route-assist-wiremold-review">
      <div className="border-b border-cardline p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">Proposed Wiremold route</p><h2 className="mt-1 text-lg font-bold text-navy">Does this route look right?</h2><p className="mt-2 text-sm leading-6 text-slate">The room scan is durably saved. Geometry analysis still has to establish the actual proposed path.</p></div>
      <div className="p-4">
        <div className="mb-4 overflow-hidden rounded-xl border border-cardline bg-slate-50"><img src={handoff.persistedImage.imageUrl} alt="Saved Route Assist room scan" className="aspect-[4/3] w-full object-cover" /><div className="border-t border-cardline bg-white px-3 py-2 text-xs text-slate">Saved scene: {handoff.persistedImage.imageId}</div></div>
        <RouteAssistSurfaceRacewayPreview destinationKind={kind} />
        <div className="mt-4 rounded-xl bg-blue-50 p-3 text-sm text-navy"><strong>Starting from this existing outlet</strong><div className="mt-1 text-xs leading-5 text-slate">This outlet becomes the Wiremold starting box.</div></div>
        <ol className="mt-4 space-y-3" data-testid="route-assist-proposed-route-steps">{proposedRoute(kind).map((step, index) => <li key={step} className="flex gap-3 text-sm leading-5 text-slate"><span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-navy text-xs font-bold text-white">{index + 1}</span><span>{step}</span></li>)}</ol>
        <div className="mt-4 rounded-xl border border-cardline bg-slate-50 p-3 text-xs leading-5 text-slate"><strong className="text-navy">Provider handoff:</strong> durable image ID is now present in capture artifacts. Distance remains unresolved until validated geometry evidence exists.</div>
        {reviewState === "PENDING" && <div className="mt-4 grid grid-cols-2 gap-2"><button type="button" onClick={() => setReviewState("ADJUST")} className="rounded-xl border border-cardline bg-white px-3 py-3 text-sm font-semibold text-navy">Adjust route</button><button type="button" onClick={() => setReviewState("ACCEPTED")} className="rounded-xl bg-electric px-3 py-3 text-sm font-semibold text-white">Looks good</button></div>}
        {reviewState === "ACCEPTED" && <div className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-900">Route review checkpoint recorded only; pricing and material quantities remain untouched.</div>}
        {reviewState === "ADJUST" && <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-5 text-amber-950">Route adjustment requested. Geometry must be corrected and shown again.<button type="button" onClick={() => setReviewState("PENDING")} className="mt-2 block text-xs font-semibold underline underline-offset-4">Return to review</button></div>}
      </div>
    </section>}
    <p className="mt-4 text-center text-xs leading-5 text-slate-light">Preview checkpoint only: no hidden wiring inference, materials, labor, price, onboarding, or decision-tree behavior is changed here.</p>
  </div></main>;
}
