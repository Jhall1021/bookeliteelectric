/**
 * ROUTING V2 — New 120V Outlet becomes a CONSUMER of the shared routing layer.
 *
 * What is deliberately NOT touched: the load and source qualification at the top
 * of the tree. `outlet_load_type` and `outlet_power_source` are safety gates —
 * they keep a dryer circuit, an EV charger and a new panel run out of ordinary
 * extension routing — and Routing V2 has nothing to say about them. Only a
 * qualified ordinary extension reaches the new routing.
 *
 * What is replaced is everything downstream of "is there an accessible route":
 *
 *     below_above_access ─ has_access ─> outlet_run_distance   (under_10 / 10_to_20 / over_20 / over_40)
 *                        └ no_access ──> finished_space_both_sides -> outlet_finish_ack -> same bands
 *
 * That model priced 19 ft and 21 ft as different KINDS of work, sent an
 * accessible 50 ft run to review, and — visible in the live tree — resolved
 * `over_40` while refusing `over_20`, which is not a rule anyone would write on
 * purpose. It is the clearest argument for the replacement.
 *
 * Now:
 *
 *     below_above_access ─ has_access ─> [ACCESSIBLE CONCEALED]
 *                        └ no_access ──> outlet_install_method
 *                                          ├ concealed ─> [FINISHED WALL]
 *                                          ├ surface ───> [SURFACE MOUNTED]
 *                                          └ unsure ────> review
 *
 * The retired questions are REWIRED OUT, not deleted. Their rows survive, so
 * historical answers still resolve against the questions they were given for,
 * and the graph verifier proves they are unreachable rather than assuming it.
 */
import { PrismaClient } from "@prisma/client";
import { upsertQuestion } from "./_moduleHelpers";
import { attachSurfaceRouteModule } from "./_surfaceRouteModule";
import { attachAccessibleConcealedModule } from "./_concealedRouteModules";
import { attachFinishedWallModule } from "./_finishedWallModule";
import { eliteService } from "./_serviceTargets";
import { assertNoBaseMaterial } from "../lib/materialCost";

const prisma = new PrismaClient();

export const OUTLET_V2_KEYS = { method: "outlet_install_method" } as const;

/** Questions the V1 routing model owned. Retired from the active path. */
export const RETIRED_OUTLET_QUESTIONS = [
  "outlet_run_distance",        // the access x distance band itself
  "finished_space_both_sides",  // only existed to reach that band
  "device_on_exterior_wall",    // a fork whose three answers all went to the band
  "outlet_finish_ack",          // acknowledgement of a scope the band implied
] as const;

const REVIEW_PHOTOS = ["A wide photo of the area between the power source and the new outlet"];

export const OUTLET_SLUG = "new-120v-outlet";

/**
 * Migrate ONE contractor's outlet. The caller names whose.
 *
 * This took no argument and resolved the service by slug alone, which four
 * contractors share. It migrated BrightPath's copy and left Elite's — the one
 * carrying the V1 assembly this exists to retire — untouched. The service id
 * is a parameter now so the canonical-template phase can reuse the same body
 * without the function guessing its own target.
 */
export async function migrateOutletToV2(db: PrismaClient, serviceId: string) {
  const svc = { id: serviceId };

  // The shared modules, each authored onto this service. Same code, same
  // component ids as the direct services — which is what makes the equivalence
  // proof structural rather than coincidental.
  const surface = await attachSurfaceRouteModule(db, svc.id, "OUTLET", 20);
  const accessible = await attachAccessibleConcealedModule(db, svc.id, "OUTLET", 10);
  const finished = await attachFinishedWallModule(db, svc.id, "OUTLET", 30);

  // The one genuinely new question: concealed, surface, or don't know.
  const qMethod = await upsertQuestion(db, svc.id, {
    key: OUTLET_V2_KEYS.method,
    prompt: "How would you like the wiring run?",
    helpText:
      "Hidden in the wall means we make small openings and patch them. Surface-mounted means the " +
      "wiring runs in a slim channel fixed to the wall — no wall damage, but you can see it.",
    inputType: "SINGLE_SELECT",
    order: 5,
  });
  await db.answerOption.deleteMany({ where: { questionId: qMethod.id } });
  await db.answerOption.createMany({
    data: [
      { questionId: qMethod.id, label: "Hidden inside the wall", value: "concealed",
        routeAction: "CONTINUE", nextQuestionId: finished.entryQuestionId, order: 1, requiredPhotoLabels: [] },
      { questionId: qMethod.id, label: "Surface-mounted channel on the wall", value: "surface",
        routeAction: "CONTINUE", nextQuestionId: surface.entryQuestionId, order: 2, requiredPhotoLabels: [] },
      { questionId: qMethod.id, label: "I'm not sure — help me decide", value: "unsure",
        routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: REVIEW_PHOTOS },
    ],
  });

  // Re-point the access question. has_access now enters the shared accessible
  // route directly; no_access asks how they want it run.
  const qAccess = await db.question.findFirstOrThrow({
    where: { serviceId: svc.id, key: "below_above_access" }, select: { id: true } });
  await db.answerOption.updateMany({
    where: { questionId: qAccess.id, value: "has_access" },
    data: { routeAction: "CONTINUE", nextQuestionId: accessible.entryQuestionId, rerouteServiceId: null },
  });
  await db.answerOption.updateMany({
    where: { questionId: qAccess.id, value: "no_access" },
    data: { routeAction: "CONTINUE", nextQuestionId: qMethod.id, rerouteServiceId: null },
  });

  // RETIRE, DO NOT DELETE. Nothing points at these any more; their rows and
  // their historical meaning stay exactly as they were. Options are cleared so
  // no legacy component can be emitted even if a path were somehow found, and
  // the graph verifier proves unreachability rather than trusting this comment.
  for (const key of RETIRED_OUTLET_QUESTIONS) {
    const q = await db.question.findFirst({ where: { serviceId: svc.id, key }, select: { id: true } });
    if (!q) continue;
    await db.answerOptionComponent.deleteMany({ where: { answerOption: { questionId: q.id } } });
    await db.answerOption.deleteMany({ where: { questionId: q.id } });
    await db.question.update({ where: { id: q.id }, data: { order: 900 } });
  }

  /**
   * THE UNCONDITIONAL ASSEMBLY GOES WITH THE MODEL THAT JUSTIFIED IT.
   *
   * V1 billed every outlet for a fixed 25 ft of 14/2 -- RECEPTACLE_STANDARD x1,
   * BOX_OLD_WORK x1, WALL_PLATE x1, WIRE_14_2 x25, CONSUMABLES_SMALL x1 -- and
   * `seed-materials.ts` says so in its own comment: "A run, not a device. 25 ft
   * of cable is a 10 ft route with slack." That was the standard-run model, and
   * it is the thing Routing V2 replaces. An 8 ft run and a 50 ft run were
   * charged the same cable either way, which is the whole argument.
   *
   * Under V2 the quantity is bound to a measured answer on the route components
   * instead, so an unconditional service-level allowance would double-count the
   * moment component economics arrive.
   *
   * NOTHING CANONICAL IS DELETED. The materials still exist and Elite's costs
   * for them are untouched -- WIRE_14_2 is still 50 c/ft. What is retired is the
   * unconditional COMBINATION, which is a claim about this service rather than
   * a fact about the parts.
   *
   * Asserted rather than left implied: deleting the rows alone would leave the
   * cached $21.50 sitting on the service, which is exactly how the bathroom fan
   * kept $11 of retired duct connector and went on pricing it.
   */
  await assertNoBaseMaterial(
    db,
    svc.id,
    "Routing V2: distance determines quantity. The V1 assembly charged a fixed " +
      "25 ft run on every outlet regardless of the actual route; quantity is now " +
      "bound to a measured answer on the route components. Canonical materials " +
      "and Elite's costs for them are unchanged."
  );

  return { surface, accessible, finished, method: qMethod.id };
}

/** Elite's copy — the proving tenant for the Routing V2 real-service proof. */
export async function migrateEliteOutletToV2(db: PrismaClient = prisma) {
  const target = await eliteService(db, OUTLET_SLUG);
  const out = await migrateOutletToV2(db, target.id);
  console.log(`  target: ${target.contractorSlug}/${target.slug} (${target.id})`);
  return { ...out, target };
}

if (process.argv[1] && process.argv[1].endsWith("seed-new-outlet-v2.ts")) {
  migrateEliteOutletToV2()
    .then(async () => { console.log("\n  New 120V Outlet migrated to Routing V2.\n"); await prisma.$disconnect(); })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
