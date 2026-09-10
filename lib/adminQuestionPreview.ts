import type { PrismaClient } from "@prisma/client";
import { loadServiceForResolution, resolveRoute, loadPricingSettings } from "./routeResolver";

/**
 * Admin-side preview of a service's SAVED question tree — what a customer
 * would actually see, walked with the exact same server-authoritative
 * machinery lib/routeResolver.ts uses at real checkout (app/api/visit),
 * never a second, reimplemented pricing/routing engine.
 *
 * READ-ONLY, DELIBERATELY: `loadServiceForResolution` and `resolveRoute` are
 * both pure reads — nothing here writes a booking, a visit, or any customer
 * or service data. A contractor can click through an entire branching tree
 * and nothing is recorded anywhere.
 *
 * Walking "which question comes next" is a small, new function — but it
 * contains no pricing logic of its own. It only follows CONTINUE/
 * nextQuestionId links, the same structural fact the tree-save route
 * (app/api/admin/services/[serviceId]/tree/route.ts) already validates
 * exists before a save is accepted. The instant a non-CONTINUE answer is
 * reached, this hands off entirely to `resolveRoute` for the real computed
 * outcome — the one thing that must never be duplicated.
 */

// Deliberately NOT derived from `ReturnType<typeof loadServiceForResolution>`
// (a large, Prisma-inferred type with its own circular-inference problems
// when indexed into from another module). This is only what the walk below
// actually reads; the real loaded service is passed to `resolveRoute`
// untouched, unnarrowed, for the actual computation.
type MinimalOption = { value: string; label: string; routeAction: string; nextQuestionId: string | null };
type MinimalQuestion = { id: string; key: string; prompt: string; helpText: string | null; options: MinimalOption[] };

export type PreviewQuestion = {
  id: string;
  /** What the answers map sent back to this endpoint must key this question by. */
  key: string;
  prompt: string;
  helpText: string | null;
  options: { value: string; label: string }[];
};

export type PreviewOutcome =
  | { status: "ASK"; question: PreviewQuestion }
  | {
      status: "PRICED";
      priceCents: number;
      disclaimers: string[];
      photoLabels: string[];
    }
  | {
      status: "REVIEW";
      reason: string;
      floorPriceCents: number | null;
      photoLabels: string[];
    }
  | {
      status: "REROUTE";
      via: "SERVICE" | "TROUBLESHOOTING";
      targetServiceId: string | null;
      targetServiceName: string;
      /** Set when a TROUBLESHOOTING reroute has no resolvable destination — the admin sees exactly what a customer's dead end would be, never a raw error. */
      unresolved: boolean;
    }
  | { status: "INVALID"; reason: string };

const MAX_STEPS = 100;

/**
 * Follows CONTINUE/nextQuestionId from the tree's first question, using the
 * given answers (Question.key -> AnswerOption.value), until either an
 * unanswered question is reached (ASK) or a non-CONTINUE answer is reached
 * (terminal — resolved for real by `resolveRoute`, not here).
 */
function walkToNextQuestion(
  questions: MinimalQuestion[],
  answers: Record<string, string>
): { kind: "ask"; question: MinimalQuestion } | { kind: "terminal" } | { kind: "structural"; reason: string } {
  const first = questions[0];
  if (!first) return { kind: "structural", reason: "This service has no questions yet." };

  let current: MinimalQuestion | undefined = first;
  const visited = new Set<string>();

  for (let step = 0; step < MAX_STEPS; step++) {
    if (!current) return { kind: "structural", reason: "Reached a question that no longer exists." };
    if (visited.has(current.id)) return { kind: "structural", reason: "This tree loops back on itself." };
    visited.add(current.id);

    const answeredValue: string | undefined = answers[current.key];
    if (answeredValue === undefined) return { kind: "ask", question: current };

    const chosen: MinimalOption | undefined = current.options.find((o) => o.value === answeredValue);
    if (!chosen) return { kind: "structural", reason: `"${answeredValue}" isn't a real answer to this question any more.` };

    if (chosen.routeAction !== "CONTINUE") return { kind: "terminal" };

    const next: MinimalQuestion | undefined = questions.find((q) => q.id === chosen.nextQuestionId);
    if (!next) return { kind: "structural", reason: "This answer continues to a question that no longer exists." };
    current = next;
  }
  return { kind: "structural", reason: "This tree is too deep to preview safely." };
}

function toPreviewQuestion(q: MinimalQuestion): PreviewQuestion {
  return {
    id: q.id,
    key: q.key,
    prompt: q.prompt,
    helpText: q.helpText,
    options: q.options.map((o) => ({ value: o.value, label: o.label })),
  };
}

/**
 * One preview step: given the answers picked so far, what does a customer
 * see next? `isPrimary` is fixed `true` — a preview always previews the
 * service as the first thing booked, the same assumption the storefront's
 * own primary-flow entry point makes.
 */
export async function previewStep(
  db: PrismaClient,
  serviceId: string,
  answers: Record<string, string>
): Promise<PreviewOutcome> {
  const service = await loadServiceForResolution(db, serviceId);
  if (!service) return { status: "INVALID", reason: "Service not found." };

  const walked = walkToNextQuestion(service.questions, answers);
  if (walked.kind === "ask") return { status: "ASK", question: toPreviewQuestion(walked.question) };
  if (walked.kind === "structural") return { status: "INVALID", reason: walked.reason };

  const settings = await loadPricingSettings(db, service.contractorId!);
  const resolved = resolveRoute(service, answers, true, settings);

  switch (resolved.status) {
    case "PRICED":
      return {
        status: "PRICED",
        priceCents: resolved.priceCents,
        disclaimers: resolved.disclaimers,
        photoLabels: resolved.photoLabels,
      };
    case "REVIEW":
      return {
        status: "REVIEW",
        reason: resolved.reason,
        floorPriceCents: resolved.floorPriceCents,
        photoLabels: resolved.photoLabels,
      };
    case "REROUTE": {
      if (resolved.via === "TROUBLESHOOTING") {
        return {
          status: "REROUTE",
          via: "TROUBLESHOOTING",
          targetServiceId: service.troubleshootingServiceId,
          targetServiceName: service.troubleshootingServiceId
            ? "your Troubleshooting service"
            : "Troubleshooting — not resolvable",
          unresolved: !service.troubleshootingServiceId,
        };
      }
      const target = await db.service.findUnique({
        where: { id: resolved.targetServiceId },
        select: { name: true },
      });
      return {
        status: "REROUTE",
        via: "SERVICE",
        targetServiceId: resolved.targetServiceId,
        targetServiceName: target?.name ?? "a service that no longer exists",
        unresolved: !target,
      };
    }
    case "INVALID":
      return { status: "INVALID", reason: resolved.reason };
  }
}
