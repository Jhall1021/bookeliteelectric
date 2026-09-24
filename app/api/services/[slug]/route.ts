import { NextResponse } from "next/server";
import { parseAccessSlot, PRIMARY_SLOT, orderAccessSlots } from "@/lib/accessSlots";
import { prisma } from "@/lib/prisma";
import type { ServiceFlowDTO } from "@/lib/flow-types";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import {
  categoryIcon,
  requireContractorCategory,
  disclaimerIsActive,
  disclaimerAccessClass,
  disclaimerAccessSlot,
  requireContractorDisclaimer,
} from "@/lib/categories";
import {
  loadOwnComponents,
  canonicalComponentIdsIn,
} from "@/lib/contractorComponents";
import { resolveServiceReferences, serviceAvailabilityLookup } from "@/lib/serviceCopy";
import { QUESTION_ORDER } from "@/lib/serviceTreeQuery";
import { laborRateForService } from "@/lib/pricing";

// Trees are small (a handful of questions per service), so we return the
// whole thing in one call rather than round-tripping per question — the
// GuidedFlowEngine walks it client-side.
export async function GET(req: Request, { params }: { params: { slug: string } }) {
  // ADR §2.2. The site identifier the caller carries decides the tenant.
  // Resolving it from the requested resource would authorise access to that
  // resource using itself.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  // The contractor comes from the SITE now, not from the service. The old
  // two-query dance — look up the service, read its contractorId, then load
  // the tree — was the forbidden shape: it used the requested resource to
  // decide whose resource it was.
  //
  // Slug resolution is now scoped to this contractor, which is also what makes
  // per-contractor slugs possible later (ADR-008 sequencing).
  const service = await withSite(site, (db) =>
    db.service.findFirst({
    where: { slug: params.slug },
    include: {
      contractorCategory: {
        select: {
          iconOverride: true,
          canonicalCategory: { select: { slug: true, name: true, defaultIcon: true } },
        },
      },
      questions: {
        orderBy: QUESTION_ORDER,
        include: {
          conditionalHelp: {
            orderBy: { order: "asc" },
            // ADR-009: the contractor's policy statement, not the shared
            // pre-split text. Service-rooted, so the traversal is safe.
            include: {
              contractorDisclaimer: { include: { canonicalDisclaimer: true } },
            },
          },
          options: {
            orderBy: { order: "asc" },
            include: {
              // contractorId travels for the tenant check below, never for
              // display — defense in depth alongside the write-time guard in
              // the admin tree editor and template provisioning.
              // whileWeThereBasePrice travels alongside basePrice so this
              // endpoint can supply both anchors — see
              // referencedServicePrimaryCents/referencedServiceAddOnCents
              // below; picking between them needs to know isAddOn, which
              // this endpoint doesn't.
              referencedService: { select: { basePrice: true, whileWeThereBasePrice: true, contractorId: true } },
              // Components come down with the tree so the engine can
              // accumulate a configuration client-side without a round trip
              // per answer.
              // Canonical roles only. Platform data beneath a tenant-owned
              // root is safe; the contractor's figures come separately.
              components: { include: { canonicalComponent: true } },
              photoGroups: {
                orderBy: { order: "asc" },
                include: { photoGroup: true },
              },
              conditionalDisclaimers: {
                orderBy: { order: "asc" },
                include: {
                  contractorDisclaimer: { include: { canonicalDisclaimer: true } },
                },
              },
            },
          },
        },
      },
    },
    })
  );

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Names and availability for this contractor's whole catalog, so a quoted
  // reference in the copy can be told apart from a quoted phrase that is not
  // a service at all.
  const catalogNames = await withSite(site, (db) =>
    db.service.findMany({ select: { name: true, active: true } })
  );

  // Tenant-rooted: ContractorComponent -> its canonical role, not the other
  // way round. A role missing from this map is one this contractor has never
  // priced, which fails closed below rather than defaulting to zero.
  const ownComponents = await withSite(site, (db) =>
    loadOwnComponents(db, site.contractorId, canonicalComponentIdsIn(service))
  );

  // ADR-018 — a TIME_AND_MATERIALS storefront needs the rate, the approved
  // band and the component hours, because all three are shown to the
  // homeowner. A FLAT_RATE storefront gets none of it, so the earlier decision
  // to keep cost inputs off this payload is untouched.
  // Two reads, not one join. PricingSettings is TENANT-OWNED, so it is rooted
  // at its own model where the guard can scope it — reading it as a relation
  // beneath Contractor is the platform-parent-to-tenant-child shape ADR-007
  // forbids, and the audit refuses it.
  const strategy = (await withSite(site, (db) =>
    db.contractor.findUniqueOrThrow({
      where: { id: site.contractorId }, select: { pricingStrategy: true },
    })
  )).pricingStrategy;
  const isTm = strategy === "TIME_AND_MATERIALS";
  // Only read when it will be used. A flat-rate storefront has no business
  // touching the rate on a customer-facing request.
  const rateSettings = isTm
    ? await withSite(site, (db) =>
        db.pricingSettings.findUnique({
          where: { contractorId: site.contractorId },
          select: { crewHourRateCents: true, electricianHourRateCents: true },
        })
      )
    : null;
  const rate = rateSettings?.crewHourRateCents === null || rateSettings?.crewHourRateCents === undefined
    ? null
    : laborRateForService(service, {
        crewHourRateCents: rateSettings.crewHourRateCents,
        electricianHourRateCents: rateSettings.electricianHourRateCents ?? rateSettings.crewHourRateCents,
        primaryMinimumCents: 0,
        roundingIncrementCents: 1,
        defaultPermitAdminCents: 0,
      });

  /**
   * The access slots this flow can ESTABLISH — G1, derived from the WRITERS.
   *
   * An answer qualifies only when it actually declares a classification: a slot
   * column defaulted to PRIMARY on an answer that establishes nothing is not a
   * writer, and publishing it would tell the client to expect state no question
   * produces.
   *
   * Readers — component, disclaimer and help conditions — are deliberately NOT
   * unioned in. A condition on a slot nothing writes is a defect, caught by
   * `access_slot_reader_has_writer` in verify-access-slots.ts, not a slot to
   * advertise. `orderAccessSlots` sorts to the platform's declared order so the
   * published list does not depend on which question happened to be authored
   * first.
   */
  const referencedAccessSlots = orderAccessSlots(
    service.questions.flatMap((q) =>
      q.options
        .filter((o) => o.accessClassification !== null)
        .map((o) => o.accessSlot)
    )
  );

  const dto: ServiceFlowDTO = {
    id: service.id,
    referencedAccessSlots,
    slug: service.slug,
    name: service.name,
    bookingType: service.bookingType,
    basePrice: service.basePrice,
    whileWeThereBasePrice: service.whileWeThereBasePrice,
    pricingMethod: service.pricingMethod,
    startingPriceLabel: service.startingPriceLabel,
    ctaLabel: service.ctaLabel,
    // Cross-references resolved against THIS contractor's live catalog: copy
    // written for the trade may point at a service they do not offer.
    shortDescription: resolveServiceReferences(
      service.shortDescription,
      serviceAvailabilityLookup(catalogNames)
    ),
    icon:
      service.icon ??
      categoryIcon(requireContractorCategory(service.slug, service.contractorCategory)),
    disclaimer: service.disclaimer,
    estimatedMinutes: service.estimatedMinutes,
    // Null unless this contractor bills time and materials AND has a rate. The
    // engine refuses to estimate on a null block rather than inventing one.
    timeAndMaterials: isTm && rate !== null
      ? {
          crewHourRateCents: rate,
          estimateLowCrewHours: service.estimateLowCrewHours,
          estimateHighCrewHours: service.estimateHighCrewHours,
          // The DATE is not shipped — only whether a human approved. The
          // customer has no use for when, and it is not theirs to know.
          estimateApproved: service.estimateApprovedAt !== null,
        }
      : null,
    questions: service.questions.map((q) => ({
      id: q.id,
      key: q.key,
      prompt: q.prompt,
      helpText: q.helpText,
      inputType: q.inputType,
      // ROUTING V2 — the authored numeric contract, carried verbatim. The
      // client must never re-derive these from labels or from option order.
      numberAllowsDecimal: q.numberAllowsDecimal, numberMin: q.numberMin,
      numberMax: q.numberMax,
      conditionalHelp: q.conditionalHelp
        .map((h) => ({
          h,
          policy: requireContractorDisclaimer(service.slug, h.contractorDisclaimer),
        }))
        .filter(({ policy }) => disclaimerIsActive(policy))
        .map(({ h, policy }) => ({
          text: policy.text,
          accessClass: disclaimerAccessClass(policy),
          accessSlot: disclaimerAccessSlot(policy),
          replaces: h.replacesHelpText,
        })),
      order: q.order,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        priceModifierCents: o.priceModifierCents,
        // Live lookup, not the frozen seed-time number, whenever this option
        // references another service — this is what makes admin edits to
        // e.g. Elite Tilt Mount's price actually show up here. A SEPARATE
        // pair of fields from priceModifierCents above (see
        // BranchContribution in lib/pricing.ts): that one always applies at
        // whatever it holds, so folding a missing/cross-tenant reference into
        // it here would have the browser show a confident price the server
        // (lib/routeResolver.ts, which resolves the identical fields the
        // identical way) would actually refuse.
        //
        // BOTH primary and add-on prices travel — this DTO doesn't know
        // which one a customer will need (isAddOn is decided client-side,
        // from a separate /api/visit read), so it can't pick for them.
        // lib/pricing.ts's resolveReferencedServicePriceCents is the ONE
        // place either is chosen, client-side, once isAddOn is known — never
        // read one of these two fields ad hoc and hand it to applyBranch.
        // Each is independently null when unresolved (missing/cross-tenant
        // reference, or the referenced service has no price recorded for
        // that specific anchor) — never backfilled from the other.
        referencedServicePrimaryCents: !o.referencedServiceId
          ? undefined
          : o.referencedService && o.referencedService.contractorId === site.contractorId
            ? o.referencedService.basePrice
            : null,
        referencedServiceAddOnCents: !o.referencedServiceId
          ? undefined
          : o.referencedService && o.referencedService.contractorId === site.contractorId
            ? o.referencedService.whileWeThereBasePrice
            : null,
        nextQuestionId: o.nextQuestionId,
        numberAtLeastExclusive: o.numberAtLeastExclusive, numberAtLeast: o.numberAtLeast,
        numberAtMost: o.numberAtMost,
        routeAction: o.routeAction,
        rerouteServiceId: o.rerouteServiceId,
        // Groups expand first, then any loose labels specific to this answer.
        // The client receives one flat list and stays unaware of the split.
        requiredPhotoLabels: [
          ...o.photoGroups.flatMap((g) => g.photoGroup.labels),
          ...o.requiredPhotoLabels,
        ],
        // Safe to send: these are pictures of ordinary fixtures, chosen to
        // help someone recognize their own. Nothing about Elite's costs.
        illustrationUrls: o.illustrationUrls,
        // De-duplicated: two groups may carry the same panel warning, and the
        // customer should see it once.
        photoSafetyNotes: [
          ...new Set(
            o.photoGroups
              .map((g) => g.photoGroup.safetyNote)
              .filter((n): n is string => !!n)
          ),
        ],
        disclaimer: o.disclaimer,
        photosBlockBooking: o.photosBlockBooking,
        overrideEstimatedMinutes: o.overrideEstimatedMinutes,
        overrideTechCount: o.overrideTechCount,
        overrideFieldLaborHours: o.overrideFieldLaborHours,
        approvedComponentPriceCents: o.approvedComponentPriceCents,
        accessClassification: o.accessClassification,
        accessSlot: parseAccessSlot(o.accessSlot) ?? PRIMARY_SLOT,
        accessFinishedDisclaimer: o.accessFinishedDisclaimer,
        conditionalDisclaimers: o.conditionalDisclaimers
          .map((d) => ({
            policy: requireContractorDisclaimer(service.slug, d.contractorDisclaimer),
          }))
          .filter(({ policy }) => disclaimerIsActive(policy))
          .map(({ policy }) => ({
            text: policy.text,
            accessClass: disclaimerAccessClass(policy),
            accessSlot: disclaimerAccessSlot(policy),
          })),
        components: o.components.flatMap((sel) => {
          const canonical = sel.canonicalComponent;
          // A broken attachment. Dropped rather than thrown: this endpoint
          // feeds a customer-facing flow, and one bad row should not take the
          // whole service page down. The route resolver — which decides the
          // actual price — throws on the same condition, so the booking
          // cannot complete on a broken tree either way.
          if (!canonical) return [];

          const own = ownComponents.get(canonical.id);

          return [
            {
              quantity: sel.quantity,
              // §29 — null on both means the component always applies; when
              // set, it applies only if the customer's earlier answer matches.
              conditionAccessClass: sel.conditionAccessClass,
              conditionAccessSlot: parseAccessSlot(sel.conditionAccessSlot) ?? PRIMARY_SLOT,
              conditionAnswerKey: sel.conditionAnswerKey,
              conditionAnswerValue: sel.conditionAnswerValue,
              component: {
                key: canonical.key,
                customerFacingLabel:
                  own?.labelOverride ?? canonical.customerFacingLabel,
                // FAILS CLOSED. No contractor row means unpriced, which is
                // null — the engine then treats the branch as review rather
                // than quoting a figure. Never zero, and never another
                // contractor's price on a public endpoint.
                approvedPriceCents: own ? own.approvedPriceCents : null,
                // Only under T&M, where these hours reach the homeowner. Null
                // when this contractor has no row — unresolved, not zero, so
                // the estimate refuses rather than pricing the extra work at
                // nothing.
                ...(isTm ? { addCrewHours: own ? own.addFieldLaborHours : null } : {}),
              },
            },
          ];
        }),
      })),
    })),
  };

  return NextResponse.json(dto);
}
