"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AnswerOptionDTO, QuestionDTO, ServiceFlowDTO } from "@/lib/flow-types";
import { formatCents } from "@/lib/flow-types";
import ServiceIntro from "./ServiceIntro";
import QuestionStep from "./QuestionStep";
import PriceConfirmationCard from "./PriceConfirmationCard";
import RerouteNotice from "./RerouteNotice";
import PhotoReviewNotice from "./PhotoReviewNotice";
import PricedPhotoReview from "./PricedPhotoReview";

type Props = {
  serviceSlug: string;
};

type TerminalState =
  | { kind: "intro" }
  | { kind: "question"; question: QuestionDTO }
  | { kind: "resolved"; priceCents: number; disclaimer: string | null }
  | { kind: "reroute"; serviceId: string; reason: string }
  | { kind: "troubleshooting" }
  | { kind: "photo_review"; labels: string[] }
  // Price already settled; the photos are prep for the technician, not a
  // condition of booking. Driven by AnswerOption.photosBlockBooking = false.
  | { kind: "priced_photo_review"; labels: string[]; priceCents: number; disclaimer: string | null };

/**
 * Interprets a Service's Question/AnswerOption tree at runtime. This is the
 * ONE component every service flow renders through — no per-service pages,
 * per the Phase 1 architecture decision. Answers accumulate as the customer
 * moves through the tree; a REROUTE_SERVICE branch carries those answers
 * forward into the new service so nothing is lost (the "no dead ends" rule).
 *
 * Every flow opens on an intro screen showing the service's name and
 * description before any questions are asked — so a customer who clicked
 * "Replace Standard Outlet" can confirm that's really what they meant
 * before committing to anything, rather than discovering a mismatch later.
 */
export default function GuidedFlowEngine({ serviceSlug }: Props) {
  const router = useRouter();
  const [flow, setFlow] = useState<ServiceFlowDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [priceCentsAccrued, setPriceCentsAccrued] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<TerminalState | null>(null);
  // Every step the customer has already passed through, newest last. The
  // browser's own back button can't serve here: the whole flow lives at one
  // URL, so going back in history leaves the service entirely and throws
  // away every answer. Each entry snapshots the three things that change as
  // the customer moves, so stepping back restores the exact prior state
  // rather than trying to reverse-calculate it.
  const [history, setHistory] = useState<
    { state: TerminalState; priceCentsAccrued: number; answers: Record<string, string> }[]
  >([]);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/services/${serviceSlug}`)
      .then((r) => r.json())
      .then((data: ServiceFlowDTO) => {
        setFlow(data);
        setPriceCentsAccrued(data.basePrice ?? 0);
        setState({ kind: "intro" });
        setHistory([]);
        setAnswers({});
        setLoading(false);
      });
  }, [serviceSlug]);

  // Snapshot the CURRENT step before moving on. Called at the top of every
  // transition so the stack always holds where the customer just was.
  function pushHistory() {
    if (!state) return;
    setHistory((h) => [...h, { state, priceCentsAccrued, answers }]);
  }

  function goBack() {
    // Read straight from the current render rather than nesting these
    // setters inside a setHistory updater — React invokes updaters twice
    // under StrictMode, and an updater that triggers other state changes
    // is exactly the kind of side effect that makes that visible.
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setState(previous.state);
    setPriceCentsAccrued(previous.priceCentsAccrued);
    setAnswers(previous.answers);
    setHistory(history.slice(0, -1));
  }

  function startQuestions() {
    if (!flow) return;
    pushHistory();
    if (flow.questions.length > 0) {
      setState({ kind: "question", question: flow.questions[0] });
    } else if (flow.bookingType === "REMOTE_QUOTE") {
      // No tree seeded for this service yet, but it's explicitly a
      // custom-quote job — route straight to photo review instead of
      // falsely resolving at $0 just because basePrice is null.
      setState({
        kind: "photo_review",
        labels: ["Photo of the area where the work is needed", "Your electrical panel, door open if possible"],
      });
    } else {
      // No qualifying questions at all, and it's a fixed-price service —
      // resolves immediately. Service.disclaimer (not an AnswerOption
      // disclaimer, since there's no branch here) still gets shown.
      setState({ kind: "resolved", priceCents: flow.basePrice ?? 0, disclaimer: flow.disclaimer });
    }
  }

  async function handleAnswer(question: QuestionDTO, option: AnswerOptionDTO) {
    pushHistory();
    const newAnswers = { ...answers, [question.key]: option.value };
    setAnswers(newAnswers);
    const newTotal = priceCentsAccrued + option.priceModifierCents;
    setPriceCentsAccrued(newTotal);

    switch (option.routeAction) {
      case "CONTINUE": {
        const next = flow?.questions.find((q) => q.id === option.nextQuestionId);
        if (next) {
          setState({ kind: "question", question: next });
        } else {
          // Tree misconfigured — fail safe to resolved rather than a dead end.
          setState({ kind: "resolved", priceCents: newTotal, disclaimer: null });
        }
        break;
      }
      case "RESOLVE_INSTANT":
      case "RESOLVE_ADJUSTED":
        setState({ kind: "resolved", priceCents: newTotal, disclaimer: option.disclaimer });
        break;
      case "REROUTE_TROUBLESHOOTING":
        setState({ kind: "troubleshooting" });
        break;
      case "PHOTO_REVIEW":
        // Two very different outcomes share this route action. When the
        // photos don't block booking, the answer has already determined the
        // price, so we resolve it and collect the photos as prep instead of
        // handing the job off to the office.
        if (!option.photosBlockBooking) {
          setState({
            kind: "priced_photo_review",
            labels: option.requiredPhotoLabels,
            priceCents: newTotal,
            disclaimer: option.disclaimer,
          });
          break;
        }
        setState({ kind: "photo_review", labels: option.requiredPhotoLabels });
        break;
      case "REMOTE_QUOTE":
        // Always blocks: a remote quote has no price to lock in by definition.
        setState({ kind: "photo_review", labels: option.requiredPhotoLabels });
        break;
      case "REROUTE_SERVICE":
        if (option.rerouteServiceId) {
          setState({ kind: "reroute", serviceId: option.rerouteServiceId, reason: option.label });
        }
        break;
    }
  }

  // Shared by the plain resolved path and the price-locked photo path — the
  // only difference is whether any photos ride along.
  async function addToVisit(
    priceCents: number,
    photos?: { url: string; label: string }[]
  ) {
    if (!flow) return;
    const res = await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: flow.id,
        computedPriceCents: priceCents,
        isPrimary: true,
        answersSnapshot: answers,
        ...(photos && photos.length > 0 ? { photos } : {}),
      }),
    });
    // Don't navigate on a failed add — that would drop the customer on an
    // empty visit page with no idea their photos went nowhere.
    if (!res.ok) throw new Error("Could not add this to your visit");
    router.push("/my-visit");
  }

  async function handleAddToVisit() {
    if (!flow || state?.kind !== "resolved") return;
    await addToVisit(state.priceCents);
  }

  if (loading || !flow || !state) {
    return <div className="py-16 text-center text-slate">Loading...</div>;
  }

  // Wrapping every step here means no child component needs to know about
  // history — QuestionStep, PriceConfirmationCard and the photo screens are
  // all rendered through this and stay unchanged.
  function withBack(content: ReactNode) {
    return (
      <div>
        {history.length > 0 && (
          <button
            onClick={goBack}
            className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-electric hover:underline"
          >
            <span aria-hidden="true">←</span> Back
          </button>
        )}
        {content}
      </div>
    );
  }

  if (state.kind === "intro") {
    // A service qualifies for one-tap booking only if there is genuinely
    // nothing left to determine: no questions to branch on, a real base
    // price, and not a remote quote (which has no settled price by
    // definition, however few questions it asks). Anything else keeps the
    // "Get My Price" step.
    const directBook =
      flow.questions.length === 0 &&
      flow.bookingType !== "REMOTE_QUOTE" &&
      flow.basePrice !== null;

    return withBack(
      <ServiceIntro
        name={flow.name}
        description={flow.shortDescription}
        basePrice={flow.basePrice}
        startingPriceLabel={flow.startingPriceLabel}
        icon={flow.icon}
        serviceSlug={serviceSlug}
        directBook={directBook}
        disclaimer={flow.disclaimer}
        onContinue={
          directBook ? () => addToVisit(flow.basePrice ?? 0) : startQuestions
        }
      />
    );
  }

  if (state.kind === "question") {
    return withBack(
      <QuestionStep
        question={state.question}
        onAnswer={(option) => handleAnswer(state.question, option)}
      />
    );
  }

  if (state.kind === "resolved") {
    return withBack(
      <PriceConfirmationCard
        serviceName={flow.name}
        priceCents={state.priceCents}
        disclaimer={state.disclaimer}
        onAddToVisit={handleAddToVisit}
      />
    );
  }

  if (state.kind === "reroute") {
    return withBack(<RerouteNotice serviceId={state.serviceId} reason={state.reason} />);
  }

  if (state.kind === "troubleshooting") {
    return withBack(
      <div className="rounded-card border border-cardline bg-white p-8 text-center shadow-card">
        <h2 className="font-display text-xl font-bold text-navy">
          This sounds like a troubleshooting job
        </h2>
        <p className="mt-2 text-slate">
          Based on your answer, we'd rather diagnose the issue first than have you book the
          wrong repair. Our Electrical Troubleshooting visit is $249, which includes the visit
          and the first 60 minutes of diagnostic time.
        </p>
        <button
          onClick={() => router.push("/services/panels-troubleshooting/electrical-troubleshooting")}
          className="mt-6 rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover"
        >
          Book Troubleshooting — {formatCents(24900)}
        </button>
      </div>
    );
  }

  if (state.kind === "priced_photo_review") {
    return withBack(
      <PricedPhotoReview
        serviceName={flow.name}
        priceCents={state.priceCents}
        disclaimer={state.disclaimer}
        labels={state.labels}
        onConfirm={(photos) => addToVisit(state.priceCents, photos)}
      />
    );
  }

  if (state.kind === "photo_review") {
    return withBack(
      <PhotoReviewNotice
        labels={state.labels}
        serviceName={flow.name}
        serviceId={flow.id}
        answers={answers}
      />
    );
  }

  return null;
}
