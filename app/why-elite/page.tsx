const TRUST_POINTS = [
  { title: "Licensed & Insured", body: "Fully licensed New Jersey electricians (License #17272), carrying full insurance on every job." },
  { title: "Upfront Flat-Rate Pricing", body: "You see your price before we start — never a surprise bill after the work is done." },
  { title: "3-Hour Arrival Windows", body: "We respect your time. Pick a window, and we'll be there within it." },
  { title: "Clean, Respectful, Professional", body: "We treat your home like our own — shoe covers, drop cloths, and a clean job site when we're done." },
];

export default function WhyElitePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="font-display text-3xl font-bold text-navy">Local. Licensed. Trusted.</h1>
      <p className="mt-2 max-w-xl text-slate">
        Elite Electric &amp; Lighting brings a premium, homeowner-first experience to
        residential electrical work — the kind of service you'd expect from a
        polished consumer platform, done by real, professional electricians.
      </p>

      <div className="mt-10 grid gap-6 sm:grid-cols-2">
        {TRUST_POINTS.map((point) => (
          <div key={point.title} className="rounded-card border border-cardline bg-white p-6 shadow-card">
            <h2 className="font-display text-base font-bold text-navy">{point.title}</h2>
            <p className="mt-2 text-sm text-slate">{point.body}</p>
          </div>
        ))}
      </div>
    </main>
  );
}
