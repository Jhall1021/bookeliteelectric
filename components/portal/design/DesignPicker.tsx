"use client";

import { useState } from "react";
import DesignPreview from "./DesignPreview";
import { definitionKey, type ThemeDefinition } from "@/lib/theme/definition";
import type { BrandInputs } from "@/lib/theme/resolve";
import type { StorefrontIdentity } from "@/lib/storefrontIdentity";
import type { PricingStrategy } from "@prisma/client";

export type Family = { family: string; name: string; blurb: string; designs: ThemeDefinition[] };

export type DesignPickerProps = {
  families: Family[];
  current: { family: string; variant: string; version: number };
  brand: BrandInputs;
  identity: StorefrontIdentity;
  strategy: PricingStrategy;
  site: { publicId: string; hostedSlug: string };
  storefrontUrl: string;
};

export default function DesignPicker(props: DesignPickerProps) {
  const { families, brand, identity, strategy, site, storefrontUrl } = props;
  const [current, setCurrent] = useState(props.current);
  const [previewing, setPreviewing] = useState<ThemeDefinition | null>(null);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCurrent = (d: ThemeDefinition) =>
    d.family === current.family && d.variant === current.variant && d.version === current.version;

  const all = families.flatMap((f) => f.designs);
  const currentDesign = all.find(isCurrent) ?? null;

  async function apply(d: ThemeDefinition) {
    setApplying(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/design", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ family: d.family, variant: d.variant, version: d.version }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not apply that design.");
      setCurrent({ family: d.family, variant: d.variant, version: d.version });
      setPreviewing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl">
      <header className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-electric">Storefront</p>
          <h1 className="mt-1 font-display text-3xl font-bold tracking-[-0.03em] text-navy">Choose how your booking experience looks</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate">
            Pick the design that feels most like your business. Every option uses your own branding, and changing the design never changes your services, pricing, or booking rules.
          </p>
        </div>
        <a
          href={storefrontUrl}
          target="_blank"
          rel="noopener"
          className="inline-flex shrink-0 items-center justify-center rounded-pill border border-cardline bg-white px-4 py-2 text-sm font-semibold text-navy shadow-sm transition hover:border-electric hover:text-electric"
        >
          Open live storefront ↗
        </a>
      </header>

      <section className="rounded-card border border-cardline bg-white p-5 shadow-card sm:p-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate">Current design</p>
            <h2 className="mt-1 font-display text-lg font-bold text-navy">What customers see today</h2>
          </div>
          {currentDesign && (
            <span className="mt-2 inline-flex w-fit rounded-pill bg-electric/10 px-3 py-1 text-xs font-semibold text-electric sm:mt-0">
              {currentDesign.label}
            </span>
          )}
        </div>

        {currentDesign ? (
          <div className="mt-5 overflow-hidden rounded-card border border-electric/30 bg-warmwhite/40 ring-1 ring-electric/5">
            <DesignPreview
              choice={current} brand={brand} identity={identity} strategy={strategy} site={site}
              height={320} scale={0.44}
            />
            <div className="flex flex-col gap-3 border-t border-cardline bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="font-display text-base font-bold text-navy">{currentDesign.label}</div>
                <div className="mt-1 max-w-2xl text-sm text-slate">{currentDesign.blurb}</div>
              </div>
              <a href={storefrontUrl} target="_blank" rel="noopener" className="shrink-0 text-sm font-semibold text-electric hover:underline">
                View live version →
              </a>
            </div>
          </div>
        ) : (
          <div className="mt-5 rounded-card border border-dashed border-cardline bg-warmwhite/50 p-5">
            <p className="text-sm font-medium text-navy">You are using the original storefront layout.</p>
            <p className="mt-1 text-sm text-slate">Choose one of the prepared designs below when you are ready to change it.</p>
          </div>
        )}
      </section>

      <section className="mt-8">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate">Design library</p>
            <h2 className="mt-1 font-display text-xl font-bold text-navy">Prepared storefront styles</h2>
            <p className="mt-1 text-sm text-slate">Preview any option with your own company before applying it.</p>
          </div>
          <p className="mt-2 text-xs text-slate sm:mt-0">{all.length} designs available</p>
        </div>

        <div className="mt-5 space-y-8">
          {families.map((f) => (
            <div key={f.family}>
              <div className="mb-4">
                <h3 className="font-display text-lg font-bold text-navy">{f.name}</h3>
                <p className="mt-1 max-w-2xl text-sm text-slate">{f.blurb}</p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                {f.designs.map((d) => {
                  const selected = isCurrent(d);
                  return (
                    <article
                      key={definitionKey(d)}
                      className={`overflow-hidden rounded-card border bg-white shadow-sm transition ${selected ? "border-electric ring-1 ring-electric/20" : "border-cardline hover:-translate-y-0.5 hover:shadow-card"}`}
                    >
                      <div className="relative bg-warmwhite/40 p-2">
                        <DesignPreview
                          choice={{ family: d.family, variant: d.variant, version: d.version }}
                          brand={brand} identity={identity} strategy={strategy} site={site}
                          height={220} scale={0.29}
                        />
                        {selected && (
                          <span className="absolute right-4 top-4 rounded-pill bg-electric px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm">Current</span>
                        )}
                      </div>

                      <div className="border-t border-cardline px-5 py-4">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h4 className="font-display text-base font-bold text-navy">{d.label}</h4>
                            <p className="mt-1 text-sm leading-5 text-slate">{d.blurb}</p>
                          </div>
                        </div>

                        <div className="mt-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setPreviewing(d)}
                            className="rounded-pill border border-cardline bg-white px-4 py-2 text-sm font-semibold text-navy transition hover:border-electric hover:text-electric"
                          >
                            Preview
                          </button>
                          {!selected && (
                            <button
                              type="button"
                              onClick={() => apply(d)}
                              disabled={applying}
                              className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
                            >
                              {applying ? "Applying…" : "Use this design"}
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {error && (
        <p role="alert" className="mt-6 rounded-card border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {previewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-navy/70 p-3 backdrop-blur-sm sm:p-6" role="dialog" aria-modal="true" aria-label={`Preview of ${previewing.label}`}>
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-card bg-white shadow-raised">
            <div className="flex flex-col gap-3 border-b border-cardline px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-electric">Design preview</p>
                <div className="mt-1 font-display text-lg font-bold text-navy">{previewing.label}</div>
                <div className="mt-1 text-sm text-slate">{previewing.blurb}</div>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => setPreviewing(null)} className="rounded-pill border border-cardline px-5 py-2 text-sm font-semibold text-navy hover:border-electric">
                  Close
                </button>
                {!isCurrent(previewing) && (
                  <button type="button" onClick={() => apply(previewing)} disabled={applying} className="rounded-pill bg-electric px-5 py-2 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-50">
                    {applying ? "Applying…" : "Use this design"}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-warmwhite p-3 sm:p-5">
              <DesignPreview
                choice={{ family: previewing.family, variant: previewing.variant, version: previewing.version }}
                brand={brand} identity={identity} strategy={strategy} site={site}
                height={720} scale={0.72}
              />
            </div>
            <div className="flex items-center gap-2 border-t border-cardline bg-warmwhite/70 px-5 py-3 text-xs text-slate">
              <span className="h-2 w-2 rounded-full bg-electric" aria-hidden="true" />
              Preview only — your live storefront does not change until you choose “Use this design.”
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
