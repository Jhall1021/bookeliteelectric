"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ServiceLaborReviewRow } from "./ServiceLaborReviewPanel";

const displayedMinutes = (hours: number) => Math.round(hours * 600) / 10;
const displayedServiceHours = (hours: number) => Math.round(hours * 100) / 100;

export type LaborSetupOperation = {
  operationKey: string;
  operationName: string;
  unit: "each" | "ft";
  includes: string;
  hoursPerUnit: number;
  source: "PLATFORM_BASELINE" | "DIRECT" | "APPROVED_PROPOSAL";
  affectedServiceCount: number;
};

function currentServiceHours(service: ServiceLaborReviewRow): number {
  if (service.laborContext === "PRIMARY") return service.currentPrimaryHours ?? service.suggestedHours;
  if (service.laborContext === "ADD_ON") return service.currentAddOnHours ?? service.suggestedHours;
  if (service.currentPrimaryHours !== null && service.currentAddOnHours !== null
      && Math.abs(service.currentPrimaryHours - service.currentAddOnHours) <= 1e-9) {
    return service.currentPrimaryHours;
  }
  return service.currentPrimaryHours ?? service.currentAddOnHours ?? service.suggestedHours;
}

function PreparedServiceTotal({ service }: { service: ServiceLaborReviewRow }) {
  const router = useRouter();
  const initialHours = displayedServiceHours(currentServiceHours(service));
  const preparedHours = displayedServiceHours(service.suggestedHours);
  const [hours, setHours] = useState(String(initialHours));
  const [savedHours, setSavedHours] = useState(initialHours);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const numericHours = Number(hours);
  const valid = hours.trim() !== "" && Number.isFinite(numericHours) && numericHours >= 0;
  const changed = valid && Math.abs(numericHours - savedHours) > 1e-9;
  const differsFromPrepared = Math.abs(savedHours - preparedHours) > 1e-9;

  async function save() {
    if (!valid) {
      setError("Enter a nonnegative number of hours.");
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/portal/labor-service-review", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: [{
          serviceId: service.serviceId,
          expectedHours: service.suggestedHours,
          approvedHours: numericHours,
        }] }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save this service time.");
      setSavedHours(numericHours);
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this service time.");
    } finally {
      setSaving(false);
    }
  }

  return <details className="p-3">
    <summary className="cursor-pointer text-sm font-semibold text-navy">
      {service.serviceName}
      <span className="ml-2 font-normal text-slate">{savedHours.toFixed(2)} hours total</span>
      {differsFromPrepared && <span className="ml-2 font-normal text-electric">Prepared calculation {preparedHours.toFixed(2)}</span>}
    </summary>
    <div className="mt-3 border-t border-cardline pt-3">
      <div className="text-xs text-slate">
        {service.lines.map((line) => <div key={line.operationName} className="flex justify-between gap-4 py-1">
          <span>{line.operationName} × {line.quantity}</span>
          <span>{(line.unitHours * 60).toFixed(1)} min each · {line.lineHours.toFixed(2)} hr</span>
        </div>)}
      </div>
      <div className="mt-3 rounded-lg bg-slate-50 p-3">
        <label className="flex flex-wrap items-center gap-3 text-sm font-semibold text-navy">
          Your service time
          <span className="flex items-center gap-2">
            <input
              aria-label={`Total labor hours for ${service.serviceName}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="0.05"
              value={hours}
              onChange={(event) => { setHours(event.target.value); setSaved(false); setError(null); }}
              className="w-24 rounded-lg border border-cardline bg-white px-2 py-1.5 text-right text-sm text-navy"
            />
            <span className="font-normal text-slate">hours</span>
          </span>
        </label>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => { void save(); }} disabled={saving || !changed} className="rounded-pill bg-electric px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {saving ? "Saving…" : "Save service time"}
          </button>
          {(!valid || Math.abs(numericHours - preparedHours) > 1e-9) && <button type="button" onClick={() => { setHours(String(preparedHours)); setSaved(false); setError(null); }} className="text-xs font-semibold text-electric">
            Use prepared {preparedHours.toFixed(2)} hours
          </button>}
          <span className="text-xs text-slate">Changes this service only; shared labor units stay unchanged.</span>
        </div>
        {saved && <p className="mt-2 text-xs text-emerald-800">Service time saved. No customer price was approved or published.</p>}
        {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
      </div>
    </div>
  </details>;
}

export default function LaborSetupPanel({
  operations,
  services,
  blockedCount,
  routeSpecificCount,
  hasCrewRate,
}: {
  operations: LaborSetupOperation[];
  services: ServiceLaborReviewRow[];
  blockedCount: number;
  routeSpecificCount: number;
  hasCrewRate: boolean;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(
    operations.map((operation) => [operation.operationKey, String(displayedMinutes(operation.hoursPerUnit))]),
  ));
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const changed = useMemo(() => operations.filter((operation) => {
    const value = Number(values[operation.operationKey]);
    return Number.isFinite(value) && Math.abs(value - displayedMinutes(operation.hoursPerUnit)) > 1e-9;
  }), [operations, values]);
  const serviceGroups = useMemo(() => {
    const byCategory = new Map<string, { name: string; sortOrder: number; services: ServiceLaborReviewRow[] }>();
    for (const service of services) {
      const key = `${service.categorySortOrder}:${service.categoryName}`;
      const group = byCategory.get(key) ?? {
        name: service.categoryName,
        sortOrder: service.categorySortOrder,
        services: [],
      };
      group.services.push(service);
      byCategory.set(key, group);
    }
    return [...byCategory.values()]
      .map((group) => ({
        ...group,
        services: group.services.sort((a, b) => a.serviceName.localeCompare(b.serviceName)),
      }))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
  }, [services]);

  async function save() {
    const invalid = operations.find((operation) => {
      const value = Number(values[operation.operationKey]);
      return !Number.isFinite(value) || value < 0;
    });
    if (invalid) {
      setError(`Enter a nonnegative number of minutes for ${invalid.operationName}.`);
      return;
    }
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const response = await fetch("/api/portal/labor-setup", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: changed.map((operation) => ({
          operationKey: operation.operationKey,
          hoursPerUnit: Number(values[operation.operationKey]) / 60,
          source: "DIRECT",
          basis: {
            method: "DIRECT_ENTRY",
            scenarioKeys: [],
            note: "Contractor edited the prepared atomic labor unit during setup.",
          },
        })) }),
      });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Could not save labor setup.");
      setSaved(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save labor setup.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-6 rounded-card border border-cardline bg-white p-5 shadow-card">
      <p className="text-xs font-semibold uppercase tracking-wide text-electric">Labor setup</p>
      <h2 className="mt-1 font-display text-lg font-bold text-navy">Review the prepared labor times once</h2>
      <p className="mt-2 max-w-3xl text-sm text-slate">
        These per-item and per-foot times come from the prepared estimator. Change anything that does not match how your company works, then save once. Price2Book will calculate the service durations from these units automatically.
      </p>
      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{operations.length} labor units used by your services</span>
        <span className="rounded-full bg-emerald-50 px-3 py-1 text-emerald-800">{services.length} bounded service totals calculated</span>
        {routeSpecificCount > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate">{routeSpecificCount} route-priced services calculate per job</span>}
        {blockedCount > 0 && <span className="rounded-full bg-amber-50 px-3 py-1 text-amber-900">{blockedCount} services still need labor inputs</span>}
      </div>
      {!hasCrewRate && <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">Service prices will also need your crew-hour rate.</p>}

      {serviceGroups.length > 0 && <div className="mt-5">
        <p className="text-sm font-semibold text-navy">Prepared service totals by category</p>
        <p className="mt-1 text-xs text-slate">Open a category to review its complete service times. Expand a service only when you want to see the atomic labor steps behind its total.</p>
        <div className="mt-3 space-y-3">
          {serviceGroups.map((group) => <details key={`${group.sortOrder}:${group.name}`} className="rounded-xl border border-cardline">
            <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-navy">
              {group.name}
              <span className="ml-2 font-normal text-slate">{group.services.length} {group.services.length === 1 ? "service" : "services"}</span>
            </summary>
            <div className="divide-y divide-cardline border-t border-cardline">
              {group.services.map((service) => <PreparedServiceTotal key={service.serviceId} service={service} />)}
            </div>
          </details>)}
        </div>
      </div>}

      <details className="mt-5 rounded-xl border border-cardline" open>
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-navy">Edit underlying labor units</summary>
        <div className="divide-y divide-cardline border-t border-cardline">
          {operations.map((operation) => (
            <label key={operation.operationKey} className="flex items-start gap-4 p-3">
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-navy">{operation.operationName}</span>
                <span className="mt-1 block text-xs text-slate">{operation.includes}</span>
                <span className="mt-1 block text-xs text-electric">Used by {operation.affectedServiceCount} selected {operation.affectedServiceCount === 1 ? "service" : "services"}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <input
                  aria-label={`Minutes per ${operation.unit} for ${operation.operationName}`}
                  inputMode="decimal"
                  value={values[operation.operationKey] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [operation.operationKey]: event.target.value }))}
                  className="w-24 rounded-lg border border-cardline px-2 py-1.5 text-right text-sm text-navy"
                />
                <span className="w-14 text-xs text-slate">min/{operation.unit}</span>
              </span>
            </label>
          ))}
        </div>
      </details>

      {routeSpecificCount > 0 && <p className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate">Route-priced services use these same labor units with the homeowner&apos;s actual footage and item counts. They do not need a separate fixed service duration.</p>}
      {saved && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">Labor setup saved. Bounded service times were updated automatically; no customer price was published.</p>}
      {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={() => { void save(); }} disabled={saving || operations.length === 0} className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? "Saving…" : changed.length > 0 ? `Save labor setup (${changed.length} changed)` : "Use prepared labor"}
        </button>
        <span className="text-xs text-slate">This does not approve or publish customer prices.</span>
      </div>
    </section>
  );
}
