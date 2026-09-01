"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Business name in, contractor out.
 *
 * The web address is derived from the name and shown rather than asked for,
 * because it is a decision most contractors have no opinion about until they
 * see it — and it is editable for the ones who do.
 */
export default function CreateContractorForm({ disabled }: { disabled: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [touchedSlug, setTouchedSlug] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const derived = name
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const effective = touchedSlug ? slug : derived;

  async function submit() {
    setBusy(true);
    setError(null);
    const res = await fetch("/api/contractors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, slug: effective }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json.error ?? "Could not create that.");
      setBusy(false);
      return;
    }
    // Straight into Guided Setup — there is nothing else to decide here.
    router.push("/dashboard/setup");
    router.refresh();
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-5 shadow-card">
      <label className="text-xs font-medium text-slate" htmlFor="biz-name">
        Business name
      </label>
      <input
        id="biz-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="BrightPath Electric"
        disabled={disabled || busy}
        className="mt-1 w-full rounded-card border border-cardline px-3 py-2 text-sm"
      />

      <label className="mt-4 block text-xs font-medium text-slate" htmlFor="biz-slug">
        Your Price2Book web address
      </label>
      <div className="mt-1 flex items-center gap-1 text-sm">
        <span className="text-slate">price2book.com/</span>
        <input
          id="biz-slug"
          value={effective}
          onChange={(e) => { setTouchedSlug(true); setSlug(e.target.value); }}
          placeholder="your-business"
          disabled={disabled || busy}
          className="flex-1 rounded-card border border-cardline px-3 py-2 text-sm"
        />
      </div>
      <p className="mt-1 text-xs text-slate">
        You can put Price2Book on your own website later — this address always works.
      </p>

      <button
        onClick={submit}
        disabled={disabled || busy || !name.trim() || !effective}
        className="mt-4 rounded-md bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {busy ? "Creating…" : "Create my business"}
      </button>

      {error && <p className="mt-3 text-sm text-p2b-error-ink">{error}</p>}
    </div>
  );
}
