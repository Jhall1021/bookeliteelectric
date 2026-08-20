/**
 * Finish acknowledgement on the FIXTURE access route.
 *
 *   npx tsx prisma/seed-fixture-finish-ack.ts
 *
 * The switch-leg module already asks for this before pricing a switch leg.
 * But getting power to the fixture itself through a finished ceiling means
 * cutting too, and that path has been resolving straight to a price with only
 * a passive disclaimer line — or on three services, nothing at all.
 *
 * This inserts the same acknowledgement immediately after any answer that
 * establishes a FINISHED route on the service's own access question, before
 * the flow continues to a price.
 *
 * Idempotent: if the answer already points at the acknowledgement, nothing
 * changes.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion, findDanglingReferences, findUnreachableQuestions } from "./_moduleHelpers";

const prisma = new PrismaClient();

const ACK_KEY = "fixture_finish_ack";

/**
 * Worded to be true wherever it appears. It can't vary by which question
 * established the finished route, so it describes what the customer will
 * actually see happen: an opening in the ceiling or wall, and no patching.
 *
 * The last line explains why the access question exists at all — an open
 * route is cheaper — so it reads as being on their side rather than as
 * groundwork for a surcharge.
 */
const ACK_TEXT = [
  "With no attic or open space above, the wiring for this has to be run through the finished ceiling.",
  "That means your electrician will need to make one or more openings in the drywall or plaster to get the cable where it needs to go. We keep them as small as we can and put them where they're least visible, but on a finished ceiling they can't always be avoided.",
  "Patching, spackling, sanding, painting and any other finish repair aren't included unless we've put it in writing.",
  "That's why we ask about attic access — an open route above usually means no openings at all and less time on site.",
].join("\n\n");

/**
 * Services whose own access question can land on a finished route.
 *
 * The lighting module handles the switch-leg side on these same services;
 * this covers the fixture side.
 */
const SERVICES = [
  "recessed-lighting",
  "new-ceiling-light",
  "new-ceiling-fan",
  "fan-replacing-light",
];

/** Question keys that ask about access to the FIXTURE, not the switch wall. */
const FIXTURE_ACCESS_KEYS = ["ceiling_access", "attic_access"];

async function attach(slug: string) {
  const service = await prisma.service.findUnique({
    where: { slug },
    include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
  });
  if (!service) {
    console.log(`  – ${slug} — not in the catalog, skipped`);
    return;
  }

  const accessQuestions = service.questions.filter((q) => FIXTURE_ACCESS_KEYS.includes(q.key));
  if (accessQuestions.length === 0) {
    console.log(`  – ${slug} — no fixture access question found`);
    return;
  }

  // Every finished answer across those questions. Collected first so we can
  // check they share a destination before inserting a single acknowledgement.
  const finishedAnswers = accessQuestions.flatMap((q) =>
    q.options.filter((o) => o.accessClassification === "FINISHED")
  );
  if (finishedAnswers.length === 0) {
    console.log(`  – ${slug} — no FINISHED answer; run seed-access-normalization first`);
    return;
  }

  // One acknowledgement can only continue to one place. If the finished
  // answers currently go to different questions, inserting a single ack would
  // silently reroute one of them — so report rather than guess.
  const destinations = new Set(
    finishedAnswers
      .filter((o) => o.routeAction === "CONTINUE")
      .map((o) => o.nextQuestionId ?? "RESOLVE")
  );
  const alreadyWired = [...destinations].some((d) => {
    const q = service.questions.find((x) => x.id === d);
    return q?.key === ACK_KEY;
  });
  if (alreadyWired && destinations.size === 1) {
    console.log(`  ✓ ${slug} — already routed through the acknowledgement`);
    return;
  }
  if (destinations.size > 1) {
    console.log(
      `  ! ${slug} — finished answers go to ${destinations.size} different places; ` +
        `needs a look rather than a single shared acknowledgement`
    );
    return;
  }

  const [destination] = [...destinations];

  const qAck = await upsertQuestion(prisma, service.id, {
    key: ACK_KEY,
    prompt: "Before we price this — one thing about your ceiling",
    helpText: ACK_TEXT,
    order: (accessQuestions[0].order ?? 0) + 1,
  });

  const proceed =
    destination && destination !== "RESOLVE"
      ? { routeAction: "CONTINUE" as const, nextQuestionId: destination }
      : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

  await prisma.answerOption.createMany({
    data: [
      {
        questionId: qAck.id,
        label: "I understand — go ahead",
        value: "accepted",
        ...proceed,
        order: 1,
        requiredPhotoLabels: [],
        approvedComponentPriceCents: 0,
      },
      {
        // Agreeing has to be a real choice. Someone who'd rather we looked
        // first needs somewhere to go that isn't "accept or abandon".
        questionId: qAck.id,
        label: "I'd rather Elite take a look first",
        value: "review_first",
        routeAction: "PHOTO_REVIEW",
        photosBlockBooking: true,
        order: 2,
        requiredPhotoLabels: [
          "The ceiling where the light or fan is going",
          "A wider photo of the whole room",
        ],
      },
    ],
  });

  // Point the finished answers at the acknowledgement, and strip the passive
  // disclaimer line they used to carry — it's now a question the customer
  // actually answers, and having both would say the same thing twice.
  await prisma.answerOption.updateMany({
    where: { id: { in: finishedAnswers.map((o) => o.id) } },
    data: { routeAction: "CONTINUE", nextQuestionId: qAck.id, disclaimer: null },
  });

  // Renumber so the acknowledgement sits directly after the access question.
  const after = service.questions.filter(
    (q) => !FIXTURE_ACCESS_KEYS.includes(q.key) && q.key !== ACK_KEY && q.order > accessQuestions[0].order
  );
  for (let i = 0; i < after.length; i++) {
    await prisma.question.update({
      where: { id: after[i].id },
      data: { order: accessQuestions[0].order + 2 + i },
    });
  }

  const dangling = await findDanglingReferences(prisma, service.id);
  const unreachable = await findUnreachableQuestions(prisma, service.id);
  console.log(
    `  ✓ ${slug} — ${finishedAnswers.length} finished answer(s) now acknowledge before pricing` +
      (dangling.length ? `  [DANGLING: ${dangling.join(", ")}]` : "") +
      (unreachable.length ? `  [UNREACHABLE: ${unreachable.join(", ")}]` : "")
  );
}

async function main() {
  console.log("Fixture-side finish acknowledgement...\n");
  for (const slug of SERVICES) await attach(slug);
  console.log(`
Run AFTER seed-access-normalization.ts — this finds finished routes by their
access classification, so answers have to be classified first.

The switch-leg module carries its own acknowledgement for the wiring to the
switch. This one covers getting power to the fixture itself, which is the
larger opening of the two.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
