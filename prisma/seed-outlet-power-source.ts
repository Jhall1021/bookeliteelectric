/**
 * "What's going in it, and how would you like it powered?"
 *
 *   npx tsx prisma/seed-outlet-power-source.ts
 *
 * Two questions in front of every service that adds a receptacle. They decide
 * something the customer was previously never asked and Elite found out on
 * the day: whether this outlet taps the nearest circuit or gets its own.
 *
 * WHY TWO QUESTIONS AND NOT ONE
 *
 * They answer different things, and only the second is a choice.
 *
 * "Do you need a dedicated circuit?" is a load calculation dressed as a
 * preference. A homeowner can't answer it, and the ones who think they can
 * are often wrong. But everyone knows what they're plugging in — so the first
 * question asks that, and it settles the cases that aren't optional. A
 * freezer needs its own circuit whether or not anyone fancies one, and
 * offering to tap the nearest outlet would be offering something we shouldn't
 * do.
 *
 * Once the load is ordinary, the choice really is theirs, and then we ask
 * plainly with both prices on screen. Somebody moving a desk wants the cheap
 * option; somebody tired of resetting a breaker wants the other. Both are
 * right, and neither is a question about amperage.
 *
 * The order matters. Ask the preference first and a chest freezer ends up on
 * a tapped circuit because $445 is less than $685.
 *
 * NOTHING NEW IS PRICED HERE
 *
 * "Its own circuit" is already a service — Dedicated Circuit & Outlet, at
 * 2.5 crew-hours. So these questions REROUTE rather than adding a component.
 * One price for that work, in one place, however the customer arrives at it.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { upsertQuestion } from "./_moduleHelpers";

const prisma = new PrismaClient();

// POLICY[dedicated_required]: NAMED_HIGH_DRAW_APPLIANCES
// POLICY[dedicated_choice]: CUSTOMER_CHOOSES_WHEN_LOAD_IS_ORDINARY
//
// NAMED appliances, not a rule about motors or heating elements.
//
// An earlier version said "anything with a motor or a heating element", which
// is wrong in both directions: a desk fan has a motor and a coffee maker has
// a heating element, and neither needs its own circuit. Written that way, the
// question would route a table lamp's worth of load to a $685 service.
//
// So these options name specific appliances Elite knows to be high draw. They
// aren't the model or the question deciding an electrical requirement — they
// route to the service whose tree does the qualifying. Anything not on the
// list goes to review rather than being guessed at.
//
//   intent -> the right service's tree -> that tree decides scope -> price
//
// never
//
//   a question decides the electrical requirement -> $685
const LOAD_KEY = "outlet_load_type";
const SOURCE_KEY = "outlet_power_source";

/** Services where someone is adding a receptacle and this choice exists. */
const APPLIES_TO = ["new-120v-outlet"];

const LABEL_PHOTOS = [
  "The nameplate label on the appliance — usually a sticker on the back or underside",
];

async function main() {
  const dedicated = await prisma.service.findUnique({
    where: { slug: "dedicated-120v-circuit-outlet" },
    select: { id: true, basePrice: true },
  });
  const ev = await prisma.service.findUnique({
    where: { slug: "level-2-ev-charger" },
    select: { id: true },
  });
  if (!dedicated) {
    console.error("Dedicated Circuit & Outlet is missing — nothing to reroute to.");
    process.exit(1);
  }

  for (const slug of APPLIES_TO) {
    const service = await prisma.service.findUnique({
      where: { slug },
      include: { questions: { include: { answerOptions: true } } },
    });
    if (!service) {
      console.log(`  ! ${slug} not found`);
      continue;
    }

    // Where the existing tree starts. The new questions go in FRONT of it —
    // if this turns out to be a dedicated circuit, none of the routing or
    // distance questions below apply, and asking them first would waste the
    // customer's time before telling them it's a different job.
    const entry = service.questions.find((q) => q.key === "below_above_access");
    if (!entry) {
      console.log(`  ! ${slug} has no below_above_access question to sit in front of`);
      continue;
    }

    // Shift everything down two places rather than renumbering by hand.
    for (const q of service.questions) {
      await prisma.question.update({
        where: { id: q.id },
        data: { order: q.order + 2 },
      });
    }

    const qLoad = await upsertQuestion(prisma, service.id, {
      key: LOAD_KEY,
      prompt: "What will you be plugging in?",
      helpText:
        "Some things need a circuit of their own so they can't be knocked out by whatever else is on it.",
      order: 1,
    });

    const qSource = await upsertQuestion(prisma, service.id, {
      key: SOURCE_KEY,
      prompt: "How would you like it powered?",
      helpText: null,
      order: 2,
    });

    await prisma.answerOption.deleteMany({
      where: { questionId: { in: [qLoad.id, qSource.id] } },
    });

    await prisma.answerOption.createMany({
      data: [
        {
          questionId: qLoad.id,
          label: "Everyday things — lamps, a TV, chargers, a computer",
          value: "everyday",
          // The only branch where the customer gets a say.
          routeAction: "CONTINUE",
          nextQuestionId: qSource.id,
          order: 1,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: 0,
        },
        {
          questionId: qLoad.id,
          label: "A fridge, freezer, or window air conditioner",
          value: "motor_appliance",
          disclaimer:
            "These need a circuit of their own — a fridge that shares one with something else can be switched off by it without anyone noticing.",
          routeAction: "REROUTE_SERVICE",
          rerouteServiceId: dedicated.id,
          order: 2,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: null,
        },
        {
          questionId: qLoad.id,
          // Named, not "anything that heats". A hair dryer heats.
          label: "A microwave, a space heater, or a treadmill",
          value: "heating_appliance",
          disclaimer:
            "These draw heavily enough that sharing a circuit tends to trip it.",
          routeAction: "REROUTE_SERVICE",
          rerouteServiceId: dedicated.id,
          order: 3,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: null,
        },
        {
          questionId: qLoad.id,
          label: "A compressor, a table saw, or similar shop equipment",
          value: "shop_equipment",
          disclaimer: "Equipment like this draws hard when it starts up.",
          routeAction: "REROUTE_SERVICE",
          rerouteServiceId: dedicated.id,
          order: 4,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: null,
        },
        {
          questionId: qLoad.id,
          label: "An electric vehicle",
          value: "ev",
          disclaimer: "That's a different job — we'll take you to the right place.",
          routeAction: ev ? "REROUTE_SERVICE" : "PHOTO_REVIEW",
          rerouteServiceId: ev?.id ?? null,
          order: 5,
          requiredPhotoLabels: ev ? [] : LABEL_PHOTOS,
          approvedComponentPriceCents: null,
        },
        {
          // A text box AND the label, because the two answer different
          // things. What they type tells us what it is; the nameplate tells
          // us the amperage, which is the fact that actually decides it.
          questionId: qLoad.id,
          label: "Something else, or I'm not sure",
          value: "unsure",
          // The catch-all, and deliberately generous. Anything not named
          // above lands here rather than being sorted by a rule — a wine
          // fridge, a kiln, an aquarium heater, a sewing machine. We look
          // and say, rather than guessing from a category.
          disclaimer:
            "Tell us what it is and send a photo of its label if you can find one — we'll work out what it needs and come back with a price.",
          routeAction: "PHOTO_REVIEW",
          photosBlockBooking: true,
          order: 6,
          requiredPhotoLabels: LABEL_PHOTOS,
          approvedComponentPriceCents: null,
        },
      ],
    });

    // ---- Q2: only reached when the load is ordinary ---------------------
    //
    // Both prices on screen. The customer is choosing between two real
    // options and the difference is the entire point of asking.
    const tapPrice = service.basePrice ? `$${Math.round(service.basePrice / 100)}` : "";
    const dedPrice = dedicated.basePrice ? `$${Math.round(dedicated.basePrice / 100)}` : "";

    await prisma.answerOption.createMany({
      data: [
        {
          questionId: qSource.id,
          label: `From the nearest outlet${tapPrice ? ` — from ${tapPrice}` : ""}`,
          value: "tap_existing",
          disclaimer:
            "The quickest way, and fine for everyday things. It shares a circuit with whatever else is already on it.",
          routeAction: "CONTINUE",
          nextQuestionId: entry.id,
          order: 1,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: 0,
        },
        {
          questionId: qSource.id,
          label: `Its own circuit from the panel${dedPrice ? ` — from ${dedPrice}` : ""}`,
          value: "dedicated",
          disclaimer:
            "Worth it if the outlets nearby already trip, or you'd rather this one had room to spare.",
          routeAction: "REROUTE_SERVICE",
          rerouteServiceId: dedicated.id,
          order: 2,
          requiredPhotoLabels: [],
          approvedComponentPriceCents: null,
        },
      ],
    });

    console.log(`  ✓ ${slug}`);
    console.log(`      what's going in it -> everyday continues, the rest reroute`);
    console.log(`      how it's powered   -> nearest outlet ${tapPrice} or own circuit ${dedPrice}`);
  }

  console.log();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
