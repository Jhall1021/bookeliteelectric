import type { PrismaClient } from "@prisma/client";
import { findOpenVisit } from "@/lib/openVisit";
import {
  buildRepeatLocationAnswers,
  type RepeatLocationInput,
} from "@/lib/repeatLocation";

type Resolution =
  | { ok: true; serviceId: string; serviceSlug: string; answers: Record<string, string> }
  | { ok: false; status: 400 | 404; error: string };

export function parseRepeatLocationInput(value: unknown): RepeatLocationInput | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.parentLineItemId !== "string" || !raw.parentLineItemId) return null;
  if (typeof raw.distanceFeet !== "number") return null;
  for (const key of ["doorway", "turnsOntoAnotherWall", "sameControl"] as const) {
    if (raw[key] !== undefined && typeof raw[key] !== "boolean") return null;
  }
  return {
    parentLineItemId: raw.parentLineItemId,
    distanceFeet: raw.distanceFeet,
    doorway: raw.doorway as boolean | undefined,
    turnsOntoAnotherWall: raw.turnsOntoAnotherWall as boolean | undefined,
    sameControl: raw.sameControl as boolean | undefined,
  };
}

export async function resolveRepeatLocation(
  db: PrismaClient,
  args: {
    contractorId: string;
    sessionId: string | null;
    requestedServiceId: unknown;
    input: unknown;
  },
): Promise<Resolution> {
  const input = parseRepeatLocationInput(args.input);
  if (!input) return { ok: false, status: 400, error: "Invalid additional-location details." };
  if (typeof args.requestedServiceId !== "string" || !args.requestedServiceId) {
    return { ok: false, status: 400, error: "Missing serviceId" };
  }

  const visit = await findOpenVisit(db, args.contractorId, args.sessionId);
  if (!visit) return { ok: false, status: 404, error: "The first item is no longer in this visit." };

  const parent = await db.lineItem.findFirst({
    where: {
      id: input.parentLineItemId,
      visitId: visit.id,
      serviceId: args.requestedServiceId,
      computedPriceCents: { not: null },
    },
    select: {
      serviceId: true,
      answersSnapshot: true,
      service: { select: { slug: true } },
    },
  });
  if (!parent) return { ok: false, status: 404, error: "The previous location could not be found." };

  const built = buildRepeatLocationAnswers({
    serviceSlug: parent.service.slug,
    parentAnswers: (parent.answersSnapshot ?? {}) as Record<string, string>,
    input,
  });
  if (!built.ok) return { ok: false, status: 400, error: built.error };

  return {
    ok: true,
    serviceId: parent.serviceId,
    serviceSlug: parent.service.slug,
    answers: built.answers,
  };
}
