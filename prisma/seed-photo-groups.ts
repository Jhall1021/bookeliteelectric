/**
 * Reusable photo groups.
 *
 * Run with: npx tsx prisma/seed-photo-groups.ts
 *
 * Every photo label the site asks for should come from one of these, rather
 * than being retyped inside each service's tree. Two reasons:
 *
 *   1. The panel safety instruction is mandatory on every panel photo. As a
 *      string copied by hand it survives only as long as whoever writes the
 *      next tree remembers it. As a property of the group it can't go missing.
 *
 *   2. Wording drifts. Four seed scripts already carried two different
 *      versions of the same panel-photo request.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

/**
 * Attached to any group containing a panel photo. Never write this sentence
 * into an individual label — a homeowner opening a dead front is the one
 * genuinely dangerous thing this site could ask someone to do.
 */
const PANEL_SAFETY =
  "Open the panel door only. Do not remove the panel cover or dead front, and don't expose any wiring inside.";

const GROUPS = [
  {
    key: "PANEL_PHOTOS",
    name: "Electrical panel",
    labels: [
      "Your electrical panel with the door open and the breakers visible",
      "A wider photo of the whole wall around the panel",
    ],
    safetyNote: PANEL_SAFETY,
    notes: "Panel capacity, breaker space, and what's around it.",
  },
  {
    key: "WORK_AREA_PHOTOS",
    name: "Work area",
    labels: [
      "The spot where the work is going",
      "A wider photo of the whole room or area",
    ],
    safetyNote: null,
    notes: "Close-up plus context. The wide shot is what catches surprises.",
  },
  {
    key: "ROUTE_PHOTOS",
    name: "Wiring route access",
    labels: [
      "The attic, basement, or drop-ceiling space the wire would travel through",
      "How that space is reached — the hatch, stairs, or door",
    ],
    safetyNote: null,
    notes: "Whether a route exists, and whether a technician can get into it.",
  },
  {
    key: "EXTERIOR_PHOTOS",
    name: "Exterior location",
    labels: [
      "Where the new exterior fixture or outlet should go",
      "A wider photo of that exterior wall",
    ],
    safetyNote: null,
    notes: "Wall finish and mounting conditions are usually visible in the wide shot.",
  },
  {
    key: "EQUIPMENT_PHOTOS",
    name: "Equipment or appliance",
    labels: [
      "The equipment or appliance, including its model or rating label if you can see it safely",
    ],
    safetyNote: "Only if you can read it without moving or dismantling anything.",
    notes: "Electrical requirements usually come straight off the label.",
  },
  {
    key: "FIXTURE_HEIGHT_PHOTOS",
    name: "Fixture height and access",
    labels: [
      "The fixture or work area, taken from floor level so we can judge the height",
      "What's directly below it — stairs, railing, or furniture that can't move",
    ],
    safetyNote: null,
    notes: "Handoff §7, for anything over 12 ft or with awkward access below.",
  },
];

async function main() {
  for (const g of GROUPS) {
    await prisma.photoGroup.upsert({
      where: { key: g.key },
      update: {
        name: g.name,
        labels: g.labels,
        safetyNote: g.safetyNote,
        notes: g.notes,
      },
      create: g,
    });
  }
  console.log(`  ✓ ${GROUPS.length} photo groups defined\n`);
  for (const g of GROUPS) {
    console.log(`  ${g.key}`);
    for (const l of g.labels) console.log(`     - ${l}`);
    if (g.safetyNote) console.log(`     ! ${g.safetyNote}`);
  }
  console.log(`
Reference these from answers via AnswerOptionPhotoGroup rather than writing
labels into requiredPhotoLabels. Existing trees still work — loose labels are
shown after any groups — and can be migrated as each is next touched.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
