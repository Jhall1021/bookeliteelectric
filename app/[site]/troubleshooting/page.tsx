import GuidedFlowEngine from "@/components/guided-flow/GuidedFlowEngine";
import TroubleshootingTradePicker from "@/components/guided-flow/TroubleshootingTradePicker";
import { requireHostedSite, withSite } from "@/lib/siteRouting";
import { findTroubleshootingDestinations } from "@/lib/troubleshooting";

/**
 * Direct entry point per the brief — routes straight into a diagnostic
 * service's own flow rather than a generic contact form.
 *
 * FORMERLY hardcoded `serviceSlug="electrical-troubleshooting"` — Elite's own
 * slug, on a page every contractor's storefront serves. lib/troubleshooting.ts
 * exists specifically so no caller has to know a diagnostic service's name;
 * this was the one direct-entry point that still did, because it has no
 * originating Service to read a tradeKey from the way a mid-flow reroute
 * does (`/api/troubleshooting?serviceId=...`) — there is no service yet, the
 * customer just clicked "I don't know what's wrong" from the homepage.
 *
 * So this resolves EVERY trade the contractor is enrolled in
 * (findTroubleshootingDestinations), and:
 *
 *   one eligible trade    -> straight into that trade's diagnostic, same as
 *                            today's experience for a single-trade contractor
 *   several eligible      -> ask which one, briefly, before opening a flow
 *   none eligible         -> an honest next step, never a 404 or a blank flow
 *
 * V1 enrolls a contractor in exactly one trade at a time (lib/tradeEnrolment.ts),
 * so the "several" branch is not reachable by any contractor today — it is
 * still real code, not a stub, because the model already allows more and a
 * caller that assumed "at most one" would silently default a future
 * multi-trade customer to whichever trade happened to sort first.
 */
export default async function TroubleshootingPage({
  params,
}: {
  params: { site: string };
}) {
  // ADR §2.2. Tenant from the URL segment, not from the service this page
  // happens to open a flow for.
  const site = await requireHostedSite(params.site);

  const destinations = await withSite(site, (db) =>
    findTroubleshootingDestinations(db, site.contractorId)
  );
  const eligible = destinations.flatMap((d) =>
    d.lookup.ok
      ? [{ tradeKey: d.tradeKey, slug: d.lookup.service.slug, name: d.lookup.service.name }]
      : []
  );

  if (eligible.length === 0) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12 text-center">
        <h1 className="font-display text-2xl font-bold text-navy">Let&rsquo;s figure it out.</h1>
        <p className="mt-4 text-slate">
          Give us a call and we&rsquo;ll get a diagnostic visit on the books.
        </p>
      </main>
    );
  }

  if (eligible.length === 1) {
    // A tree exists, or it doesn't — both were already handled generically
    // inside GuidedFlowEngine (an empty tree resolves straight to price with
    // its own note field, per B.4). Nothing here needs to know which.
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <h1 className="font-display text-2xl font-bold text-navy">Let&rsquo;s figure it out.</h1>
        <p className="mt-1 text-sm text-slate">
          When something&rsquo;s wrong but you&rsquo;re not sure what, we&rsquo;ll come diagnose it — at a
          price you can see before you book.
        </p>
        <div className="mt-6">
          <GuidedFlowEngine serviceSlug={eligible[0].slug} />
        </div>
      </main>
    );
  }

  // More than one eligible trade. Not silently defaulting to Electrical or
  // to whichever sorted first — the homeowner picks.
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">Let&rsquo;s figure it out.</h1>
      <p className="mt-1 text-sm text-slate">First, what&rsquo;s this about?</p>
      <div className="mt-6">
        <TroubleshootingTradePicker destinations={eligible} />
      </div>
    </main>
  );
}
