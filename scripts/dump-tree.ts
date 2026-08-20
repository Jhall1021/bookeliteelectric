/**
 * Dump a service's decision tree as plain English.
 *
 *   npx tsx scripts/dump-tree.ts dedicated-120v-circuit-outlet
 *   npx tsx scripts/dump-tree.ts                 # lists every service
 *
 * Read-only. Reads from whatever DATABASE_URL points at, so run it against
 * production only if that's what you mean to review.
 *
 * Written because the trees live in Neon rather than in seed.ts, so there's
 * no file to read them out of — and reviewing branching logic by clicking
 * through the admin editor is how routing mistakes get missed.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const money = (cents: number | null | undefined) =>
  cents === null || cents === undefined
    ? "—"
    : `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

const ACTION_ENGLISH: Record<string, string> = {
  CONTINUE: "go on to another question",
  RESOLVE_INSTANT: "settle on a price and stop",
  RESOLVE_ADJUSTED: "settle on a price (adjusted) and stop",
  REMOTE_QUOTE: "collect photos and hand off to the office to price",
  REROUTE_SERVICE: "send the customer to a different service",
  REROUTE_TROUBLESHOOTING: "send the customer to Electrical Troubleshooting",
  PHOTO_REVIEW: "require photos",
};

async function main() {
  const slug = process.argv[2];

  if (!slug) {
    const all = await prisma.service.findMany({
      orderBy: { slug: "asc" },
      select: { slug: true, name: true, _count: { select: { questions: true } } },
    });
    console.log(`\n${all.length} services. Pass a slug to dump its tree.\n`);
    for (const s of all) {
      const n = s._count.questions;
      console.log(`  ${n > 0 ? `${String(n).padStart(2)}q` : "  –"}  ${s.slug.padEnd(38)} ${s.name}`);
    }
    console.log();
    return;
  }

  const service = await prisma.service.findUnique({
    where: { slug },
    include: {
      category: true,
      questions: {
        orderBy: { order: "asc" },
        include: {
          options: {
            orderBy: { order: "asc" },
            include: {
              referencedService: { select: { name: true, basePrice: true } },
            },
          },
        },
      },
    },
  });

  if (!service) {
    console.error(`No service with slug "${slug}".`);
    process.exitCode = 1;
    return;
  }

  // Resolve reroute targets by id — they aren't a Prisma relation.
  const rerouteIds = service.questions
    .flatMap((q) => q.options.map((o) => o.rerouteServiceId))
    .filter((v): v is string => !!v);
  const rerouteTargets = rerouteIds.length
    ? await prisma.service.findMany({
        where: { id: { in: rerouteIds } },
        select: { id: true, name: true, slug: true },
      })
    : [];
  const rerouteById = new Map(rerouteTargets.map((s) => [s.id, s]));
  const questionNumber = new Map(service.questions.map((q, i) => [q.id, i + 1]));

  const line = "=".repeat(72);
  console.log(`\n${line}\n${service.name}\n${line}`);
  console.log(`Category............. ${service.category.name}`);
  console.log(`Slug................. ${service.slug}`);
  console.log(`Booking type......... ${service.bookingType}`);
  console.log(`Standalone price..... ${money(service.basePrice)}`);
  console.log(`While We're There.... ${money(service.whileWeThereBasePrice)}`);
  console.log(`Starting price label. ${service.startingPriceLabel ?? "—"}`);
  console.log(`Estimated duration... ${service.estimatedMinutes ?? "—"} minutes`);
  console.log(`Technicians needed... ${service.requiresTechCount ?? 1}`);
  console.log(`Active............... ${service.active}`);
  if (service.disclaimer) console.log(`Service disclaimer... ${service.disclaimer}`);
  if (service.shortDescription) console.log(`\n${service.shortDescription}`);

  if (service.questions.length === 0) {
    console.log(`\nNo decision tree. Customers see the price above and book directly.\n`);
    return;
  }

  console.log(`\n${service.questions.length} question(s). Every customer starts at Q1.\n`);

  for (const [i, q] of service.questions.entries()) {
    console.log(`${"-".repeat(72)}`);
    console.log(`Q${i + 1}. ${q.prompt}`);
    console.log(`      key "${q.key}" · ${q.inputType}`);
    if (q.helpText) console.log(`      helper text: ${q.helpText}`);
    console.log();

    for (const o of q.options) {
      console.log(`   • "${o.label}"`);

      const bits: string[] = [ACTION_ENGLISH[o.routeAction] ?? o.routeAction];

      if (o.routeAction === "CONTINUE") {
        const target = o.nextQuestionId ? questionNumber.get(o.nextQuestionId) : undefined;
        bits.push(
          target
            ? `→ Q${target}`
            : o.nextQuestionId
              ? `→ BROKEN: points at a question not in this service`
              : `→ BROKEN: no next question set`
        );
      }
      if (o.routeAction === "REROUTE_SERVICE") {
        const t = o.rerouteServiceId ? rerouteById.get(o.rerouteServiceId) : undefined;
        bits.push(t ? `→ ${t.name}` : `→ BROKEN: no target service set`);
      }
      console.log(`     what happens: ${bits.join(" ")}`);

      if (o.referencedServiceId) {
        console.log(
          `     price effect: uses "${o.referencedService?.name}" live price ` +
            `(${money(o.referencedService?.basePrice)}), not a fixed amount`
        );
      } else if (o.priceModifierCents !== 0) {
        const sign = o.priceModifierCents > 0 ? "adds" : "subtracts";
        console.log(`     price effect: ${sign} ${money(Math.abs(o.priceModifierCents))}`);
      } else {
        console.log(`     price effect: none`);
      }

      if (o.requiredPhotoLabels.length > 0) {
        console.log(`     photos required (${o.requiredPhotoLabels.length}):`);
        for (const p of o.requiredPhotoLabels) console.log(`       - ${p}`);
      }
      if (o.routeAction === "PHOTO_REVIEW") {
        console.log(
          o.photosBlockBooking
            ? `     booking: BLOCKED until the office prices it`
            : `     booking: ALLOWED — price locked, photos are prep for the tech`
        );
        if (!o.photosBlockBooking && o.requiredPhotoLabels.length === 0) {
          console.log(`     WARNING: books with no photos at all`);
        }
      }
      if (o.disclaimer) console.log(`     disclaimer: ${o.disclaimer}`);
      console.log();
    }
  }

  // Any question nothing routes to is unreachable unless it's Q1.
  const reachable = new Set<string>([service.questions[0].id]);
  for (const q of service.questions) {
    for (const o of q.options) {
      if (o.routeAction === "CONTINUE" && o.nextQuestionId) reachable.add(o.nextQuestionId);
    }
  }
  const orphans = service.questions.filter((q) => !reachable.has(q.id));
  if (orphans.length > 0) {
    console.log(`${"-".repeat(72)}`);
    console.log(`WARNING — unreachable question(s): no answer routes here, so`);
    console.log(`customers will never see them:`);
    for (const q of orphans) console.log(`   Q${questionNumber.get(q.id)}. ${q.prompt}`);
    console.log();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
