"use client";

import { useState } from "react";
import GuidedFlowEngine from "./GuidedFlowEngine";

/** Display labels for the trade keys this platform publishes a catalog for.
 *  Falls back to a capitalized key for anything not listed here, so a new
 *  trade never renders blank. */
const TRADE_LABELS: Record<string, string> = {
  electrical: "Electrical",
  plumbing: "Plumbing",
  hvac: "HVAC",
};

function tradeLabel(tradeKey: string): string {
  return TRADE_LABELS[tradeKey] ?? tradeKey.charAt(0).toUpperCase() + tradeKey.slice(1);
}

type Destination = { tradeKey: string; slug: string; name: string };

/**
 * Asked ONLY when a contractor is enrolled in more than one trade and more
 * than one has a resolvable diagnostic — B.3. Today that's nobody (V1
 * enrolls a contractor in exactly one trade at a time), so this has no live
 * exercise yet; it exists so the moment that constraint lifts, a multi-trade
 * customer picks their own destination instead of one being guessed for
 * them.
 */
export default function TroubleshootingTradePicker({ destinations }: { destinations: Destination[] }) {
  const [chosen, setChosen] = useState<Destination | null>(null);

  if (chosen) {
    return <GuidedFlowEngine serviceSlug={chosen.slug} />;
  }

  return (
    <div className="flex flex-wrap gap-3">
      {destinations.map((d) => (
        <button
          key={d.tradeKey}
          onClick={() => setChosen(d)}
          className="rounded-pill border border-cardline bg-white px-6 py-3 font-medium text-navy transition hover:border-electric hover:text-electric"
        >
          {tradeLabel(d.tradeKey)}
        </button>
      ))}
    </div>
  );
}
