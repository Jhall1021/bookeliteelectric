"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const ICON_OPTIONS = [
  "bolt", "breaker", "camera", "circuit", "doorbell", "ev", "exhaust-fan",
  "exterior-outlet", "fan", "generator", "inspection", "kitchen-appliance",
  "landscape", "laundry", "light", "mount", "new-outlet", "outlet", "panel",
  "pool", "recessed", "smoke-detector", "surge", "switch", "thermostat",
  "transfer-switch", "troubleshooting", "tv", "under-cabinet",
];

const BOOKING_TYPES = [
  { value: "INSTANT", label: "Instant — flat price, no questions" },
  { value: "ADJUSTED", label: "Adjusted — flat price, but expects branching questions later" },
  { value: "REMOTE_QUOTE", label: "Remote Quote — always priced by you after the fact" },
];

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export default function NewServiceForm({
  categories,
  trades,
}: {
  categories: { id: string; name: string }[];
  /** Server-authoritative: the trades Price2Book publishes a catalog for. */
  trades: string[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "");
  // A single available trade is PRESELECTED, not assumed — what gets stored is
  // still an explicit choice, and the select is still shown. G2's rule is that
  // trade is never inferred, including from "there is only one".
  const [tradeKey, setTradeKey] = useState(trades.length === 1 ? trades[0] : "");
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [description, setDescription] = useState("");
  const [bookingType, setBookingType] = useState("INSTANT");
  const [startingLabel, setStartingLabel] = useState("");
  const [icon, setIcon] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const res = await fetch("/api/admin/services", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        categoryId,
        name,
        slug,
        shortDescription: description || null,
        bookingType,
        tradeKey,
        startingPriceLabel: startingLabel || null,
        icon: icon || null,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      router.push(`/dashboard/services/${data.id}`);
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Something went wrong creating this service.");
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-xl space-y-5 rounded-card border border-cardline bg-white p-6 shadow-card">
      <div>
        <label className="text-sm font-medium text-navy">Trade</label>
        <select
          required
          value={tradeKey}
          onChange={(e) => setTradeKey(e.target.value)}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        >
          <option value="" disabled>Choose a trade</option>
          {trades.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate">
          Which catalog this service belongs to. It decides where &ldquo;it stopped
          working&rdquo; sends a homeowner, so it cannot be changed by guesswork later.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Category</label>
        <select
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Service name</label>
        <input
          required
          value={name}
          onChange={(e) => handleNameChange(e.target.value)}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">
          URL slug <span className="font-normal text-slate">(auto-generated, edit if needed)</span>
        </label>
        <input
          required
          value={slug}
          onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); }}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm font-mono focus:border-electric"
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

      <div>
        <label className="text-sm font-medium text-navy">Booking type</label>
        <select
          value={bookingType}
          onChange={(e) => setBookingType(e.target.value)}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        >
          {BOOKING_TYPES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
      </div>

      {/* No price fields here on purpose. A new service is created unpriced,
          then priced on its Pricing tab from crew hours and material cost and
          published as an explicit approval. Typing a price at creation was the
          shortest path from somebody's guess to a homeowner's invoice. */}
      <p className="rounded-card bg-warmwhite p-3 text-xs text-slate">
        You&rsquo;ll set the price after creating this service, on its Pricing tab — it&rsquo;s
        worked out from your crew hours and material costs, and you approve it before
        customers see it.
      </p>

      <div>
        <label className="text-sm font-medium text-navy">
          "Starting price" label <span className="font-normal text-slate">(only shown when there's no base price)</span>
        </label>
        <input
          value={startingLabel}
          onChange={(e) => setStartingLabel(e.target.value)}
          placeholder="e.g. From $795, or leave blank for Custom Quote"
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Icon</label>
        <select
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        >
          <option value="">— use category's default icon —</option>
          {ICON_OPTIONS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <button
        type="submit"
        disabled={saving}
        className="w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
      >
        {saving ? "Creating..." : "Create Service"}
      </button>
    </form>
  );
}
