"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function QuotePricingForm({
  quoteId, accessibleRouteReview, lowVoltageStandardReview, doorbellStandardReview, floodCameraStandardReview, dedicatedCircuitStandardReview, newCeilingLightStandardReview, newCeilingFanStandardReview, newWallSconceStandardReview, exteriorGfciStandardReview, garageOpenerStandardReview, garage240vStandardReview, initialAccessibleRouteFeet, initialSuggestedPriceCents,
}: {
  quoteId: string;
  accessibleRouteReview: boolean;
  lowVoltageStandardReview: boolean;
  doorbellStandardReview: boolean;
  floodCameraStandardReview: boolean;
  dedicatedCircuitStandardReview: boolean;
  newCeilingLightStandardReview: boolean;
  newCeilingFanStandardReview: boolean;
  newWallSconceStandardReview: boolean;
  exteriorGfciStandardReview: boolean;
  garageOpenerStandardReview: boolean;
  garage240vStandardReview: boolean;
  initialAccessibleRouteFeet: number | null;
  initialSuggestedPriceCents: number | null;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(initialSuggestedPriceCents === null ? "" : (initialSuggestedPriceCents / 100).toFixed(2));
  const [routeFeet, setRouteFeet] = useState(initialAccessibleRouteFeet === null ? "" : String(initialAccessibleRouteFeet));
  const [calculating, setCalculating] = useState(false);
  const [calculation, setCalculation] = useState<{ suggestedPriceCents: number; laborHours: number; materialCostCents: number } | null>(
    initialSuggestedPriceCents === null ? null : { suggestedPriceCents: initialSuggestedPriceCents, laborHours: 0, materialCostCents: 0 },
  );
  const [depositRequired, setDepositRequired] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function calculateAccessibleRoute() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 300) {
      setError("Enter the electrician-confirmed route length between 1 and 300 feet.");
      return;
    }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/labor-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined) {
        throw new Error(data.error ?? "Could not calculate this reviewed route.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice("Reviewed labor and materials calculated. Confirm or edit the customer price before sending.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed route.");
    } finally { setCalculating(false); }
  }

  async function calculateLowVoltagePackage() {
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/low-voltage-scope`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; packageFeet?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.packageFeet === undefined) {
        throw new Error(data.error ?? "Could not calculate this standard accessible package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from your approved ${data.packageFeet}-foot accessible package. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this standard accessible package.");
    } finally { setCalculating(false); }
  }

  async function calculateDoorbellPackage() {
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/doorbell-scope`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; routeFeet?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.routeFeet === undefined) {
        throw new Error(data.error ?? "Could not calculate this standard doorbell package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from your approved ${data.routeFeet}-foot doorbell package. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this standard doorbell package.");
    } finally { setCalculating(false); }
  }

  async function calculateFloodCameraPackage() {
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/flood-camera-scope`, { method: "POST" });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined) {
        throw new Error(data.error ?? "Could not calculate this hardwired floodlight-camera package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice("Calculated from the reviewed hardwired back-to-back package. Confirm or edit the customer price before sending.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this hardwired floodlight-camera package.");
    } finally { setCalculating(false); }
  }

  async function calculateDedicatedCircuitPackage() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 50) {
      setError("Enter the electrician-confirmed accessible route length between 1 and 50 feet.");
      return;
    }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/dedicated-circuit-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; supportCount?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.supportCount === undefined) {
        throw new Error(data.error ?? "Could not calculate this reviewed dedicated-circuit package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from the confirmed accessible path and ${data.supportCount} policy-derived cable supports. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed dedicated-circuit package.");
    } finally { setCalculating(false); }
  }

  async function calculateNewCeilingLightPackage() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 300) {
      setError("Enter the electrician-confirmed accessible cable path between 1 and 300 feet.");
      return;
    }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/new-ceiling-light-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; supportCount?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.supportCount === undefined) {
        throw new Error(data.error ?? "Could not calculate this reviewed new-light package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from the confirmed cable path and ${data.supportCount} policy-derived cable supports. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed new-light package.");
    } finally { setCalculating(false); }
  }

  async function calculateNewCeilingFanPackage() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 300) {
      setError("Enter the electrician-confirmed accessible cable path between 1 and 300 feet.");
      return;
    }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/new-ceiling-fan-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; supportCount?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.supportCount === undefined) {
        throw new Error(data.error ?? "Could not calculate this reviewed new-fan package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from the confirmed cable path and ${data.supportCount} policy-derived cable supports. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed new-fan package.");
    } finally { setCalculating(false); }
  }

  async function calculateNewWallSconcePackage() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 20) {
      setError("Enter the electrician-confirmed accessible cable path between 1 and 20 feet.");
      return;
    }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/new-wall-sconce-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; supportCount?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.supportCount === undefined) {
        throw new Error(data.error ?? "Could not calculate this reviewed new-sconce package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from the confirmed cable path and ${data.supportCount} policy-derived cable supports. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed new-sconce package.");
    } finally { setCalculating(false); }
  }

  async function calculateExteriorGfciPackage() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 20) {
      setError("Enter the electrician-confirmed accessible cable path between 1 and 20 feet.");
      return;
    }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/exterior-gfci-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; supportCount?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.supportCount === undefined) {
        throw new Error(data.error ?? "Could not calculate this reviewed exterior-GFCI package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from the confirmed cable path and ${data.supportCount} policy-derived cable supports. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed exterior-GFCI package.");
    } finally { setCalculating(false); }
  }

  async function calculateGarageOpenerPackage() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 300) {
      setError("Enter the electrician-confirmed accessible cable path between 1 and 300 feet.");
      return;
    }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/garage-opener-scope`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }),
      });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; supportCount?: number };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.supportCount === undefined) {
        throw new Error(data.error ?? "Could not calculate this reviewed garage-opener package.");
      }
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated from the confirmed cable path and ${data.supportCount} policy-derived cable supports. Confirm or edit the customer price before sending.`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed garage-opener package.");
    } finally { setCalculating(false); }
  }

  async function calculateGarage240vPackage() {
    const feet = Number(routeFeet);
    if (!Number.isFinite(feet) || feet < 1 || feet > 300) { setError("Enter the electrician-confirmed open-route length between 1 and 300 feet."); return; }
    setCalculating(true); setError(null); setNotice(null);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}/garage-240v-scope`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ accessibleRouteFeet: feet }) });
      const data = await res.json().catch(() => ({})) as { error?: string; suggestedPriceCents?: number; laborHours?: number; materialCostCents?: number; supportCount?: number; configuration?: string };
      if (!res.ok || data.suggestedPriceCents === undefined || data.laborHours === undefined || data.materialCostCents === undefined || data.supportCount === undefined) throw new Error(data.error ?? "Could not calculate this reviewed 240V package.");
      setCalculation({ suggestedPriceCents: data.suggestedPriceCents, laborHours: data.laborHours, materialCostCents: data.materialCostCents });
      setPrice((data.suggestedPriceCents / 100).toFixed(2));
      setNotice(`Calculated the ${data.configuration ?? "selected"} package from confirmed scope and ${data.supportCount} policy-derived supports. Confirm or edit the customer price before sending.`);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not calculate this reviewed 240V package."); }
    finally { setCalculating(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;

    const dollars = Number(price);
    const cents = dollars * 100;
    if (!Number.isFinite(dollars) || dollars <= 0 || !Number.isSafeInteger(cents)) {
      setError("Enter a valid price with no more than two decimal places.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setNotice(null);

    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ quotedPriceCents: cents, depositRequired }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setError(typeof data.error === "string" ? data.error : "Price2Book could not send this price. Nothing was intentionally changed.");
        return;
      }

      if (data.emailed === false) {
        setNotice(
          typeof data.emailError === "string"
            ? `Price saved, but the customer was not emailed: ${data.emailError}`
            : "Price saved, but Price2Book could not confirm that the customer was emailed."
        );
      } else {
        setNotice("Price saved and the customer was notified.");
      }
      router.refresh();
    } catch {
      // The route saves the quote before attempting the notification email, so
      // a dropped browser response may mean the price is already live. Do not
      // encourage a blind retry that could resend or overwrite the decision.
      setError("Price2Book lost the response while sending this price. Refreshing the quote now — confirm its status before trying again.");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-5 rounded-card border border-cardline bg-warmwhite p-4 sm:p-5">
      {accessibleRouteReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Contractor measurement</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the accessible cable path</h3>
          <p className="mt-1 text-sm text-slate">Enter the actual attic, unfinished-basement or crawlspace path—not the straight-line room distance. This uses your approved per-foot labor and material costs.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="300" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateAccessibleRoute(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Calculate from scope"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {lowVoltageStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Standard accessible package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Calculate without asking the homeowner for exact footage</h3>
          <p className="mt-1 text-sm text-slate">The homeowner selected your approximate standard range and reported attic, unfinished-basement or crawlspace access. Calculate using the maximum footage you approved during onboarding, then confirm or edit the price.</p>
          <button type="button" onClick={() => { void calculateLowVoltagePackage(); }} disabled={calculating} className="mt-3 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Use standard accessible package"}</button>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {doorbellStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Standard new-doorbell package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Calculate from your approved package</h3>
          <p className="mt-1 text-sm text-slate">This request matches the ground-floor accessible package with customer-supplied equipment and no indoor chime. The calculation uses your approved wire allowance, transformer, framing labor and commissioning policy.</p>
          <button type="button" onClick={() => { void calculateDoorbellPackage(); }} disabled={calculating} className="mt-3 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Use standard doorbell package"}</button>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {floodCameraStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Hardwired floodlight-camera package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the back-to-back installation</h3>
          <p className="mt-1 text-sm text-slate">Use this only after the photos confirm an ordinary exterior fixture-box location directly opposite a suitable powered source, at the reported first-story height. Plug-in cameras and routed attic, crawlspace or finished-wall work require separate review.</p>
          <button type="button" onClick={() => { void calculateFloodCameraPackage(); }} disabled={calculating} className="mt-3 rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm and calculate package"}</button>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {dedicatedCircuitStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Reviewed 15A dedicated circuit</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the accessible cable path and panel</h3>
          <p className="mt-1 text-sm text-slate">Enter the actual attic, unfinished-basement or drop-ceiling path after reviewing the photos. Continue only after confirming the existing panel can accept the new circuit. The homeowner&apos;s rough distance answer is context, not pricing authority.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="50" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateDedicatedCircuitPackage(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm panel and calculate"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {newCeilingLightStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Reviewed accessible new-light package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the attic cable path</h3>
          <p className="mt-1 text-sm text-slate">Use this only after confirming an ordinary accessible attic route and a usable existing switched-light source. Enter the actual cable path—not a homeowner guess. Customer-supplied fixture, standard shared control, and no dimmer upgrade are the only included branch.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="300" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateNewCeilingLightPackage(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm scope and calculate"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {newCeilingFanStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Reviewed accessible new-fan package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the attic cable path and source</h3>
          <p className="mt-1 text-sm text-slate">Use this only after confirming an ordinary accessible attic route and a suitable existing switched-light source. Enter the actual cable path—not a homeowner guess. A new fan-rated box and customer-supplied fan are included; new controls, dimmers, difficult access, and finished routing require separate review.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="300" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateNewCeilingFanPackage(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm scope and calculate"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {newWallSconceStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Reviewed accessible new-sconce package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the cable path and source</h3>
          <p className="mt-1 text-sm text-slate">Use this only after reviewing the source photos and confirming an ordinary attic, basement, or crawlspace route. Enter the actual cable path—not the homeowner&apos;s rough range. The customer supplies the sconce; finished walls, uncertain sources, and routes over 20 feet require separate review.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="20" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateNewWallSconcePackage(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm scope and calculate"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {exteriorGfciStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Reviewed accessible exterior-GFCI package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the cable path, source, and exterior wall</h3>
          <p className="mt-1 text-sm text-slate">Use this only after reviewing the photos and confirming a suitable existing branch source, an ordinary accessible attic, basement, or crawlspace path, and a standard exterior-wall penetration. Enter the actual cable path—not the homeowner&apos;s rough range. Finished routes, masonry complications, uncertain sources, and routes over 20 feet require separate review.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="20" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateExteriorGfciPackage(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm scope and calculate"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {garageOpenerStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Reviewed garage-opener outlet package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the accessible cable path and existing protection</h3>
          <p className="mt-1 text-sm text-slate">Use this only after the photos confirm an ordinary accessible attic or open-framing route and a suitable existing source that already provides compliant upstream garage protection. Enter the actual cable path—not the homeowner&apos;s estimate. New or uncertain protection and finished-wall routes require separate review.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="300" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateGarageOpenerPackage(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm protection and calculate"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      {garage240vStandardReview && (
        <div className="mb-5 rounded-card border border-blue-100 bg-blue-50 p-4">
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Reviewed 240V garage outlet package</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Confirm the open route and panel capacity</h3>
          <p className="mt-1 text-sm text-slate">Use this only after the equipment and panel photos confirm the selected receptacle configuration, two usable adjacent breaker spaces, adequate panel capacity, and an exposed or open-framing route. Enter the actual cable path—not the homeowner&apos;s estimate. Finished routes, detached garages, panel work, and uncertain equipment requirements remain manual review.</p>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="text-sm font-semibold text-navy">Confirmed feet
              <input type="number" min="1" max="300" step="0.1" value={routeFeet} onChange={(event) => setRouteFeet(event.target.value)} className="mt-1 block w-36 rounded-card border border-cardline bg-white px-3 py-2 text-sm" />
            </label>
            <button type="button" onClick={() => { void calculateGarage240vPackage(); }} disabled={calculating} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{calculating ? "Calculating…" : "Confirm panel and calculate"}</button>
          </div>
          {calculation && calculation.laborHours > 0 && <p className="mt-3 text-xs text-slate">Suggested ${(calculation.suggestedPriceCents / 100).toFixed(2)} · {calculation.laborHours.toFixed(2)} crew-hours · ${(calculation.materialCostCents / 100).toFixed(2)} direct material</p>}
        </div>
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Your decision</p>
          <h3 className="mt-1 font-display text-base font-bold text-navy">Set the customer price</h3>
          <p className="mt-1 max-w-xl text-sm text-slate">
            Review the request and photos above, then enter the price you want the customer to receive.
          </p>
        </div>
        <span className="mt-2 inline-flex w-fit items-center rounded-pill bg-white px-3 py-1 text-xs font-semibold text-slate ring-1 ring-cardline sm:mt-0">
          Sent only when you click Send price
        </span>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,180px)_1fr_auto] sm:items-end">
        <div>
          <label htmlFor={`quote-price-${quoteId}`} className="text-sm font-semibold text-navy">Customer price</label>
          <div className="relative mt-1.5">
            <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-slate">$</span>
            <input
              id={`quote-price-${quoteId}`}
              type="number"
              step="0.01"
              min="0.01"
              required
              value={price}
              onChange={(e) => {
                setPrice(e.target.value);
                setError(null);
                setNotice(null);
              }}
              className="w-full rounded-card border border-cardline bg-white py-2.5 pl-7 pr-3 text-sm font-medium text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
              placeholder="495.00"
            />
          </div>
        </div>

        <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-card border border-cardline bg-white px-3.5 py-2.5 text-sm text-navy">
          <input
            type="checkbox"
            checked={depositRequired}
            onChange={(e) => {
              setDepositRequired(e.target.checked);
              setError(null);
              setNotice(null);
            }}
            className="h-4 w-4 accent-electric"
          />
          <span>
            <span className="font-semibold">Require a deposit</span>
            <span className="block text-xs text-slate">Customer must complete the deposit step before booking.</span>
          </span>
        </label>

        <button
          type="submit"
          disabled={submitting}
          className="min-h-[44px] rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Sending…" : "Send price"}
        </button>
      </div>

      {notice && (
        <p role="status" className="mt-3 rounded-card border border-success/25 bg-success/[0.06] px-3 py-2 text-sm text-success">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-3 rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </form>
  );
}
