/**
 * May this service go live, and putting it live.
 *
 * ONE implementation, called by the admin route and by the tests. It was
 * inline in the route, which meant a behavioral test either drove HTTP with a
 * real session or asserted on source — and a source assertion proves the code
 * SAYS the right thing, not that it DOES it.
 *
 * There is deliberately no bulk variant. Guided Setup's launch calls this once
 * per service, so a contractor putting seven services live gets seven
 * independent decisions. A bulk path would be a second activation authority,
 * and the one that skipped a check would be the one nobody noticed.
 */

import type { PrismaClient } from "@prisma/client";
import { promiseFor } from "./onboardingReadiness";
import { findTroubleshootingService, tradeOfService } from "./troubleshooting";
import { loadPricingSettings } from "./routeResolver";
import { assessActivationMaterialReadiness } from "./materialResolution";

export type ActivationRefusal = {
  code: "UNKNOWN_SERVICE" | "PRICE_NOT_APPROVED" | "MATERIALS_UNRESOLVED"
      | "POLICY_UNRESOLVED" | "DEPENDENCY_UNAVAILABLE";
  message: string;
  unresolvedMaterialKeys?: string[];
  unresolvedPolicyKeys?: string[];
  /** Slugs the contractor must launch first, when the refusal is a dependency. */
  missingPrerequisites?: string[];
};

/**
 * Why this service may not go live, or null.
 *
 * Only ever blocks the transition INTO active. A service already live with a
 * material problem is the pricing guard's business, and refusing to save an
 * unrelated wording change on it would help nobody.
 */
export async function activationRefusal(
  db: PrismaClient,
  contractorId: string,
  serviceId: string
): Promise<ActivationRefusal | null> {
  const service = await db.service.findUnique({
    where: { id: serviceId },
    select: {
      id: true, slug: true, active: true, bookingType: true,
      publishedPriceApprovedAt: true, materialCostResolved: true,
      unresolvedMaterialKeys: true, unresolvedPolicyKeys: true,
    },
  });
  if (!service) {
    return { code: "UNKNOWN_SERVICE", message: "Unknown service" };
  }
  if (service.active) return null;

  // §1.4, enforced at activation rather than only in CI.
  //
  // A tree that can quote a homeowner a fixed price, on a service with no
  // approved price, is what §1.4 forbids — and it used to be caught only
  // afterwards by a verifier. One service slipping through was a build
  // failure; a launch that activates many at once makes it a storefront
  // quoting prices nobody approved.
  //
  // Asked through the same function readiness and §1.4 use, so the three
  // cannot disagree about what a service promises.
  let settings: unknown = null;
  try { settings = await loadPricingSettings(db as never, contractorId); } catch { settings = null; }
  const promise = await promiseFor(
    db, { id: service.id, bookingType: service.bookingType }, settings
  );
  if (promise.promisesFixedPrice && service.publishedPriceApprovedAt === null) {
    return {
      code: "PRICE_NOT_APPROVED",
      message:
        "This service can't go live yet — a homeowner could reach a price on it, " +
        "and no price has been approved.",
    };
  }

  if (service.materialCostResolved === false) {
    const keys = service.unresolvedMaterialKeys ?? [];
    return {
      code: "MATERIALS_UNRESOLVED",
      message:
        keys.length > 0
          ? `This service can't go live yet — no cost has been entered for ${keys.join(", ")}. ` +
            `Add those costs and try again.`
          : `This service can't go live yet — one of the materials it needs has no cost recorded.`,
      unresolvedMaterialKeys: keys,
    };
  }

  /**
   * Branch and component material, checked before the storefront can offer a
   * fixed price on a route that consumes it.
   *
   * The check above covers Service -> Material, which is what
   * materialCostResolved tracks. It cannot see the other two shapes:
   *
   *   AnswerOption -> Material                 base material of a branch
   *   AnswerOption -> Component -> Material    material a branch's component uses
   *
   * Both were invisible to activation until now — a contractor could take a
   * service live with a copper branch whose fittings they had never costed, and
   * only find out when every copper customer silently fell through to review.
   * Route resolution already refused to quote those (REVIEW on
   * awaitingComponentMaterialCost), so no wrong price ever reached a homeowner;
   * what was missing was telling the CONTRACTOR before they launched.
   * Activation is the proactive guard; route resolution stays the runtime net.
   *
   * Reported as MATERIALS_UNRESOLVED because it is the same problem with the
   * same fix — enter the cost — and a second code would be two names for one
   * thing.
   */
  const branchMaterials = await assessActivationMaterialReadiness(db, serviceId, contractorId);
  if (!branchMaterials.ready) {
    const keys = branchMaterials.missing.map((m) => m.key);
    return {
      code: "MATERIALS_UNRESOLVED",
      message:
        `This service can't go live yet — a route a homeowner can reach consumes ` +
        `${keys.join(", ")}, and no cost has been entered for ${keys.length === 1 ? "it" : "them"}.`,
      unresolvedMaterialKeys: keys,
    };
  }

  // An undecided policy is a HOLE IN THE STOREFRONT, not a back-office gap.
  //
  // A band question's labels are written against the policy's boundaries, so
  // until those numbers exist the option a homeowner reads is the pattern
  // itself: "{b1} feet or less". BrightPath launched with exactly that on a
  // live, priced service — readiness called it a blocker, the repo has
  // asserted it since verify-policy-resolution was written, and activation
  // was the one place that did not ask. That is the same gap §1.4 closed for
  // prices: a check that only runs in CI is a check the storefront can
  // outrun.
  const policies = service.unresolvedPolicyKeys ?? [];
  if (policies.length > 0) {
    return {
      code: "POLICY_UNRESOLVED",
      message:
        `This service can't go live yet — it asks the homeowner a question whose ` +
        `answers are written from ${policies.join(", ")}, and that hasn't been decided. ` +
        `Until it is, the choices would read as "{b1} feet or less".`,
      unresolvedPolicyKeys: policies,
    };
  }

  // WHERE THE ANSWERS LEAD, not just what they cost.
  //
  // A tree can hand a homeowner off — "it stopped working" goes to the
  // diagnostic, "that's a different job" goes to another service. Those
  // destinations have to exist and be live, and until now nothing checked:
  // BrightPath launched outlet replacement while its diagnostic was still
  // held back, so the two commonest answers a homeowner gives reached
  // nothing. The contractor was never told; the fix was to launch
  // troubleshooting first, which is an ordering rule nobody could know.
  //
  // Asked at activation so the ordering enforces itself. Review & Launch may
  // sort its calls into dependency order, but it still makes them one at a
  // time through here.
  const blocked = await unavailableDependencies(db, contractorId, service.id, promise);
  if (blocked.length > 0) {
    const named = blocked.map((d) => d.label);
    return {
      code: "DEPENDENCY_UNAVAILABLE",
      message:
        `This service can't go live yet — an answer a homeowner can give leads to ` +
        `${named.join(" and ")}, which ${named.length === 1 ? "isn't" : "aren't"} live. ` +
        `Launch ${named.length === 1 ? "it" : "those"} first and this can follow.`,
      missingPrerequisites: blocked.map((d) => d.slug).filter((x): x is string => x !== null),
    };
  }

  return null;
}

/**
 * Destinations this service's tree reaches that a homeowner could not actually
 * be sent to.
 *
 * Two kinds, and they fail differently. A REROUTE_SERVICE names its target on
 * the answer row, and the resolver hands it back WITHOUT checking that it is
 * live — so an inactive target looks like a working hand-off and has to be
 * caught here. A REROUTE_TROUBLESHOOTING names a role instead, resolved
 * against the contractor's own active diagnostic; when there is none the
 * resolver already fails the route, so it arrives as a dead-route reason.
 */
async function unavailableDependencies(
  db: PrismaClient,
  contractorId: string,
  serviceId: string,
  promise: { handoffTargets: string[]; deadReasons: string[] }
): Promise<{ slug: string | null; label: string }[]> {
  const out: { slug: string | null; label: string }[] = [];

  if (promise.handoffTargets.length > 0) {
    const targets = await db.service.findMany({
      where: { id: { in: promise.handoffTargets }, contractorId },
      select: { id: true, slug: true, name: true, active: true },
    });
    for (const t of targets) {
      if (!t.active) out.push({ slug: t.slug, label: `"${t.name}"` });
    }
    // A target that is not this contractor's at all is a catalog defect rather
    // than an ordering problem, but it is equally unreachable, so it is named
    // too rather than passing silently.
    const found = new Set(targets.map((t) => t.id));
    for (const id of promise.handoffTargets) {
      if (!found.has(id)) out.push({ slug: null, label: "a service that isn't in your catalog" });
    }
  }

  if (promise.deadReasons.some((r) => /routes to troubleshooting/.test(r))) {
    // G2. This used to be a local `findFirst` with no `orderBy` — it silently
    // picked a row, and on a multi-trade contractor that row could belong to
    // another trade, so the contractor was told to launch the wrong service
    // first. It now asks the one authority, scoped to THIS service's trade.
    //
    // The destination reported here is the same one routeResolver would send a
    // homeowner to, which is the property this whole module exists to keep.
    const trade = await tradeOfService(db, contractorId, serviceId);
    if (!trade.ok) {
      out.push({ slug: null, label: "a diagnostic visit, which this service cannot resolve" });
    } else {
      const found = await findTroubleshootingService(db, contractorId, trade.tradeKey);
      out.push(
        found.ok
          ? { slug: found.service.slug, label: `your diagnostic visit ("${found.service.name}")` }
          : { slug: null, label: "a diagnostic visit, which you don't offer yet" }
      );
    }
  }

  return out;
}

/**
 * Put one service live, or refuse and change nothing.
 *
 * The refusal and the write are together on purpose: a caller that could check
 * and then write separately is a caller that can forget the check.
 */
export async function activateService(
  db: PrismaClient,
  contractorId: string,
  serviceId: string
): Promise<{ ok: true } | { ok: false; refusal: ActivationRefusal }> {
  const refusal = await activationRefusal(db, contractorId, serviceId);
  if (refusal) return { ok: false, refusal };
  await db.service.update({ where: { id: serviceId }, data: { active: true } });
  return { ok: true };
}
