"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ServiceData = {
  id: string;
  name: string;
  shortDescription: string | null;
  disclaimer: string | null;
  basePrice: number | null; // cents
  whileWeThereBasePrice: number | null; // cents
  startingPriceLabel: string | null;
  active: boolean;
  bookingType: string;
  hasTree: boolean;
};

function centsToDollarsStr(cents: number | null): string {
  return cents === null ? "" : (cents / 100).toFixed(2);
}

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

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    setError(null);

    const res = await fetch(`/api/admin/services/${service.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        shortDescription: description || null,
        disclaimer: disclaimer || null,
        startingPriceLabel: startingLabel || null,
        active,
      }),
    });

    setSaving(false);
    if (res.ok) {
      setSaved(true);
      router.refresh();
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError("Something went wrong saving this service.");
    }
  }

  return (
    <form onSubmit={handleSave} className="mt-6 max-w-xl space-y-5 rounded-card border border-cardline bg-white p-6 shadow-card">
      <div>
        <label className="text-sm font-medium text-navy">Service name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Description (shown to customers)</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      {/* READ-ONLY, deliberately.
          A price typed here used to go straight to the customer without ever
          passing through the pricing engine or anyone's approval — the number
          somebody typed simply became the number a homeowner paid. Prices now
          have one way in: the Pricing tab derives one from crew hours and
          material cost, and publishing it is an explicit act that gets
          stamped. This shows what is published; it does not set it. */}
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
          onChange={(e) => setStartingLabel(e.target.value)}
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
          onChange={(e) => setDisclaimer(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <label className="flex items-center gap-2 text-sm text-navy">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} />
        Visible on the site (uncheck to hide from category/browse pages without deleting it)
      </label>

      {service.hasTree && (
        <p className="rounded-card bg-warmwhite p-3 text-xs text-slate">
          This service has answer-branching questions — edit them in the Guided Pricing section
          below. This form only controls the base price shown before any questions are asked.
        </p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

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
