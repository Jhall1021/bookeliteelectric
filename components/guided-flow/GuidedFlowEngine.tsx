"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AnswerOptionDTO, QuestionDTO, ServiceFlowDTO } from "@/lib/flow-types";
import { formatCents } from "@/lib/flow-types";
import { optionForStoredGuidedFlowAnswer } from "@/lib/guidedFlowStoredAnswer";
import {
  startDisplayConfiguration,
  applyBranch,
  type JobConfiguration,
} from "@/lib/pricing";
import { flowPriceSource } from "@/lib/guidedFlowPricing";
import ServiceIntro from "./ServiceIntro";
import QuestionStep from "./QuestionStep";
import PriceConfirmationCard from "./PriceConfirmationCard";
import EstimateRangeCard from "./EstimateRangeCard";
import { estimateRange } from "@/lib/timeAndMaterials";
import RerouteNotice, { REROUTE_HANDOFF_KEY } from "./RerouteNotice";
import PhotoReviewNotice from "./PhotoReviewNotice";
import PricedPhotoReview from "./PricedPhotoReview";
import { advanceQueue, queuedServiceHref } from "@/lib/multiServiceQueue";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import RouteAssistQuestionAssist from "@/components/route-assist/RouteAssistQuestionAssist";

type Props = {
  serviceSlug: string;
};

type TerminalState =
  | { kind: "intro" }
  | { kind: "question"; question: QuestionDTO }
  | { kind: "resolved"; priceCents: number; disclaimer: string | null; addedCrewHours: number }
  | { kind: "reroute"; serviceId: string; reason: string }
  | { kind: "troubleshooting"; note?: string | null }
  | {
      kind: "photo_review";
      labels: string[];
      safetyNotes?: string[];
      floorPriceCents?: number | null;
      /** True when the route couldn't be completed, so booking must wait. */
      blocking?: boolean;
      /** Shown instead of the usual review copy when something went wrong. */
      message?: string;
    }
  // Price already settled; the photos are prep for the technician, not a
  // condition of booking. Driven by AnswerOption.photosBlockBooking = false.
  | { kind: "priced_photo_review"; labels: string[]; safetyNotes?: string[]; priceCents: number; disclaimer: string | null }
  // DERIVED_RESOLVED_SCOPE only: the tree reached a terminal answer and the
  // SERVER is now asked for the price (lib/guidedFlowPricing.ts). `then` is
  // what a PRICED answer becomes; the answers asked about travel with it.
  | {
      kind: "server_pricing";
      answers: Record<string, string>;
      then: { kind: "resolved"; disclaimer: string | null }
        | { kind: "priced_photo_review"; labels: string[]; safetyNotes?: string[]; disclaimer: string | null };
    };

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
  // Storefront navigation carries the site slug. These were root paths,
  // working only because the legacy Elite redirects catch them.
  const base = useStorefrontBase();
  // ADR §2.2 — customer-facing calls carry the storefront identifier.
  const siteFetch = useSiteFetch();
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
  // rate — contradicting the promise made on the homepage and honored
  // correctly by /my-visit.
  const [isAddOn, setIsAddOn] = useState(false);
  // The troubleshooting reroute screen used to hardcode $249 in both the body
  // copy and the button, while the service record said $250 — so a customer
  // sent there from a failed outlet swap was quoted one number and charged
  // another. Read it from the service instead; the hardcode was the bug, not
  // the specific figure.
  /**
   * The contractor's diagnostic service, resolved by the server.
   *
   * Was a bare price fetched from a hard-coded Elite slug, with the button's
   * URL hard-coded separately. Both are now the one thing the server resolved
   * by ROLE, so the destination shown here is the destination /api/visit would
   * send the customer to. `null` means the lookup has not answered yet or
   * refused — the button fails closed rather than guessing a URL.
   */
  const [troubleshooting, setTroubleshooting] = useState<{
    /** Relative to the storefront root. Built by the server, not from parts. */
    path: string;
    basePrice: number | null;
  } | null>(null);
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
  // Server-side mirror of `answers` — docs/design/guided-flow-session-v1.md.
  // Null until the create-or-resume call returns; nothing before that point
  // blocks the existing flow, so a failure here degrades to "answers aren't
  // saved across a reload," never to a broken booking. `version` is the
  // optimistic-concurrency token every write must present back.
  const [guidedFlowSession, setGuidedFlowSession] = useState<{ id: string; version: number } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      siteFetch(`/api/services/${serviceSlug}`).then((r) => r.json()),
      siteFetch("/api/visit")
        .then((r) => r.json())
        .catch(() => ({ lineItems: [] })),
      siteFetch("/api/guided-flow-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceSlug }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([data, visit, session]: [ServiceFlowDTO, { lineItems?: unknown[] }, { id: string; version: number; consumedAnswers?: Record<string, string> } | null]) => {
      const addOn = (visit?.lineItems?.length ?? 0) > 0 && data.whileWeThereBasePrice !== null;
      setFlow(data);
      setIsAddOn(addOn);
      setConfig(startDisplayConfiguration(data));
      setState({ kind: "intro" });
      setHistory([]);
      setGuidedFlowSession(session ? { id: session.id, version: session.version } : null);
      let carried: Record<string, string> = {};
      try {
        const raw = sessionStorage.getItem(REROUTE_HANDOFF_KEY);
        if (raw) {
          sessionStorage.removeItem(REROUTE_HANDOFF_KEY);
          const payload = JSON.parse(raw);
          if (payload?.targetServiceId === data.id && payload.answers) {
            const keys = new Set(data.questions.map((q: QuestionDTO) => q.key));
            carried = Object.fromEntries(
              Object.entries(payload.answers as Record<string, string>).filter(([k]) =>
                keys.has(k)
              )
            );
          }
        }
      } catch {
        // Storage unavailable. The customer answers again — not ideal, not broken.
      }
      const hasCarried = Object.keys(carried).length > 0;
      setAnswers(hasCarried ? carried : (session?.consumedAnswers ?? {}));
      setLoading(false);
    });
  }, [serviceSlug]);

  function persistAnswers(newAnswers: Record<string, string>) {
    if (!guidedFlowSession) return;
    siteFetch(`/api/guided-flow-sessions/${guidedFlowSession.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedVersion: guidedFlowSession.version, consumedAnswers: newAnswers }),
    })
      .then((r) => r.json())
      .then((body) => {
        if (typeof body?.version === "number") {
          setGuidedFlowSession({ id: guidedFlowSession.id, version: body.version });
        }
      })
      .catch(() => {});
  }

  function pushHistory() {
    if (!state) return;
    setHistory((h) => [...h, { state, config, answers }]);
  }

  function goBack() {
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
      setState({
        kind: "photo_review",
        labels: ["Photo of the area where the work is needed", "Your electrical panel, door open if possible"],
      });
    } else {
      setState({
        kind: "resolved",
        addedCrewHours: 0,
        priceCents: (isAddOn ? flow.whileWeThereBasePrice : flow.basePrice) ?? 0,
        disclaimer: flow.disclaimer,
      });
    }
  }

  function evaluate(
    option: AnswerOptionDTO,
    cfg: JobConfiguration,
    ans: Record<string, string>
  ):
    | { kind: "continue"; config: JobConfiguration; nextQuestionId: string | null }
    | { kind: "terminal"; config: JobConfiguration; state: TerminalState } {
    const nextConfig = applyBranch(cfg, option, ans);
    const anchor = isAddOn ? flow!.whileWeThereBasePrice : flow!.basePrice;
    const priceSource = flowPriceSource(flow!.pricingMethod, nextConfig, anchor ?? null);
    const serverPriced = priceSource.source === "SERVER";
    const total = priceSource.source === "PUBLISHED" ? priceSource.totalCents
      : priceSource.source === "PUBLISHED_REVIEW" ? priceSource.floorCents : 0;
    const serverPricing = (then: Extract<TerminalState, { kind: "server_pricing" }>["then"]): TerminalState =>
      ({ kind: "server_pricing", answers: ans, then });

    const fallbackPhotos = [
      "Photo of the area where the work is needed",
      "Your electrical panel, door open — leave the panel cover on",
    ];

    if (priceSource.source === "PUBLISHED_REVIEW") {
      return {
        kind: "terminal",
        config: nextConfig,
        state: {
          kind: "photo_review",
          labels: option.requiredPhotoLabels.length > 0 ? option.requiredPhotoLabels : fallbackPhotos,
          safetyNotes: option.photoSafetyNotes,
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
          state: serverPriced
            ? serverPricing({ kind: "resolved", disclaimer: option.disclaimer })
            : { kind: "resolved", priceCents: total, disclaimer: option.disclaimer,
                addedCrewHours: nextConfig.addedCrewHours },
        };
      case "REROUTE_TROUBLESHOOTING":
        return {
          kind: "terminal",
          config: nextConfig,
          state: { kind: "troubleshooting", note: option.disclaimer },
        };
      case "PHOTO_REVIEW":
        if (!option.photosBlockBooking) {
          if (serverPriced) {
            return {
              kind: "terminal",
              config: nextConfig,
              state: serverPricing({ kind: "priced_photo_review", labels: option.requiredPhotoLabels,
                                     safetyNotes: option.photoSafetyNotes, disclaimer: option.disclaimer }),
            };
          }
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
            floorPriceCents: serverPriced ? null : total,
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
            floorPriceCents: serverPriced ? null : total,
          },
        };
      case "REROUTE_SERVICE":
        if (!option.rerouteServiceId) {
          return {
            kind: "terminal",
            config: nextConfig,
            state: {
              kind: "photo_review",
              blocking: true,
              message: "We need to look at this one before we can price it.",
              labels: option.requiredPhotoLabels,
              safetyNotes: option.photoSafetyNotes,
            },
          };
        }
        return {
          kind: "terminal",
          config: nextConfig,
          state: { kind: "reroute", serviceId: option.rerouteServiceId, reason: option.label },
        };
      default:
        return {
          kind: "terminal",
          config: nextConfig,
          state: serverPriced
            ? serverPricing({ kind: "resolved", disclaimer: null })
            : { kind: "resolved", priceCents: total, disclaimer: null,
                addedCrewHours: nextConfig.addedCrewHours },
        };
    }
  }

  /**
   * Walk forward from a question, auto-answering any whose key the customer
   * has already answered (handoff §29).
   *
   * Ordinary questions replay by exact option value. NUMBER questions replay
   * through the same numeric selector used for fresh input and server routing,
   * because the stored answer is the customer's number (for example 14.625),
   * not the authored sentinel/range option value.
   */
  function advanceFrom(
    questionId: string | null,
    cfg: JobConfiguration,
    ans: Record<string, string>
  ) {
    let config = cfg;
    let currentId = questionId;
    const visited = new Set<string>();

    while (currentId) {
      const question = flow?.questions.find((q) => q.id === currentId);
      if (!question || visited.has(question.id)) break;
      visited.add(question.id);

      const prior = ans[question.key];
      const priorOption = optionForStoredGuidedFlowAnswer(question, prior) ?? undefined;

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

    console.error(
      `[flow] ${flow?.slug}: route did not terminate — ` +
        `${visited.size} question(s) walked from ${questionId}. Sending to review.`
    );
    setConfig(config);
    setState({
      kind: "photo_review",
      labels: [
        "The area where the work is needed",
        "A wider photo of the room",
      ],
      safetyNotes: [],
      floorPriceCents: null,
      blocking: true,
      message: "We need to take a quick look at this one before confirming the price.",
    });
  }

  async function handleAnswer(question: QuestionDTO, option: AnswerOptionDTO) {
    pushHistory();
    const newAnswers = { ...answers, [question.key]: option.value };
    setAnswers(newAnswers);
    persistAnswers(newAnswers);

    const result = evaluate(option, config ?? startDisplayConfiguration(flow!), newAnswers);

    if (result.kind === "continue") {
      advanceFrom(result.nextQuestionId, result.config, newAnswers);
      return;
    }

    if (result.state.kind === "troubleshooting" && flow) {
      siteFetch(`/api/troubleshooting?serviceId=${encodeURIComponent(flow.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((t) =>
          setTroubleshooting(
            t && typeof t.path === "string"
              ? { path: t.path, basePrice: t.basePrice ?? null }
              : null
          )
        )
        .catch(() => setTroubleshooting(null));
    }

    setConfig(result.config);
    setState(result.state);
  }

  async function addToVisit(
    priceCents: number,
    photos?: { url: string; label: string }[]
  ) {
    if (!flow) return;
    const res = await siteFetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: flow.id,
        answersSnapshot: customerNote.trim()
          ? { ...answers, customer_note: customerNote.trim() }
          : answers,
        ...(photos && photos.length > 0 ? { photos } : {}),
      }),
    });
    if (!res.ok) {
      if (flow.pricingMethod === "DERIVED_RESOLVED_SCOPE" && res.status === 409) {
        const body = await res.json().catch(() => null);
        if (body?.error === "REVIEW_REQUIRED") {
          setState({ kind: "photo_review", blocking: true, floorPriceCents: null,
                     message: "We need to take a quick look at this one before confirming the price.",
                     labels: Array.isArray(body.photoLabels) && body.photoLabels.length > 0 ? body.photoLabels
                       : ["Photo of the area where the work is needed", "A wider photo of the room"] });
          return;
        }
      }
      throw new Error("Could not add this to your visit");
    }

    if (guidedFlowSession) {
      const lineItemId = await res
        .clone()
        .json()
        .then((b) => (typeof b?.lineItemId === "string" ? b.lineItemId : null))
        .catch(() => null);
      siteFetch(`/api/guided-flow-sessions/${guidedFlowSession.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expectedVersion: guidedFlowSession.version, lineItemId }),
      }).catch(() => {});
    }

    const next = advanceQueue(serviceSlug);
    router.push(next ? queuedServiceHref(next, base) : `${base}/my-visit`);
  }

  async function handleAddToVisit() {
    if (!flow || state?.kind !== "resolved") return;
    await addToVisit(state.priceCents);
  }

  useEffect(() => {
    if (!flow || state?.kind !== "server_pricing") return;
    const pending = state;
    let cancelled = false;
    const toReview = (message: string, labels: string[] = []) =>
      setState({ kind: "photo_review", blocking: true, message, floorPriceCents: null,
                 labels: labels.length > 0 ? labels : ["Photo of the area where the work is needed", "A wider photo of the room"] });
    siteFetch("/api/price-evaluation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceId: flow.id, answers: pending.answers }),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((ev) => {
        if (cancelled) return;
        if (ev?.outcome === "PRICED" && typeof ev.priceCents === "number") {
          if (pending.then.kind === "priced_photo_review") {
            setState({ kind: "priced_photo_review", labels: pending.then.labels, safetyNotes: pending.then.safetyNotes,
                       priceCents: ev.priceCents, disclaimer: pending.then.disclaimer });
          } else {
            setState({ kind: "resolved", priceCents: ev.priceCents, disclaimer: pending.then.disclaimer, addedCrewHours: 0 });
          }
        } else if (ev?.outcome === "REROUTE" && typeof ev.targetServiceId === "string") {
          setState({ kind: "reroute", serviceId: ev.targetServiceId, reason: "" });
        } else {
          toReview(typeof ev?.message === "string" ? ev.message : "We need to take a quick look at this one before confirming the price.",
                   Array.isArray(ev?.photoLabels) ? ev.photoLabels : []);
        }
      })
      .catch(() => { if (!cancelled) toReview("We need to take a quick look at this one before confirming the price."); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, flow]);

  if (loading || !flow || !state) {
    return <div className="py-16 text-center text-slate">Loading...</div>;
  }

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
    const anchorPrice = isAddOn ? flow.whileWeThereBasePrice : flow.basePrice;

    const directBook =
      flow.questions.length === 0 &&
      flow.bookingType !== "REMOTE_QUOTE" &&
      anchorPrice !== null;

    const mayNotQualify = flow.questions.some((q) =>
      q.options.some(
        (o) =>
          o.routeAction === "REMOTE_QUOTE" ||
          o.routeAction === "REROUTE_SERVICE" ||
          o.routeAction === "REROUTE_TROUBLESHOOTING" ||
          (o.routeAction === "PHOTO_REVIEW" && o.photosBlockBooking)
      )
    );

    return withBack(
      <ServiceIntro
        name={flow.name}
        description={flow.shortDescription}
        basePrice={anchorPrice}
        startingPriceLabel={flow.startingPriceLabel}
        ctaLabel={flow.ctaLabel}
        icon={flow.icon}
        serviceSlug={serviceSlug}
        directBook={directBook}
        mayNotQualify={mayNotQualify}
        disclaimer={flow.disclaimer}
        isAddOn={isAddOn}
        standalonePrice={flow.basePrice}
        onContinue={directBook ? () => addToVisit(anchorPrice ?? 0) : startQuestions}
      />
    );
  }

  if (state.kind === "question") {
    return withBack(
      <>
        <QuestionStep
          question={state.question}
          answers={answers}
          accessBySlot={config?.accessBySlot ?? {}}
          onAnswer={(option) => handleAnswer(state.question, option)}
        />
        <RouteAssistQuestionAssist
          serviceSlug={serviceSlug}
          question={state.question}
          guidedFlowSessionId={guidedFlowSession?.id ?? null}
          currentAnswer={answers[state.question.key]}
          onResolved={(option) => handleAnswer(state.question, option)}
        />
      </>
    );
  }

  if (state.kind === "resolved") {
    if (flow.timeAndMaterials) {
      const estimate = estimateRange(
        {
          estimateLowCrewHours: flow.timeAndMaterials.estimateLowCrewHours,
          estimateHighCrewHours: flow.timeAndMaterials.estimateHighCrewHours,
          estimateApproved: flow.timeAndMaterials.estimateApproved,
          addedCrewHours: state.addedCrewHours,
          materialCostCents: null,
        },
        { crewHourRateCents: flow.timeAndMaterials.crewHourRateCents,
          primaryMinimumCents: 0, roundingIncrementCents: 0, defaultPermitAdminCents: 0 },
      );
      return withBack(
        <EstimateRangeCard serviceName={flow.name} estimate={estimate} disclaimer={state.disclaimer} />
      );
    }
    return withBack(
      <PriceConfirmationCard
        serviceName={flow.name}
        ctaLabel={flow.ctaLabel}
        priceCents={state.priceCents}
        disclaimer={state.disclaimer}
        onAddToVisit={handleAddToVisit}
      />
    );
  }

  if (state.kind === "server_pricing") {
    return withBack(
      <div role="status" aria-live="polite" className="rounded-card border border-cardline bg-white p-8 text-center shadow-card">
        <p className="font-display text-lg font-semibold text-navy">Checking whether we can price this online…</p>
      </div>
    );
  }

  if (state.kind === "reroute") {
    return withBack(
      <RerouteNotice
        serviceId={state.serviceId}
        reason={state.reason}
        answers={answers}
      />
    );
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
          wrong repair. Our diagnostic visit
          {troubleshooting?.basePrice != null ? ` is ${formatCents(troubleshooting.basePrice)},` : ""} includes
          the visit and the first 60 minutes of diagnostic time.
        </p>
        {troubleshooting ? (
          <button
            onClick={() => router.push(`${base}/${troubleshooting.path}`)}
            className="mt-6 rounded-pill bg-electric px-7 py-3 font-semibold text-white hover:bg-electric-hover"
          >
            {troubleshooting.basePrice != null
              ? `Book Troubleshooting — ${formatCents(troubleshooting.basePrice)}`
              : "Book Troubleshooting"}
          </button>
        ) : (
          <p className="mt-6 text-sm text-slate">
            Give us a call and we'll get a diagnostic visit on the books.
          </p>
        )}
      </div>
    );
  }

  if (state.kind === "priced_photo_review") {
    return withBack(
      <PricedPhotoReview
        serviceName={flow.name}
        ctaLabel={flow.ctaLabel}
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
