import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { ServiceFlowDTO } from "@/lib/flow-types";
import { categoryIcon, requireContractorCategory } from "@/lib/categories";
import {
  loadOwnComponents,
  canonicalComponentIdsIn,
} from "@/lib/contractorComponents";

// Trees are small (a handful of questions per service), so we return the
// whole thing in one call rather than round-tripping per question — the
// GuidedFlowEngine walks it client-side.
export async function GET(_req: Request, { params }: { params: { slug: string } }) {
  // The contractor first, so their economics can be loaded from their own
  // tenant-rooted query.
  //
  // Components are a canonical role plus one contractor's economics. Loading
  // every contractor's figures and picking one afterwards would put other
  // contractors' pricing into a PUBLIC response — the worst place for it.
  //
  // This used to nest `contractorComponents` under `canonicalComponent` with a
  // hand-written contractor filter. CanonicalComponent is a PLATFORM model and
  // Prisma extensions do not fire on nested reads, so that filter was the only
  // thing standing between this public endpoint and every contractor's
  // component pricing. It is now a separate query rooted at the tenant-owned
  // model, where the guard can see it — see lib/contractorComponents.ts.
  //
  // NOTE: this still resolves by slug alone, which works only while
  // Service.slug is globally unique. Two contractors both wanting
  // "new-120v-outlet" breaks that, and the fix is a slug unique per
  // contractor plus a contractor in the request. Out of scope here; recorded
  // so it is not discovered by a collision.
  const owner = await prisma.service.findUnique({
    where: { slug: params.slug },
    select: { contractorId: true },
  });
  if (!owner?.contractorId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const service = await prisma.service.findUnique({
    where: { slug: params.slug },
    include: {
      contractorCategory: {
        select: {
          iconOverride: true,
          canonicalCategory: { select: { slug: true, name: true, defaultIcon: true } },
        },
      },
      questions: {
        orderBy: { order: "asc" },
        include: {
          conditionalHelp: {
            orderBy: { order: "asc" },
            include: { disclaimer: true },
          },
          options: {
            orderBy: { order: "asc" },
            include: {
              referencedService: { select: { basePrice: true } },
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
                include: { disclaimer: true },
              },
            },
          },
        },
      },
    },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Tenant-rooted: ContractorComponent -> its canonical role, not the other
  // way round. A role missing from this map is one this contractor has never
  // priced, which fails closed below rather than defaulting to zero.
  const ownComponents = await loadOwnComponents(
    prisma,
    owner.contractorId,
    canonicalComponentIdsIn(service)
  );

  const dto: ServiceFlowDTO = {
    id: service.id,
    slug: service.slug,
    name: service.name,
    bookingType: service.bookingType,
    basePrice: service.basePrice,
    whileWeThereBasePrice: service.whileWeThereBasePrice,
    startingPriceLabel: service.startingPriceLabel,
    shortDescription: service.shortDescription,
    icon:
      service.icon ??
      categoryIcon(requireContractorCategory(service.slug, service.contractorCategory)),
    disclaimer: service.disclaimer,
    estimatedMinutes: service.estimatedMinutes,
    questions: service.questions.map((q) => ({
      id: q.id,
      key: q.key,
      prompt: q.prompt,
      helpText: q.helpText,
      inputType: q.inputType,
      conditionalHelp: q.conditionalHelp
        .filter((h) => h.disclaimer.active)
        .map((h) => ({
          text: h.disclaimer.text,
          accessClass: h.disclaimer.accessClass,
          replaces: h.replacesHelpText,
        })),
      order: q.order,
      options: q.options.map((o) => ({
        id: o.id,
        label: o.label,
        value: o.value,
        // Live lookup wins over the frozen seed-time number whenever this
        // option references another service — this is what makes admin
        // edits to e.g. Elite Tilt Mount's price actually show up here.
        priceModifierCents: o.referencedService?.basePrice ?? o.priceModifierCents,
        nextQuestionId: o.nextQuestionId,
        routeAction: o.routeAction,
        rerouteServiceId: o.rerouteServiceId,
        // Groups expand first, then any loose labels specific to this answer.
        // The client receives one flat list and stays unaware of the split.
        requiredPhotoLabels: [
          ...o.photoGroups.flatMap((g) => g.photoGroup.labels),
          ...o.requiredPhotoLabels,
        ],
        // Safe to send: these are pictures of ordinary fixtures, chosen to
        // help someone recognise their own. Nothing about Elite's costs.
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
        accessFinishedDisclaimer: o.accessFinishedDisclaimer,
        conditionalDisclaimers: o.conditionalDisclaimers
          .filter((d) => d.disclaimer.active)
          .map((d) => ({
            text: d.disclaimer.text,
            accessClass: d.disclaimer.accessClass,
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
              },
            },
          ];
        }),
      })),
    })),
  };

  return NextResponse.json(dto);
}
