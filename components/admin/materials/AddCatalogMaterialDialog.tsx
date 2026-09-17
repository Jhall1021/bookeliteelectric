"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { MaterialDefinitionOption } from "@/lib/materialCatalog";

export function AddCatalogMaterialDialog({
  available,
  triggerRef,
  onChooseExisting,
  onCreateCustom,
  onClose,
}: {
  available: MaterialDefinitionOption[];
  triggerRef: React.RefObject<HTMLElement>;
  onChooseExisting: (material: MaterialDefinitionOption) => void;
  onCreateCustom: (input: { name: string; unit: string; unitCostCents: number }) => Promise<string | null>;
  onClose: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<"find" | "custom">("find");
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("each");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return available;
    return available.filter((entry) => entry.name.toLowerCase().includes(query));
  }, [available, search]);

  useEffect(() => {
    panelRef.current?.focus();
    const trigger = triggerRef.current;
    return () => trigger?.focus?.();
  }, [triggerRef]);

  useEffect(() => {
    if (mode === "find") searchRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    const original = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = original; };
  }, []);

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
    );
    if (!nodes?.length) return;
    const focusable = Array.from(nodes);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function startCustom() {
    setName(search.trim());
    setError(null);
    setMode("custom");
  }

  async function createCustom(event: React.FormEvent) {
    event.preventDefault();
    const dollars = Number(cost);
    if (!name.trim()) return setError("Enter a material name.");
    if (!unit.trim()) return setError("Enter the unit you use in service recipes.");
    if (cost.trim() === "" || !Number.isFinite(dollars) || dollars < 0) {
      return setError("Enter a valid cost of zero or more.");
    }

    setBusy(true);
    setError(null);
    const failure = await onCreateCustom({
      name: name.trim(),
      unit: unit.trim(),
      unitCostCents: Math.round(dollars * 100),
    });
    setBusy(false);
    if (failure) setError(failure);
  }

  return (
    <div className="fixed inset-0 z-50">
      <div className="fixed inset-0 bg-navy/40" aria-hidden="true" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="fixed inset-0 flex flex-col bg-white shadow-raised outline-none sm:inset-y-10 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-lg sm:-translate-x-1/2 sm:rounded-card"
      >
        <header className="flex items-start justify-between gap-3 border-b border-cardline p-5">
          <div>
            <h2 id={titleId} className="font-display text-lg font-bold text-navy">Add material</h2>
            <p className="mt-1 text-sm text-slate">
              {mode === "find" ? "Choose a Price2Book material or create your own." : "Create a material just for your company."}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-lg text-slate hover:bg-warmwhite">×</button>
        </header>

        {mode === "find" ? (
          <>
            <div className="border-b border-cardline p-4">
              <input
                ref={searchRef}
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search the material catalog…"
                aria-label="Search available materials"
                className="w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric"
              />
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {filtered.length ? (
                <ul className="divide-y divide-cardline">
                  {filtered.map((entry) => (
                    <li key={entry.canonicalMaterialId} className="flex items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-navy">{entry.name}</p>
                        <p className="mt-0.5 text-xs text-slate">Priced per {entry.unit} · {entry.category}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => onChooseExisting(entry)}
                        className="shrink-0 rounded-pill border border-cardline px-3 py-1.5 text-xs font-semibold text-electric hover:border-electric hover:bg-electric/5"
                      >
                        Add cost
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-card bg-warmwhite p-4 text-sm text-slate">
                  No available materials match that search.
                </p>
              )}
            </div>
            <footer className="border-t border-cardline p-4">
              <button type="button" onClick={startCustom} className="w-full rounded-pill bg-electric py-2.5 text-sm font-semibold text-white hover:bg-electric-hover">
                Create custom material
              </button>
            </footer>
          </>
        ) : (
          <form onSubmit={createCustom} className="flex flex-1 flex-col overflow-hidden">
            <div className="flex-1 space-y-4 overflow-y-auto p-5">
              <label className="block text-sm font-medium text-navy">
                Material name
                <input autoFocus value={name} maxLength={120} onChange={(event) => setName(event.target.value)} className="mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm" placeholder="Weather-resistant GFCI receptacle" />
              </label>
              <label className="block text-sm font-medium text-navy">
                Recipe unit
                <input value={unit} maxLength={30} onChange={(event) => setUnit(event.target.value)} className="mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm" placeholder="each, ft, box…" />
                <span className="mt-1 block text-xs font-normal text-slate">The quantity a service recipe will count.</span>
              </label>
              <label className="block text-sm font-medium text-navy">
                Cost per {unit.trim() || "unit"}
                <div className="relative mt-1">
                  <span className="absolute left-3 top-2 text-sm text-slate">$</span>
                  <input inputMode="decimal" value={cost} onChange={(event) => setCost(event.target.value)} className="w-full rounded-card border border-cardline py-2 pl-7 pr-3 text-sm" placeholder="0.00" />
                </div>
              </label>
              {error && <p role="alert" className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}
            </div>
            <footer className="flex gap-3 border-t border-cardline p-4">
              <button type="button" onClick={() => { setMode("find"); setError(null); }} className="flex-1 rounded-pill border border-cardline py-2.5 text-sm font-semibold text-navy">Back</button>
              <button type="submit" disabled={busy} className="flex-1 rounded-pill bg-electric py-2.5 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-50">
                {busy ? "Creating…" : "Create material"}
              </button>
            </footer>
          </form>
        )}
      </div>
    </div>
  );
}
