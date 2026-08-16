import GuidedFlowEngine from "@/components/guided-flow/GuidedFlowEngine";

// Direct entry point per the brief — routes straight into the
// Troubleshooting service's own flow rather than a generic contact form.
export default function TroubleshootingPage() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl font-bold text-navy">Let's figure it out.</h1>
      <p className="mt-1 text-sm text-slate">
        Answer a couple quick questions and we'll get you booked with the right service.
      </p>
      <div className="mt-6">
        <GuidedFlowEngine serviceSlug="electrical-troubleshooting" />
      </div>
    </main>
  );
}
