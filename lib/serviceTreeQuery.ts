/**
 * Shared query definitions for a service's question tree.
 *
 * Small on purpose, with type-only imports, so any loader — the single-service
 * resolver, the contractor-wide catalog loader, the storefront API, the admin
 * editor, template installation — can import it without importing each other.
 */
import type { Prisma } from "@prisma/client";
import type { OwnComponentMap } from "./contractorComponents";

/**
 * The one ordering rule for a service's questions: position, then id.
 *
 * `order` alone was not a total order. Three Elite services on the rehearsal
 * database carried two questions at the same `order`, and Postgres breaks such
 * ties however the query plan happens to run — no stated rule reproduced what
 * it returned (`id asc` matched two services and `id desc` the third). That is
 * harmless only while the tie is not at the lowest position: the resolver, the
 * activation outcome walker and the storefront all begin at `questions[0]`, so
 * a tie there would make the question a customer starts on depend on a query
 * plan.
 *
 * `id` makes the order total. It changes nothing where positions are unique,
 * which verify-question-order requires of the data. It exists for the case
 * that check exists to catch.
 */
export const QUESTION_ORDER = [
  { order: "asc" },
  { id: "asc" },
] satisfies Prisma.QuestionOrderByWithRelationInput[];

/**
 * A service's full resolution tree: every question, its answers, and what each
 * answer does — the components it adds with their canonical materials, the
 * photographs it asks for, the disclaimers it attaches.
 *
 * Defined once so the single-service loader (loadServiceForResolution: visit,
 * quotes, activation) and the contractor-wide loader
 * (loadCatalogForResolution: readiness, catalog promises) cannot drift apart
 * in shape. Moved verbatim from loadServiceForResolution.
 */
export const RESOLUTION_TREE_INCLUDE = {
  questions: {
    orderBy: QUESTION_ORDER,
    include: {
      options: {
        orderBy: { order: "asc" },
        include: {
          // The referenced service's own live price, when this answer sells
          // another catalog item rather than declaring its own modifier —
          // see AnswerOption.referencedServiceId. Safe to traverse from a
          // tenant-scoped root: a reference can only be written through the
          // admin tree editor's guarded client, which resolves every linked
          // id through that same contractor before it's ever stored (see
          // app/api/admin/services/[serviceId]/tree/route.ts), so this
          // relation can never point outside the tenant it's read from.
          //
          // basePrice/whileWeThereBasePrice — never economics beyond what a
          // customer is charged. contractorId travels too, NOT to display,
          // but so a caller can prove this row is the same tenant's rather
          // than trusting the write-time guard alone (defense in depth: see
          // lib/routeResolver.ts's tenant check on this field).
          referencedService: { select: { basePrice: true, whileWeThereBasePrice: true, contractorId: true } },
          // Canonical roles only — platform data under a tenant-owned
          // root, which is safe. The contractor's figures arrive
          // separately, from their own tenant-rooted query.
          components: {
            include: {
              // v1.1 §3.1 — what the component physically consumes. Platform
              // data under a tenant-owned root, like canonicalComponent
              // itself; the COST comes from the contractor's own query.
              canonicalComponent: { include: { materials: { include: { canonicalMaterial: true } } } },
            },
          },
          photoGroups: { include: { photoGroup: true } },
          // ADR-009: the contractor's policy statement, not the shared
          // pre-split text. Service-rooted, so this traversal is safe.
          conditionalDisclaimers: {
            include: {
              contractorDisclaimer: {
                include: { canonicalDisclaimer: true },
              },
            },
          },
        },
      },
    },
  },
} satisfies Prisma.ServiceInclude;

/** A Service row with its resolution tree, as either loader reads it. */
export type ServiceTree = Prisma.ServiceGetPayload<{ include: typeof RESOLUTION_TREE_INCLUDE }>;

/**
 * What both loaders return for a service: the tree plus the contractor's own
 * figures and the resolved troubleshooting destination.
 */
export type ResolvedServiceTree = ServiceTree & {
  ownComponents: OwnComponentMap;
  ownMaterialCosts: Map<string, number>;
  troubleshootingServiceId: string | null;
  troubleshootingProblem: string | null;
};
