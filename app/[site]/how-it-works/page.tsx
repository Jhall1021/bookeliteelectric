import Link from "next/link";

const STEPS = [
  {
    number: "1",
    title: "Choose Your Service",
    body: "Browse by category or tell us what's going on and we'll point you in the right direction. No electrical jargon required.",
  },
  {
    number: "2",
    title: "See Your Price",
    body: "Answer a few quick questions about your home. Most jobs get an instant flat price — some need a couple of photos so we can confirm it remotely.",
  },
  {
    number: "3",
    title: "Pick Your Time",
    body: "Choose an arrival window that works for you. Add anything else you need while we're there, at a lower price since we're already on-site.",
  },
];

export default function HowItWorksPage({ params }: { params: { site: string } }) {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-navy">It's as easy as 1-2-3.</h1>
      <p className="mt-2 text-slate">Upfront pricing. On-time service. Done right.</p>

      <div className="mt-10 space-y-8">
        {STEPS.map((step) => (
          <div key={step.number} className="flex gap-5">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-electric text-sm font-bold text-white">
              {step.number}
            </div>
            <div>
              <h2 className="font-display text-lg font-bold text-navy">{step.title}</h2>
              <p className="mt-1 text-slate">{step.body}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-12 rounded-card border border-cardline bg-white p-6 text-center shadow-card">
        <Link
          href={`/${params.site}/services`}
          className="inline-block rounded-pill bg-electric px-7 py-3 font-semibold text-white transition hover:bg-electric-hover"
        >
          Book Your Service
        </Link>
      </div>
    </main>
  );
}
