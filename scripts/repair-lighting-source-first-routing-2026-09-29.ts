/**
 * Replace the combined lighting-route question with source-first measured legs.
 *
 * Report only by default. Pass --apply to update route-complete new-light
 * services. Legacy lighting trees are intentionally left alone.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { findDanglingReferences, findUnreachableQuestions } from "../prisma/_moduleHelpers";
import { NUMERIC_UNKNOWN } from "../lib/numericRouteRanges";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTORS = ["elite-electric", "electrical-onboarding-test"] as const;
const TARGETS = [
  { slug: "new-ceiling-light", noun: "ceiling light" },
  { slug: "new-wall-sconce", noun: "wall sconce" },
  { slug: "recessed-lighting", noun: "recessed lighting" },
  { slug: "new-exterior-lighting-locations", noun: "exterior light" },
] as const;
const NEW_KEYS = [
  "extension_existing_switch_feet", "extension_existing_fixture_feet",
  "extension_power_to_switch_feet", "extension_switch_to_fixture_feet",
] as const;
const OLD_KEYS = ["extension_route_feet", "extension_switch_location", "extension_switch_extra_feet"] as const;
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
      for (const target of TARGETS) {
        const service = await db.service.findUniqueOrThrow({
          where: { contractorId_slug: { contractorId: contractor.id, slug: target.slug } },
          select: { id: true, questions: { select: { id: true, key: true, options: { select: { id: true, value: true } } } } },
        });
        const byKey = new Map(service.questions.map((question) => [question.key, question]));
        const control = byKey.get("extension_control");
        if (!control) {
          console.log(`${contractorSlug}/${target.slug}: legacy lighting tree skipped`);
          continue;
        }
        const newQuestions = NEW_KEYS.map((key) => byKey.get(key)).filter(Boolean);
        const oldQuestions = OLD_KEYS.map((key) => byKey.get(key)).filter(Boolean);
        if (newQuestions.length === NEW_KEYS.length) {
          assert.equal(oldQuestions.length, 0, `${contractorSlug}/${target.slug}: old and new route questions coexist`);
          assert.deepEqual(control.options.map((option) => option.value).sort(), ["existing_fixture", "existing_switch", "new_switch", "unsure"].sort());
          for (const question of newQuestions) assert.deepEqual(question!.options.map((option) => option.value).sort(), [NUMERIC_UNKNOWN, "__number__"].sort());
          console.log(`${contractorSlug}/${target.slug}: already source-first`);
          continue;
        }
        assert.equal(newQuestions.length, 0, `${contractorSlug}/${target.slug}: partial source-first tree`);
        assert.ok(byKey.has("extension_route_feet"), `${contractorSlug}/${target.slug}: missing old route question`);
        changes++;
        console.log(`${contractorSlug}/${target.slug}: will replace the combined route with source-first measured legs`);
        if (!apply) continue;

        const loadNoun = target.slug === "recessed-lighting" ? "the first recessed light" : `the new ${target.noun}`;
        const remainingLightsHelp = target.slug === "recessed-lighting"
          ? " Include the wiring that will continue from the first light to the remaining recessed lights."
          : "";
        await db.$transaction(async (tx) => {
          await tx.question.update({ where: { id: control.id }, data: {
            prompt: `Where will the new ${target.noun} get power and control?`,
            helpText: "Choose the existing switch or light fixture that will feed it. If neither will be used, choose a brand-new switch.",
            order: 3,
          } });
          for (const [key, order] of [["fixture_height", 8], ["work_area_below", 9], ["recessed_light_count", 10], ["extension_route_access", 11], ["extension_route_surface", 12], ["extension_route_clear", 13]] as const) {
            const question = byKey.get(key);
            if (question) await tx.question.update({ where: { id: question.id }, data: { order } });
          }
          const questionData = [
            ["extension_existing_switch_feet", `About how many feet is it from the existing switch to ${loadNoun}?`, `Measure along the wiring route rather than straight through the air.${remainingLightsHelp}`, 4],
            ["extension_existing_fixture_feet", `About how many feet is it from the existing light fixture to ${loadNoun}?`, `The new light will share the existing fixture's switch. Measure along the wiring route.${remainingLightsHelp}`, 5],
            ["extension_power_to_switch_feet", "About how many feet is it from the closest suitable power source to the new switch?", "The power source may be an outlet, switch box or another suitable circuit point. Measure along the wiring route.", 6],
            ["extension_switch_to_fixture_feet", `About how many feet is it from the new switch to ${loadNoun}?`, `Measure along the wiring route rather than straight through the air.${remainingLightsHelp}`, 7],
          ] as const;
          const created = new Map<string, string>();
          for (const [key, prompt, helpText, order] of questionData) {
            const question = await tx.question.create({ data: {
              serviceId: service.id, key, prompt, helpText, inputType: "NUMBER",
              numberAllowsDecimal: true, numberMin: 1, numberMax: 200, order,
            } });
            created.set(key, question.id);
          }

          const existing = byKey.get("extension_existing_location");
          if (existing) await tx.answerOption.updateMany({ where: { questionId: existing.id, value: "no" }, data: { nextQuestionId: control.id } });
          const wall = byKey.get("extension_wall_finish");
          if (wall) await tx.answerOption.updateMany({ where: { questionId: wall.id, value: "ordinary" }, data: { nextQuestionId: control.id } });
          const access = byKey.get("extension_route_access");
          const clear = byKey.get("extension_route_clear");
          assert.ok(access && clear, `${contractorSlug}/${target.slug}: missing route qualification questions`);
          await tx.answerOption.updateMany({ where: { questionId: access.id, value: "accessible" }, data: {
            routeAction: "RESOLVE_ADJUSTED", nextQuestionId: null, photosBlockBooking: false,
            requiredPhotoLabels: PHOTOS, approvedComponentPriceCents: null,
          } });
          await tx.answerOption.updateMany({ where: { questionId: clear.id, value: "clear" }, data: {
            routeAction: "RESOLVE_ADJUSTED", nextQuestionId: null, photosBlockBooking: false,
            requiredPhotoLabels: PHOTOS, approvedComponentPriceCents: null,
          } });
          await tx.answerOption.deleteMany({ where: { questionId: control.id } });
          await tx.answerOption.createMany({ data: [
            { questionId: control.id, label: "An existing wall switch", value: "existing_switch", routeAction: "CONTINUE", nextQuestionId: created.get("extension_existing_switch_feet")!, order: 1, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
            { questionId: control.id, label: "An existing light fixture", value: "existing_fixture", routeAction: "CONTINUE", nextQuestionId: created.get("extension_existing_fixture_feet")!, order: 2, requiredPhotoLabels: [], approvedComponentPriceCents: 0, disclaimer: "The new light will turn on and off with the existing fixture from the same switch." },
            { questionId: control.id, label: "Neither — install a brand-new switch", value: "new_switch", routeAction: "CONTINUE", nextQuestionId: created.get("extension_power_to_switch_feet")!, order: 3, requiredPhotoLabels: [], approvedComponentPriceCents: 0 },
            { questionId: control.id, label: "I'm not sure", value: "unsure", routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 4, requiredPhotoLabels: PHOTOS },
          ] });
          const nextByKey = new Map<string, string>([
            ["extension_existing_switch_feet", byKey.get("fixture_height")!.id],
            ["extension_existing_fixture_feet", byKey.get("fixture_height")!.id],
            ["extension_power_to_switch_feet", created.get("extension_switch_to_fixture_feet")!],
            ["extension_switch_to_fixture_feet", byKey.get("fixture_height")!.id],
          ]);
          for (const key of NEW_KEYS) {
            const questionId = created.get(key)!;
            await tx.answerOption.createMany({ data: [
              { questionId, label: "Route length in feet", value: "__number__", routeAction: "CONTINUE", nextQuestionId: nextByKey.get(key)!, order: 1, requiredPhotoLabels: [] },
              { questionId, label: "I'm not sure", value: NUMERIC_UNKNOWN, routeAction: "PHOTO_REVIEW", photosBlockBooking: true, order: 99, requiredPhotoLabels: [] },
            ] });
          }
          const oldIds = oldQuestions.map((question) => question!.id);
          await tx.answerOption.deleteMany({ where: { questionId: { in: oldIds } } });
          await tx.question.deleteMany({ where: { id: { in: oldIds } } });
        });
        assert.deepEqual(await findDanglingReferences(db, service.id), []);
        assert.deepEqual(await findUnreachableQuestions(db, service.id), []);
      }
    }
    console.log(`${apply ? "applied" : "report"}: ${changes} lighting tree(s) need source-first routing`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
