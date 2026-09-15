"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { AnswerOptionDTO, QuestionDTO, ServiceFlowDTO } from "@/lib/flow-types";
import { formatCents } from "@/lib/flow-types";
import {
  startDisplayConfiguration,
  applyBranch,
  customerPrice,
  resolveReferencedServicePriceCents,
  type JobConfiguration,
} from "@/lib/pricing";
import ServiceIntro from "./ServiceIntro";
import QuestionStep from "./QuestionStep";
import PriceConfirmationCard from "./PriceConfirmationCard";
import EstimateRangeCard from "./EstimateRangeCard";
import { estimateRange } from "@/lib/timeAndMaterials";
import RerouteNotice from "./RerouteNotice";
import PhotoReviewNotice from "./PhotoReviewNotice";
import PricedPhotoReview from "./PricedPhotoReview";
import { advanceQueue, queuedServiceHref } from "@/lib/multiServiceQueue";
import { useSiteFetch, useStorefrontBase } from "@/components/site/SiteContext";
import RouteAssistQuestionAssist from "@/components/route-assist/RouteAssistQuestionAssist";
import {
  REROUTE_HANDOFF_KEY,
  serializeHandoff,
  consumeHandoffForTarget,
  buildTroubleshootingNote,
} from "@/lib/rerouteHandoff";

type Props = {
  serviceSlug: string;
};

type TerminalState =
  | { kind: "intro" }
  | { kind: "question"; question: QuestionDTO }
  | { kind: "resolved"; priceCents: number; disclaimer: string | null; addedCrewHours: number }
  | { kind: "reroute"; serviceId: string; reason: string }
  | {
      kind: "troubleshooting";
      /** What the customer told THIS service, in their own words — always
       *  available, unlike the answer's own disclaimer. */
      originServiceName: string;
      answerLabel: string;
      /** The answer's own disclaimer, when the seed author wrote one. Shown
       *  ALONGSIDE answerLabel, never instead of it — B.5. */
      note?: string | null;
    }
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
    id: string;
    /** Relative to the storefront root. Built by the server, not from parts. */
    path: string;
    basePrice: number | null;
    /** The contractor's own configured terms — never a duration or figure
     *  this component invents. See lib/troubleshooting.ts. */
    disclaimer: string | null;
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
      // Tolerate a failure here rather than blocking the whole flow — worst
      // case the customer is treated as a first-time booker, which is the
      // old behavior, not a broken page.
      siteFetch("/api/visit")
        .then((r) => r.json())
        .catch(() => ({ lineItems: [] })),
      // Same tolerance: a session that can't be created/resumed just means
      // this visit isn't persisted mid-flow, not that the customer can't
      // book. Never awaited by anything that would block the page.
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
      // Answers carried over from a reroute, if this is where one landed.
      //
      // Consumed once and cleared immediately: the payload is tagged with
      // the service it was meant for, so a stale one from earlier in the
      // session can't leak into an unrelated flow. Reuse is right for the
      // reroute that created it and wrong for anything else.
      // Parsing/filtering is a pure function (lib/rerouteHandoff.ts, tested
      // DB-free and DOM-free in scripts/verify-reroute-handoff.ts) — this is
      // just the browser-API plumbing around it: read, clear (single-use,
      // per the module docstring), hand the raw value to the pure function.
      let carried: Record<string, string> = {};
      let carriedNote = "";
      try {
        const raw = sessionStorage.getItem(REROUTE_HANDOFF_KEY);
        sessionStorage.removeItem(REROUTE_HANDOFF_KEY);
        const consumed = consumeHandoffForTarget(
          raw,
          data.id,
          data.questions.map((q: QuestionDTO) => q.key)
        );
        carried = consumed.answers;
        carriedNote = consumed.customerNote;
      } catch {
        // Storage unavailable. The customer answers again — not ideal, not
        // broken.
      }
      // Reroute-carry wins when both exist: it's the more specific, more
      // recent intent ("this is what the customer just told the OTHER
      // service"), and it's already scoped to keys this tree asks about.
      // The resumed session fills in only when there's no reroute payload —
      // same precedence a fresh visitor implicitly has today (reroute over
      // nothing), just extended by one more fallback.
      const hasCarried = Object.keys(carried).length > 0;
      setAnswers(hasCarried ? carried : (session?.consumedAnswers ?? {}));
      if (carriedNote) setCustomerNote(carriedNote);
      setLoading(false);
    });
  }, [serviceSlug]);

  // Fire-and-forget mirror of `answers` to the server. Never blocks the UI
  // and never retried on failure — the NEXT answer's write carries the
  // latest state anyway, so a single dropped request just means one fewer
  // point a second device could have resumed from, not lost data. A 409
  // (another device already moved the session forward) is read back so this
  // tab's local version catches up; it does not overwrite what the other
  // device wrote, matching docs/design/guided-flow-session-v1.md §5 — this
  // is the CLIENT side of that same rule, not a second implementation of it.
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
      .catch(() => {
        // Network failure — the next answer tries again with the same
        // (now further-behind) expectedVersion and will itself 409 if
        // something else moved the session on. Never surfaced to the
        // customer; booking doesn't depend on this succeeding.
      });
  }

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
    // The full prior configuration, not just the two fields above. Without
    // this, `config` keeps whatever the abandoned branch folded into it —
    // re-answering the question this Back returned to then folds the NEW
    // answer onto that stale base instead of the one this step actually had,
    // and a component/price the customer just undid survives on a display
    // that was never rebuilt to drop it.
    setConfig(previous.config);
    setHistory(history.slice(0, -1));
    // Mirror the trimmed answers to the session the same way every forward
    // answer already does (persistAnswers, same expectedVersion contract) —
    // otherwise the server's `consumedAnswers` still holds the abandoned
    // branch's keys, and a reload before the customer finishes re-answering
    // resumes from that stale, larger set instead of the trimmed one just
    // shown here.
    persistAnswers(previous.answers);
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
        // A service with no tree adds nothing: the baseline band is the estimate.
        addedCrewHours: 0,
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
    // A referenced-service answer carries its primary AND add-on price
    // separately (lib/flow-types.ts) precisely because `isAddOn` — decided
    // here, from this visit's own state — determines which one applies.
    // Passing `option` straight to applyBranch would silently use whichever
    // shape happened to be on the DTO regardless of that; this resolves the
    // one that matches, the same way the anchor price two lines down does.
    const nextConfig = applyBranch(
      cfg,
      { ...option, referencedServicePriceCents: resolveReferencedServicePriceCents(option, isAddOn) },
      ans
    );

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
          state: { kind: "resolved", priceCents: total, disclaimer: option.disclaimer,
                   addedCrewHours: nextConfig.addedCrewHours },
        };
      case "REROUTE_TROUBLESHOOTING":
        // originServiceName + answerLabel are ALWAYS available and carry the
        // one piece of context that matters ("what did the customer say"),
        // independent of whether this specific answer has its own authored
        // disclaimer — B.4/B.5. option.disclaimer, when present, is
        // additional framing on top, not a substitute for it.
        return {
          kind: "terminal",
          config: nextConfig,
          state: {
            kind: "troubleshooting",
            originServiceName: flow!.name,
            answerLabel: option.label,
            note: option.disclaimer,
          },
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
        // A reroute with no target used to fall through to a PRICED job at the
        // running total — the customer booked and paid for a service the tree
        // had just decided they were not buying. The server calls that INVALID,
        // so the storefront was the lenient one. Uncertain scope is a review,
        // and our own missing data is uncertain scope.
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
          state: { kind: "resolved", priceCents: total, disclaimer: null,
                   addedCrewHours: nextConfig.addedCrewHours },
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

    // Ran out of questions, or hit a cycle.
    //
    // This used to resolve to a price — "fail safe to a price rather than a
    // dead end" — on the reasoning that a customer should always get an
    // answer. That was wrong twice over: the server would reject the line
    // anyway, so the price was a lie the customer saw first; and the
    // `?? 0` meant a failed calculation could show them $0.
    //
    // A review IS an answer. It's just not a number.
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
      // Skip straight past anything already answered.
      advanceFrom(result.nextQuestionId, result.config, newAnswers);
      return;
    }

    if (result.state.kind === "troubleshooting" && flow) {
      // Fetched on demand rather than up front — most flows never reach it.
      //
      // Sends WHICH SERVICE is asking, not which trade it is — G2. The server
      // reads that service's own tradeKey and scopes the lookup with it. The
      // page identifies itself; it does not get to say what it means.
      siteFetch(`/api/troubleshooting?serviceId=${encodeURIComponent(flow.id)}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((t) =>
          setTroubleshooting(
            t && typeof t.id === "string" && typeof t.path === "string"
              ? { id: t.id, path: t.path, basePrice: t.basePrice ?? null, disclaimer: t.disclaimer ?? null }
              : null
          )
        )
        .catch(() => setTroubleshooting(null));
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
    const res = await siteFetch("/api/visit", {
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
    // empty visit page with no idea their photos went nowhere. The queue is
    // untouched too, so a retry resumes rather than skipping a service.
    if (!res.ok) throw new Error("Could not add this to your visit");

    // Mark the session COMPLETED only now — after the write it describes
    // has actually succeeded, never before (docs/design/
    // guided-flow-session-v1.md's completeSession doc comment). Best
    // effort: a failure here means bookkeeping alone is stale, not that
    // the booking itself is in doubt — the LineItem the response names is
    // the real record either way.
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

    // If the service finder found more than one job in what the customer
    // typed, the rest are waiting. Go to the next one instead of the visit
    // page — being handed back a cart and asked to remember the second thing
    // is how the second thing doesn't get booked.
    //
    // advanceQueue returns null for the ordinary single-service case, and
    // also when this service isn't part of a run, so nothing changes for
    // anyone who arrived here any other way.
    const next = advanceQueue(serviceSlug);
    // BOTH destinations carry the storefront. "/my-visit" unscoped sent a
    // homeowner who had just added a $215 fixture on one contractor's site to
    // a different contractor's empty cart.
    router.push(next ? queuedServiceHref(next, base) : `${base}/my-visit`);
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

    // Can a homeowner answer honestly and still NOT get a price here?
    //
    // Read off the tree rather than the service, so it stays true for whatever
    // a contractor builds. A blocking photo review, a remote quote or a
    // hand-off all end somewhere other than a number on this service — and a
    // screen that promised "you'll see your exact price" would be lying on
    // exactly those routes.
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
          isAddOn={isAddOn}
          onAnswer={(option) => handleAnswer(state.question, option)}
        />
        <RouteAssistQuestionAssist
          serviceSlug={serviceSlug}
          question={state.question}
          guidedFlowSessionId={guidedFlowSession?.id ?? null}
          onResolved={(option) => handleAnswer(state.question, option)}
        />
      </>
    );
  }

  if (state.kind === "resolved") {
    // ADR-018 — the same resolved scope, read the other way. The band comes
    // from the contractor's approved calibration and the increment from the
    // components this route actually selected; nothing here is representative
    // or illustrative.
    if (flow.timeAndMaterials) {
      const estimate = estimateRange(
        {
          estimateLowCrewHours: flow.timeAndMaterials.estimateLowCrewHours,
          estimateHighCrewHours: flow.timeAndMaterials.estimateHighCrewHours,
          estimateApproved: flow.timeAndMaterials.estimateApproved,
          addedCrewHours: state.addedCrewHours,
          // Labor only in V1; materials are disclosed as additional rather
          // than quoted at a figure the markup rule cannot produce per part.
          materialCostCents: null,
        },
        { crewHourRateCents: flow.timeAndMaterials.crewHourRateCents,
          primaryMinimumCents: 0, roundingIncrementCents: 0, defaultPermitAdminCents: 0 },
      );
      return withBack(
        <EstimateRangeCard serviceName={flow.name} estimate={estimate} disclaimer={state.disclaimer} />
      );
    }
    // The diagnostic service has no questions of its own, so this is the
    // ONLY screen a homeowner sees before booking it — direct entry and a
    // troubleshooting reroute both land here. When a reroute pre-filled
    // customerNote (B.4), show it as an editable field so the homeowner can
    // see what will reach the technician and correct it, rather than
    // silently sending it.
    //
    // Offered on EVERY resolved service, not special-cased by slug — an
    // earlier version of this gated the note on
    // `flow.slug === "soundbar-installation"` (B.18), which
    // scripts/verify-theme-structure.ts correctly rejects: no customer-
    // facing component may branch on a specific contractor's specific
    // service identity, full stop, the same rule B.3's hardcoded
    // troubleshooting slug violated. `bookingType` is a structural,
    // platform-level field (the same kind of check TROUBLESHOOT_ONLY
    // already makes throughout this codebase), not an identity check, so
    // varying only the LABEL by booking type is fine; the field itself is
    // universal.
    //
    // Soundbar (B.18) still gets its job-prep facts (cable type/possession,
    // wall concealment — real information, just never a pricing decision)
    // through this same generic field, worded generically; so does every
    // other resolved service, for free, which is a small net UX
    // improvement rather than a workaround.
    return withBack(
      <PriceConfirmationCard
        serviceName={flow.name}
        ctaLabel={flow.ctaLabel}
        priceCents={state.priceCents}
        disclaimer={state.disclaimer}
        onAddToVisit={handleAddToVisit}
        note={customerNote}
        onNoteChange={setCustomerNote}
        noteLabel={
          flow.bookingType === "TROUBLESHOOT_ONLY"
            ? "What should we tell the technician?"
            : "Anything the technician should know before the visit? (optional)"
        }
      />
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
    // B.4: what will reach the technician, in the same words the destination
    // flow will pre-fill into its own editable note. Built here, once, from
    // context that's always available — not gated on this specific answer
    // having its own authored disclaimer (B.5). Pure function, tested
    // DB-free/DOM-free — see lib/rerouteHandoff.ts.
    const intakeNote = buildTroubleshootingNote(state.originServiceName, state.answerLabel, state.note);

    function bookTroubleshooting() {
      if (!troubleshooting) return;
      try {
        sessionStorage.setItem(
          REROUTE_HANDOFF_KEY,
          serializeHandoff({ targetServiceId: troubleshooting!.id, customerNote: intakeNote })
        );
      } catch {
        // Private browsing, or storage full. The customer starts the
        // diagnostic with an empty note instead of a pre-filled one — worth
        // swallowing, not worth blocking the booking over.
      }
      router.push(`${base}/${troubleshooting.path}`);
    }

    return withBack(
      <div className="rounded-card border border-cardline bg-white p-8 text-center shadow-card">
        <h2 className="font-display text-xl font-bold text-navy">
          This sounds like a troubleshooting job
        </h2>
        <p className="mx-auto mt-4 max-w-lg rounded-card bg-warmwhite p-4 text-left text-sm text-slate">
          {intakeNote}
        </p>
        <p className="mt-2 text-slate">
          Based on your answer, we&rsquo;d rather diagnose the issue first than have you book the
          wrong repair.
          {troubleshooting?.basePrice != null
            ? ` Our diagnostic visit is ${formatCents(troubleshooting.basePrice)}.`
            : ""}
        </p>
        {/* The contractor's own configured terms — never a duration this
            component invents (B.5). Same text a direct visitor to the
            diagnostic service sees via its own PriceConfirmationCard. */}
        {troubleshooting?.disclaimer && (
          <p className="mx-auto mt-2 max-w-lg text-left text-xs text-slate">
            {troubleshooting.disclaimer}
          </p>
        )}
        {/*
          No button until the server has said where it goes. A "Book
          Troubleshooting" button built from a guessed URL is worse than no
          button: it looks like the hand-off worked and lands on a 404. The
          same refusal the resolver makes, made visibly.
        */}
        {troubleshooting ? (
          <button
            onClick={bookTroubleshooting}
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
