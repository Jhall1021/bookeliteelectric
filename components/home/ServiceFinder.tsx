"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { startQueue, queuedServiceHref, type QueuedService } from "@/lib/multiServiceQueue";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import { useIdentity } from "@/components/theme/StorefrontContext";

type Candidate = { slug: string; name: string; categorySlug: string };

/** One job inside a multi-service answer. */
type Item =
  | { kind: "suggestion"; label: string; serviceSlug: string; categorySlug: string; serviceName: string; confidence: number; reason: string }
  | { kind: "clarify"; label: string; question: string; candidates: Candidate[] }
  | { kind: "out_of_scope"; label: string; message: string }
  | { kind: "unsure"; label: string };

type Result =
  | { kind: "emergency"; matched: string[]; message: string }
  | { kind: "clarify"; question: string; candidates: Candidate[] }
  | {
      kind: "suggestion";
      serviceSlug: string;
      categorySlug: string;
      serviceName: string;
      confidence: number;
      reason: string;
    }
  | { kind: "out_of_scope"; message: string }
  | { kind: "unsure"; message: string }
  | { kind: "multi"; items: Item[] }
  | { kind: "too_many"; count: number; message: string };

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
export default function ServiceFinder({ tone = "light" }: { tone?: "light" | "dark" }) {
  // Storefront navigation must carry the site slug. These were root paths,
  // working only because the legacy Elite redirects catch them — the whole
  // client-side navigation layer was masked by those redirects.
  const base = useStorefrontBase();
  // ADR §2.2 — customer-facing calls carry the storefront identifier.
  const siteFetch = useSiteFetch();
  // The hero is navy. Everything else this might sit on is warm white, and a
  // component that only works on one of them is a component that gets
  // dropped in the wrong place and quietly disappears — which is exactly
  // what happened the first time.
  const dark = tone === "dark";
  const id = useIdentity();
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  // When a multi answer contains a job we couldn't pin down, the customer
  // answers it right there rather than losing it. Keyed by position.
  const [resolvedItems, setResolvedItems] = useState<Record<number, QueuedService>>({});

  async function ask() {
    if (text.trim().length < 3) return;
    setBusy(true);
    setResult(null);
    setResolvedItems({});
    try {
      const res = await siteFetch("/api/service-match", {
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
    siteFetch("/api/service-match/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, accepted: true }),
    }).catch(() => {});
    router.push(`${base}/services/${r.categorySlug}/${r.serviceSlug}`);
  }

  return (
    <div className="w-full max-w-[30rem]">
      <label
        htmlFor="finder"
        className={`block text-sm font-medium ${dark ? "text-white" : "text-navy"}`}
      >
        Tell us what you need
      </label>
      <div className="mt-2 flex gap-2">
        <input
          id="finder"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
          placeholder="e.g. the light over my kitchen island needs replacing"
          className={`min-w-0 flex-1 rounded-pill px-5 py-3 text-sm focus:outline-none ${
            dark
              ? "border border-white/25 bg-white/10 text-white placeholder:text-white/50 focus:border-white/60"
              : "border border-cardline text-navy focus:border-electric"
          }`}
        />
        <button
          onClick={ask}
          disabled={busy || text.trim().length < 3}
          className="shrink-0 rounded-pill bg-electric px-6 py-3 text-sm font-semibold text-white transition hover:bg-electric-hover disabled:opacity-50"
        >
          {busy ? "..." : "Find it"}
        </button>
      </div>

      <p className={`mt-2 text-xs ${dark ? "text-slate-light" : "text-slate"}`}>
        or{" "}
        <Link
          href={`${base}/services`}
          className={dark ? "text-white underline hover:text-white/80" : "text-electric hover:underline"}
        >
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
          {/* A safety escalation with no number to call is worse than no
              escalation: it tells someone to phone and gives them nobody. A
              contractor with no phone on file gets the message without the
              button, which is the honest version. */}
          {id.phone && id.phoneHref ? (
            <a
              href={`tel:${id.phoneHref}`}
              className="mt-4 inline-block rounded-pill bg-red-700 px-6 py-3 font-semibold text-white hover:bg-red-800"
            >
              Call {id.phone}
            </a>
          ) : null}
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
              href={`${base}/services`}
              onClick={() => {
                siteFetch("/api/service-match/feedback", {
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

      {result?.kind === "clarify" && (
        /* One question rather than a wrong guess or a shrug.
           The candidates are the answer buttons — answering the question IS
           choosing the service, so there's no second step. */
        <div className="mt-4 rounded-card border border-cardline bg-white p-5 shadow-card">
          <p className="font-medium text-navy">{result.question}</p>
          <div className="mt-3 flex flex-col gap-2">
            {result.candidates.map((c) => (
              <button
                key={c.slug}
                onClick={() => {
                  siteFetch("/api/service-match/feedback", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ text, accepted: true }),
                  }).catch(() => {});
                  router.push(`${base}/services/${c.categorySlug}/${c.slug}`);
                }}
                className="rounded-card border border-cardline px-4 py-3 text-left text-sm font-medium text-navy transition hover:border-electric hover:bg-electric/5"
              >
                {c.name}
              </button>
            ))}
          </div>
          <Link
            href={`${base}/services`}
            className="mt-3 inline-block text-xs text-slate hover:underline"
          >
            Neither — show me everything
          </Link>
        </div>
      )}

      {result?.kind === "multi" && (() => {
        /* More than one job in one sentence.
           Everything found is shown — resolved, still-a-question, and
           out-of-scope alike. Nothing the customer asked for disappears
           because another part of it was easier to place.
           The point of the Continue button is that they don't have to
           remember the second job. Both go onto one visit, which is also
           cheaper: a visit carries ONE service-call minimum however many
           jobs are on it. */
        const chosen: QueuedService[] = [];
        result.items.forEach((item, i) => {
          if (item.kind === "suggestion") {
            chosen.push({
              slug: item.serviceSlug,
              categorySlug: item.categorySlug,
              name: item.serviceName,
            });
          } else if (resolvedItems[i]) {
            chosen.push(resolvedItems[i]);
          }
        });
        const unresolved = result.items.length - chosen.length;

        return (
          <div className="mt-4 rounded-card border border-cardline bg-white p-5 shadow-card">
            <p className="font-display text-lg font-bold text-navy">
              I found {result.items.length} services in your request
            </p>

            <ol className="mt-3 flex flex-col gap-3">
              {result.items.map((item, i) => {
                const picked = resolvedItems[i];
                return (
                  <li key={i} className="rounded-card border border-cardline p-3">
                    {/* Their words, so the answer reads against what they
                        actually asked for rather than a service name they
                        never used. */}
                    <p className="text-xs uppercase tracking-wide text-slate">{item.label}</p>

                    {item.kind === "suggestion" && (
                      <p className="mt-1 font-medium text-navy">{item.serviceName}</p>
                    )}

                    {item.kind === "clarify" && !picked && (
                      <div className="mt-1">
                        <p className="text-sm text-navy">{item.question}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {item.candidates.map((c) => (
                            <button
                              key={c.slug}
                              onClick={() =>
                                setResolvedItems((prev) => ({
                                  ...prev,
                                  [i]: { slug: c.slug, categorySlug: c.categorySlug, name: c.name },
                                }))
                              }
                              className="rounded-pill border border-cardline px-4 py-2 text-sm font-medium text-navy transition hover:border-electric hover:bg-electric/5"
                            >
                              {c.name}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {item.kind === "clarify" && picked && (
                      <p className="mt-1 font-medium text-navy">{picked.name}</p>
                    )}

                    {item.kind === "out_of_scope" && (
                      /* Kept visible on purpose. Dropping it would leave the
                         customer expecting it to be handled. */
                      <p className="mt-1 text-sm text-muted">
                        We don&rsquo;t handle this one through the website
                        {id.phone ? <> &mdash; give us a call on {id.phone} about it.</> : "."}
                      </p>
                    )}

                    {item.kind === "unsure" && (
                      <p className="mt-1 text-sm text-slate">
                        We couldn&rsquo;t pin this one down &mdash;{" "}
                        <Link href={`${base}/services`} className="text-electric hover:underline">
                          find it in the list
                        </Link>
                      </p>
                    )}
                  </li>
                );
              })}
            </ol>

            {chosen.length > 0 && (
              <>
                <button
                  onClick={() => {
                    siteFetch("/api/service-match/feedback", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ text, accepted: true }),
                    }).catch(() => {});
                    /* The queue carries the rest. Each service still needs its
                       own guided flow — a price depends on answers about that
                       specific job — so the flow engine sends them to the next
                       one as each is added, instead of back to the cart. */
                    startQueue(chosen, text);
                    router.push(queuedServiceHref(chosen[0], base));
                  }}
                  className="mt-4 w-full rounded-pill bg-electric px-6 py-3 text-sm font-semibold text-white hover:bg-electric-hover"
                >
                  {chosen.length === result.items.length
                    ? `Continue with ${chosen.length === 2 ? "both" : `all ${chosen.length}`} services`
                    : `Continue with ${chosen.length} of ${result.items.length}`}
                </button>
                <p className="mt-2 text-center text-xs text-slate">
                  {/* Worth saying plainly: it's the reason to book them together. */}
                  We&rsquo;ll take you through each one, then they go on the same visit &mdash;
                  one call-out, not {chosen.length}.
                </p>
              </>
            )}

            {unresolved > 0 && chosen.length === 0 && (
              <p className="mt-4 text-sm text-slate">
                Answer the question above and we&rsquo;ll carry both through together.
              </p>
            )}

            <Link
              href={`${base}/services`}
              className="mt-3 inline-block text-xs text-slate hover:underline"
            >
              Not right &mdash; show me everything
            </Link>
          </div>
        );
      })()}

      {result?.kind === "too_many" && (
        /* A punch list. Resolving nine jobs through a text box is worse than
           the list itself, and pretending otherwise wastes their time. */
        <div className="mt-4 rounded-card border border-cardline bg-warmwhite p-5">
          <p className="text-sm text-navy">{result.message}</p>
          <Link
            href={`${base}/services`}
            className="mt-3 inline-block rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
          >
            Browse all services
          </Link>
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
            href={`${base}/services`}
            className="mt-3 inline-block rounded-pill bg-electric px-6 py-2.5 text-sm font-semibold text-white hover:bg-electric-hover"
          >
            Browse all services
          </Link>
        </div>
      )}
    </div>
  );
}
