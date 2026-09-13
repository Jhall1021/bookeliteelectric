"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [savingProfile, setSavingProfile] = useState(false);
  const [creatingStorefront, setCreatingStorefront] = useState(false);
  const [saved, setSaved] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [storefrontError, setStorefrontError] = useState<string | null>(null);

  const field = "mt-1.5 w-full rounded-card border border-cardline bg-white px-3.5 py-2.5 text-sm text-navy outline-none transition focus:border-electric focus:ring-2 focus:ring-electric/10";

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (savingProfile) return;

    setSavingProfile(true);
    setProfileError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/admin/business-profile", {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProfileError(
          typeof data.message === "string" ? data.message
            : typeof data.error === "string" ? data.error
            : "Could not save your business details. Nothing was changed."
        );
        return;
      }
      setSaved(true);
      router.refresh();
    } catch {
      setProfileError("Could not reach Price2Book. Check your connection and try again; nothing was changed.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function createStorefront() {
    if (creatingStorefront) return;

    setCreatingStorefront(true);
    setStorefrontError(null);
    try {
      const res = await fetch("/api/admin/setup/storefront", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStorefrontError(
          typeof data.message === "string" ? data.message
            : typeof data.error === "string" ? data.error
            : "Could not create your booking destination."
        );
        return;
      }
      router.refresh();
    } catch {
      setStorefrontError("Could not reach Price2Book. Check your connection and try creating the booking destination again.");
    } finally {
      setCreatingStorefront(false);
    }
  }

  return (
    <div className="space-y-5">
      <form onSubmit={save} className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
        <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-electric/10 text-sm font-bold text-electric">1</span>
            <div>
              <h2 className="font-display text-lg font-bold text-navy">Tell us about your business</h2>
              <p className="mt-1 text-sm text-slate">These details identify your company to customers and support the rest of your setup.</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          <div className="grid gap-5 sm:grid-cols-2">
            {([
              ["name", "Business name", "text", "The name customers know you by"],
              ["legalName", "Legal name", "text", "Optional — if different from your public name"],
              ["phone", "Phone", "tel", "Your customer-facing business number"],
              ["supportEmail", "Support email", "email", "Where customer questions should go"],
              ["licenseNumber", "License number", "text", "Shown where your business requires it"],
              ["countryCode", "Country", "text", "Used for account and payment setup"],
            ] as const).map(([key, label, type, helper]) => (
              <div key={key}>
                <label className="text-sm font-semibold text-navy">{label}</label>
                <p className="mt-0.5 text-xs text-slate">{helper}</p>
                <input
                  type={type} value={form[key]} disabled={savingProfile}
                  onChange={(e) => {
                    setForm({ ...form, [key]: e.target.value });
                    setSaved(false);
                    setProfileError(null);
                  }}
                  className={field}
                />
              </div>
            ))}
          </div>

          {profileError && <div role="alert" className="mt-5 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">{profileError}</div>}
          {saved && <div className="mt-5 rounded-card border border-success/20 bg-success/5 p-3 text-sm font-medium text-success">Business details saved.</div>}

          <div className="mt-6 flex justify-end border-t border-cardline pt-5">
            <button
              type="submit" disabled={savingProfile}
              className="rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
            >
              {savingProfile ? "Saving..." : "Save business details"}
            </button>
          </div>
        </div>
      </form>

      <div className="overflow-hidden rounded-card border border-cardline bg-white shadow-sm">
        <div className="border-b border-cardline bg-warmwhite/60 px-5 py-4 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-electric/10 text-sm font-bold text-electric">2</span>
            <div>
              <h2 className="font-display text-lg font-bold text-navy">Choose where customers book</h2>
              <p className="mt-1 text-sm text-slate">Price2Book can live on your own website, with a hosted address available as a fallback.</p>
            </div>
          </div>
        </div>

        <div className="p-5 sm:p-6">
          {hostedSlug ? (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-card border border-electric/20 bg-electric/[0.03] p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-electric">Recommended</div>
                <h3 className="mt-1 text-sm font-semibold text-navy">Keep customers on your website</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate">
                  Add Price2Book to a page like <span className="font-medium text-navy">yourcompany.com/pricing</span> or <span className="font-medium text-navy">/book</span>. That becomes the pricing-and-booking link you can put anywhere customers find you.
                </p>
              </div>
              <div className="rounded-card border border-cardline bg-warmwhite/50 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate">Always available</div>
                <h3 className="mt-1 text-sm font-semibold text-navy">Price2Book-hosted address</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-slate">Your fallback storefront is ready at <span className="font-medium text-navy">/{hostedSlug}</span>. It is useful for testing and for businesses without a website.</p>
              </div>
            </div>
          ) : (
            <div className="rounded-card border border-dashed border-cardline bg-warmwhite/50 p-5">
              <h3 className="text-sm font-semibold text-navy">Create your booking destination</h3>
              <p className="mt-1.5 max-w-2xl text-sm text-slate">
                We&rsquo;ll create the hosted address Price2Book needs behind the scenes. You can still embed the experience on your own website afterward.
              </p>
              <button
                type="button" onClick={() => void createStorefront()} disabled={creatingStorefront}
                className="mt-4 rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
              >
                {creatingStorefront ? "Creating..." : "Create booking destination"}
              </button>
              {storefrontError && (
                <div role="alert" className="mt-4 rounded-card border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                  {storefrontError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
