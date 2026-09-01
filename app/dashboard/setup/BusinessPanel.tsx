"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The contractor's own details, and the action that gives them a storefront.
 *
 * Writes through the general business-profile route, not a setup-only one.
 * Readiness is NOT mirrored here: the page re-renders from the saved domain
 * state, so the verdict can never drift from what the engine would say.
 */

type Profile = {
  name: string; legalName: string | null; phone: string | null;
  supportEmail: string | null; licenseNumber: string | null; countryCode: string | null;
};

export default function BusinessPanel({
  profile, hostedSlug,
}: { profile: Profile; hostedSlug: string | null }) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: profile.name ?? "", legalName: profile.legalName ?? "", phone: profile.phone ?? "",
    supportEmail: profile.supportEmail ?? "", licenseNumber: profile.licenseNumber ?? "",
    countryCode: profile.countryCode ?? "US",
  });
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const field = "mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm focus:border-electric";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(false);
    const res = await fetch("/api/admin/business-profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.message ?? data.error ?? "Could not save."); return; }
    setSaved(true);
    router.refresh();
  }

  async function createStorefront() {
    setBusy(true); setError(null);
    const res = await fetch("/api/admin/setup/storefront", { method: "POST" });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(data.message ?? data.error ?? "Could not create your storefront."); return; }
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={save} className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Your business</h2>
        <p className="mt-1 text-sm text-slate">What a homeowner sees, and what we need before payments can be set up.</p>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {([
            ["name", "Business name", "text"], ["legalName", "Legal name (optional)", "text"],
            ["phone", "Phone", "tel"], ["supportEmail", "Support email", "email"],
            ["licenseNumber", "License number", "text"], ["countryCode", "Country", "text"],
          ] as const).map(([key, label, type]) => (
            <div key={key}>
              <label className="text-sm font-medium text-navy">{label}</label>
              <input
                type={type} value={form[key]} disabled={busy}
                onChange={(e) => setForm({ ...form, [key]: e.target.value })}
                className={field}
              />
            </div>
          ))}
        </div>

        {error && <div className="mt-4 rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</div>}
        {saved && <div className="mt-4 text-sm text-success">Saved.</div>}

        <button
          type="submit" disabled={busy}
          className="mt-5 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
        >
          {busy ? "Saving..." : "Save"}
        </button>
      </form>

      <div className="rounded-card border border-cardline bg-white p-5 shadow-card">
        <h2 className="font-display text-lg font-bold text-navy">Your Price2Book storefront</h2>
        {hostedSlug ? (
          <>
            {/* THE HOSTED ADDRESS IS THE FALLBACK, NOT THE HEADLINE.
                This said "Homeowners book you at /slug" full stop, which
                tells a contractor with a perfectly good website that their
                public address is now somewhere else. Most of them have a
                site, and adding Price2Book to it is the easier sell than
                sending customers elsewhere. */}
            <p className="mt-1 text-sm text-slate">
              This always works: <span className="font-medium text-navy">/{hostedSlug}</span>.
            </p>
            <p className="mt-2 text-sm text-slate">
              Most businesses put Price2Book on their own website instead — a page
              like <span className="font-medium text-navy">yourcompany.com/pricing</span> —
              so customers stay on your site. That page becomes the one link you
              put everywhere. We&rsquo;ll set that up with you; nothing here is
              required to start taking bookings.
            </p>
          </>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate">
              You don&rsquo;t have one yet, so there is nowhere to send a homeowner. We&rsquo;ll set up
              the address for you — you can add branding and a custom domain later.
            </p>
            <button
              type="button" onClick={createStorefront} disabled={busy}
              className="mt-4 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
            >
              {busy ? "Creating..." : "Create my Price2Book storefront"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
