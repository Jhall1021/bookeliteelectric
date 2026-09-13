"use client";

/**
 * The first-service wizard.
 *
 * Every save goes to a real admin endpoint, then router.refresh() re-reads the
 * page from the database — so "which step am I on" is always the answer stored
 * state gives, never something this component remembers. The only local state
 * is which card is open and what is typed but not yet saved.
 *
 * Language rule for this file: nothing a contractor reads may mention a
 * component, a role, a basis, a fingerprint, a policy or a scope.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { WizardData, WizardLabor, WizardPart } from "@/lib/electrical/firstServiceWizardData";

type Ready = Extract<WizardData, { catalogInstalled: true }>;
type StepKey = "MATERIALS" | "LABOR" | "PRICING_SETTINGS" | "APPROVE" | "ACTIVATE";

const money = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const wholeMoney = (c: number | null | undefined) =>
  c === null || c === undefined ? "—" : `$${Math.round(c / 100).toLocaleString("en-US")}`;
/** "$1,234.50" -> 123450. Null for anything that is not a non-negative amount. */
const toCents = (s: string): number | null => {
  const t = s.replace(/[$,\s]/g, "");
  if (t === "" || !/^\d*(\.\d{0,2})?$/.test(t)) return null;
  return Math.round(parseFloat(t) * 100);
};
const dollars = (c: number | null) => (c === null ? "" : (c / 100).toFixed(2));

async function call(method: "POST" | "PATCH", url: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

const card = "rounded-xl border border-slate/20 bg-white p-5";
const label = "block text-sm font-medium text-navy";
const help = "mt-0.5 text-xs text-slate";
// Width is NOT part of the base style: appending a second w-* class to one
// that already had w-28 left Tailwind to pick a winner by stylesheet order,
// and the parts table rendered with oversized inputs and colliding units.
const field = "rounded-md border border-slate/30 px-2 py-1.5 text-sm text-navy focus:border-electric focus:outline-none";
const input = `mt-1 w-28 ${field}`;
const primaryBtn = "rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white disabled:opacity-40";
const quietBtn = "rounded-md border border-slate/30 px-3 py-1.5 text-sm text-navy";

export default function FirstServiceWizard({ data }: { data: WizardData }) {
  if (!data.catalogInstalled) return <InstallCatalog />;
  return <Wizard data={data} />;
}

function InstallCatalog() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-navy">Let&rsquo;s get your first service ready</h1>
      <p className="mt-2 text-sm text-slate">
        We&rsquo;ll set up one service from start to finish so homeowners can book it at your price.
        First, add the Electrical services to your account.
      </p>
      <div className={`${card} mt-6`}>
        <p className="text-sm text-navy">This adds our Electrical service list to your account. Nothing goes live and no prices are set.</p>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <button className={`${primaryBtn} mt-4`} disabled={busy} onClick={async () => {
          setBusy(true); setError(null);
          const r = await call("POST", "/api/admin/setup/install-catalog", {});
          setBusy(false);
          if (!r.ok) { setError(r.json?.message ?? "That didn't work — please try again."); return; }
          router.refresh();
        }}>{busy ? "Adding…" : "Add Electrical services"}</button>
      </div>
    </div>
  );
}

function Wizard({ data }: { data: Ready }) {
  const order: StepKey[] = ["MATERIALS", "LABOR", "PRICING_SETTINGS", "APPROVE", "ACTIVATE"];
  const doneOf = (k: StepKey) => data.steps.find((s) => s.key === k)?.done ?? false;
  const resume = (order.find((k) => !doneOf(k)) ?? null) as StepKey | null;
  const [open, setOpen] = useState<StepKey | null>(resume);
  const completed = order.filter(doneOf).length;

  // Moving on waits for the SAVED state. Advancing the moment a save was sent
  // opened the next card on the old data — the review card told a contractor
  // their price would appear "once everything is complete", straight after they
  // had completed it. The target is held until the refreshed page arrives.
  const pending = useRef<{ to: StepKey | null } | null>(null);
  const advance = (to: StepKey | null) => { pending.current = { to }; };
  useEffect(() => {
    if (!pending.current) return;
    setOpen(pending.current.to);
    pending.current = null;
  }, [data]);

  if (data.live && !data.needsReapproval && open === null) return <Success data={data} onEdit={() => setOpen("MATERIALS")} />;

  const titles: Record<StepKey, string> = {
    MATERIALS: "Materials", LABOR: "Labor", PRICING_SETTINGS: "Your pricing",
    APPROVE: "Review your price", ACTIVATE: "Go live",
  };
  const summaries: Record<StepKey, string> = {
    MATERIALS: `${data.parts.filter((p) => p.configured).length} parts priced`,
    LABOR: `${data.labor.filter((l) => l.hours !== null).length} of ${data.labor.length} set`,
    PRICING_SETTINGS: data.pricing.crewHourRateCents !== null ? `${wholeMoney(data.pricing.crewHourRateCents)} per crew-hour` : "",
    APPROVE: data.proposal ? `${wholeMoney(data.proposal.totalCents)} approved` : "",
    ACTIVATE: data.active ? "Live" : "",
  };

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold text-navy">Let&rsquo;s get your first service ready</h1>
      <p className="mt-1 text-sm text-slate">
        We&rsquo;ll set up <strong className="text-navy">{data.serviceName}</strong> so homeowners can book it at your price.
        Everything saves as you go — you can stop and come back.
      </p>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-slate">{completed} of {order.length} steps done</p>

      {data.needsReapproval && (
        <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-navy">
          <strong>Price needs review.</strong> Your costs changed, so homeowners are asked to send details for a quote
          until you approve the updated price.
          <button className="ml-2 font-semibold text-electric underline" onClick={() => setOpen("APPROVE")}>Review it</button>
        </div>
      )}

      <ol className="mt-5 space-y-3">
        {order.map((k, i) => {
          const done = doneOf(k);
          const isOpen = open === k;
          return (
            <li key={k} className={`${card} ${isOpen ? "ring-2 ring-navy/20" : ""}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${done ? "bg-emerald-600 text-white" : "bg-slate/10 text-navy"}`}>
                    {done ? "✓" : i + 1}
                  </span>
                  <div>
                    <p className="font-semibold text-navy">{titles[k]}</p>
                    {!isOpen && done && summaries[k] && <p className="text-xs text-slate">{summaries[k]}</p>}
                  </div>
                </div>
                {!isOpen && (done || k === resume) && (
                  <button className={quietBtn} onClick={() => setOpen(k)}>{done ? "Edit" : "Continue"}</button>
                )}
                {isOpen && <button className="text-xs text-slate underline" onClick={() => setOpen(null)}>Close</button>}
              </div>
              {isOpen && (
                <div className="mt-5 border-t border-slate/15 pt-5">
                  {k === "MATERIALS" && <MaterialsStep data={data} onNext={() => setOpen("LABOR")} />}
                  {k === "LABOR" && <LaborStep data={data} onNext={() => setOpen("PRICING_SETTINGS")} />}
                  {k === "PRICING_SETTINGS" && <PricingStep data={data} onNext={() => advance("APPROVE")} />}
                  {k === "APPROVE" && <ReviewStep data={data} onNext={() => advance("ACTIVATE")} />}
                  {k === "ACTIVATE" && <GoLiveStep data={data} onDone={() => advance(null)} />}
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/* ─────────────────────────── Materials ─────────────────────────── */

function Choice({ name, value, current, onPick, children }: {
  name: string; value: string; current: string | null; onPick: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="mr-5 inline-flex items-center gap-2 text-sm text-navy">
      <input type="radio" name={name} checked={current === value} onChange={() => onPick(value)} />
      {children}
    </label>
  );
}

function MaterialsStep({ data, onNext }: { data: Ready; onNext: () => void }) {
  const router = useRouter();
  const s = data.system;
  const [gauge, setGauge] = useState<string | null>(s.conductorGauge);
  const [ground, setGround] = useState<string | null>(s.groundingStrategy);
  const [spacing, setSpacing] = useState(s.supportSpacingFt?.toString() ?? "");
  const [ends, setEnds] = useState<string | null>(s.supportAtEachTerminus === null ? null : s.supportAtEachTerminus ? "yes" : "no");
  const [source, setSource] = useState<string | null>(s.sourceTermination);
  const [dest, setDest] = useState<string | null>(s.destinationTermination);
  const [slack, setSlack] = useState(s.slackDecided && s.slackFt !== 0 ? String(s.slackFt) : "");
  const [noSlack, setNoSlack] = useState(s.slackDecided && s.slackFt === 0);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const setupComplete = !!(gauge && ground && spacing && ends && source && dest && (noSlack || slack));

  const saveSetup = async () => {
    setBusy(true); setMsg(null);
    const spacingFt = Number(spacing);
    if (!(spacingFt > 0)) { setBusy(false); setMsg("Enter how far apart you place support clips, in feet."); return; }
    const slackFt = noSlack ? 0 : Number(slack);
    if (!noSlack && !(slackFt >= 0 && slack !== "")) { setBusy(false); setMsg("Enter the extra wire you leave at each connection, or choose “I don't add extra”."); return; }
    const results = await Promise.all([
      call("POST", "/api/admin/material-system", {
        systemKey: "SURFACE_RACEWAY", declaredSystemLabel: "Surface raceway",
        groundingStrategy: ground, supportSpacingFt: spacingFt, supportAtEachTerminus: ends === "yes",
        sourceTermination: source, sourceTerminationRole: source === "FITTING_REQUIRED" ? "SURFACE_RACEWAY_TRANSITION" : null,
        destinationTermination: dest, destinationTerminationRole: dest === "FITTING_REQUIRED" ? "SURFACE_RACEWAY_TRANSITION" : null,
      }),
      call("PATCH", "/api/admin/policies", { key: "surface_outlet.branch_conductor_spec", choice: gauge }),
      call("PATCH", "/api/admin/policies", { key: "surface_raceway.conductor_slack_per_termination", measurement: slackFt }),
    ]);
    setBusy(false);
    const failed = results.find((r) => !r.ok);
    if (failed) { setMsg(failed.json?.message ?? failed.json?.error ?? "Something didn't save — please try again."); return; }
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <section>
        <h3 className="font-semibold text-navy">How you run surface wiring</h3>
        <p className={help}>For a new outlet run in channel along the wall from an existing outlet.</p>
        <div className="mt-4 space-y-4">
          <div>
            <span className={label}>Wire size you use</span>
            <div className="mt-1">{["14", "12", "10"].map((g) => <Choice key={g} name="gauge" value={g} current={gauge} onPick={setGauge}>#{g}</Choice>)}</div>
          </div>
          <div>
            <span className={label}>Grounding</span>
            <div className="mt-1">
              <Choice name="ground" value="SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR" current={ground} onPick={setGround}>I pull a separate ground wire</Choice>
              <Choice name="ground" value="SYSTEM_PROVIDES_GROUNDING_PATH" current={ground} onPick={setGround}>My raceway serves as the ground</Choice>
            </div>
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <label htmlFor="clip-spacing" className={label}>Support clip every</label>
              <div className="flex items-center gap-2"><input id="clip-spacing" className={input} inputMode="decimal" value={spacing} onChange={(e) => setSpacing(e.target.value)} /> <span className="text-sm text-slate">feet</span></div>
            </div>
            <div>
              <span className={label}>Plus a clip near each end?</span>
              <div className="mt-2"><Choice name="ends" value="yes" current={ends} onPick={setEnds}>Yes</Choice><Choice name="ends" value="no" current={ends} onPick={setEnds}>No</Choice></div>
            </div>
          </div>
          <div>
            <span className={label}>Where the channel leaves the existing outlet</span>
            <div className="mt-1">
              <Choice name="source" value="FITTING_REQUIRED" current={source} onPick={setSource}>Needs an entrance fitting</Choice>
              <Choice name="source" value="DIRECT_ENTRY" current={source} onPick={setSource}>Goes straight in</Choice>
            </div>
          </div>
          <div>
            <span className={label}>Where the channel enters the new box</span>
            <div className="mt-1">
              <Choice name="dest" value="FITTING_REQUIRED" current={dest} onPick={setDest}>Needs an entrance fitting</Choice>
              <Choice name="dest" value="DIRECT_ENTRY" current={dest} onPick={setDest}>Goes straight in</Choice>
            </div>
          </div>
          <div>
            <label htmlFor="extra-wire" className={label}>Extra wire you leave at each connection</label>
            <div className="flex flex-wrap items-center gap-3">
              <input id="extra-wire" className={input} inputMode="decimal" disabled={noSlack} value={noSlack ? "" : slack} onChange={(e) => setSlack(e.target.value)} />
              <span className="text-sm text-slate">feet</span>
              <label className="inline-flex items-center gap-2 text-sm text-navy">
                <input type="checkbox" checked={noSlack} onChange={(e) => setNoSlack(e.target.checked)} /> I don&rsquo;t add extra
              </label>
            </div>
          </div>
        </div>
        {msg && <p className="mt-3 text-sm text-red-700">{msg}</p>}
        <button className={`${primaryBtn} mt-4`} disabled={!setupComplete || busy} onClick={saveSetup}>{busy ? "Saving…" : "Save how you run it"}</button>
      </section>

      <PartsTable parts={data.parts} ready={s.conductorGauge !== null} onNext={onNext} />
    </div>
  );
}

function PartsTable({ parts, ready, onNext }: { parts: WizardPart[]; ready: boolean; onNext: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Record<string, { qty: string; price: string }>>(() =>
    Object.fromEntries(parts.map((p) => [p.roleKey, { qty: p.packageQuantity?.toString() ?? "", price: dollars(p.packagePriceCents) }])));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allPriced = parts.every((p) => p.configured);

  const save = async () => {
    setBusy(true); setMsg(null);
    type Write = { kind: "bad"; name: string } | { kind: "save"; body: Record<string, unknown> };
    const writes: Write[] = [];
    for (const p of parts) {
      const d = draft[p.roleKey]; if (!d) continue;
      if (d.qty === "" && d.price === "") continue;
      const qty = Number(d.qty); const cents = toCents(d.price);
      if (!(qty > 0) || cents === null) { writes.push({ kind: "bad", name: p.name }); continue; }
      if (p.configured && qty === p.packageQuantity && cents === p.packagePriceCents) continue;
      writes.push({ kind: "save", body: { action: "set-cost-by-role", roleKey: p.roleKey, packageQuantity: qty, packageUnit: p.packageUnit, packagePriceCents: cents } });
    }
    const bad = writes.find((w) => w.kind === "bad");
    if (bad && bad.kind === "bad") { setBusy(false); setMsg(`Check the amount for ${bad.name}.`); return; }
    for (const w of writes) {
      if (w.kind !== "save") continue;
      const r = await call("POST", "/api/admin/materials", w.body);
      if (!r.ok) { setBusy(false); setMsg(r.json?.error ?? "Something didn't save."); return; }
    }
    setBusy(false);
    router.refresh();
  };

  const groups = [...new Set(parts.map((p) => p.group))];
  return (
    <section>
      <h3 className="font-semibold text-navy">What you pay for the parts</h3>
      <p className={help}>
        For each part: how it comes (a 5 ft length, a single piece, a 500 ft spool) and what you pay for that. We work out how many each job needs, in whole packs.
        {!ready && " Wire appears here once you've chosen a wire size above."}
      </p>
      {groups.map((g) => (
        <div key={g} className="mt-4">
          <div className="flex items-end justify-between gap-3 border-b border-slate/15 pb-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">{g}</p>
            <div className="flex items-end gap-4 text-xs font-semibold text-slate">
              <span className="w-36">You buy it in</span>
              <span className="w-28">You pay for that</span>
              <span className="w-14" />
            </div>
          </div>
          <div className="divide-y divide-slate/10">
            {parts.filter((p) => p.group === g).map((p) => (
              <div key={p.roleKey} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                <div className="min-w-[10rem]">
                  <p className="text-sm font-medium text-navy">{p.name}</p>
                  <p className="text-xs text-slate">{p.hint}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-slate">
                  <span className="flex w-36 items-center gap-2">
                    <input className={`${field} w-20`} inputMode="decimal" aria-label={`${p.name} pack size`} value={draft[p.roleKey]?.qty ?? ""}
                      onChange={(e) => setDraft({ ...draft, [p.roleKey]: { ...draft[p.roleKey], qty: e.target.value } })} />
                    <span>{p.packageUnit === "ft" ? "ft" : "pieces"}</span>
                  </span>
                  <span className="flex w-28 items-center gap-1">
                    <span>$</span>
                    <input className={`${field} w-24`} inputMode="decimal" aria-label={`${p.name} price`} value={draft[p.roleKey]?.price ?? ""}
                      onChange={(e) => setDraft({ ...draft, [p.roleKey]: { ...draft[p.roleKey], price: e.target.value } })} />
                  </span>
                  <span className={`w-14 text-xs ${p.configured ? "text-emerald-700" : "text-amber-700"}`}>{p.configured ? "Saved" : "Needed"}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
      {msg && <p className="mt-3 text-sm text-red-700">{msg}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save prices"}</button>
        {allPriced && ready && <button className={quietBtn} onClick={onNext}>Next: labor</button>}
      </div>
      <p className="mt-4 text-xs text-slate">You can change these any time in Materials &amp; Costs — a price you update there applies to every service that uses that part.</p>
    </section>
  );
}

/* ─────────────────────────── Labor ─────────────────────────── */

function LaborStep({ data, onNext }: { data: Ready; onNext: () => void }) {
  const router = useRouter();
  // ONE save for the step. Four per-row Save buttons meant a contractor who
  // filled every row and pressed the last button lost the other three,
  // silently. Rows still distinguish "typed minutes" from a deliberate
  // "No extra time", and an untouched row stays undecided — never zero.
  type Draft = { minutes: string; zero: boolean };
  const initial = (l: WizardLabor): Draft => ({
    minutes: l.hours !== null && l.hours > 0 ? String(+(l.hours * 60).toFixed(2)) : "",
    zero: l.hours === 0,
  });
  const [draft, setDraft] = useState<Record<string, Draft>>(() =>
    Object.fromEntries(data.labor.map((l) => [l.componentKey, initial(l)])));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const allSaved = data.labor.every((l) => l.hours !== null);

  const save = async () => {
    setBusy(true); setMsg(null);
    for (const l of data.labor) {
      const d = draft[l.componentKey];
      let hours: number | null | undefined;
      if (d.zero) hours = 0;
      else if (d.minutes.trim() === "") hours = undefined;        // untouched: leave as it is
      else {
        const m = Number(d.minutes);
        if (!(m >= 0)) { setBusy(false); setMsg(`Check the minutes for ${l.label}.`); return; }
        hours = m / 60;
      }
      if (hours === undefined) continue;
      if (l.hours !== null && Math.abs(l.hours - hours) < 1e-9) continue;
      const r = await call("POST", "/api/admin/component-labor", { action: "set", componentKey: l.componentKey, hours });
      if (!r.ok) { setBusy(false); setMsg(r.json?.error ?? "That didn't save."); return; }
    }
    setBusy(false);
    router.refresh();
  };

  const clear = async (l: WizardLabor) => {
    setBusy(true);
    await call("POST", "/api/admin/component-labor", { action: "clear", componentKey: l.componentKey });
    setDraft({ ...draft, [l.componentKey]: { minutes: "", zero: false } });
    setBusy(false);
    router.refresh();
  };

  return (
    <div>
      <p className="text-sm text-navy">How much field labor do you normally allow for each part of this job?</p>
      <p className={help}>Minutes your crew spends. This is what makes the price yours, so use your own numbers.</p>
      <div className="mt-4 divide-y divide-slate/10">
        {data.labor.map((l) => {
          const d = draft[l.componentKey];
          const typed = Number(d.minutes);
          return (
            <div key={l.componentKey} className="py-3.5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-sm">
                  <p className="text-sm font-medium text-navy">{l.label}</p>
                  <p className="text-xs text-slate">{l.explainer}</p>
                  {l.reference.kind === "REFERENCE" && (
                    <p className="mt-1 text-xs text-slate/80">
                      For reference, published estimates put this near {l.reference.minutes} min
                      {l.reference.partial ? " (a close, not exact, match)" : ""}.
                    </p>
                  )}
                  {l.reference.kind === "VARIES" && (
                    <p className="mt-1 text-xs text-slate/80">Published references vary. Enter the labor you normally allow.</p>
                  )}
                </div>
                <div className="text-right">
                  {d.zero ? (
                    <div className="flex items-center justify-end gap-3">
                      <span className="text-sm text-emerald-700">No extra time</span>
                      <button className="text-xs text-slate underline" disabled={busy}
                        onClick={() => (l.hours === 0 ? clear(l) : setDraft({ ...draft, [l.componentKey]: { minutes: "", zero: false } }))}>Change</button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-end gap-2">
                        <input className={`${field} w-20`} inputMode="decimal" aria-label={`${l.label} minutes`} value={d.minutes}
                          onChange={(e) => setDraft({ ...draft, [l.componentKey]: { minutes: e.target.value, zero: false } })} />
                        <span className="w-24 text-left text-sm text-slate">min {l.per === "foot" ? "per foot" : "per job"}</span>
                      </div>
                      {l.per === "foot" && d.minutes !== "" && typed >= 0 && (
                        <p className="mt-1 text-xs text-slate">About {((typed * data.routeFeet) / 60).toFixed(1)} hours on a {data.routeFeet} ft run</p>
                      )}
                      <button className="mt-1 text-xs text-slate underline" disabled={busy}
                        onClick={() => setDraft({ ...draft, [l.componentKey]: { minutes: "", zero: true } })}>No extra time for this</button>
                    </>
                  )}
                  <p className={`mt-0.5 text-xs ${l.hours !== null ? "text-emerald-700" : "text-amber-700"}`}>{l.hours !== null ? "Saved" : "Not set"}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {msg && <p className="mt-3 text-sm text-red-700">{msg}</p>}
      <div className="mt-4 flex items-center gap-3">
        <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save labor"}</button>
        {allSaved && <button className={quietBtn} onClick={onNext}>Next: your pricing</button>}
      </div>
    </div>
  );
}

/* ─────────────────────────── Pricing ─────────────────────────── */

function PricingStep({ data, onNext }: { data: Ready; onNext: () => void }) {
  const router = useRouter();
  const p = data.pricing;
  const [rate, setRate] = useState(dollars(p.crewHourRateCents));
  const [minimum, setMinimum] = useState(dollars(p.primaryMinimumCents));
  const [rounding, setRounding] = useState<string>(p.roundingIncrementCents === null ? "" : String(p.roundingIncrementCents));
  const [permitMode, setPermitMode] = useState<string | null>(p.defaultPermitAdminCents === null ? null : p.defaultPermitAdminCents === 0 ? "none" : "charge");
  const [permit, setPermit] = useState(p.defaultPermitAdminCents && p.defaultPermitAdminCents > 0 ? dollars(p.defaultPermitAdminCents) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setMsg(null);
    const rateC = toCents(rate), minC = toCents(minimum);
    if (rateC === null || rateC === 0) { setMsg("Enter what you charge per crew-hour."); return; }
    if (minC === null) { setMsg("Enter your minimum labor charge — use 0 if you don't have one."); return; }
    if (rounding === "") { setMsg("Choose how customer prices are rounded."); return; }
    let permitC: number | null = null;
    if (p.permitAsked) {
      if (permitMode === null) { setMsg("Choose whether you add a permit or admin charge."); return; }
      permitC = permitMode === "none" ? 0 : toCents(permit);
      if (permitC === null) { setMsg("Enter the permit or admin charge."); return; }
    }
    setBusy(true);
    const fields: [string, number][] = [["crewHourRateCents", rateC], ["primaryMinimumCents", minC], ["roundingIncrementCents", Number(rounding)]];
    if (permitC !== null) fields.push(["defaultPermitAdminCents", permitC]);
    for (const [field, value] of fields) {
      const r = await call("POST", "/api/admin/pricing-settings-fields", { action: "set", field, value });
      if (!r.ok) { setBusy(false); setMsg(r.json?.error ?? "Something didn't save."); return; }
    }
    setBusy(false);
    onNext();
    router.refresh();
  };

  return (
    <div className="space-y-5">
      <div>
        <label className={label}>What you charge per crew-hour</label>
        <p className={help}>One crew-hour is one van on site for an hour, with your helper included.</p>
        <div className="flex items-center gap-1"><span className="text-sm text-slate">$</span><input className={input} inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} /></div>
      </div>
      <div>
        <label className={label}>Your minimum labor charge for a visit</label>
        <p className={help}>On a small job, labor never comes in below this. It doesn&rsquo;t apply when the work is added to a job you&rsquo;re already doing.</p>
        <div className="flex items-center gap-1"><span className="text-sm text-slate">$</span><input className={input} inputMode="decimal" value={minimum} onChange={(e) => setMinimum(e.target.value)} /></div>
      </div>
      <div>
        <label className={label}>Round customer prices up to the nearest</label>
        <select className={`${input} w-40`} value={rounding} onChange={(e) => setRounding(e.target.value)}>
          <option value="">Choose…</option>
          <option value="100">$1</option>
          <option value="500">$5</option>
          <option value="1000">$10</option>
          <option value="2500">$25</option>
          <option value="0">Don&rsquo;t round</option>
        </select>
      </div>
      {p.permitAsked && (
        <div>
          <span className={label}>Permit or admin charge on this kind of job</span>
          <div className="mt-1 flex flex-wrap items-center">
            <Choice name="permit" value="none" current={permitMode} onPick={setPermitMode}>No charge</Choice>
            <Choice name="permit" value="charge" current={permitMode} onPick={setPermitMode}>Add</Choice>
            {permitMode === "charge" && <span className="flex items-center gap-1"><span className="text-sm text-slate">$</span><input className={input} inputMode="decimal" value={permit} onChange={(e) => setPermit(e.target.value)} /></span>}
          </div>
        </div>
      )}
      {msg && <p className="text-sm text-red-700">{msg}</p>}
      <button className={primaryBtn} disabled={busy} onClick={save}>{busy ? "Saving…" : "Save and review price"}</button>
    </div>
  );
}

/* ─────────────────────────── Review & approve ─────────────────────────── */

function Row({ name, value, sub }: { name: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <div><span className="text-sm text-navy">{name}</span>{sub && <span className="ml-2 text-xs text-slate">{sub}</span>}</div>
      <span className="text-sm tabular-nums text-navy">{value}</span>
    </div>
  );
}

function ReviewStep({ data, onNext }: { data: Ready; onNext: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const p = data.proposal;
  const approvedCurrent = data.steps.find((s) => s.key === "APPROVE")?.done ?? false;

  if (!p) {
    return (
      <p className="text-sm text-slate">
        Your price appears here once your materials, labor and pricing are complete.
      </p>
    );
  }

  const approve = async () => {
    setBusy(true); setMsg(null);
    const r = await call("POST", "/api/admin/derived-pricing-approval", { action: "approve", serviceId: data.serviceId, expectedFingerprint: data.approvalToken });
    setBusy(false);
    if (!r.ok) { setMsg(r.json?.message ?? "That didn't go through — please try again."); router.refresh(); return; }
    onNext();
    router.refresh();
  };

  const hrs = p.laborHours;
  return (
    <div>
      {data.needsReapproval && data.previouslyApprovedCents !== null && (
        <div className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-navy">
          Your costs changed. Review the updated customer price before fixed pricing resumes.
          <div className="mt-2 flex gap-6">
            <span>Previously approved <strong>{wholeMoney(data.previouslyApprovedCents)}</strong></span>
            <span>New price <strong>{wholeMoney(p.totalCents)}</strong></span>
          </div>
        </div>
      )}
      <p className="text-sm text-slate">For a {data.routeFeet}-foot straight run from an existing outlet:</p>
      <div className="mt-2 divide-y divide-slate/10 rounded-lg border border-slate/15 px-4 py-2">
        <Row name="Labor" sub={`${hrs.toFixed(2)} crew-hours × ${wholeMoney(p.crewHourRateCents)}`} value={money(p.laborCents)} />
        {p.minimumApplied && p.minimumAdjustmentCents > 0 && (
          <Row name="Brought up to your minimum labor charge" value={`+${money(p.minimumAdjustmentCents)}`} />
        )}
        <Row name="Materials" sub="what you pay, in whole packs" value={money(p.materialCostCents)} />
        {/* The rule stated, because it is compute()'s own fixed rule
            (calculateMaterialSellCents), not a contractor setting. */}
        {p.materialMarkupCents > 0 && <Row name="Materials markup" sub="30% on the first $750 of materials, 20% above" value={`+${money(p.materialMarkupCents)}`} />}
        {p.permitCents > 0 && <Row name="Permit / admin" value={`+${money(p.permitCents)}`} />}
        {p.roundingCents > 0 && <Row name="Rounded up" value={`+${money(p.roundingCents)}`} />}
        <div className="flex items-baseline justify-between py-2">
          <span className="font-semibold text-navy">Customer price</span>
          <span className="text-lg font-bold tabular-nums text-navy">{wholeMoney(p.totalCents)}</span>
        </div>
      </div>
      <p className="mt-3 text-xs text-slate">
        Longer or shorter runs are worked out the same way from your costs. Runs that turn corners come to you for a quick
        review before the homeowner gets a price.
      </p>
      {msg && <p className="mt-3 text-sm text-red-700">{msg}</p>}
      {approvedCurrent && !data.needsReapproval
        ? <p className="mt-4 text-sm text-emerald-700">You&rsquo;ve approved this price.</p>
        : <button className={`${primaryBtn} mt-4`} disabled={busy} onClick={approve}>{busy ? "Approving…" : "Approve this price"}</button>}
    </div>
  );
}

/* ─────────────────────────── Go live ─────────────────────────── */

function GoLiveStep({ data, onDone }: { data: Ready; onDone: () => void }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const approved = data.steps.find((s) => s.key === "APPROVE")?.done ?? false;

  if (data.active) {
    return data.needsReapproval
      ? <p className="text-sm text-navy">Live · <strong>Price needs review.</strong> Homeowners can still ask for this job, but they&rsquo;ll get a quick quote review instead of a fixed price until you approve the updated price.</p>
      : <p className="text-sm text-emerald-700">{data.serviceName} is live.</p>;
  }
  return (
    <div>
      <p className="text-sm text-navy">Make {data.serviceName} bookable on your storefront at the price you approved.</p>
      {msg && <p className="mt-3 text-sm text-red-700">{msg}</p>}
      <button className={`${primaryBtn} mt-4`} disabled={!approved || busy} onClick={async () => {
        setBusy(true); setMsg(null);
        const r = await call("PATCH", `/api/admin/services/${data.serviceId}`, { name: data.serviceName, active: true });
        setBusy(false);
        if (!r.ok) { setMsg(r.json?.message ?? "It couldn't go live yet."); return; }
        onDone();
        router.refresh();
      }}>{busy ? "Going live…" : `Make ${data.serviceName} bookable`}</button>
      {!approved && <p className="mt-2 text-xs text-slate">Approve your price first.</p>}
    </div>
  );
}

/* ─────────────────────────── Success ─────────────────────────── */

function Success({ data, onEdit }: { data: Ready; onEdit: () => void }) {
  return (
    <div className="max-w-2xl">
      <div className={`${card} border-emerald-300`}>
        <h1 className="text-base font-semibold text-emerald-700">Your first service is ready to book</h1>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="font-display text-xl font-bold text-navy">{data.serviceName}</span>
          <span className="text-xl font-bold text-navy">{wholeMoney(data.proposal?.totalCents)}</span>
        </div>
        <p className="mt-1 text-sm text-emerald-700">Live</p>
        <p className="mt-1 text-xs text-slate">Price shown for a {data.routeFeet}-foot straight run.</p>
        <div className="mt-5 flex flex-wrap gap-3">
          <Link href="/dashboard/services" className={quietBtn}>Set up another service</Link>
          <Link href="/dashboard/setup" className={quietBtn}>Finish setting up my catalog</Link>
          <Link href="/dashboard" className={primaryBtn}>Go to dashboard</Link>
        </div>
        <button className="mt-4 text-xs text-slate underline" onClick={onEdit}>Review this service&rsquo;s setup</button>
      </div>
    </div>
  );
}
