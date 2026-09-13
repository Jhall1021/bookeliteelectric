/**
 * Shared query definitions for a service's question tree.
 *
 * Small on purpose, and dependent only on Prisma's types, so any loader — the
 * single-service resolver, the storefront API, the admin editor, template
 * installation — can import it without importing each other.
 */
import type { Prisma } from "@prisma/client";

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
