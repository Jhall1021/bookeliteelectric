"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The list of businesses this account can work on.
 *
 * A button rather than a link, because choosing is a WRITE — it records the
 * selection server-side, where it is re-validated against the account's
 * memberships. A link carrying an id in the URL would look like the same thing
 * and would let anyone type another contractor's id into the address bar.
 */
export default function ContractorChoices(
  { choices }: { choices: { contractorId: string; name: string; slug: string }[] },
) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function choose(contractorId: string) {
    setBusy(contractorId);
    setError(null);
    try {
      const res = await fetch("/api/portal/contractor", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contractorId }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Could not open that business.");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <>
      <ul className="mt-8 space-y-3">
        {choices.map((c) => (
          <li key={c.contractorId}>
            <button type="button" onClick={() => choose(c.contractorId)} disabled={busy !== null}
                    className="block w-full rounded-card border border-cardline bg-white px-5 py-4 text-left shadow-card transition hover:border-electric disabled:opacity-50">
              <div className="font-display text-base font-bold text-navy">{c.name}</div>
              <div className="mt-0.5 text-sm text-slate">
                {busy === c.contractorId ? "Opening…" : `/${c.slug}`}
              </div>
            </button>
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}
    </>
  );
}
