import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { WORK_AREA_BELOW_CHOICES, workAreaBelowAnswerOptions } from "../prisma/_workAreaBelowOptions";

const options = workAreaBelowAnswerOptions({
  questionId: "question",
  continueOption: { routeAction: "CONTINUE", nextQuestionId: "next" },
  reviewPhotoLabels: ["wide photo"],
});

assert.deepEqual(options.map((option) => option.label), [
  "A normal level floor",
  "A stairway or stairwell, or furniture/built-ins that can't be moved",
  "I'm not sure",
]);
assert.deepEqual(options.map((option) => option.value), ["level_floor", "obstructed", "unsure"]);
assert.deepEqual(options.map((option) => option.order), [1, 2, 3]);
assert.equal(options[0].routeAction, "CONTINUE");
assert.equal(options[0].nextQuestionId, "next");
assert.equal(options[1].routeAction, "PHOTO_REVIEW");
assert.equal(options[2].routeAction, "PHOTO_REVIEW");
assert.deepEqual(WORK_AREA_BELOW_CHOICES.unsure, { label: "I'm not sure", value: "unsure" });

for (const file of [
  "prisma/seed-height-access.ts",
  "prisma/seed-route-complete-extensions.ts",
]) {
  const source = readFileSync(file, "utf8");
  assert.ok(source.includes("workAreaBelowAnswerOptions"), `${file} uses the shared three-choice authoring helper`);
  for (const retired of [
    "An open room or entryway",
    "An open garage bay",
    "A loft or balcony edge",
    "Furniture or built-ins that can't easily be moved",
    'value: "open_room_level"',
    'value: "loft_balcony"',
    'value: "immovable_furniture"',
    'value: "other_unsure"',
  ]) {
    assert.ok(!source.includes(retired), `${file} no longer authors retired choice: ${retired}`);
  }
}

const garageOpener = readFileSync("prisma/seed-garage-opener-v2.ts", "utf8");
assert.ok(!garageOpener.includes("work_area_below"), "garage-door opener skips work-area-below because a level garage floor is implicit");

console.log("WORK AREA BELOW — applicable authoring paths use three choices; garage-door opener correctly skips the redundant question");
