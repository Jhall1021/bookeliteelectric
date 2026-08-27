/**
 * Server-side route resolution.
 *
 * The browser used to walk the decision tree, work out a price, and POST it.
 * `/api/visit` checked `typeof computedPriceCents === "number"` and stored it,
 * which made anyone with dev tools an authority on what Elite charges.
 *
 * This module is now the only thing that decides a price. The browser sends
 * what the customer CHOSE — a service and an answer map — and the server
 * replays that route against the current database to decide what it COSTS.
 *
 * STATELESS BY DESIGN
 *
 * No server-side flow state, no session-held partial route. The answer
 * snapshot alone reproduces the result, which means any price can be
 * reconstructed later from three things: the contractor's configuration, the
 * service definition, and what the customer answered. Nothing hidden in a
 * browser or a session.
 *
 * FAILS CLOSED
 *
 * A missing question, an answer that no longer maps to an option, a cycle, an
 * unknown access classification, a component with no approved price — none of
 * these produce a guessed price. They produce a review. "Uncertain scope =
 * review; known scope = fixed price" applies to our own bugs as much as to a
 * customer's unusual house.
 */

import type { PrismaClient } from "@prisma/client";
import {
  loadOwnComponents,
  canonicalComponentIdsIn,
  type OwnComponentMap,
} from "./contractorComponents";
import {
  startConfiguration,
  applyBranch,
  customerPrice,
  type JobConfiguration,
  type PricingSettings,
} from "./pricing";

export type ResolvedRoute =
  | {
      status: "PRICED";
      /** What the customer pays. Server-derived; never from the client. */
      priceCents: number;
      isPrimary: boolean;
      config: JobConfiguration;
      /** Photos to collect, when the route wants them but doesn't block. */
      photoLabels: string[];
      photoSafetyNotes: string[];
      disclaimers: string[];
      /** Which answers were actually consumed, in order. */
      consumed: { key: string; value: string; label: string }[];
    }
  | {
      status: "REVIEW";
      reason: string;
      photoLabels: string[];
      photoSafetyNotes: string[];
      /** The running total where the route stopped. A floor, never an estimate. */
      floorPriceCents: number | null;
      isPrimary: boolean;
      config: JobConfiguration;
    }
  | {
      status: "REROUTE";
      targetServiceId: string;
      carriedAnswers: Record<string, string>;
    }
  | {
      status: "INVALID";
      /** Operator-facing. Never shown to a customer as-is. */
      reason: string;
    };

/**
 * Everything the resolver needs, loaded once.
 *
 * THREE QUERIES, DELIBERATELY.
 *
 *   1. the service's owning contractor
 *   2. the tree, rooted at Service — tenant-owned, so the guard scopes it and
 *      everything reachable below it is constrained by foreign key
 *   3. that contractor's component economics, rooted at ContractorComponent —
 *      tenant-owned, so the guard scopes that too
 *
 * Query 3 used to be a nested include hanging off CanonicalComponent, with a
 * hand-written contractor filter on it. It was correct, but only by diligence:
 * CanonicalComponent is a PLATFORM model, the guard waves it through, and
 * Prisma extensions do not fire on nested reads — so deleting that one `where`
 * would have exposed every contractor's economics with nothing failing. The
 * live harness demonstrated exactly that read.
 *
 * The rule this now follows: tenant-owned data is loaded from a tenant-owned
 * TOP-LEVEL query. See lib/contractorComponents.ts.
 *
 * Loading every contractor's economics and filtering in memory was never an
 * option either — a tenant boundary that holds only because the data was
 * discarded after loading is not one.
 */
export async function loadServiceForResolution(prisma: PrismaClient, serviceId: string) {
  const owner = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { slug: true, contractorId: true },
  });
  if (!owner) return null;
  if (!owner.contractorId) {
    throw new Error(
      `${owner.slug} has no contractor. Its components cannot be resolved — ` +
        `run prisma/backfill-service-contractor-2026-08-25.ts.`
    );
  }

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    include: {
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            include: {
              // Canonical roles only — platform data under a tenant-owned
              // root, which is safe. The contractor's figures arrive
              // separately, from their own tenant-rooted query.
              components: { include: { canonicalComponent: true } },
              photoGroups: { include: { photoGroup: true } },
              conditionalDisclaimers: { include: { disclaimer: true } },
            },
          },
        },
      },
    },
  });
  if (!service) return null;

  const ownComponents = await loadOwnComponents(
    prisma,
    owner.contractorId,
    canonicalComponentIdsIn(service)
  );

  return { ...service, ownComponents };
}

type LoadedService = NonNullable<Awaited<ReturnType<typeof loadServiceForResolution>>>;

/**
 * Replay a customer's answers through a service's tree.
 *
 * `isPrimary` is decided by the CALLER from the state of the open visit, never
 * by the client — it changes the price, so it's exactly the sort of thing a
 * browser shouldn't get to assert.
 */
export function resolveRoute(
  service: LoadedService,
  answers: Record<string, string>,
  isPrimary: boolean,
  settings: PricingSettings
): ResolvedRoute {
  let config = startConfiguration({
    estimatedMinutes: service.estimatedMinutes,
    requiresTechCount: service.requiresTechCount,
    fieldLaborHours: service.fieldLaborHours,
    materialCostCents: service.materialCostCents,
  });

  // A required material role with no cost for this contractor.
  //
  //   A homeowner-facing price may never be calculated using an unresolved
  //   required material cost. Missing required cost = no price.
  //
  // Checked FIRST, before the tree is walked, because it is a fact about the
  // service rather than about the answers — and because the cached
  // materialCostCents that startConfiguration just consumed is exactly the
  // figure that must not be trusted while this flag is false. It is
  // deliberately left at its previous value rather than zeroed; zeroing would
  // be silent underpricing by another route, and this check is what prevents
  // the stale figure reaching a customer.
  //
  // This cannot happen for a service whose materials all resolve, which today
  // is all of them. It becomes reachable when a contractor holds template
  // services before entering their own costs, and when a cost is deleted,
  // deactivated or lost to a bad import after activation. Activation blocking
  // catches the first; this catches the rest.
  //
  // RESTORED 27 August. This block was deleted as collateral in 3ae9349,
  // whose subject was scoping pricing settings to the contractor and which
  // never mentioned it. scripts/verify-unresolved-guards.ts went red in the
  // same commit and stayed red, because nothing runs it on the way to a
  // deploy — `npm run build` type-checks the seeds but does not execute the
  // verify scripts, and the test's fixture is cast `as any`, so removing the
  // guard was not even a type error.
  if (service.materialCostResolved === false) {
    return {
      status: "REVIEW",
      reason: "A material this service needs has no cost recorded",
      photoLabels: [],
      photoSafetyNotes: [],
      // No floor either. A floor derived from a total that is missing a
      // material is not a floor.
      floorPriceCents: null,
      isPrimary,
      config,
    };
  }

  const consumed: { key: string; value: string; label: string }[] = [];
  const photoLabels: string[] = [];
  const photoSafetyNotes: string[] = [];
  const disclaimers: string[] = [];

  // A service with no tree is priced entirely from its published figures.
  if (service.questions.length === 0) {
    const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
    if (base === null) {
      return { status: "INVALID", reason: `${service.slug} has no published ${isPrimary ? "base" : "add-on"} price` };
    }
    return {
      status: "PRICED",
      priceCents: base,
      isPrimary,
      config,
      photoLabels: [],
      photoSafetyNotes: [],
      disclaimers: service.disclaimer ? [service.disclaimer] : [],
      consumed: [],
    };
  }

  let current = service.questions[0];
  // Guards against a tree that loops back on itself. A cycle used to be
  // possible to build in the editor and would hang the walk.
  const visited = new Set<string>();

  for (;;) {
    if (visited.has(current.id)) {
      return { status: "INVALID", reason: `Cycle at question "${current.key}" in ${service.slug}` };
    }
    visited.add(current.id);

    const given = answers[current.key];
    if (given === undefined) {
      return { status: "INVALID", reason: `No answer for "${current.key}"` };
    }

    // TEXT and NUMBER questions carry the typed value, so the option is
    // whichever one the question holds rather than a value match.
    const isFreeText = current.inputType === "TEXT" || current.inputType === "NUMBER";
    const option = isFreeText
      ? current.options[0]
      : current.options.find((o) => o.value === given);

    if (!option) {
      // The answer doesn't map to anything on this question. Usually means
      // the tree changed under a customer mid-flow.
      return {
        status: "INVALID",
        reason: `"${given}" is not a valid answer to "${current.key}" in ${service.slug}`,
      };
    }

    consumed.push({ key: current.key, value: given, label: option.label });

    // Reroutes stop the walk. The target service prices it, with whatever
    // answers still apply carried across.
    if (option.routeAction === "REROUTE_SERVICE" || option.routeAction === "REROUTE_TROUBLESHOOTING") {
      if (!option.rerouteServiceId) {
        return { status: "INVALID", reason: `Reroute from "${current.key}" has no target service` };
      }
      return { status: "REROUTE", targetServiceId: option.rerouteServiceId, carriedAnswers: answers };
    }

    // applyBranch returns the new configuration directly — it isn't wrapped.
    config = applyBranch(
      config,
      {
        priceModifierCents: option.priceModifierCents,
        approvedComponentPriceCents: option.approvedComponentPriceCents,
        accessClassification: option.accessClassification,
        overrideEstimatedMinutes: option.overrideEstimatedMinutes,
        overrideTechCount: option.overrideTechCount,
        overrideFieldLaborHours: option.overrideFieldLaborHours,
        addFieldLaborHours: option.addFieldLaborHours,
        addMaterialCostCents: option.addMaterialCostCents,
        addScheduleMinutes: option.addScheduleMinutes,
        components: option.components.map((c) => {
          const canonical = c.canonicalComponent;
          // A recipe line pointing at nothing. Post-migration this cannot
          // happen — the migration reported zero unlinked — but a broken
          // attachment must not price as though the work were free.
          if (!canonical) {
            throw new Error(
              `${service.slug}: an answer option attaches a component with no ` +
                `canonical role. The tree is broken and must not be priced.`
            );
          }

          // Possibly none: a role this contractor has never priced.
          const own = service.ownComponents.get(canonical.id);

          return {
            quantity: c.quantity,
            conditionAnswerKey: c.conditionAnswerKey,
            conditionAnswerValue: c.conditionAnswerValue,
            conditionAccessClass: c.conditionAccessClass,
            component: {
              key: canonical.key,
              // The contractor's wording if they set one, else the shared
              // description of the work.
              customerFacingLabel:
                own?.labelOverride ?? canonical.customerFacingLabel,
              // FAILS CLOSED. No contractor row means this contractor has
              // never priced the component: null, not approved, and the route
              // goes to review via config.awaitingComponentApproval. Never
              // zero, and never another contractor's figure.
              approvedPriceCents: own ? own.approvedPriceCents : null,
              // Only reached when the price above is non-null, since a null
              // price stops the route before these are used.
              addFieldLaborHours: own?.addFieldLaborHours ?? 0,
              addMaterialCostCents: own?.addMaterialCostCents ?? 0,
              addScheduleMinutes: own?.addScheduleMinutes ?? 0,
              addTechCount: own?.addTechCount ?? 0,
            },
          };
        }),
      },
      answers
    );

    for (const g of option.photoGroups) {
      photoLabels.push(...g.photoGroup.labels);
      if (g.photoGroup.safetyNote) photoSafetyNotes.push(g.photoGroup.safetyNote);
    }
    photoLabels.push(...option.requiredPhotoLabels);
    if (option.disclaimer) disclaimers.push(option.disclaimer);
    for (const d of option.conditionalDisclaimers) {
      if (!d.disclaimer.active) continue;
      if (d.disclaimer.accessClass === null || d.disclaimer.accessClass === config.accessClass) {
        disclaimers.push(d.disclaimer.text);
      }
    }

    const terminal =
      option.routeAction === "RESOLVE_INSTANT" ||
      option.routeAction === "RESOLVE_ADJUSTED" ||
      option.routeAction === "PHOTO_REVIEW";

    if (option.routeAction === "PHOTO_REVIEW" && option.photosBlockBooking) {
      const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
      // customerPrice returns a verdict, not a number: it can refuse to
      // price a route whose components aren't approved.
      const floor = base === null ? null : customerPrice(config, base).totalCents;
      return {
        status: "REVIEW",
        reason: "This route needs the office to price it",
        photoLabels: [...new Set(photoLabels)],
        photoSafetyNotes: [...new Set(photoSafetyNotes)],
        floorPriceCents: floor,
        isPrimary,
        config,
      };
    }

    if (terminal) break;

    if (!option.nextQuestionId) {
      return { status: "INVALID", reason: `"${option.value}" continues but has no next question` };
    }
    const next = service.questions.find((q) => q.id === option.nextQuestionId);
    if (!next) {
      return { status: "INVALID", reason: `"${option.value}" points at a question that doesn't exist` };
    }
    current = next;
  }

  // Anything unresolved at this point becomes a review rather than a price.
  if (config.awaitingComponentApproval) {
    const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
    return {
      status: "REVIEW",
      reason: "A component on this route has no approved price",
      photoLabels: [...new Set(photoLabels)],
      photoSafetyNotes: [...new Set(photoSafetyNotes)],
      floorPriceCents: base === null ? null : customerPrice(config, base).totalCents,
      isPrimary,
      config,
    };
  }
  if (config.accessClass === "UNKNOWN") {
    const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
    return {
      status: "REVIEW",
      reason: "The wiring route isn't established",
      photoLabels: [...new Set(photoLabels)],
      photoSafetyNotes: [...new Set(photoSafetyNotes)],
      floorPriceCents: base === null ? null : customerPrice(config, base).totalCents,
      isPrimary,
      config,
    };
  }

  const base = isPrimary ? service.basePrice : service.whileWeThereBasePrice;
  if (base === null) {
    return {
      status: "INVALID",
      reason: `${service.slug} has no published ${isPrimary ? "base" : "add-on"} price`,
    };
  }

  const verdict = customerPrice(config, base);
  if (verdict.mustReview || verdict.totalCents === null) {
    // The pricing library itself refused. Fail closed rather than reaching
    // past it for a number — its reasons are the same ones this resolver
    // checks, and any it catches that we don't is exactly the case worth
    // deferring to it on.
    return {
      status: "REVIEW",
      reason: verdict.reason ?? "This route can't be priced automatically",
      photoLabels: [...new Set(photoLabels)],
      photoSafetyNotes: [...new Set(photoSafetyNotes)],
      floorPriceCents: null,
      isPrimary,
      config,
    };
  }

  return {
    status: "PRICED",
    priceCents: verdict.totalCents,
    isPrimary,
    config,
    photoLabels: [...new Set(photoLabels)],
    photoSafetyNotes: [...new Set(photoSafetyNotes)],
    disclaimers: service.disclaimer ? [service.disclaimer, ...disclaimers] : disclaimers,
    consumed,
  };
}

/**
 * ONE contractor's pricing settings, or a thrown error.
 *
 * A missing row must not become a default price, and — now that there is more
 * than one contractor — it must not become somebody else's price either.
 * There is deliberately no fallback to Elite and no "first row" lookup. A
 * cross-tenant pricing fallback is worse than an error, because the error
 * stops a booking while the fallback completes one at the wrong rate.
 *
 * WHERE THE CONTRACTOR COMES FROM
 *
 * The service being priced. `loadServiceForResolution` uses `include`, so
 * `service.contractorId` is available at every call site that resolves a
 * route. That is a fact about the work rather than an inference: you are
 * pricing that contractor's service, so you use that contractor's rate.
 *
 * No site identifier, no session, no ambient context needed for this path.
 */
export async function loadPricingSettings(
  prisma: PrismaClient,
  contractorId: string
): Promise<PricingSettings> {
  if (!contractorId) {
    throw new Error("loadPricingSettings called with no contractor — cannot price anything.");
  }
  const s = await prisma.pricingSettings.findUnique({ where: { contractorId } });
  if (!s) {
    throw new Error(
      `No pricing settings for contractor ${contractorId} — cannot price anything. ` +
        `Onboarding must create them; they are not defaulted.`
    );
  }
  return s;
}

/**
 * The contractor that owns a service, or a thrown error.
 *
 * Small on purpose. Every pricing path needs this and every one of them must
 * fail the same way, rather than each inventing its own handling of a service
 * with no owner.
 */
export function contractorIdForService(service: {
  slug: string;
  contractorId: string | null;
}): string {
  if (!service.contractorId) {
    throw new Error(
      `${service.slug} has no contractor. It cannot be priced — run ` +
        `prisma/backfill-service-contractor-2026-08-25.ts.`
    );
  }
  return service.contractorId;
}
