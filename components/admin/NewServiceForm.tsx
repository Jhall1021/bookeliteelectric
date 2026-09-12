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
    setError(null);
    if (!slugTouched) setSlug(slugify(value));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cleanName = name.trim();
    const cleanSlug = slug.trim();
    if (!tradeKey) {
      setError("Choose a trade before creating the service.");
      return;
    }
    if (!categoryId) {
      setError("Choose a category before creating the service.");
      return;
    }
    if (!cleanName) {
      setError("Enter a service name before creating the service.");
      return;
    }
    if (!cleanSlug) {
      setError("Enter a URL slug before creating the service.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/services", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryId,
          name: cleanName,
          slug: cleanSlug,
          shortDescription: description.trim() || null,
          bookingType,
          tradeKey,
          startingPriceLabel: startingLabel.trim() || null,
          icon: icon || null,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Could not create this service. Nothing was added.");
        setSaving(false);
        return;
      }

      router.push(`/dashboard/services/${data.id}`);
    } catch {
      setError("Could not reach Price2Book. Check your connection and try again; nothing was added.");
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
          onChange={(e) => { setTradeKey(e.target.value); setError(null); }}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        >
          <option value="" disabled>Choose a trade</option>
          {trades.map((t) => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
        <p className="mt-1 text-xs text-slate">
          Which catalog this service belongs to. It decides where &ldquo;it stopped working&rdquo; sends a homeowner, so it cannot be changed by guesswork later.
        </p>
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Category</label>
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setError(null); }}
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
          onChange={(e) => { setSlug(slugify(e.target.value)); setSlugTouched(true); setError(null); }}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm font-mono focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Description (shown to customers)</label>
        <textarea
          value={description}
          onChange={(e) => { setDescription(e.target.value); setError(null); }}
          rows={3}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Booking type</label>
        <select
          value={bookingType}
          onChange={(e) => { setBookingType(e.target.value); setError(null); }}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        >
          {BOOKING_TYPES.map((b) => (
            <option key={b.value} value={b.value}>{b.label}</option>
          ))}
        </select>
      </div>

      <p className="rounded-card border border-electric/15 bg-electric/5 p-3 text-xs leading-5 text-slate">
        <span className="font-semibold text-navy">New services start hidden.</span>{" "}
        After creation, set up the pricing, materials and customer flow, then make the service live when Price2Book says it is ready. Creating a service never publishes it to customers automatically.
      </p>

      <div>
        <label className="text-sm font-medium text-navy">
          "Starting price" label <span className="font-normal text-slate">(only shown when there's no base price)</span>
        </label>
        <input
          value={startingLabel}
          onChange={(e) => { setStartingLabel(e.target.value); setError(null); }}
          placeholder="e.g. From $795, or leave blank for Custom Quote"
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        />
      </div>

      <div>
        <label className="text-sm font-medium text-navy">Icon</label>
        <select
          value={icon}
          onChange={(e) => { setIcon(e.target.value); setError(null); }}
          className="mt-1 w-full rounded-card border border-cardline px-4 py-2.5 text-sm focus:border-electric"
        >
          <option value="">— use category's default icon —</option>
          {ICON_OPTIONS.map((i) => (
            <option key={i} value={i}>{i}</option>
          ))}
        </select>
      </div>

      {error && <p role="alert" className="rounded-card bg-red-50 p-3 text-sm text-red-700">{error}</p>}

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
