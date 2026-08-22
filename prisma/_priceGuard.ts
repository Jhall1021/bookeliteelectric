/**
 * Publishing a price from a seed, safely.
 *
 * Removing `publishedPriceApprovedAt` from the seeds stopped them *claiming*
 * approval, but they still wrote `basePrice` and `whileWeThereBasePrice` — so
 * re-running one still moved a customer-facing price. The stamp was the
 * symptom; the write is the problem.
 *
 * The rule this enforces:
 *
 *   A seed may ESTABLISH a price that doesn't exist yet — that's how a new
 *   service gets its first one. It may never OVERWRITE a price that does.
 *
 * Changing a live price happens in two places only: the admin Publish action,
 * or one explicitly named owner-approved reconciliation migration. A seed that
 * silently reprices is how the recessed base moved from $375 to $385 without
 * anyone choosing it, and how a re-run of the old base seed could restore a
 * price book from months ago.
 *
 * Operational seeds should keep writing freely to crew-hours, materials,
 * schedule duration, questions, routing and direct costs. Those are inputs.
 * Only the published customer price is protected.
 */

import type { PrismaClient } from "@prisma/client";

export type PriceIntent = {
  basePrice?: number | null;
  whileWeThereBasePrice?: number | null;
};

export type PriceResult = {
  established: string[];
  skipped: { field: string; existing: number; wanted: number }[];
  cleared: string[];
};

/**
 * Apply price intent to a service, refusing to overwrite anything already
 * published.
 *
 * Returns what it did so the seed can report it. A skip is not an error — it's
 * the guard working — but it must be visible, or a seed silently stops doing
 * what its source says it does.
 *
 * Setting a price to null IS allowed: that's making a service quote-only,
 * which removes a price rather than substituting a different one.
 */
export async function publishIfUnset(
  prisma: PrismaClient,
  serviceId: string,
  intent: PriceIntent
): Promise<PriceResult> {
  const current = await prisma.service.findUniqueOrThrow({
    where: { id: serviceId },
    select: { basePrice: true, whileWeThereBasePrice: true },
  });

  const data: Record<string, number | null> = {};
  const result: PriceResult = { established: [], skipped: [], cleared: [] };

  for (const field of ["basePrice", "whileWeThereBasePrice"] as const) {
    if (!(field in intent)) continue;
    const wanted = intent[field];
    const existing = current[field];

    if (wanted === null) {
      if (existing !== null) {
        data[field] = null;
        result.cleared.push(field);
      }
      continue;
    }
    if (wanted === undefined) continue;

    if (existing === null) {
      data[field] = wanted;
      result.established.push(field);
    } else if (existing !== wanted) {
      // The interesting case. The seed wants one number, the database holds
      // another, and the database wins — because someone may have set it in
      // the admin since, and a seed can't tell a deliberate change from a
      // stale constant in its own source.
      result.skipped.push({ field, existing, wanted });
    }
  }

  if (Object.keys(data).length > 0) {
    await prisma.service.update({ where: { id: serviceId }, data });
  }

  return result;
}

/** One line per service, for a seed's output. */
export function describePriceResult(slug: string, r: PriceResult): string | null {
  const parts: string[] = [];
  if (r.established.length) parts.push(`established ${r.established.join(", ")}`);
  if (r.cleared.length) parts.push(`cleared ${r.cleared.join(", ")}`);
  for (const s of r.skipped) {
    parts.push(
      `kept published ${s.field} $${s.existing / 100} (seed wanted $${s.wanted / 100})`
    );
  }
  return parts.length ? `      ${slug}: ${parts.join("; ")}` : null;
}
