"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The websites allowed to show this contractor's booking section.
 *
 * Without this, a contractor could not put Price2Book on their own site
 * without someone running an API call for them — which made the embed, the
 * recommended way to use the product, a developer-only feature.
 *
 * The snippet is shown here too, because a contractor who has just authorised
 * their site is exactly one step from needing it.
 */
export default function EmbedOriginsControl({
  origins, publicId,
}: { origins: string[]; publicId: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(origins.join("\n"));
  const [state, setState] = useState<"idle" | "saving" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setState("saving");
    setError(null);
    const res = await fetch("/api/admin/setup/embed-origins", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        origins: value.split("\n").map((l) => l.trim()).filter(Boolean),
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) { setError(json.error ?? "Could not save that."); setState("idle"); return; }
    setState("saved");
    router.refresh();
  }

  const snippet = publicId
    ? `<div id="p2b"></div>\n<script src="https://price2book.com/embed.js" data-site="${publicId}" async></script>`
    : null;

  return (
    <section className="mt-4 rounded-card border border-cardline bg-white p-5 shadow-card">
      <h2 className="font-display text-lg font-bold text-navy">Put booking on your own website</h2>
      <p className="mt-1 text-sm text-slate">
        Add a page like <span className="font-medium text-navy">yourcompany.com/pricing</span> and
        paste the snippet below into it. Customers stay on your site the whole way through.
      </p>

      <label className="mt-4 block text-xs font-medium text-slate" htmlFor="origins">
        Your website address
      </label>
      <textarea
        id="origins"
        value={value}
        rows={2}
        onChange={(e) => { setValue(e.target.value); setState("idle"); }}
        placeholder="https://yourcompany.com"
        className="mt-1 w-full rounded-md border border-cardline px-3 py-2 font-mono text-xs"
      />
      <p className="mt-1 text-xs text-slate">
        One per line, starting with https://. Only the sites listed here can show your
        booking section — that&apos;s what stops anyone else putting it on theirs.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={state === "saving"}
          className="rounded-md bg-electric px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
        >
          {state === "saving" ? "Saving…" : "Save"}
        </button>
        {state === "saved" && <span className="text-sm text-success">Saved.</span>}
        {error && <span className="text-sm text-p2b-error-ink">{error}</span>}
      </div>

      {snippet && (
        <>
          <p className="mt-5 text-xs font-medium text-slate">Paste this into that page</p>
          <pre className="mt-1 overflow-x-auto rounded-md border border-cardline bg-warmwhite p-3 text-[11px] leading-relaxed">
{snippet}
          </pre>
          <p className="mt-1 text-xs text-slate">
            You only ever paste this once. Everything it shows is kept up to date for you.
          </p>
        </>
      )}
    </section>
  );
}
