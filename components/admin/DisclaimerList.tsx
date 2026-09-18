"use client";

import { useState } from "react";
import type { PendingDisclaimer } from "@/lib/disclaimerAuthoring";

/**
 * One card per disclaimer CONCEPT, not one per affected service — same
 * reasoning as PolicyList: TAP_EXISTING_FIXTURE_FINISHED alone reaches four
 * services, and listed per service it looks like four problems instead of
 * one sentence to write.
 */
export default function DisclaimerList({ disclaimers }: { disclaimers: PendingDisclaimer[] }) {
  if (disclaimers.length === 0) {
    return (
      <div className="rounded-card border border-cardline bg-warmwhite/60 p-5 text-sm text-slate">
        <p className="font-semibold text-navy">No disclaimers to write.</p>
        <p className="mt-1">Your current catalog does not need any contractor-specific disclosures.</p>
      </div>
    );
  }

  const open = disclaimers.filter((d) => !d.authored);
  const authored = disclaimers.length - open.length;

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 rounded-card border border-cardline bg-warmwhite/55 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-navy">
            {open.length === 0 ? "Every disclaimer is written." : `${open.length} ${open.length === 1 ? "disclaimer still needs" : "disclaimers still need"} your wording.`}
          </p>
          <p className="mt-1 text-xs leading-relaxed text-slate">
            {authored} of {disclaimers.length} complete. Homeowners see nothing for a concept until you write it — there is no default wording.
          </p>
        </div>
        <span className={`w-fit rounded-pill px-3 py-1 text-xs font-semibold ${open.length === 0 ? "bg-success/10 text-success" : "bg-p2b-amber-tint text-p2b-amber-ink"}`}>
          {open.length === 0 ? "Complete" : `${open.length} open`}
        </span>
      </div>

      <div className="grid gap-4">
        {disclaimers.map((d, index) => (
          <DisclaimerCard key={d.key} disclaimer={d} index={index + 1} total={disclaimers.length} />
        ))}
      </div>
    </>
  );
}

function DisclaimerCard({ disclaimer, index, total }: { disclaimer: PendingDisclaimer; index: number; total: number }) {
  const [text, setText] = useState(disclaimer.text);
  const [savedText, setSavedText] = useState(disclaimer.text);
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const [authored, setAuthored] = useState(disclaimer.authored);
  const [attachedCount, setAttachedCount] = useState<number | null>(null);

  const dirty = text !== savedText;

  async function save() {
    if (state === "saving" || (!dirty && authored)) return;
    if (text.trim() === "") {
      setError("Enter the wording you want homeowners to see before saving.");
      return;
    }

    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/admin/disclaimers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: disclaimer.key, text }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Could not save that disclaimer. Nothing was changed.");
        setState("idle");
        return;
      }
      setAuthored(true);
      setSavedText(text);
      setAttachedCount(typeof json.attached === "number" ? json.attached : null);
      setState("saved");
    } catch {
      setError("Price2Book lost the response while saving. Reload this page to confirm the current wording before trying again.");
      setState("idle");
    }
  }

  return (
    <section
      className={`overflow-hidden rounded-card border bg-white shadow-sm transition ${
        authored ? "border-cardline" : "border-p2b-amber-ink/30"
      }`}
    >
      <div className={`border-b px-5 py-4 sm:px-6 ${authored ? "border-cardline bg-white" : "border-p2b-amber-ink/15 bg-p2b-amber-tint/60"}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.13em] text-slate">Disclaimer {index} of {total}</span>
              <span className={`rounded-pill px-2.5 py-1 text-[11px] font-semibold ${authored ? "bg-success/10 text-success" : "bg-p2b-amber-tint text-p2b-amber-ink ring-1 ring-p2b-amber-ink/20"}`}>
                {authored ? "Written" : "Needs your wording"}
              </span>
            </div>
            <h3 className="mt-2 font-display text-lg font-bold leading-snug text-navy">{disclaimer.name}</h3>
            {disclaimer.description && (
              <p className="mt-1 max-w-2xl text-xs leading-relaxed text-slate">{disclaimer.description}</p>
            )}
          </div>

          {disclaimer.dependentSlugs.length > 0 && (
            <div className="shrink-0 rounded-card border border-cardline bg-warmwhite/60 px-3 py-2 text-right">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate">Used by</p>
              <p className="mt-0.5 text-sm font-semibold text-navy">{disclaimer.dependentSlugs.length} service{disclaimer.dependentSlugs.length === 1 ? "" : "s"}</p>
            </div>
          )}
        </div>

        {disclaimer.dependentSlugs.length > 0 && (
          <p className="mt-3 max-w-3xl text-xs leading-relaxed text-slate">
            This is one statement reused across every affected service
            {disclaimer.offeredDependentSlugs.length > 0 && (
              <> — including <strong className="font-semibold text-navy">{disclaimer.offeredDependentSlugs[0]}</strong>, which you currently offer</>
            )}
            .
          </p>
        )}
      </div>

      <div className="p-5 sm:p-6">
        <label className="block">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate">Your wording</span>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setState("idle"); setError(null); }}
            placeholder="Write exactly what a homeowner should read when this applies. Your own words — nothing here is filled in for you."
            rows={4}
            className="mt-2 w-full rounded-card border border-cardline bg-white px-3.5 py-3 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10"
          />
        </label>

        <div className="mt-5 flex flex-col gap-3 border-t border-cardline pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-h-5 text-sm">
            {state === "saved" && !dirty && (
              <span className="font-medium text-success">
                Saved{attachedCount !== null ? ` — attached to ${attachedCount} applicable answer${attachedCount === 1 ? "" : "s"}` : ""}.
              </span>
            )}
            {dirty && <span className="text-slate">Unsaved changes</span>}
            {error && <span className="text-p2b-error-ink">{error}</span>}
          </div>
          <button
            onClick={save}
            disabled={state === "saving" || (!dirty && authored)}
            className="inline-flex min-h-10 w-full items-center justify-center rounded-pill bg-electric px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:cursor-not-allowed disabled:opacity-45 sm:w-auto"
          >
            {state === "saving" ? "Saving…" : authored ? "Update wording" : "Save wording"}
          </button>
        </div>
      </div>
    </section>
  );
}
