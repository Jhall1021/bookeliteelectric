import GuidedFlowEngine from "@/components/guided-flow/GuidedFlowEngine";
import { prisma } from "@/lib/prisma";
import { withContractor } from "@/lib/tenantRoute";
import { soleContractorId } from "@/lib/categories";

// Direct entry point per the brief — routes straight into the
// Troubleshooting service's own flow rather than a generic contact form.
export default async function TroubleshootingPage() {
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
  const contractorId = await soleContractorId(prisma, "the troubleshooting page");
  const questionCount = await withContractor(
    contractorId,
    "site-identifier",
    (db) =>
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
