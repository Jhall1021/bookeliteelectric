"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Result =
  | { kind: "emergency"; matched: string[]; message: string }
  | {
      kind: "suggestion";
      serviceSlug: string;
      categorySlug: string;
      serviceName: string;
      confidence: number;
      reason: string;
    }
  | { kind: "out_of_scope"; message: string }
  | { kind: "unsure"; message: string };

/**
 * "Tell us what you need."
 *
 * Homeowners don't know the trade word for what they want. They know "the
 * light over my island" and "the outlet in the garage stopped working". A
 * category menu asks them to already know the answer; this doesn't.
 *
 * THE SUGGESTION IS ALWAYS CONFIRMED, NEVER FOLLOWED
 *
 * A match takes the customer nowhere on its own. It shows what we think and
 * waits, because picking the service decides the price — describe a
 * chandelier, land on Standard Light Fixture, and you've been quoted $305 for
 * a $530 job. Being quietly wrong is worse than being visibly unsure, so
 * "browse everything instead" sits next to every answer including the
 * confident ones.
 */
export default function ServiceFinder() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);

  async function ask() {
    if (text.trim().length < 3) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch("/api/service-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      setResult(await res.json());
    } catch {
      // Even the fetch failing shouldn't strand anyone — "unsure" renders
      // the browse link, which is where they were going anyway.
      setResult({ kind: "unsure", message: "" });
    } finally {
      setBusy(false);
    }
  }

  function accept(r: Extract<Result, { kind: "suggestion" }>) {
    // Recorded so we learn which suggestions people actually take. A service
    // that's suggested often and accepted rarely is named wrongly.
    fetch("/api/service-match/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, accepted: true }),
    }).catch(() => {});
    router.push(`/services/${r.categorySlug}/${r.serviceSlug}`);
  }

  return (
    <div className="mx-auto w-full max-w-[30rem]">
      <label htmlFor="finder" className="block text-sm font-medium text-navy">
        Tell us what you need
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="finder"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="e.g. the light over my kitchen island needs replacing"
          className="min-w-0 flex-1 rounded-pill border border-cardline px-5 py-3 text-sm focus:border-electric focus:outline-none"
        />
        <button
          onClick={ask}
          disabled={busy || text.trim().length < 3}
          className="shrink-0 rounded-pill bg-electric px-6 py-3 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
        >
          {busy ? "..." : "Find it"}
        </button>
      </div>

      <p className="mt-2 text-center text-xs text-slate">
        or{" "}
        <Link href="/services" className="text-electric hover:underline">
          browse all our services
        </Link>
      </p>

      {result?.kind === "emergency" && (
        /* Deliberately the loudest thing on the page, and deliberately has no
           booking button. Someone describing sparks should not be one click
           from scheduling three days out. */
        <div className="mt-4 rounded-card border-2 border-red-300 bg-red-50 p-5">
          <p className="font-display font-bold text-red-900">Please call us instead</p>
          <p className="mt-2 text-sm text-red-900">{result.message}</p>
          <a
            href="tel:7322047003"
            className="mt-4 inline-block rounded-pill bg-red-700 px-6 py-3 font-semibold text-white hover:bg-red-800"
          >
            Call 732-204-7003
          </a>
        </div>
      )}

      {result?.kind === "suggestion" && (
        <div className="mt-4 rounded-card border border-cardline bg-white p-5 shadow-card">
          <p className="text-sm text-slate">
            {/* Low confidence says so. A hedge the customer can see is more
                useful than false certainty they can't. */}
            {result.confidence >= 0.7 ? "This sounds like:" : "This might be what you need:"}
          </p>
          <p className="mt-1 font-display text-lg font-bold text-navy">{result.serviceName}</p>
          {result.reason && <p className="mt-1 text-sm text-slate">{result.reason}</p>}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => accept(result)}
              className="rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
            >
              Yes, that&rsquo;s it
            </button>
            <Link
              href="/services"
              onClick={() => {
                fetch("/api/service-match/feedback", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ text, accepted: false }),
                }).catch(() => {});
              }}
              className="rounded-pill border border-cardline px-6 py-2.5 text-sm font-semibold text-slate hover:bg-warmwhite"
            >
              No, show me everything
            </Link>
          </div>
        </div>
      )}

      {result?.kind === "out_of_scope" && (
        <div className="mt-4 rounded-card border border-cardline bg-warmwhite p-5">
          <p className="text-sm text-navy">{result.message}</p>
        </div>
      )}

      {result?.kind === "unsure" && (
        /* No apology and no error. It just didn't match, which happens, and
           the browse page was always the fallback. */
        <div className="mt-4 rounded-card border border-cardline bg-warmwhite p-5">
          <p className="text-sm text-navy">
            We couldn&rsquo;t pin that down to one service — have a look through the list
            and it should be in there.
          </p>
          <Link
            href="/services"
            className="mt-3 inline-block rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
          >
            Browse all services
          </Link>
        </div>
      )}
    </div>
  );
}
