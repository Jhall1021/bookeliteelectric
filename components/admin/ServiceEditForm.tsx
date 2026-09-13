"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ServiceData = {
  id: string;
  name: string;
  shortDescription: string | null;
  disclaimer: string | null;
  basePrice: number | null;
  whileWeThereBasePrice: number | null;
  startingPriceLabel: string | null;
  active: boolean;
  bookingType: string;
  hasTree: boolean;
};

export default function ServiceEditForm({ service }: { service: ServiceData }) {
  const router = useRouter();
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.shortDescription ?? "");
  const [disclaimer, setDisclaimer] = useState(service.disclaimer ?? "");
  const [startingLabel, setStartingLabel] = useState(service.startingPriceLabel ?? "");
  const [active, setActive] = useState(service.active);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [blockedBy, setBlockedBy] = useState<
    { id: string | null; slug: string | null; label: string }[]
  >([]);

  function changed(fn: () => void) {
    fn();
    setSaved(false);
    setError(null);
    setBlockedBy([]);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Enter a service name before saving.");
      return;
    }

    setSaving(true);
    setSaved(false);
    setError(null);
    setBlockedBy([]);

    try {
      const res = await fetch(`/api/admin/services/${service.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          shortDescription: description || null,
          disclaimer: disclaimer || null,
          startingPriceLabel: startingLabel || null,
          active,
        }),
      });

      const data = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) {
        const message = typeof data.message === "string"
          ? data.message
          : typeof data.error === "string"
            ? data.error
            : "Could not save this service. Nothing was changed.";
        setError(message);
        setBlockedBy(Array.isArray(data.prerequisites) ? data.prerequisites : []);
        return;
      }

      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } catch {
      setError("Could not reach Price2Book. Check your connection and try again; nothing was changed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-6 max-w-xl space-y-5 rounded-card border border-cardline bg-white p-6 shadow-card">
      <div>
        <label className="text-sm font-medium text-navy">Service name</label>
        <input
          value={name}
          onChange={(e) => changed(() => setName(e.target.value))}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Description (shown to customers)</label>
        <textarea
          value={description}
          onChange={(e) => changed(() => setDescription(e.target.value))}
          rows={3}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-sm font-medium text-navy">Published base price</label>
          <div className="mt-1 rounded-card border border-cardline bg-warmwhite px-4 py-2.5 text-sm text-slate">
            {service.basePrice === null ? "Not published" : `$${(service.basePrice / 100).toFixed(2)}`}
          </div>
        </div>
        <div>
          <label className="text-sm font-medium text-navy">While We&rsquo;re There price</label>
          <div className="mt-1 rounded-card border border-cardline bg-warmwhite px-4 py-2.5 text-sm text-slate">
            {service.whileWeThereBasePrice === null
              ? "None"
              : `$${(service.whileWeThereBasePrice / 100).toFixed(2)}`}
          </div>
        </div>
      </div>
      <p className="-mt-2 text-xs text-slate">
        Prices are set on the Pricing tab, where they are derived from your crew hours and
        material costs and published as an explicit approval.
      </p>

      <div>
        <label className="text-sm font-medium text-navy">
          "Starting price" label <span className="font-normal text-slate">(only shown when there's no base price — e.g. "From $795")</span>
        </label>
        <input
          value={startingLabel}
          onChange={(e) => changed(() => setStartingLabel(e.target.value))}
          placeholder="Custom Quote"
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">
          Disclaimer <span className="font-normal text-slate">(shown with the price, e.g. a scope caveat)</span>
        </label>
        <textarea
          value={disclaimer}
          onChange={(e) => changed(() => setDisclaimer(e.target.value))}
          rows={2}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div className={`rounded-card border p-4 ${active ? "border-success/20 bg-success/[0.05]" : "border-cardline bg-warmwhite/60"}`}>
        <label className="flex items-start gap-3 text-sm text-navy">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => changed(() => setActive(e.target.checked))}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            <span className="font-semibold">{active ? "Live on storefront" : "Hidden from storefront"}</span>
            <span className="mt-1 block text-xs leading-relaxed text-slate">
              {active
                ? "Customers can reach this service through the storefront. Turning it off takes it down without deleting its setup."
                : "This service stays configured in Price2Book, but customers cannot book it until you make it live again."}
            </span>
          </span>
        </label>
      </div>

      {service.hasTree && (
        <p className="rounded-card bg-warmwhite p-3 text-xs text-slate">
          This service has answer-branching questions — edit them on the Customer questions tab.
          This form only controls the base price shown before any questions are asked.
        </p>
      )}

      {error && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-red-600">{error}</p>
          {blockedBy.length > 0 && (
            <ul className="space-y-1 text-sm">
              {blockedBy.map((p, i) => (
                <li key={p.id ?? p.slug ?? i}>
                  {p.id ? (
                    <a href={`/dashboard/services/${p.id}`} className="font-medium text-electric underline">
                      Make {p.label} live first
                    </a>
                  ) : (
                    <span className="text-navy">{p.label} — nothing to open yet</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
      >
        {saving ? "Saving..." : saved ? "✓ Saved" : "Save Changes"}
      </button>
    </form>
  );
}
