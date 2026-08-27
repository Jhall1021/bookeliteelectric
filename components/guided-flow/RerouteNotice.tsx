"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSiteFetch } from "@/components/site/SiteContext";

type Props = {
  serviceId: string;
  reason: string;
  /** What the customer has answered so far, to carry across. */
  answers?: Record<string, string>;
};

/** Where a reroute leaves its answers for the target flow to pick up. */
export const REROUTE_HANDOFF_KEY = "elite:reroute-handoff";

/**
 * The "no dead ends" rule in practice: when an answer shows the customer
 * picked the wrong service, this looks up the right one and sends them there
 * — never a plain "sorry, we can't help with that."
 *
 * IT NOW ACTUALLY MOVES THE ANSWERS
 *
 * The copy said "we'll move your answers over" and then navigated with
 * nothing. The target flow initialised empty, so someone who'd just told us
 * their ceiling height and what's above it was asked both again — after being
 * promised otherwise.
 *
 * The handoff goes through sessionStorage rather than the URL: answer maps
 * get long, and a query string full of them is ugly, capped in length, and
 * ends up in browser history and server logs.
 *
 * Deliberately short-lived and single-use. It's tagged with the target
 * service and cleared the moment it's read, so answers can't leak into an
 * unrelated service later in the session — reuse is right for THIS reroute
 * and wrong for anything else.
 */
export default function RerouteNotice({ serviceId, reason, answers }: Props) {
  // ADR §2.2 — customer-facing calls carry the storefront identifier.
  const siteFetch = useSiteFetch();
  const router = useRouter();
  const [target, setTarget] = useState<{
    slug: string;
    name: string;
    categorySlug: string;
  } | null>(null);

  useEffect(() => {
    siteFetch(`/api/services/by-id/${serviceId}`)
      .then((r) => r.json())
      .then(setTarget)
      .catch(() => setTarget(null));
  }, [serviceId]);

  const carried = Object.keys(answers ?? {}).length;

  function go() {
    if (!target) return;
    if (answers && carried > 0) {
      try {
        sessionStorage.setItem(
          REROUTE_HANDOFF_KEY,
          JSON.stringify({ targetServiceId: serviceId, answers })
        );
      } catch {
        // Private browsing, or storage full. The customer answers a few
        // questions again rather than hitting a wall — so this is worth
        // swallowing, but not worth claiming success over.
      }
    }
    router.push(`/services/${target.categorySlug}/${target.slug}`);
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-8 text-center shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">
        Based on your answer, you actually need a different service
      </h2>
      <p className="mt-2 text-sm text-slate">
        You selected &ldquo;{reason}&rdquo; — that&rsquo;s handled by{" "}
        {target ? target.name : "a different service"}
        {/* Only promise the carry-over when there's something to carry.
            Saying it with an empty answer map is the bug this replaced. */}
        {carried > 0
          ? ", so we'll bring your answers over and pick up where you left off."
          : ", so we'll take you there."}
      </p>
      {target && (
        <button
          onClick={go}
          className="mt-6 rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover"
        >
          Continue to {target.name}
        </button>
      )}
    </div>
  );
}
