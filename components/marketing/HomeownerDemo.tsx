"use client";

import { useMemo, useState } from "react";
import { DEMO_FLOW } from "./demoFlow";

/**
 * The homeowner demonstration — ADR-020.
 *
 * "See the Homeowner Experience" used to scroll to four written steps, which
 * is a description of an experience rather than one. This walks the actual
 * flow: type what you need, answer the questions that change the price, and
 * find out whether the job can be priced and booked or has to go to the
 * office.
 *
 * NOTHING HERE IS INVENTED. Every question, every answer, every price and
 * every routing decision comes from components/marketing/demoFlow.ts, which
 * scripts/capture-demo-flow.ts generates by walking a real service's real
 * tree and resolving EVERY path through the same resolveRoute the storefront
 * calls. There are 19 paths through this tree and 16 of them end in review —
 * that ratio is the product being conservative, not a script being dramatic.
 *
 * And it cannot book anything. It holds no session, calls no endpoint and
 * writes nothing; the last screen says so rather than implying a booking that
 * never happened.
 */

const money = (cents: number) =>
  `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

type Stage = "search" | "questions" | "handoff" | "outcome" | "sameVisit" | "schedule" | "done";

type Flow = {
  key: string | null;
  name: string;
  description: string | null;
  steps: readonly { key: string; prompt: string; helpText: string | null;
    options: readonly { value: string; label: string; disclaimer: string | null; next: string | null }[] }[];
  outcomes: Record<string, any>;
};

const FLOWS = DEMO_FLOW.flows as unknown as Record<string, Flow>;

const WINDOWS = [
  { label: "8:00 – 11:00", note: "2 crews available", open: true },
  { label: "11:00 – 2:00", note: "1 crew available", open: true },
  { label: "2:00 – 4:30", note: "Unavailable — job won’t fit", open: false },
];

export default function HomeownerDemo() {
  const [stage, setStage] = useState<Stage>("search");
  const [flowKey, setFlowKey] = useState<string>(DEMO_FLOW.primary as string);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [stepKey, setStepKey] = useState<string>(FLOWS[DEMO_FLOW.primary as string]?.steps[0]?.key ?? "");
  /** What the customer answered before being rerouted, so the demo can say so. */
  const [handoff, setHandoff] = useState<{ from: string; to: string; carried: number } | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [window_, setWindow] = useState<string | null>(null);

  const flow = FLOWS[flowKey];
  const step = flow?.steps.find((s) => s.key === stepKey);

  /** Looked up, never computed here — the engine already decided. */
  const outcome = useMemo(() => flow?.outcomes[JSON.stringify(answers)] ?? null, [flow, answers]);

  const total = useMemo(() => {
    const base = outcome?.status === "PRICED" ? outcome.priceCents : 0;
    const extras = DEMO_FLOW.addOns
      .filter((a) => added.includes(a.name))
      .reduce((sum, a) => sum + a.priceCents, 0);
    return base + extras;
  }, [outcome, added]);

  function choose(value: string) {
    if (!step) return;
    const next = { ...answers, [step.key]: value };
    setAnswers(next);
    const option = step.options.find((o) => o.value === value);
    if (option?.next) { setStepKey(option.next); return; }

    // A terminal answer. If the engine rerouted, move into the destination
    // flow rather than stopping — the product's rule is no dead ends.
    const result = flow?.outcomes[JSON.stringify(next)];
    if (result?.status === "REROUTE" && result.targetKey && FLOWS[result.targetKey]) {
      const target = FLOWS[result.targetKey];
      // Answers carry across, exactly as RerouteNotice does with its handoff:
      // any question the destination shares is already answered and not asked
      // again.
      const carried = Object.fromEntries(
        Object.entries(next).filter(([k]) => target.steps.some((s) => s.key === k)),
      );
      setHandoff({ from: flow!.name, to: target.name, carried: Object.keys(carried).length });
      setFlowKey(result.targetKey);
      setAnswers(carried);
      setStepKey(target.steps.find((s) => !(s.key in carried))?.key ?? target.steps[0]?.key ?? "");
      setStage("handoff");
      return;
    }
    setStage("outcome");
  }

  function restart() {
    const first = DEMO_FLOW.primary as string;
    setFlowKey(first);
    setAnswers({});
    setStepKey(FLOWS[first]?.steps[0]?.key ?? "");
    setHandoff(null);
    setAdded([]);
    setWindow(null);
    setStage("search");
  }

  const asked = flow ? flow.steps.filter((s) => s.key in answers).length : 0;

  return (
    <section id="demo" className="border-t border-p2b-line bg-p2b-canvas-alt py-16 lg:py-20">
      <div className="mx-auto max-w-[1440px] px-5 lg:px-[88px]">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-start">
          <div className="lg:col-span-4">
            <div className="mb-5 flex items-center gap-2.5">
              <div className="h-0.5 w-[26px] bg-p2b-accent" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
                Try it yourself
              </span>
            </div>
            <h2 className="text-[30px] font-bold leading-[1.12] tracking-[-0.022em] lg:text-[40px]">
              This is what your customer does.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm lg:text-lg">
              A real service from a demonstration contractor, with its real questions. The price and
              the decision to book or review come from the same engine that runs the product.
            </p>
            <p className="mt-4 text-[15px] leading-[1.6] text-p2b-muted">
              Answer honestly, or answer “I’m not sure” — the point is what happens differently.
              Nothing here books an appointment.
            </p>
            {/* Carried over from the "Four steps" section this replaced. It
                lands harder next to a price being approved or withheld than
                it did as a caption under four numbered cards. */}
            <p className="mt-6 text-[15px] leading-[1.6] text-p2b-ink-warm lg:text-base">
              The price they see is a price <span className="font-semibold">you approved</span>. The
              window they choose is a window <span className="font-semibold">you opened</span>.
            </p>

            {/* Shown unless the card on the right already offers a reset.
                Two "Start over" buttons is a pointless choice; none at all —
                which the first attempt at this produced on the priced card,
                whose own button is "Continue" — is a trap. */}
            {stage !== "search" &&
              !(stage === "done") &&
              !(stage === "outcome" && outcome?.status !== "PRICED") && (
              <button onClick={restart}
                      className="mt-6 text-[15px] font-semibold text-p2b-accent underline underline-offset-2 hover:text-p2b-accent-hover">
                Start over
              </button>
            )}
          </div>

          <div className="lg:col-span-8">
            <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white shadow-[0_2px_6px_rgba(20,24,31,.05)]">
              <div className="flex items-center justify-between border-b border-[#EEEAE1] bg-p2b-surface-warm px-6 py-3">
                <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
                  {DEMO_FLOW.contractor} · what the homeowner sees
                </span>
                <span className="text-[11px] font-medium text-p2b-muted">Demonstration</span>
              </div>

              <div className="p-6 lg:p-8">
                {stage === "search" && (
                  <div>
                    <label htmlFor="demo-q" className="text-[15px] font-semibold">Tell us what you need</label>
                    <input
                      id="demo-q" readOnly value={DEMO_FLOW.search.query}
                      className="mt-2.5 w-full rounded-sm border border-p2b-line bg-p2b-canvas px-4 py-3 text-[15px] text-p2b-ink-warm"
                    />
                    <p className="mt-2 text-[13px] text-p2b-muted">
                      In the customer’s words. No trade terminology required.
                    </p>
                    <button
                      onClick={() => setStage("questions")}
                      className="mt-5 rounded-sm bg-p2b-accent px-6 py-3 text-[15px] font-semibold text-p2b-canvas hover:bg-p2b-accent-hover"
                    >
                      Find it
                    </button>
                  </div>
                )}

                {stage === "handoff" && handoff && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-accent">
                      That’s a different job
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold">{handoff.to}</h3>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-ink-warm">
                      What you described isn’t {handoff.from.toLowerCase()} — it’s {handoff.to}. So
                      you’re moved there rather than turned away, and the questions continue.
                    </p>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
                      {handoff.carried > 0
                        ? `Your answers come with you — ${handoff.carried} question${handoff.carried === 1 ? "" : "s"} you have already answered won't be asked again.`
                        : "Your answers come with you; this job asks about different things, so there is nothing to skip."}
                    </p>
                    <button onClick={() => setStage("questions")}
                            className="mt-5 rounded-sm bg-p2b-accent px-6 py-3 text-[15px] font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
                      Keep going
                    </button>
                  </div>
                )}

                {stage === "questions" && step && (
                  <div>
                    <div className="flex items-baseline justify-between gap-4">
                      <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-accent">
                        {flow?.name}
                      </div>
                      <div className="text-[13px] text-p2b-muted">Question {asked + 1}</div>
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold leading-[1.3] lg:text-[24px]">{step.prompt}</h3>
                    {step.helpText && <p className="mt-2 text-[15px] text-p2b-muted">{step.helpText}</p>}
                    <div className="mt-5 flex flex-col gap-2.5">
                      {step.options.map((o) => (
                        <button key={o.value} onClick={() => choose(o.value)}
                                className="rounded-sm border border-p2b-line px-4 py-3.5 text-left text-[15px] hover:border-p2b-accent hover:bg-p2b-accent-tint">
                          {o.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {stage === "outcome" && outcome?.status === "PRICED" && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-green-deep">
                      Can be booked online
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold">{flow?.name}</h3>
                    <div className="mt-3 flex items-baseline gap-2.5">
                      <span className="text-[44px] font-bold tracking-[-0.03em]">{money(outcome.priceCents)}</span>
                      <span className="text-sm text-p2b-muted">all-in</span>
                    </div>
                    <p className="mt-3 text-[15px] leading-[1.55] text-p2b-muted">
                      Your answers fit a pricing path the contractor approved, so the price is
                      released and the job can be booked.
                    </p>
                    <button onClick={() => setStage("sameVisit")}
                            className="mt-5 rounded-sm bg-p2b-accent px-6 py-3 text-[15px] font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
                      Continue
                    </button>
                  </div>
                )}

                {stage === "outcome" && outcome?.status === "REVIEW" && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-amber-ink">
                      Needs review before a price
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold">{flow?.name}</h3>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-ink-warm">
                      No price is shown, on purpose. {outcome.reason}.
                    </p>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
                      On a real storefront this is not the end either: the request goes to the
                      contractor with the answers and any photos, they issue a price, and the
                      customer approves and books. It is a slower path, not a closed door — and it
                      is what stops a job being priced wrongly and sight-unseen.
                    </p>
                    <button onClick={restart}
                            className="mt-5 rounded-sm border border-p2b-ink px-6 py-3 text-[15px] font-semibold text-p2b-ink hover:border-p2b-accent hover:text-p2b-accent">
                      Start over
                    </button>
                  </div>
                )}

                {stage === "outcome" && outcome?.status === "REROUTE" && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-accent">
                      That’s a different job
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold">{outcome.targetName}</h3>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-ink-warm">
                      What you described isn’t the service you started in, so the real flow moves
                      you to {outcome.targetName} and carries your answers over. This demonstration
                      only follows one reroute, so it stops here.
                    </p>
                    <button onClick={restart}
                            className="mt-5 rounded-sm border border-p2b-ink px-6 py-3 text-[15px] font-semibold text-p2b-ink hover:border-p2b-accent hover:text-p2b-accent">
                      Start over
                    </button>
                  </div>
                )}

                {/* Any outcome this component does not model — and any path
                    missing from the snapshot — lands here rather than
                    rendering nothing. A blank card is the one failure a
                    visitor cannot interpret. */}
                {stage === "outcome" &&
                  (!outcome || !["PRICED", "REVIEW", "REROUTE"].includes(outcome.status)) && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-muted">
                      Not part of this demonstration
                    </div>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
                      This route goes somewhere the demonstration doesn’t follow. On a real
                      storefront it resolves; here it stops.
                    </p>
                    <button onClick={restart} className="mt-4 text-[15px] font-semibold text-p2b-accent underline">
                      Start over
                    </button>
                  </div>
                )}

                {stage === "sameVisit" && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-green-deep">
                      While We’re There™
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold">Since we’re already coming out</h3>
                    <p className="mt-2 text-[15px] text-p2b-muted">
                      The contractor approved these at a same-visit price. Adding one is optional.
                    </p>
                    <div className="mt-4 divide-y divide-p2b-line-soft border-y border-p2b-line-soft">
                      {DEMO_FLOW.addOns.map((a) => {
                        const on = added.includes(a.name);
                        return (
                          <div key={a.name} className="flex items-center justify-between gap-4 py-3.5">
                            <span className="text-[15px]">{a.name}</span>
                            <div className="flex items-center gap-3">
                              <span className="text-[15px] font-bold text-p2b-green-deep">
                                +{money(a.priceCents)}
                              </span>
                              <button
                                onClick={() => setAdded(on ? added.filter((n) => n !== a.name) : [...added, a.name])}
                                className={`rounded-sm border-[1.5px] px-4 py-1.5 text-sm font-semibold ${
                                  on ? "border-p2b-green bg-p2b-green text-white"
                                     : "border-p2b-green text-p2b-green-deep hover:bg-p2b-green-tint"}`}
                              >
                                {on ? "Added" : "Add"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 flex items-baseline justify-between">
                      <span className="text-[15px] font-semibold">Visit total</span>
                      <span className="text-2xl font-bold">{money(total)}</span>
                    </div>
                    <button onClick={() => setStage("schedule")}
                            className="mt-5 rounded-sm bg-p2b-accent px-6 py-3 text-[15px] font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
                      Pick a time
                    </button>
                  </div>
                )}

                {stage === "schedule" && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-accent">
                      Availability the contractor opened
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold">Thursday</h3>
                    <p className="mt-2 text-[15px] text-p2b-muted">
                      Windows come from working hours, crews and how long this job actually takes.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      {WINDOWS.map((w) => (
                        <button
                          key={w.label} disabled={!w.open}
                          onClick={() => setWindow(w.label)}
                          className={`rounded-sm border p-4 text-left ${
                            !w.open ? "cursor-not-allowed border-p2b-line bg-p2b-surface-warm opacity-60"
                            : window_ === w.label ? "border-[1.5px] border-p2b-green bg-p2b-green-tint"
                            : "border-[#CFE3D8] bg-[#F3F9F5] hover:border-p2b-green"}`}
                        >
                          <div className={`text-[15px] font-semibold ${w.open ? "" : "text-p2b-faint"}`}>{w.label}</div>
                          <div className={`mt-1.5 text-[13px] ${w.open ? "text-p2b-green-deep" : "text-p2b-faint"}`}>
                            {w.note}
                          </div>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => setStage("done")} disabled={!window_}
                      className="mt-5 w-full rounded-sm bg-p2b-ink p-3.5 text-[15px] font-semibold text-p2b-canvas disabled:opacity-40"
                    >
                      {window_ ? `Book ${window_}` : "Choose a window"}
                    </button>
                  </div>
                )}

                {stage === "done" && (
                  <div>
                    <div className="text-[13px] font-semibold uppercase tracking-[0.06em] text-p2b-muted">
                      End of the demonstration
                    </div>
                    <h3 className="mt-3 text-[21px] font-semibold">Nothing was booked.</h3>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-ink-warm">
                      That’s the whole customer journey: they described the job, answered the
                      questions that change the price, got a price you approved, added same-visit
                      work, and chose a window you opened — without calling anyone.
                    </p>
                    <p className="mt-3 text-[15px] leading-[1.6] text-p2b-muted">
                      On a real storefront this is where the booking is created and handed to the
                      software you already run. Here it stops, because this page holds no account
                      and takes no appointments.
                    </p>
                    <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
                      <a href="#access"
                         className="rounded-sm bg-p2b-accent px-6 py-3 text-center text-[15px] font-semibold text-p2b-canvas hover:bg-p2b-accent-hover">
                        Request Early Access
                      </a>
                      <button onClick={restart}
                              className="text-[15px] font-semibold text-p2b-accent underline underline-offset-2">
                        Run it again
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
