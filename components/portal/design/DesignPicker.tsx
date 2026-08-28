"use client";

import { useState } from "react";
import DesignPreview from "./DesignPreview";
import { definitionKey, type ThemeDefinition } from "@/lib/theme/definition";
import type { BrandInputs } from "@/lib/theme/resolve";
import type { StorefrontIdentity } from "@/lib/storefrontIdentity";
import type { PricingStrategy } from "@prisma/client";

/**
 * Choosing a storefront design — Phase 4, ADR-015.
 *
 * CURATED. The contractor sees pictures of their own business in six finished
 * designs and picks one. They do not see structural axes, token values, fonts,
 * radii, shadows or spacing, because a contractor asked to set forty switches
 * produces a worse-looking site than one asked to choose between six.
 *
 * The vocabulary is deliberately plain — "crisp, straightforward,
 * professional", not "a stacked navigation with an elevated card treatment".
 * Nobody should need design terminology to answer this question.
 *
 * Browse -> Preview with my company -> Apply. Browsing and previewing are pure
 * reads; only Apply writes, and it writes family, variant and version.
 */
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
    <div>
      <header className="mb-8">
        <h1 className="font-display text-2xl font-bold text-navy">Your storefront design</h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          Every design shows your own logo, colours and company details, so what you see here is
          what your customers will see. Picking one changes how your storefront looks — never what
          you sell or what you charge.
        </p>
      </header>

      {/* CURRENT ------------------------------------------------------------ */}
      <section className="mb-12">
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate">Current design</h2>
        {currentDesign ? (
          <div className="mt-3 overflow-hidden rounded-card border-2 border-electric bg-white">
            <DesignPreview
              choice={current} brand={brand} identity={identity} strategy={strategy} site={site}
              height={300} scale={0.42}
            />
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-cardline px-5 py-4">
              <div>
                <div className="font-display text-base font-bold text-navy">{currentDesign.label}</div>
                <div className="mt-0.5 text-sm text-slate">{currentDesign.blurb}</div>
              </div>
              <a href={storefrontUrl} target="_blank" rel="noopener"
                 className="text-sm font-semibold text-electric hover:underline">
                View my live storefront
              </a>
            </div>
          </div>
        ) : (
          <p className="mt-3 text-sm text-slate">
            Your storefront is on the original layout. Choose one of the designs below to change it.
          </p>
        )}
      </section>

      {/* AVAILABLE ---------------------------------------------------------- */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-[0.12em] text-slate">Available designs</h2>

        {families.map((f) => (
          <div key={f.family} className="mt-8">
            <h3 className="font-display text-lg font-bold text-navy">{f.name}</h3>
            <p className="text-sm text-slate">{f.blurb}</p>

            <div className="mt-4 grid gap-5 md:grid-cols-2">
              {f.designs.map((d) => (
                <div key={definitionKey(d)}
                     className={`overflow-hidden rounded-card border bg-white ${
                       isCurrent(d) ? "border-2 border-electric" : "border-cardline"}`}>
                  <DesignPreview
                    choice={{ family: d.family, variant: d.variant, version: d.version }}
                    brand={brand} identity={identity} strategy={strategy} site={site}
                    height={200} scale={0.28}
                  />
                  <div className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="font-display text-base font-bold text-navy">{d.label}</span>
                      {isCurrent(d) && (
                        <span className="rounded-pill bg-electric px-2 py-0.5 text-[11px] font-semibold text-white">
                          Current
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-slate">{d.blurb}</p>
                    <div className="mt-4 flex gap-2">
                      <button type="button" onClick={() => setPreviewing(d)}
                              className="rounded-pill border border-cardline px-4 py-2 text-sm font-semibold text-navy transition hover:border-electric hover:text-electric">
                        Preview with my company
                      </button>
                      {!isCurrent(d) && (
                        <button type="button" onClick={() => apply(d)} disabled={applying}
                                className="rounded-pill bg-electric px-4 py-2 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50">
                          {applying ? "Applying…" : "Use this design"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </section>

      {error && (
        <p role="alert" className="mt-6 rounded-card border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {/* PREVIEW ------------------------------------------------------------ */}
      {previewing && (
        <div className="fixed inset-0 z-50 flex flex-col bg-navy/60 p-4 sm:p-8"
             role="dialog" aria-modal="true" aria-label={`Preview of ${previewing.label}`}>
          <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col overflow-hidden rounded-card bg-white">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-cardline px-5 py-4">
              <div>
                <div className="font-display text-base font-bold text-navy">{previewing.label}</div>
                <div className="mt-0.5 text-sm text-slate">{previewing.blurb}</div>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setPreviewing(null)}
                        className="rounded-pill border border-cardline px-5 py-2 text-sm font-semibold text-navy">
                  Close
                </button>
                {!isCurrent(previewing) && (
                  <button type="button" onClick={() => apply(previewing)} disabled={applying}
                          className="rounded-pill bg-electric px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {applying ? "Applying…" : "Apply this design"}
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 overflow-auto bg-warmwhite p-4">
              <DesignPreview
                choice={{ family: previewing.family, variant: previewing.variant, version: previewing.version }}
                brand={brand} identity={identity} strategy={strategy} site={site}
                height={720} scale={0.72}
              />
            </div>
            {/* Said plainly, because "preview" is not a universally understood
                word and a contractor should never wonder whether they have
                already changed their live site. */}
            <p className="border-t border-cardline px-5 py-3 text-xs text-slate">
              This is a preview. Your live storefront has not changed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
