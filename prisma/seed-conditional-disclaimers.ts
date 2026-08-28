/**
 * Conditional disclaimers, defined once and attached where they apply.
 *
 *   npx tsx prisma/seed-conditional-disclaimers.ts
 *
 * Four bespoke versions of the same idea had accumulated —
 * accessFinishedDisclaimer, the switch-leg acknowledgement, the fixture
 * acknowledgement, and the exterior-wall contingency was about to be a fifth.
 * Each says "show this sentence when the route established earlier was
 * finished." Written per tree they drift, and a stale copy tells a customer
 * with an attic that we'll be cutting their ceiling.
 *
 * THE EXTERIOR-WALL CONTINGENCY is the new one.
 *
 * An open attic doesn't guarantee an open route. A low-pitch attic over an
 * exterior wall can be too tight to get in and drill down into the top plate
 * — so a job that qualified as accessible turns into a finished-wall job on
 * arrival. Previously that was discovered on a ladder with nothing said in
 * advance.
 *
 * Now: book at the accessible price, name the specific amount it becomes if
 * the route doesn't work, and record that the customer was told. The site
 * can disclose and record; the technician decides on site and the change
 * happens in Jobber.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { eliteContractorId } from "./_componentHelpers";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

/**
 * The contingency amount is the accessible-to-finished gap for that service,
 * so it has to be written per service rather than as one number.
 *
 *   New 120V Outlet     $125 under 10 ft, $190 at 10-20 ft
 *   Switch leg          $135 under 10 ft, $200 at 10-20 ft
 *   Exterior GFCI       n/a — it goes through the wall, not along it
 *   Dedicated circuit   quoted, not banded
 */
/**
 * A note on the exterior-wall wording.
 *
 * An earlier version said the wall "can't be fished". That's too absolute —
 * plenty of exterior walls can be. Insulation, fire blocking, framing and
 * headers make it unpredictable, not impossible.
 *
 * It also described HOW the cable would be run, which is a promise about
 * method made before anyone has looked. The electrician decides that on the
 * day. What the customer needs to know is narrower and more useful: openings
 * may be needed, here's what that costs, patching isn't included.
 *
 * Say what the fixed price covers. Don't explain the wiring.
 */
const DISCLAIMERS = [
  {
    key: "EXTERIOR_WALL_CONTINGENCY_OUTLET",
    name: "Exterior wall contingency — new outlet",
    accessClass: "ACCESSIBLE" as const,
    text:
      "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across. If that's what it takes, it adds $125 for a run under 10 feet or $190 for a longer one, and patching and painting aren't included. We'll show you what we're looking at and confirm before doing anything.",
    notes: "Gap between the accessible and finished components on new-120v-outlet.",
  },
  {
    key: "EXTERIOR_WALL_CONTINGENCY_SWITCHLEG",
    name: "Exterior wall contingency — switch leg",
    accessClass: "ACCESSIBLE" as const,
    text:
      "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across. If that's what it takes, it adds $135 for a run under 10 feet or $200 for a longer one, and patching and painting aren't included. We'll show you and confirm before doing anything.",
    notes: "Gap between the accessible and finished switch-leg components.",
  },
  {
    key: "EXTERIOR_WALL_CONTINGENCY_DEDICATED",
    name: "Exterior wall contingency — dedicated circuit",
    accessClass: "ACCESSIBLE" as const,
    // No banded finished price on this service, so no figure can honestly be
    // named. Says what happens instead of inventing a number.
    text:
      "One thing about exterior walls: they're harder to route through than interior ones because of insulation and framing, and we won't know for certain until we're there. Small drywall openings may be needed to get the wiring across, which takes longer, and patching and painting aren't included. We'd show you what we're looking at and give you a price before doing any of it.",
    notes: "No banded finished price on this service, so no figure is quoted.",
  },
  {
    // Replaces the per-answer accessFinishedDisclaimer on the lighting
    // module's existing-light option.
    key: "TAP_EXISTING_FIXTURE_FINISHED",
    name: "Tapping an existing fixture — finished ceiling",
    accessClass: "FINISHED" as const,
    text:
      "Because there's no open space above this ceiling, we'll need to make an opening at the existing light as well as at the new one to make that connection. The fixture covers some of it, but not always all.",
    notes: "Was accessFinishedDisclaimer on existing_switched_light.",
  },
  {
    key: "DISTANCE_HELP_FINISHED",
    name: "Distance question — finished route",
    accessClass: "FINISHED" as const,
    text:
      "Measure roughly the path the wire would take through the walls — not the straight line across the room.",
    notes:
      "The default help text mentions the basement or attic, which reads as nonsense once the customer has said there isn't one.",
  },
];

/**
 * Where each applies. The exterior-wall question itself is created here too —
 * asked only when the route is otherwise accessible, since a finished route
 * is already priced for fishing.
 */
const EXTERIOR_WALL_KEY = "device_on_exterior_wall";

const ATTACHMENTS: { slug: string; questionKey: string; answerValue: string; disclaimerKey: string }[] = [
  { slug: "new-ceiling-light", questionKey: "lighting_control", answerValue: "existing_switched_light", disclaimerKey: "TAP_EXISTING_FIXTURE_FINISHED" },
  { slug: "new-ceiling-fan", questionKey: "lighting_control", answerValue: "existing_switched_light", disclaimerKey: "TAP_EXISTING_FIXTURE_FINISHED" },
  { slug: "fan-replacing-light", questionKey: "lighting_control", answerValue: "existing_switched_light", disclaimerKey: "TAP_EXISTING_FIXTURE_FINISHED" },
  { slug: "recessed-lighting", questionKey: "lighting_control", answerValue: "existing_switched_light", disclaimerKey: "TAP_EXISTING_FIXTURE_FINISHED" },
];

/** Services getting the exterior-wall question, and which contingency text. */
const EXTERIOR_WALL_SERVICES = [
  { slug: "new-120v-outlet", disclaimerKey: "EXTERIOR_WALL_CONTINGENCY_OUTLET", afterKey: "below_above_access", answerValue: "has_access" },
  { slug: "dedicated-120v-circuit-outlet", disclaimerKey: "EXTERIOR_WALL_CONTINGENCY_DEDICATED", afterKey: "dedicated_route_access", answerValue: null },
];

/**
 * Attach by the CONTRACTOR's disclaimer, not the deprecated shared one.
 *
 * The canonical row says which condition this is; the contractor's row says
 * what they tell a homeowner about it, and per ADR-009 that text IS policy —
 * whether they patch, whether they paint, in their words. Attaching the shared
 * ConditionalDisclaimer meant every contractor made the same promise.
 */
async function attach(answerOptionId: string, disclaimerKey: string, order = 0) {
  const contractorId = await eliteContractorId(prisma);
  const canonical = await prisma.canonicalDisclaimer.findUniqueOrThrow({ where: { key: disclaimerKey } });
  const cd = await prisma.contractorDisclaimer.findUnique({
    where: { contractorId_canonicalDisclaimerId: { contractorId, canonicalDisclaimerId: canonical.id } },
    select: { id: true },
  });
  if (!cd) {
    throw new Error(
      `No ContractorDisclaimer for "${disclaimerKey}". The contractor has to author the ` +
        `wording before it can be attached — it is their policy statement, not ours.`
    );
  }
  await prisma.answerOptionDisclaimer.upsert({
    where: { answerOptionId_contractorDisclaimerId: { answerOptionId, contractorDisclaimerId: cd.id } },
    update: { order },
    create: { answerOptionId, contractorDisclaimerId: cd.id, order },
  });
}

/**
 * Questions whose default help text is wrong on a finished route.
 *
 * Both distance questions tell the customer to estimate the path "through the
 * basement or attic" — which they've just told us doesn't exist. Replaces
 * rather than appends, since the default is actively misleading here.
 */
const HELP_ATTACHMENTS: { questionKey: string; disclaimerKey: string }[] = [
  { questionKey: "switch_leg_distance", disclaimerKey: "DISTANCE_HELP_FINISHED" },
  { questionKey: "outlet_run_distance", disclaimerKey: "DISTANCE_HELP_FINISHED" },
];

async function main() {
  for (const d of DISCLAIMERS) {
    await prisma.conditionalDisclaimer.upsert({
      where: { key: d.key },
      update: { name: d.name, text: d.text, accessClass: d.accessClass, notes: d.notes },
      create: d,
    });
  }
  console.log(`  ✓ ${DISCLAIMERS.length} conditional disclaimers defined`);

  // --- attach the finished-ceiling tap warning --------------------------
  let attached = 0;
  for (const a of ATTACHMENTS) {
    const q = await prisma.question.findFirst({
      where: { key: a.questionKey, service: { slug: a.slug } },
      include: { options: true },
    });
    const opt = q?.options.find((o) => o.value === a.answerValue);
    if (!opt) {
      console.log(`  – ${a.slug}/${a.questionKey}/${a.answerValue} not found`);
      continue;
    }
    await attach(opt.id, a.disclaimerKey);
    // The per-answer copy is retired now the shared one is attached — two
    // sources of the same sentence is how they drift apart.
    await prisma.answerOption.update({
      where: { id: opt.id },
      data: { accessFinishedDisclaimer: null },
    });
    attached++;
  }
  console.log(`  ✓ ${attached} answer(s) now use the shared finished-ceiling text`);

  // --- exterior-wall contingency ----------------------------------------
  for (const s of EXTERIOR_WALL_SERVICES) {
    const service = await prisma.service.findUnique({
      where: await serviceSlugKey(prisma, s.slug),
      include: { questions: { orderBy: { order: "asc" }, include: { options: true } } },
    });
    if (!service) {
      console.log(`  – ${s.slug} not in the catalog`);
      continue;
    }

    const after = service.questions.find((q) => q.key === s.afterKey);
    if (!after) {
      console.log(`  – ${s.slug} has no ${s.afterKey} question`);
      continue;
    }

    // Only the accessible answers lead here. A finished route is already
    // priced for fishing, so the contingency would be meaningless.
    const accessibleAnswers = after.options.filter(
      (o) => o.accessClassification === "ACCESSIBLE"
    );
    if (accessibleAnswers.length === 0) {
      console.log(`  – ${s.slug} has no ACCESSIBLE answer; run seed-access-normalization first`);
      continue;
    }

    // Where the accessible answers went BEFORE this seed ever touched them.
    //
    // On a re-run they already point at the exterior-wall question, so taking
    // their destination naively makes that question route to itself and
    // orphans everything downstream. When that's what we find, the real
    // destination is whatever the exterior question's own answers point at.
    const priorExterior = service.questions.find((q) => q.key === EXTERIOR_WALL_KEY);
    const rawDestinations = new Set(
      accessibleAnswers.map((o) => o.nextQuestionId ?? "RESOLVE")
    );
    const destinations = new Set(
      [...rawDestinations].map((d) => {
        if (priorExterior && d === priorExterior.id) {
          const onward = priorExterior.options.find(
            (o) => o.routeAction === "CONTINUE" && o.nextQuestionId
          );
          return onward?.nextQuestionId ?? "RESOLVE";
        }
        return d;
      })
    );

    if (destinations.size > 1) {
      console.log(`  ! ${s.slug} — accessible answers go to ${destinations.size} places; skipped`);
      continue;
    }
    const [destination] = [...destinations];

    // If it still resolves to the exterior question, a previous run already
    // looped it. Fall back to document order: the next question after the
    // access one that isn't the exterior question is where the chain was
    // always meant to go.
    let resolvedDestination = destination;
    if (priorExterior && destination === priorExterior.id) {
      const next = service.questions
        .filter((q) => q.order > after.order && q.key !== EXTERIOR_WALL_KEY)
        .sort((a, b) => a.order - b.order)[0];
      if (!next) {
        console.log(`  ! ${s.slug} — exterior-wall question loops and nothing follows it; needs a look`);
        continue;
      }
      resolvedDestination = next.id;
      console.log(`  · ${s.slug} — repairing a self-referencing exterior-wall question`);
    }

    // Separate binding rather than reassigning the found one: service.questions
    // is typed with its options included, and question.create returns a bare
    // question. Only the id is needed here either way.
    if (priorExterior) {
      await prisma.answerOption.deleteMany({ where: { questionId: priorExterior.id } });
    }
    const qExterior =
      priorExterior ??
      (await prisma.question.create({
        data: {
          serviceId: service.id,
          key: EXTERIOR_WALL_KEY,
          prompt: "Is this going on an outside wall?",
          helpText:
            "A wall with the outdoors on the other side, rather than another room. It changes how we get the wire there.",
          inputType: "SINGLE_SELECT",
          order: after.order + 1,
        },
      }));

    const proceed =
      resolvedDestination && resolvedDestination !== "RESOLVE"
        ? { routeAction: "CONTINUE" as const, nextQuestionId: resolvedDestination }
        : { routeAction: "RESOLVE_INSTANT" as const, nextQuestionId: null };

    await prisma.answerOption.createMany({
      data: [
        {
          questionId: qExterior.id,
          label: "Yes, it's an outside wall",
          value: "exterior",
          ...proceed,
          order: 1,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: 0,
        },
        {
          questionId: qExterior.id,
          label: "No, it's an interior wall",
          value: "interior",
          ...proceed,
          order: 2,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: 0,
        },
        {
          questionId: qExterior.id,
          label: "I'm not sure",
          value: "unsure",
          ...proceed,
          order: 3,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: 0,
        },
      ],
    });

    // The contingency goes on the exterior answer, and on "not sure" — if
    // they don't know, they should still hear what it might become.
    for (const value of ["exterior", "unsure"]) {
      const opt = await prisma.answerOption.findFirstOrThrow({
        where: { questionId: qExterior.id, value },
      });
      await attach(opt.id, s.disclaimerKey);
    }

    // Accessible answers now route through the exterior-wall question.
    await prisma.answerOption.updateMany({
      where: { id: { in: accessibleAnswers.map((o) => o.id) } },
      data: { routeAction: "CONTINUE", nextQuestionId: qExterior.id },
    });

    console.log(`  ✓ ${s.slug} — exterior-wall question added after ${s.afterKey}`);
  }

  console.log(`
The contingency is disclosed, not charged. Booking stays at the accessible
price; if the route turns out not to work, the technician shows the customer
and confirms before anything changes. That conversion happens in Jobber —
the site's job is that nobody is surprised by it.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
