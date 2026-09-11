/**
 * "Let's get your first service ready."
 *
 * A pilot, deliberately narrow: ONE trade, ONE service, one straight route.
 * It is not the all-trades onboarding experience and does not try to be.
 *
 * PROGRESS IS READ, NOT STORED. Every step's state comes from
 * loadPilotReadiness, which asks the rows that step writes. There is no
 * `wizardStep` column, so a contractor who clears a labor calibration walks
 * BACK to the labour step by itself — a stored counter would have kept
 * pointing at "approve" for a service that could no longer be priced.
 *
 * Friendly names only. A contractor never sees SURFACE_RACEWAY_ELBOW_INSIDE.
 */
import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { loadPilotReadiness, PILOT_SERVICE_SLUG, PILOT_ROUTE } from "@/lib/electrical/onboardingPilotReadiness";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "@/lib/routeResolver";
import { SURFACE_KEYS } from "@/prisma/_surfaceRouteModule";
import { FIELD_PROMPT, type PricingSettingsField } from "@/lib/pricingSettingsState";

const money = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : `$${(c / 100).toFixed(2)}`;

/** The straight pilot route, answered as a homeowner would. */
const ANSWERS: Record<string, string> = {
  outlet_load_type: "everyday", outlet_power_source: "tap_existing",
  below_above_access: "no_access", outlet_install_method: "surface",
  [SURFACE_KEYS.feet]: String(PILOT_ROUTE.feet), [SURFACE_KEYS.inside]: "0",
  [SURFACE_KEYS.outside]: "0", [SURFACE_KEYS.flat]: "0",
  [SURFACE_KEYS.surface]: "drywall", [SURFACE_KEYS.obstacles]: "clear",
};

export default async function FirstServicePage() {
  const view = await withAdminContractor(async (db, ctx) => {
    const service = await db.service.findFirst({
      where: { contractorId: ctx.contractorId, slug: PILOT_SERVICE_SLUG },
      select: { id: true, name: true, isPrimaryEligible: true, materialMultiplier: true,
                permitAdminCents: true, otherDirectCostCents: true },
    });
    if (!service) return null;

    const loaded = await loadServiceForResolution(db, service.id);
    let settings: unknown = null;
    try { settings = await loadPricingSettings(db, ctx.contractorId); } catch { settings = null; }
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const resolved = loaded ? (resolveRoute(loaded as never, ANSWERS, true, settings as never) as any) : null;
    const components = (resolved?.config?.components ?? []) as { key: string; label: string | null; quantity: number }[];

    const readiness = await loadPilotReadiness(db, ctx.contractorId, {
      components,
      context: { isPrimary: true, isPrimaryEligible: service.isPrimaryEligible,
                 servicePermitAdminEstablished: service.permitAdminCents !== null },
      service: { materialMultiplier: service.materialMultiplier, permitAdminCents: service.permitAdminCents,
                 otherDirectCostCents: service.otherDirectCostCents, isPrimaryEligible: service.isPrimaryEligible },
    });

    // Friendly labels for the labour step, from the canonical customer-facing
    // wording — never the component key.
    const labourRows = await db.canonicalComponent.findMany({
      where: { key: { in: components.map((c) => c.key) } },
      select: { id: true, key: true, customerFacingLabel: true,
                referenceLaborHours: true, referenceLaborUnit: true, referenceLaborStatus: true },
    });
    const own = await db.contractorComponent.findMany({
      where: { contractorId: ctx.contractorId, canonicalComponentId: { in: labourRows.map((r) => r.id) } },
      select: { canonicalComponentId: true, addFieldLaborHours: true },
    });
    const mine = new Map(own.map((o) => [o.canonicalComponentId, o.addFieldLaborHours]));

    const settingsRow = await db.pricingSettings.findUnique({
      where: { contractorId: ctx.contractorId },
      select: { crewHourRateCents: true, primaryMinimumCents: true,
                roundingIncrementCents: true, defaultPermitAdminCents: true },
    });

    return {
      readiness,
      labour: labourRows.map((r) => ({
        label: r.customerFacingLabel ?? "This part of the job",
        hours: mine.has(r.id) ? mine.get(r.id) ?? null : null,
        established: mine.has(r.id) && mine.get(r.id) !== null,
        reference: r.referenceLaborHours,
        referenceUnit: r.referenceLaborUnit,
        referenceStatus: r.referenceLaborStatus,
      })),
      settingsRow,
    };
  });

  if (!view) {
    return (
      <div>
        <h1 className="font-display text-2xl font-bold text-navy">Let&rsquo;s get your first service ready</h1>
        <p className="mt-2 text-sm text-slate">
          Your services haven&rsquo;t been set up yet. Install your Electrical catalog to begin.
        </p>
      </div>
    );
  }

  const { readiness, labour, settingsRow } = view;
  const done = readiness.steps.filter((s) => s.done).length;

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-navy">
        Let&rsquo;s get your first service ready
      </h1>
      <p className="mt-1 text-sm text-slate">
        We&rsquo;ll set up <strong>{readiness.serviceName}</strong> end to end, then you can price the
        rest of your catalog the same way. {done} of {readiness.steps.length} steps done.
      </p>

      <ol className="mt-6 space-y-3">
        {readiness.steps.map((s) => {
          const current = readiness.resumeAt === s.key;
          return (
            <li key={s.key}
                className={`rounded-lg border p-4 ${current ? "border-navy bg-navy/5" : "border-slate/20"}`}>
              <div className="flex items-center justify-between">
                <span className="font-medium text-navy">
                  {s.done ? "✓ " : ""}{s.title}
                </span>
                {current && <span className="text-xs font-semibold uppercase text-navy">Next</span>}
              </div>

              {s.key === "LABOR" && current && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-slate">
                    How long does each part of this job take you? Enter your own times — this is
                    what makes the price yours.
                  </p>
                  {labour.map((l) => (
                    <div key={l.label} className="flex items-baseline justify-between text-sm">
                      <span className="text-navy">{l.label}</span>
                      <span className="text-slate">
                        {l.established ? `${l.hours} h` : "not set"}
                        {/* Reference is shown BESIDE the contractor's own figure and
                            never written into it. A disputed figure says so. */}
                        {l.reference !== null && (
                          <em className="ml-2 text-xs">
                            {l.referenceStatus === "DISPUTED"
                              ? "sources disagree — enter your own"
                              : `published reference: ${l.reference} ${l.referenceUnit ?? "h"}`}
                          </em>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {s.key === "PRICING_SETTINGS" && current && settingsRow && (
                <div className="mt-3 space-y-1">
                  {(s.outstanding as PricingSettingsField[]).map((f) => (
                    <p key={f} className="text-sm text-slate">Still needed: {FIELD_PROMPT[f]}</p>
                  ))}
                </div>
              )}

              {!s.done && s.outstanding.length > 0 && s.key !== "PRICING_SETTINGS" && (
                <ul className="mt-2 list-disc pl-5 text-sm text-slate">
                  {s.outstanding.slice(0, 6).map((o) => <li key={o}>{o}</li>)}
                </ul>
              )}
            </li>
          );
        })}
      </ol>

      {readiness.proposed?.totalCents !== null && readiness.proposed && (
        <div className="mt-6 rounded-lg border border-slate/20 p-4">
          <h2 className="font-display text-lg font-bold text-navy">Your proposed price</h2>
          <dl className="mt-3 space-y-1 text-sm">
            <div className="flex justify-between"><dt className="text-slate">Labour</dt>
              <dd className="text-navy">{money(readiness.proposed.laborCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate">Materials you buy</dt>
              <dd className="text-navy">{money(readiness.proposed.materialCostCents)}</dd></div>
            <div className="flex justify-between"><dt className="text-slate">Materials, with your markup</dt>
              <dd className="text-navy">{money(readiness.proposed.materialCents)}</dd></div>
            {readiness.proposed.minimumApplied && (
              <div className="flex justify-between"><dt className="text-slate">Your service-call minimum applied</dt>
                <dd className="text-navy">yes</dd></div>
            )}
            <div className="mt-2 flex justify-between border-t border-slate/20 pt-2 font-semibold">
              <dt className="text-navy">Proposed customer price</dt>
              <dd className="text-navy">{money(readiness.proposed.totalCents)}</dd></div>
          </dl>
          <p className="mt-3 text-xs text-slate">
            Worked out from a {PILOT_ROUTE.feet}-foot surface run — the materials you actually buy,
            rounded to whole packages, plus your own labour.
          </p>
        </div>
      )}

      {readiness.proposed?.refusal === "DERIVED_PRICING_APPROVAL_STALE" && (
        <p className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-navy">
          Your price changed because one of its cost inputs changed. Review and approve the
          updated price.
        </p>
      )}

      {readiness.live && (
        <div className="mt-6 rounded-lg border border-emerald-300 bg-emerald-50 p-5">
          <h2 className="font-display text-xl font-bold text-navy">
            Your first service is ready to book.
          </h2>
          <p className="mt-2 text-lg text-navy">
            {readiness.serviceName} — <strong>{money(readiness.proposed?.totalCents)}</strong> · Live
          </p>
          <div className="mt-4 flex flex-wrap gap-3 text-sm">
            <Link href="/dashboard/first-service" className="rounded border border-navy px-3 py-1.5 text-navy">
              Set up another service
            </Link>
            <Link href="/dashboard/services" className="rounded border border-navy px-3 py-1.5 text-navy">
              Finish more of my catalogue
            </Link>
            <Link href="/dashboard" className="rounded bg-navy px-3 py-1.5 text-white">
              Go to dashboard
            </Link>
          </div>
          <p className="mt-4 text-xs text-slate">
            Material costs are maintained in Materials &amp; Costs from here on — change a price
            once and every service using it follows.
          </p>
        </div>
      )}
    </div>
  );
}
