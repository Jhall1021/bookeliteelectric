import GuidedFlowEngine from "@/components/guided-flow/GuidedFlowEngine";
import { requireHostedSite, withSite } from "@/lib/siteRouting";

// Direct entry point per the brief — routes straight into the
// Troubleshooting service's own flow rather than a generic contact form.
export default async function TroubleshootingPage({
  params,
}: {
  params: { site: string };
}) {
  // ADR §2.2. Tenant from the URL segment, not from the service this page
  // happens to open a flow for.
  const site = await requireHostedSite(params.site);
  // The intro copy promised "a couple quick questions," which was only ever
  // true if this service had a decision tree — and it doesn't, so customers
  // were told to expect questions that never came. Rather than hardcode the
  // corrected wording, derive it: add a triage tree in the admin tree
  // builder and the original copy comes back on its own, with nothing here
  // to remember to change.
  //
  // GUARD-ADOPTED (ADR-007a). Question is derived-owned, so the guard adds
  // `service: { contractorId }` and this stays the natural top-level shape —
  // no reshaping into a Service-rooted include to inherit tenancy, which would
  // push the query back into nested traversal where extensions are least
  // observable.
  const questionCount = await withSite(site, (db) =>
    db.question.count({
      where: { service: { slug: "electrical-troubleshooting" } },
    })
  );
  const hasTree = questionCount > 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">Let&rsquo;s figure it out.</h1>
      <p className="mt-1 text-sm text-slate">
        {hasTree
          ? "Answer a couple quick questions and we'll get you booked with the right service."
          : "When something's wrong but you're not sure what, we'll come diagnose it — at a price you can see before you book."}
      </p>
      <div className="mt-6">
        <GuidedFlowEngine serviceSlug="electrical-troubleshooting" />
      </div>
    </main>
  );
}
