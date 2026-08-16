"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { AnswerOptionDTO, QuestionDTO, ServiceFlowDTO } from "@/lib/flow-types";
import { formatCents } from "@/lib/flow-types";
import ServiceIntro from "./ServiceIntro";
import QuestionStep from "./QuestionStep";
import PriceConfirmationCard from "./PriceConfirmationCard";
import RerouteNotice from "./RerouteNotice";
import PhotoReviewNotice from "./PhotoReviewNotice";

type Props = {
  serviceSlug: string;
};

type TerminalState =
  | { kind: "intro" }
  | { kind: "question"; question: QuestionDTO }
  | { kind: "resolved"; priceCents: number }
  | { kind: "reroute"; serviceId: string; reason: string }
  | { kind: "troubleshooting" }
  | { kind: "photo_review"; labels: string[] };

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

  useEffect(() => {
    setLoading(true);
    fetch(`/api/services/${serviceSlug}`)
      .then((r) => r.json())
      .then((data: ServiceFlowDTO) => {
        setFlow(data);
        setPriceCentsAccrued(data.basePrice ?? 0);
        setState({ kind: "intro" });
        setLoading(false);
      });
  }, [serviceSlug]);

  function startQuestions() {
    if (!flow) return;
    if (flow.questions.length > 0) {
      setState({ kind: "question", question: flow.questions[0] });
    } else {
      // No qualifying questions at all — resolves immediately.
      setState({ kind: "resolved", priceCents: flow.basePrice ?? 0 });
    }
  }

  async function handleAnswer(question: QuestionDTO, option: AnswerOptionDTO) {
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
          setState({ kind: "resolved", priceCents: newTotal });
        }
        break;
      }
      case "RESOLVE_INSTANT":
      case "RESOLVE_ADJUSTED":
        setState({ kind: "resolved", priceCents: newTotal });
        break;
      case "REROUTE_TROUBLESHOOTING":
        setState({ kind: "troubleshooting" });
        break;
      case "REMOTE_QUOTE":
      case "PHOTO_REVIEW":
        setState({ kind: "photo_review", labels: option.requiredPhotoLabels });
        break;
      case "REROUTE_SERVICE":
        if (option.rerouteServiceId) {
          setState({ kind: "reroute", serviceId: option.rerouteServiceId, reason: option.label });
        }
        break;
    }
  }

  async function handleAddToVisit() {
    if (!flow || state?.kind !== "resolved") return;
    await fetch("/api/visit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serviceId: flow.id,
        computedPriceCents: state.priceCents,
        isPrimary: true,
        answersSnapshot: answers,
      }),
    });
    router.push("/my-visit");
  }

  if (loading || !flow || !state) {
    return <div className="py-16 text-center text-slate">Loading...</div>;
  }

  if (state.kind === "intro") {
    return (
      <ServiceIntro
        name={flow.name}
        description={flow.shortDescription}
        basePrice={flow.basePrice}
        startingPriceLabel={flow.startingPriceLabel}
        onContinue={startQuestions}
      />
    );
  }

  if (state.kind === "question") {
    return (
      <QuestionStep
        question={state.question}
        onAnswer={(option) => handleAnswer(state.question, option)}
      />
    );
  }

  if (state.kind === "resolved") {
    return (
      <PriceConfirmationCard
        serviceName={flow.name}
        priceCents={state.priceCents}
        onAddToVisit={handleAddToVisit}
      />
    );
  }

  if (state.kind === "reroute") {
    return <RerouteNotice serviceId={state.serviceId} reason={state.reason} />;
  }

  if (state.kind === "troubleshooting") {
    return (
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

  if (state.kind === "photo_review") {
    return <PhotoReviewNotice labels={state.labels} serviceName={flow.name} />;
  }

  return null;
}
