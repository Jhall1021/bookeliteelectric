/**
 * "Given this contractor, this service and this completed answer set, can we
 * offer a fixed price right now — and if so, what is it?"
 *
 * The storefront's question for a DERIVED_RESOLVED_SCOPE service, whose price
 * the browser must never work out: it has no published base price, and its
 * economics (labor, material packages, markup, approval) live only on the
 * server. The guided flow navigates the question tree itself and asks this once
 * the tree reaches a terminal answer.
 *
 * SIDE-EFFECT FREE. It reads the visitor's open visit if one exists — never
 * creates one — and runs the same read-only plan POST /api/visit runs before
 * it writes (lib/visitLinePlanning.ts). No visit, line item, booking, approval,
 * activation or pricing state is written.
 *
 * STOREFRONT-SAFE. The resolver's verdict carries configuration, fingerprints
 * and refusal codes; only the outcome and the customer's price leave here. A
 * review says the job needs a look, with the tree's own photo labels — never
 * the contractor-facing reason (approval state, economics) behind it.
 */
import type { PrismaClient } from "@prisma/client";
import { loadServiceForResolution } from "./routeResolver";
import { findOpenVisit } from "./openVisit";
import { planNewLine, type ExistingLine } from "./visitLinePlanning";

export type StorefrontPriceEvaluation =
  | { outcome: "PRICED"; priceCents: number }
  | { outcome: "REVIEW"; message: string; photoLabels: string[] }
  | { outcome: "REROUTE"; targetServiceId: string }
  | { outcome: "UNAVAILABLE"; message: string };

export const REVIEW_MESSAGE = "We need to take a quick look at this one before confirming the price.";
const UNAVAILABLE_MESSAGE = "We can't price this online just now. Send us a couple of photos and we'll price it directly.";

export type EvaluationRefusal = { status: 400 | 404; error: string };

export async function evaluateStorefrontPrice(
  guarded: PrismaClient,
  input: { contractorId: string; sessionId: string | null; serviceId: unknown; answers: unknown },
): Promise<{ ok: true; evaluation: StorefrontPriceEvaluation } | { ok: false; refusal: EvaluationRefusal }> {
  if (typeof input.serviceId !== "string" || !input.serviceId) return { ok: false, refusal: { status: 400, error: "Missing serviceId" } };
  if (input.answers === null || typeof input.answers !== "object" || Array.isArray(input.answers)
      || Object.values(input.answers as Record<string, unknown>).some((v) => typeof v !== "string")) {
    return { ok: false, refusal: { status: 400, error: "answers must be an object of strings" } };
  }

  // The guarded client scopes this to the storefront's contractor: another
  // tenant's service id reads as absent, exactly like an unknown one.
  const service = await loadServiceForResolution(guarded, input.serviceId);
  if (!service || !service.active) return { ok: false, refusal: { status: 404, error: "Unknown service" } };
  // Only services the server prices. A published-price service is priced by
  // its published figures, and that path is deliberately untouched.
  if ((service as { pricingMethod?: string }).pricingMethod !== "DERIVED_RESOLVED_SCOPE") {
    return { ok: false, refusal: { status: 400, error: "NOT_SERVER_PRICED" } };
  }

  const visit = await findOpenVisit(guarded, input.contractorId, input.sessionId);
  const existing: ExistingLine[] = visit
    ? await guarded.lineItem.findMany({
        where: { visitId: visit.id },
        select: {
          id: true, serviceId: true, isPrimary: true, answersSnapshot: true,
          service: { select: { slug: true, basePrice: true, whileWeThereBasePrice: true, pricingMethod: true } },
        },
        orderBy: { id: "asc" },
      })
    : [];

  const plan = await planNewLine(guarded, {
    contractorId: input.contractorId, service, answersSnapshot: input.answers, existing,
  });

  if (plan.kind === "REVIEW_BEFORE_PLACEMENT") {
    const labels = plan.verdict && "photoLabels" in plan.verdict ? (plan.verdict.photoLabels as string[]) : [];
    return { ok: true, evaluation: { outcome: "REVIEW", message: REVIEW_MESSAGE, photoLabels: labels } };
  }
  if (plan.kind === "UNRESOLVABLE") return { ok: true, evaluation: { outcome: "UNAVAILABLE", message: UNAVAILABLE_MESSAGE } };

  const r = plan.resolved;
  if (r.status === "PRICED") return { ok: true, evaluation: { outcome: "PRICED", priceCents: r.priceCents } };
  if (r.status === "REROUTE") return { ok: true, evaluation: { outcome: "REROUTE", targetServiceId: r.targetServiceId } };
  if (r.status === "REVIEW") {
    return { ok: true, evaluation: { outcome: "REVIEW", message: REVIEW_MESSAGE, photoLabels: (r.photoLabels ?? []) as string[] } };
  }
  return { ok: true, evaluation: { outcome: "UNAVAILABLE", message: UNAVAILABLE_MESSAGE } };
}
