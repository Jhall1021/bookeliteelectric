"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  suggestPrimaryPrice,
  suggestWwtPrice,
  materialMultiplierFor,
  type PricingSettings,
} from "@/lib/pricing";

type Props = {
  serviceId: string;
  publishedBaseCents: number | null;
  publishedWwtCents: number | null;
  publishedApprovedAt: string | null;
  estimatedMinutes: number | null;
  estimatedMinutesReviewed: boolean;
  requiresTechCount: number;
  fieldLaborHours: number | null;
  wwtLaborHours: number | null;
  materialCostCents: number | null;
  materialMultiplier: number | null;
  permitAdminCents: number | null;
  otherDirectCostCents: number | null;
  isPrimaryEligible: boolean;
  photoState: string;
  /** Kept only to show how the current published price was derived. */
  legacyPrimaryUnits: number | null;
  settings: PricingSettings | null;
};

const money = (c: number | null) => (c === null ? "—" : `$${(c / 100).toFixed(2)}`);
const numOrNull = (s: string) => (s === "" ? null : Number(s));
const str = (n: number | null) => (n === null || n === undefined ? "" : String(n));

export default function PricingPanel(p: Props) {
  const router = useRouter();
  const [hours, setHours] = useState(str(p.fieldLaborHours));
  const [wwtHours, setWwtHours] = useState(str(p.wwtLaborHours));
  const [techs, setTechs] = useState(String(p.requiresTechCount));
  const [minutes, setMinutes] = useState(str(p.estimatedMinutes));
  const [minutesOk, setMinutesOk] = useState(p.estimatedMinutesReviewed);
  const [material, setMaterial] = useState(
    p.materialCostCents === null ? "" : (p.materialCostCents / 100).toFixed(2)
  );
  const [multOverride, setMultOverride] = useState(str(p.materialMultiplier));
  const [permit, setPermit] = useState(
    p.permitAdminCents === null ? "" : (p.permitAdminCents / 100).toFixed(2)
  );
  const [other, setOther] = useState(
    p.otherDirectCostCents === null ? "" : (p.otherDirectCostCents / 100).toFixed(2)
  );
  const [primaryEligible, setPrimaryEligible] = useState(p.isPrimaryEligible);
  const [photoState, setPhotoState] = useState(p.photoState);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const materialCents = material === "" ? null : Math.round(parseFloat(material) * 100);

  const inputs = useMemo(
    () => ({
      fieldLaborHours: numOrNull(hours),
      wwtLaborHours: numOrNull(wwtHours),
      requiresTechCount: Number(techs) || 1,
      materialCostCents: materialCents,
      materialMultiplier: numOrNull(multOverride),
      permitAdminCents: permit === "" ? null : Math.round(parseFloat(permit) * 100),
      otherDirectCostCents: other === "" ? null : Math.round(parseFloat(other) * 100),
      isPrimaryEligible: primaryEligible,
    }),
    [hours, wwtHours, techs, materialCents, multOverride, permit, other, primaryEligible]
  );

  // Recomputed live as the admin types. Nothing here writes anything —
  // publishing is a separate, explicit action.
  const primary = p.settings ? suggestPrimaryPrice(inputs, p.settings) : null;
  const wwt = p.settings ? suggestWwtPrice(inputs, p.settings) : null;
  const derivedMult = materialCents ? materialMultiplierFor(materialCents) : null;

  async function send(action: "save" | "publish") {
    setBusy(true);
    setMsg(null);
    setError(null);
    const res = await fetch(`/api/admin/services/${p.serviceId}/pricing`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        fieldLaborHours: numOrNull(hours),
        wwtLaborHours: numOrNull(wwtHours),
        requiresTechCount: Number(techs) || 1,
        estimatedMinutes: numOrNull(minutes),
        estimatedMinutesReviewed: minutesOk,
        materialCostCents: materialCents,
        materialMultiplier: numOrNull(multOverride),
        permitAdminCents: permit === "" ? null : Math.round(parseFloat(permit) * 100),
        otherDirectCostCents: other === "" ? null : Math.round(parseFloat(other) * 100),
        isPrimaryEligible: primaryEligible,
        photoState,
      }),
    });
    setBusy(false);
    if (res.ok) {
      setMsg(action === "publish" ? "Published — customers now see this price." : "Inputs saved. Published price unchanged.");
      router.refresh();
      setTimeout(() => setMsg(null), 4000);
    } else {
      let detail = `${res.status} ${res.statusText}`;
      try {
        const d = await res.json();
        if (d?.error) detail = d.error;
      } catch {}
      setError(detail);
    }
  }

  const field = "mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";
  const label = "text-xs font-medium text-slate";

  return (
    <div className="mt-8 max-w-xl rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-lg font-bold text-navy">Pricing</h2>
      <p className="mt-1 text-sm text-slate">
        Changing anything here updates the <em>suggested</em> price only. The published price
        never moves until you press Publish.
      </p>

      <div className="mt-5 grid grid-cols-2 gap-4 rounded-card bg-warmwhite p-4">
        <div>
          <div className={label}>Published (what customers pay)</div>
          <div className="font-display text-2xl font-bold text-navy">{money(p.publishedBaseCents)}</div>
          <div className="mt-0.5 text-xs text-slate">
            While we&rsquo;re there: {money(p.publishedWwtCents)}
          </div>
          {p.publishedApprovedAt ? (
            <div className="mt-1 text-xs text-success">
              Approved {new Date(p.publishedApprovedAt).toLocaleDateString()}
            </div>
          ) : (
            <div className="mt-1 text-xs text-slate">
              Never approved here{p.legacyPrimaryUnits !== null ? " — set from the original import" : ""}
            </div>
          )}
        </div>
        <div>
          <div className={label}>Suggested (calculated)</div>
          {primary?.totalCents != null ? (
            <>
              <div className="font-display text-2xl font-bold text-electric">
                {money(primary.totalCents)}
              </div>
              <div className="mt-0.5 text-xs text-slate">
                While we&rsquo;re there: {wwt?.totalCents != null ? money(wwt.totalCents) : "—"}
              </div>
            </>
          ) : (
            <div className="text-sm text-amber-700">
              {primary?.unavailableReason ?? "Pricing settings not configured"}
            </div>
          )}
        </div>
      </div>

      {primary?.totalCents != null && (
        <div className="mt-2 rounded-card border border-cardline p-3 text-xs text-slate">
          Labor {money(primary.laborCents)}
          {primary.minimumApplied && (
            <span className="text-navy"> (service-call minimum applied)</span>
          )}
          {primary.materialCents > 0 && <> · material {money(primary.materialCents)}</>}
          {primary.permitCents > 0 && <> · permit {money(primary.permitCents)}</>}
          {primary.otherCents > 0 && <> · other {money(primary.otherCents)}</>}
          <> · {primary.actualTechHours.toFixed(2)} crew-hours</>
        </div>
      )}

      <div className="mt-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Actual field labor (crew-hours)</label>
            <input
              type="number" step="0.25" min="0" value={hours}
              onChange={(e) => setHours(e.target.value)}
              placeholder="not established"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Elite crews (normally 1)</label>
            <input
              type="number" step="1" min="1" value={techs}
              onChange={(e) => setTechs(e.target.value)}
              className={field}
            />
            {/* Vans, not people. Every van carries a lead and a helper, and
                both are already inside the crew-hour rate — putting 2 here
                means a genuine second van and doubles the price. */}
            <p className="mt-1 text-xs text-slate">
              One crew is a van with a lead and a helper. Only change this for a
              job that genuinely needs a second van.
            </p>
          </div>
        </div>

        {hours === "" && (
          <p className="rounded-card bg-amber-50 p-3 text-xs text-amber-800">
            No suggested price until actual field hours are entered. Deliberately not
            derived from the dispatch duration — that&rsquo;s a different number, and
            guessing is what produced the labor figures behind the current prices.
          </p>
        )}

        <div>
          <label className={label}>While We&rsquo;re There labor (incremental hours)</label>
          <input
            type="number" step="0.25" min="0" value={wwtHours}
            onChange={(e) => setWwtHours(e.target.value)}
            placeholder="leave blank if this service has no add-on price"
            className={field}
          />
          <p className="mt-1 text-xs text-slate">
            No service-call minimum applies here — the technician is already on site.
          </p>
          {/* The commonest confusion in this panel: editing the primary hours
              doesn't move the add-on price, because incremental work isn't a
              fraction of the full job. Says so where it's noticed. */}
          {wwtHours === "" && p.publishedWwtCents !== null && (
            <p className="mt-1 rounded-card bg-amber-50 p-2 text-xs text-amber-800">
              This service sells an add-on at {money(p.publishedWwtCents)}, but the hours
              behind it were never recorded — so there&rsquo;s no suggested add-on price to
              compare it against. Editing the primary hours above won&rsquo;t change it.
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Dispatch duration (minutes)</label>
            <input
              type="number" step="5" min="0" value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
              className={field}
            />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-navy">
              <input
                type="checkbox" checked={minutesOk}
                onChange={(e) => setMinutesOk(e.target.checked)}
                className="h-4 w-4 accent-[#1B6BFF]"
              />
              Duration reviewed
            </label>
          </div>
        </div>
        {!minutesOk && (
          <p className="text-xs text-amber-700">
            This duration hasn&rsquo;t been confirmed. It drives scheduling capacity, so an
            optimistic value over-books the day.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Direct material cost ($)</label>
            <input
              type="number" step="0.01" min="0" value={material}
              onChange={(e) => setMaterial(e.target.value)}
              placeholder="0.00"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Markup multiplier</label>
            <input
              type="number" step="0.01" min="1" value={multOverride}
              onChange={(e) => setMultOverride(e.target.value)}
              placeholder={derivedMult ? `${derivedMult.toFixed(2)} (from tier)` : "auto"}
              className={field}
            />
            {derivedMult && multOverride === "" && (
              <p className="mt-1 text-xs text-success">
                Tier: {derivedMult.toFixed(2)}× applied automatically
              </p>
            )}
            {multOverride !== "" && derivedMult && Number(multOverride) !== derivedMult && (
              <p className="mt-1 text-xs text-amber-700">
                Overriding the {derivedMult.toFixed(2)}× tier
              </p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={label}>Permit / admin ($)</label>
            <input
              type="number" step="0.01" min="0" value={permit}
              onChange={(e) => setPermit(e.target.value)}
              placeholder="0.00"
              className={field}
            />
          </div>
          <div>
            <label className={label}>Other direct cost ($)</label>
            <input
              type="number" step="0.01" min="0" value={other}
              onChange={(e) => setOther(e.target.value)}
              placeholder="0.00"
              className={field}
            />
          </div>
        </div>

        <div>
          <label className={label}>Customer photos</label>
          <select
            value={photoState}
            onChange={(e) => setPhotoState(e.target.value)}
            className={field}
          >
            <option value="NONE">None — routine standardized work</option>
            <option value="PREPARATION">Preparation — price locked, photos help us arrive ready</option>
            <option value="REVIEW_REQUIRED">Review required — photos gate the price</option>
          </select>
        </div>

        <label className="flex cursor-pointer items-start gap-2">
          <input
            type="checkbox" checked={primaryEligible}
            onChange={(e) => setPrimaryEligible(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[#1B6BFF]"
          />
          <span className="text-xs">
            <span className="font-semibold text-navy">Can be the first service on a visit</span>
            <span className="mt-0.5 block text-slate">
              Uncheck for add-on-only items such as the Elite TV mounts. The service-call
              minimum only applies to work that can be the reason a technician is dispatched.
            </span>
          </span>
        </label>
      </div>

      {msg && <p className="mt-4 rounded-card bg-success/10 p-3 text-sm text-success">{msg}</p>}
      {error && <p className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="mt-5 flex gap-3">
        <button
          onClick={() => send("save")}
          disabled={busy}
          className="flex-1 rounded-pill border border-cardline py-2.5 text-sm font-semibold text-navy hover:border-electric disabled:opacity-50"
        >
          {busy ? "Working..." : "Save inputs"}
        </button>
        <button
          onClick={() => send("publish")}
          disabled={busy || primary?.totalCents == null}
          className="flex-1 rounded-pill bg-electric py-2.5 text-sm font-semibold text-white hover:bg-electric-hover disabled:opacity-40"
          title={primary?.totalCents == null ? "No suggested price to publish" : undefined}
        >
          Publish {primary?.totalCents != null ? money(primary.totalCents) : ""}
        </button>
      </div>
    </div>
  );
}
