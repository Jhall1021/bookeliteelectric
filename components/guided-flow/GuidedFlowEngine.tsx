"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AnswerOptionDTO, QuestionDTO, ServiceFlowDTO } from "@/lib/flow-types";
import { formatCents } from "@/lib/flow-types";
import {
  startDisplayConfiguration,
  applyBranch,
  customerPrice,
  type JobConfiguration,
} from "@/lib/pricing";
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
  | { kind: "troubleshooting"; note?: string | null }
  | { kind: "photo_review"; labels: string[]; safetyNotes?: string[]; floorPriceCents?: number | null }
  // Price already settled; the photos are prep for the technician, not a
  // condition of booking. Driven by AnswerOption.photosBlockBooking = false.
  | { kind: "priced_photo_review"; labels: string[]; safetyNotes?: string[]; priceCents: number; disclaimer: string | null };

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
  // Handoff §13-§15: accumulate the JOB — technician-hours, material, calendar
  // minutes, crew size — and price the finished configuration once. Summing
  // dollar modifiers and inferring labor afterwards is what this replaces.
  const [config, setConfig] = useState<JobConfiguration | null>(null);
  // Whether this customer already has services in their visit. If they do,
  // this service is an add-on: it anchors on whileWeThereBasePrice and is
  // NOT the primary job. Previously the flow always assumed it was the first
  // service, so anything added by browsing was charged the full standalone
  // rate — contradicting the promise made on the homepage and honoured
  // correctly by /my-visit.
  const [isAddOn, setIsAddOn] = useState(false);
  // The troubleshooting reroute screen used to hardcode $249 in both the body
  // copy and the button, while the service record said $250 — so a customer
  // sent there from a failed outlet swap was quoted one number and charged
  // another. Read it from the service instead; the hardcode was the bug, not
  // the specific figure.
  const [troubleshootingCents, setTroubleshootingCents] = useState<number | null>(null);
  // Stored under a reserved key in answersSnapshot rather than its own column
  // — it's part of the record of what the customer told us, same as any
  // answer, and it reaches the job sheet without extra plumbing.
  const [customerNote, setCustomerNote] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [state, setState] = useState<TerminalState | null>(null);
  // Every step the customer has already passed through, newest last. The
  // browser's own back button can't serve here: the whole flow lives at one
  // URL, so going back in history leaves the service entirely and throws
  // away every answer. Each entry snapshots the three things that change as
  // the customer moves, so stepping back restores the exact prior state
  // rather than trying to reverse-calculate it.
  const [history, setHistory] = useState<
    { state: TerminalState; config: JobConfiguration | null; answers: Record<string, string> }[]
  >([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/services/${serviceSlug}`).then((r) => r.json()),
      // Tolerate a failure here rather than blocking the whole flow — worst
      // case the customer is treated as a first-time booker, which is the
      // old behaviour, not a broken page.
      fetch("/api/visit")
        .then((r) => r.json())
        .catch(() => ({ lineItems: [] })),
    ]).then(([data, visit]: [ServiceFlowDTO, { lineItems?: unknown[] }]) => {
      const addOn = (visit?.lineItems?.length ?? 0) > 0 && data.whileWeThereBasePrice !== null;
      setFlow(data);
      setIsAddOn(addOn);
      setConfig(startDisplayConfiguration(data));
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
    setHistory((h) => [...h, { state, config, answers }]);
  }

  function goBack() {
    // Read straight from the current render rather than nesting these
    // setters inside a setHistory updater — React invokes updaters twice
    // under StrictMode, and an updater that triggers other state changes
    // is exactly the kind of side effect that makes that visible.
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setState(previous.state);
    setAnswers(previous.answers);
    setHistory(history.slice(0, -1));
  }

  function startQuestions() {
    if (!flow) return;
    pushHistory();
    if (flow.questions.length > 0) {
      advanceFrom(flow.questions[0].id, config ?? startDisplayConfiguration(flow), answers);
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
      // The anchor is the published price — While We're There when this is an
      // add-on, standalone otherwise.
      setState({
        kind: "resolved",
        priceCents: (isAddOn ? flow.whileWeThereBasePrice : flow.basePrice) ?? 0,
        disclaimer: flow.disclaimer,
      });
    }
  }

  /**
   * Pure evaluation of one answer: fold it into the configuration and decide
   * where the customer goes next. Separated from the click handler so it can
   * also be driven by a previously-collected answer (§29) without a click.
   */
  function evaluate(
    option: AnswerOptionDTO,
    cfg: JobConfiguration,
    /** Needed for conditional components (§29). */
    ans: Record<string, string>
  ):
    | { kind: "continue"; config: JobConfiguration; nextQuestionId: string | null }
    | { kind: "terminal"; config: JobConfiguration; state: TerminalState } {
    const nextConfig = applyBranch(cfg, option, ans);

    // What the customer pays comes from the PUBLISHED price plus approved
    // increments — never from the calculated configuration. A service whose
    // field hours aren't established still sells at its published price;
    // only the internal suggestion is withheld (handoff §5/§31).
    const anchor = isAddOn ? flow!.whileWeThereBasePrice : flow!.basePrice;
    const priced = customerPrice(nextConfig, anchor ?? null);
    const total = priced.totalCents ?? 0;

    const fallbackPhotos = [
      "Photo of the area where the work is needed",
      "Your electrical panel, door open — leave the panel cover on",
    ];

    // A branch selecting components with no approved customer price can't be
    // booked at a number we invented. Checked before the route action, so it
    // overrides an otherwise instant-resolving answer.
    if (priced.mustReview) {
      return {
        kind: "terminal",
        config: nextConfig,
        state: {
          kind: "photo_review",
          labels: option.requiredPhotoLabels.length > 0 ? option.requiredPhotoLabels : fallbackPhotos,
          safetyNotes: option.photoSafetyNotes,
          // Where the running total stood when we stopped. Only ever shown
          // as a floor.
          floorPriceCents: total,
        },
      };
    }

    switch (option.routeAction) {
      case "CONTINUE":
        return { kind: "continue", config: nextConfig, nextQuestionId: option.nextQuestionId };
      case "RESOLVE_INSTANT":
      case "RESOLVE_ADJUSTED":
        return {
          kind: "terminal",
          config: nextConfig,
          state: { kind: "resolved", priceCents: total, disclaimer: option.disclaimer },
        };
      case "REROUTE_TROUBLESHOOTING":
        // Carry the answer's disclaimer through — that's where the "we'll start at
      // the device and only charge for the swap if that's all it is" promise
      // lives, and it's useless if the customer never sees it.
      return {
          kind: "terminal",
          config: nextConfig,
          state: { kind: "troubleshooting", note: option.disclaimer },
        };
      case "PHOTO_REVIEW":
        // Two very different outcomes share this route action. When the photos
        // don't block booking, the answer has already determined the price, so
        // resolve it and collect the photos as preparation instead.
        if (!option.photosBlockBooking) {
          return {
            kind: "terminal",
            config: nextConfig,
            state: {
              kind: "priced_photo_review",
              labels: option.requiredPhotoLabels,
              safetyNotes: option.photoSafetyNotes,
              priceCents: total,
              disclaimer: option.disclaimer,
            },
          };
        }
        return {
          kind: "terminal",
          config: nextConfig,
          state: {
            kind: "photo_review",
            labels: option.requiredPhotoLabels,
            safetyNotes: option.photoSafetyNotes,
            floorPriceCents: total,
          },
        };
      case "REMOTE_QUOTE":
        return {
          kind: "terminal",
          config: nextConfig,
          state: {
            kind: "photo_review",
            labels: option.requiredPhotoLabels,
            safetyNotes: option.photoSafetyNotes,
            floorPriceCents: total,
          },
        };
      case "REROUTE_SERVICE":
        return {
          kind: "terminal",
          config: nextConfig,
          state: option.rerouteServiceId
            ? { kind: "reroute", serviceId: option.rerouteServiceId, reason: option.label }
            : { kind: "resolved", priceCents: total, disclaimer: null },
        };
      default:
        return {
          kind: "terminal",
          config: nextConfig,
          state: { kind: "resolved", priceCents: total, disclaimer: null },
        };
    }
  }

  /**
   * Walk forward from a question, auto-answering any whose key the customer
   * has already answered (handoff §29).
   *
   * This is what stops the Lighting Control module re-asking the attic/
   * finished-space question that the Height/Access module already collected,
   * and what makes answers carried through a REROUTE_SERVICE actually useful
   * rather than merely preserved.
   *
   * Matching is by Question.key and AnswerOption.value, so two modules share
   * an answer only when they deliberately share a key.
   */
  function advanceFrom(
    questionId: string | null,
    cfg: JobConfiguration,
    ans: Record<string, string>
  ) {
    let config = cfg;
    let currentId = questionId;
    // A tree can be miswired into a cycle; auto-advance would spin forever.
    const visited = new Set<string>();

    while (currentId) {
      const question = flow?.questions.find((q) => q.id === currentId);
      if (!question || visited.has(question.id)) break;
      visited.add(question.id);

      const prior = ans[question.key];
      const priorOption = prior
        ? question.options.find((o) => o.value === prior)
        : undefined;

      // Nothing collected for this key yet — ask it.
      if (!priorOption) {
        setConfig(config);
        setState({ kind: "question", question });
        return;
      }

      const result = evaluate(priorOption, config, ans);
      config = result.config;
      if (result.kind === "continue") {
        currentId = result.nextQuestionId;
        continue;
      }
      setConfig(config);
      setState(result.state);
      return;
    }

    // Ran out of questions, or hit a cycle — fail safe to a price rather than
    // a dead end.
    setConfig(config);
    const anchor = isAddOn ? flow?.whileWeThereBasePrice : flow?.basePrice;
    const priced = customerPrice(config, anchor ?? null);
    setState({ kind: "resolved", priceCents: priced.totalCents ?? 0, disclaimer: null });
  }

  async function handleAnswer(question: QuestionDTO, option: AnswerOptionDTO) {
    pushHistory();
    const newAnswers = { ...answers, [question.key]: option.value };
    setAnswers(newAnswers);

    const result = evaluate(option, config ?? startDisplayConfiguration(flow!), newAnswers);

    if (result.kind === "continue") {
      // Skip straight past anything already answered.
      advanceFrom(result.nextQuestionId, result.config, newAnswers);
      return;
    }

    if (result.state.kind === "troubleshooting") {
      // Fetched on demand rather than up front — most flows never reach it.
      fetch("/api/services/electrical-troubleshooting")
        .then((r) => r.json())
        .then((t: { basePrice?: number }) => setTroubleshootingCents(t?.basePrice ?? null))
        .catch(() => setTroubleshootingCents(null));
    }

    setConfig(result.config);
    setState(result.state);
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
        // Only what the customer chose.
        //
        // computedPriceCents and isPrimary used to be sent from here. The
        // server replays these answers against the current tree and decides
        // both — a browser asserting its own price is a browser deciding what
        // Elite charges.
        answersSnapshot: customerNote.trim()
          ? { ...answers, customer_note: customerNote.trim() }
          : answers,
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
    const anchorPrice = isAddOn ? flow.whileWeThereBasePrice : flow.basePrice;

    const directBook =
      flow.questions.length === 0 &&
      flow.bookingType !== "REMOTE_QUOTE" &&
      anchorPrice !== null;

    return withBack(
      <ServiceIntro
        name={flow.name}
        description={flow.shortDescription}
        basePrice={anchorPrice}
        startingPriceLabel={flow.startingPriceLabel}
        icon={flow.icon}
        serviceSlug={serviceSlug}
        directBook={directBook}
        disclaimer={flow.disclaimer}
        isAddOn={isAddOn}
        standalonePrice={flow.basePrice}
        onContinue={directBook ? () => addToVisit(anchorPrice ?? 0) : startQuestions}
      />
    );
  }

  if (state.kind === "question") {
    return withBack(
      <QuestionStep
        question={state.question}
        answers={answers}
        accessClass={config?.accessClass ?? null}
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
        {state.note && (
          <p className="mx-auto mt-4 max-w-lg rounded-card bg-warmwhite p-4 text-left text-sm text-slate">
            {state.note}
          </p>
        )}
        <p className="mt-2 text-slate">
          Based on your answer, we'd rather diagnose the issue first than have you book the
          wrong repair. Our Electrical Troubleshooting visit
          {troubleshootingCents !== null ? ` is ${formatCents(troubleshootingCents)},` : ""} includes
          the visit and the first 60 minutes of diagnostic time.
        </p>
        <button
          onClick={() => router.push("/services/panels-troubleshooting/electrical-troubleshooting")}
          className="mt-6 rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover"
        >
          {troubleshootingCents !== null
            ? `Book Troubleshooting — ${formatCents(troubleshootingCents)}`
            : "Book Troubleshooting"}
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
        safetyNotes={state.safetyNotes}
        note={customerNote}
        onNoteChange={setCustomerNote}
        onConfirm={(photos) => addToVisit(state.priceCents, photos)}
      />
    );
  }

  if (state.kind === "photo_review") {
    return withBack(
      <PhotoReviewNotice
        labels={state.labels}
        safetyNotes={state.safetyNotes}
        floorPriceCents={state.floorPriceCents}
        note={customerNote}
        onNoteChange={setCustomerNote}
        serviceName={flow.name}
        serviceId={flow.id}
        answers={answers}
      />
    );
  }

  return null;
}
