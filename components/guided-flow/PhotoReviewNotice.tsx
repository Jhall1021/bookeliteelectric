"use client";

type Props = {
  serviceName: string;
  labels: string[];
};

/**
 * Phase 2 stub: shows what photos are needed and why, matching the "we can
 * price this remotely, we just need a few photos" tone from the brief.
 * Actual upload wiring to Cloudflare R2 + Quote creation is Phase 3 —
 * this establishes the UI and the branch-specific required-photo list.
 */
export default function PhotoReviewNotice({ serviceName, labels }: Props) {
  return (
    <div className="rounded-card border border-cardline bg-white p-8 text-center shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">We can price this remotely.</h2>
      <p className="mt-2 text-sm text-slate">
        Your answers for {serviceName} mean we need a few photos to confirm the price — no
        estimate visit required. We'll review them and send back a fixed price.
      </p>

      <ul className="mx-auto mt-6 max-w-sm space-y-2 text-left text-sm text-navy">
        {labels.map((label) => (
          <li key={label} className="flex items-start gap-2">
            <span className="mt-0.5 text-electric">📷</span>
            {label}
          </li>
        ))}
      </ul>

      <button
        disabled
        title="Photo upload wiring lands in Phase 3"
        className="mt-6 rounded-pill bg-electric/40 px-7 py-3 font-semibold text-white"
      >
        Upload Photos (coming in Phase 3)
      </button>
    </div>
  );
}
