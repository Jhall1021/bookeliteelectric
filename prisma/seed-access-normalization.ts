/**
 * Access-contract normalization + distance-banded switch legs.
 *
 *   npx tsx prisma/seed-access-normalization.ts
 *
 * TWO PROBLEMS, ONE ROOT CAUSE.
 *
 * Six questions across the catalog ask whether there's an open path to run
 * wiring, using three different answer vocabularies:
 *
 *   attic_access            has_access / no_access / unsure
 *   ceiling_access          accessible / finished / unsure
 *   below_above_access      has_access / no_access
 *   outlet_access           (its own)
 *   attic_basement_access   (its own)
 *   dedicated_route_access  unfinished_basement / drop_ceiling / ... (seven)
 *
 * Switch-leg components conditioned on the string "accessible", so an answer
 * of "has_access" never matched. New Ceiling Light, New Ceiling Fan and Fan
 * Replacing Existing Light have been silently sending every switch-leg route
 * to photo review instead of pricing it.
 *
 * The fix isn't renaming keys — the VALUES disagree too. Instead each ANSWER
 * declares what it means, and components condition on that meaning. Raw values
 * keep their detail, so a job sheet still says "unfinished basement" while the
 * pricing engine sees ACCESSIBLE.
 *
 * The distance bands then become possible: a switch leg's cost depends on
 * access AND run length, and both dimensions resolve from one classification
 * plus one distance answer.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Every access answer in the catalog, and what it means.
 *
 * Keyed by question key, then by answer value. Anything not listed keeps a
 * null classification and fails safe — components stay unmatched and the
 * route goes to review rather than guessing a variant.
 */
const CLASSIFICATIONS: Record<string, Record<string, "ACCESSIBLE" | "FINISHED" | "UNKNOWN">> = {
  attic_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  ceiling_access: { accessible: "ACCESSIBLE", finished: "FINISHED", unsure: "UNKNOWN" },
  below_above_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  outlet_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  attic_basement_access: { has_access: "ACCESSIBLE", no_access: "FINISHED", unsure: "UNKNOWN" },
  dedicated_route_access: {
    // Four ways of saying "there's an open path". Kept as separate answers so
    // the job sheet knows which — a drop ceiling means moving tiles, an attic
    // means a crawl — but all four price identically.
    unfinished_basement: "ACCESSIBLE",
    drop_ceiling: "ACCESSIBLE",
    accessible_attic: "ACCESSIBLE",
    combination: "ACCESSIBLE",
    finished_route: "FINISHED",
    no_accessible_route: "FINISHED",
    unsure: "UNKNOWN",
  },
  // The New 120V Outlet follow-up. Reached only after no_access, so "yes,
  // finished on both sides" confirms FINISHED rather than adding a third state.
  finished_space_both_sides: {
    finished_both_sides: "FINISHED",
    not_finished_both_sides: "UNKNOWN",
    unsure: "UNKNOWN",
  },
};

async function classifyAnswers() {
  let classified = 0;
  const unmapped: string[] = [];

  for (const [questionKey, values] of Object.entries(CLASSIFICATIONS)) {
    const questions = await prisma.question.findMany({
      where: { key: questionKey },
      include: { options: true, service: { select: { slug: true } } },
    });

    for (const q of questions) {
      for (const o of q.options) {
        const cls = values[o.value];
        if (!cls) {
          unmapped.push(`${q.service.slug}/${questionKey} = "${o.value}"`);
          continue;
        }
        await prisma.answerOption.update({
          where: { id: o.id },
          data: { accessClassification: cls },
        });
        classified++;
      }
    }
  }

  console.log(`  ✓ ${classified} access answer(s) classified`);
  if (unmapped.length) {
    console.log(`  ! ${unmapped.length} unmapped — these stay null and fail safe to review:`);
    for (const u of unmapped) console.log(`      ${u}`);
  }
}

async function main() {
  console.log("Normalizing the access contract...\n");
  await classifyAnswers();

  console.log(`
Components now condition on what an answer MEANS, not on how its question was
worded — so a switch-leg component resolves whether the customer answered
"ceiling_access = accessible" or "attic_access = has_access".

This script only classifies answers. The switch-leg questions and their
distance bands live in seed-lighting-control.ts, so re-running these in any
order can't break the wiring.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
