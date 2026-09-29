/**
 * Narrow production repair for the recessed-lighting new-switch branch.
 *
 * Report only by default. Pass --apply to add the measured switch-placement
 * questions and replace the old blocking photo-review exit.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const PHOTOS = [
  "A wide photo showing the existing control or power source and the proposed new location",
  "A photo showing the wall or ceiling along the proposed wiring route",
];

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required");
  const identity = await probe(databaseUrl);
  if (identity.endpoint !== EXPECTED_ENDPOINT || identity.lineage !== PRODUCTION_LINEAGE || identity.markerEndpoint !== EXPECTED_ENDPOINT) {
    throw new Error(`refusing ${identity.endpoint}: production lineage/marker guard failed`);
  }

  const apply = process.argv.includes("--apply");
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    let changes = 0;
    for (const contractorSlug of CONTRACTORS) {
      const contractor = await db.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
      const service = await db.service.findUniqueOrThrow({
        where: { contractorId_slug: { contractorId: contractor.id, slug: "recessed-lighting" } },
        select: { id: true, questions: { select: { id: true, key: true, options: { select: { id: true, value: true, routeAction: true, nextQuestionId: true } } } } },
      });
      const controlRows = service.questions.filter((row) => row.key === "extension_control");
      if (controlRows.length !== 1) {
        assert.equal(contractorSlug, "elite-electric", `${contractorSlug}: unexpected recessed-light question lineage`);
        assert.deepEqual(service.questions.map((row) => row.key).sort(), [
          "below_above_access", "ceiling_access", "finished_space_both_sides", "fixture_finish_ack",
          "fixture_height", "lighting_control", "lighting_dimmer_upgrade", "recessed_light_count",
          "switch_leg_distance", "switch_near_power", "switchleg_finish_ack", "work_area_below",
        ]);
        console.log(`${contractorSlug}/recessed-lighting: legacy measured-switch flow is not part of this repair`);
        continue;
      }
      const control = controlRows[0];
      const newSwitchRows = control.options.filter((row) => row.value === "new_switch");
      assert.equal(newSwitchRows.length, 1, `${contractorSlug}: expected one new_switch answer`);
      const newSwitch = newSwitchRows[0];
      const locations = service.questions.filter((row) => row.key === "extension_switch_location");
      const extraFeet = service.questions.filter((row) => row.key === "extension_switch_extra_feet");
      assert.ok(locations.length <= 1 && extraFeet.length <= 1, `${contractorSlug}: duplicate recessed-light switch-route questions`);
      const repaired = locations.length === 1 && extraFeet.length === 1
        && newSwitch.routeAction === "CONTINUE" && newSwitch.nextQuestionId === locations[0].id;
      const oldShape = locations.length === 0 && extraFeet.length === 0
        && newSwitch.routeAction === "PHOTO_REVIEW" && newSwitch.nextQuestionId === null;
      assert.ok(repaired || oldShape, `${contractorSlug}: unexpected recessed-light switch branch`);
      if (repaired) {
        assert.deepEqual(extraFeet[0].options.map((row) => row.value).sort(), [NUMERIC_UNKNOWN, "__number__"].sort());
        console.log(`${contractorSlug}/recessed-lighting: already repaired`);
        continue;
      }

      changes++;
      console.log(`${contractorSlug}/recessed-lighting: will price same-route and measured-detour switch locations`);
      if (!apply) continue;

      await db.$transaction(async (tx) => {
        await tx.question.update({
          where: { id: control.id },
          data: { helpText: "A new switch can be priced here. If it sits along the wiring route, the package includes a 5-foot drop; if it is somewhere else, enter only the additional detour footage." },
        });
        const location = await tx.question.create({ data: {
          serviceId: service.id, key: "extension_switch_location", prompt: "Where should the new switch be installed?",
          helpText: "Choose along the route when the switch can sit between the existing power source and the recessed-light layout.",
          inputType: "SINGLE_SELECT", order: 11,
        } });
        const feet = await tx.question.create({ data: {
          serviceId: service.id, key: "extension_switch_extra_feet", prompt: "About how many additional feet of wire will the different switch location add?",
          helpText: "Enter only the extra detour beyond the direct route from the power source through the recessed-light layout.",
          inputType: "NUMBER", numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order: 12,
        } });
        await tx.answerOption.update({ where: { id: newSwitch.id }, data: {
          routeAction: "CONTINUE", nextQuestionId: location.id, photosBlockBooking: false,
          requiredPhotoLabels: [], approvedComponentPriceCents: 0,
        } });
        await tx.answerOption.createMany({ data: [
          { questionId: location.id, label: "Along the same route between the power source and recessed lights", value: "along_route", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 1, requiredPhotoLabels: PHOTOS },
          { questionId: location.id, label: "Somewhere else — the wiring must detour to reach it", value: "different_location", routeAction: "CONTINUE", nextQuestionId: feet.id, photosBlockBooking: false, order: 2, requiredPhotoLabels: [] },
          { questionId: location.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 3, requiredPhotoLabels: PHOTOS },
          { questionId: feet.id, label: "Additional switch-route length in feet", value: "__number__", routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, order: 1, requiredPhotoLabels: PHOTOS },
          { questionId: feet.id, label: "I'm not sure", value: NUMERIC_UNKNOWN, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 99, requiredPhotoLabels: [] },
        ] });
      });
      assert.deepEqual(await findDanglingReferences(db, service.id), []);
      assert.deepEqual(await findUnreachableQuestions(db, service.id), []);
    }
    console.log(`${apply ? "applied" : "report"}: ${changes} recessed-light switch tree(s) need repair`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
