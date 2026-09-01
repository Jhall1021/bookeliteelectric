/**
 * One real Guided Pricing question, with what each answer does.
 *
 * Shared by the Guided Pricing product page and every trade page, because
 * both show the same artifact and neither should own the rendering of it. The
 * question itself is always captured — see scripts/capture-trade-electrical.ts,
 * which picks the question whose answers do the most DIFFERENT things rather
 * than the one that reads nicest.
 */

/** What each route action does, in words a contractor would use. */
export const ROUTE_ACTION: Record<string, { label: string; tone: string; means: string }> = {
  RESOLVE_INSTANT: {
    label: "Price it",
    tone: "bg-p2b-green-tint text-p2b-green-deep",
    means: "The answers established known work. The price is released and the job can be booked.",
  },
  RESOLVE_ADJUSTED: {
    label: "Price it, adjusted",
    tone: "bg-p2b-green-tint text-p2b-green-deep",
    means: "Known work with a defined surcharge — a longer run, a second story — priced by a rule the contractor set.",
  },
  CONTINUE: {
    label: "Ask the next question",
    tone: "bg-p2b-accent-tint-strong text-p2b-accent",
    means: "Not enough is established yet. The answer narrows the job and the conversation continues.",
  },
  PHOTO_REVIEW: {
    label: "Look before pricing",
    tone: "bg-p2b-amber-tint text-p2b-amber-ink",
    means: "The homeowner sends photos of what they can see. Nobody prices it sight-unseen.",
  },
  REROUTE_SERVICE: {
    label: "That’s a different job",
    tone: "bg-[#F0F0EC] text-p2b-muted",
    means: "The answers describe other work. The customer is moved to the right service, carrying what they have already answered.",
  },
  REROUTE_TROUBLESHOOTING: {
    label: "Send to troubleshooting",
    tone: "bg-[#F0F0EC] text-p2b-muted",
    means: "Something is wrong rather than missing. That is a diagnostic visit, not a fixed-price installation.",
  },
  REMOTE_QUOTE: {
    label: "Quote it",
    tone: "bg-[#F0F0EC] text-p2b-muted",
    means: "Too variable for an automatic price. Information is collected and the contractor quotes it.",
  },
};

export const routeAction = (key: string) =>
  ROUTE_ACTION[key] ?? { label: key, tone: "bg-[#F0F0EC] text-p2b-muted", means: "" };

export type GuidedExample = {
  service: string;
  prompt: string;
  helpText: string | null;
  options: readonly { label: string; routeAction: string }[];
};

export default function GuidedQuestionCard({ example }: { example: GuidedExample }) {
  return (
    <div className="rounded-[3px] border border-p2b-line bg-white px-5 py-6 lg:px-8 lg:py-7">
      <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
        {example.service}
      </div>
      <div className="mt-3 text-[19px] font-semibold leading-[1.3] lg:text-[21px]">{example.prompt}</div>
      {example.helpText && (
        <p className="mt-2 text-[15px] leading-[1.5] text-p2b-muted">{example.helpText}</p>
      )}
      <div className="mt-5 flex flex-col gap-2.5">
        {example.options.map((o) => {
          const action = routeAction(o.routeAction);
          return (
            <div key={o.label}
                 className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-p2b-line px-4 py-3">
              <span className="text-[15px] text-p2b-ink-warm">{o.label}</span>
              <span className={`shrink-0 rounded-sm px-3 py-1 text-[12px] font-semibold ${action.tone}`}>
                {action.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
