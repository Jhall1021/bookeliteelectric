"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  serviceId: string;
  reason: string;
};

/**
 * The "no dead ends" rule in practice: when an answer indicates the
 * customer picked the wrong service, this looks up the correct one and
 * sends them there — never a plain "sorry, we can't help with that."
 */
export default function RerouteNotice({ serviceId, reason }: Props) {
  const router = useRouter();
  const [target, setTarget] = useState<{ slug: string; name: string; categorySlug: string } | null>(null);

  useEffect(() => {
    fetch(`/api/services/by-id/${serviceId}`)
      .then((r) => r.json())
      .then(setTarget);
  }, [serviceId]);

  return (
    <div className="rounded-card border border-cardline bg-white p-8 text-center shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">
        Based on your answer, you actually need a different service
      </h2>
      <p className="mt-2 text-sm text-slate">
        You selected "{reason}" — that's handled by {target ? target.name : "a different service"}, so
        we'll move your answers over and continue there.
      </p>
      {target && (
        <button
          onClick={() => router.push(`/services/${target.categorySlug}/${target.slug}`)}
          className="mt-6 rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover"
        >
          Continue to {target.name}
        </button>
      )}
    </div>
  );
}
