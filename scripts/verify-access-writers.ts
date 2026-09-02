/**
 * MULTI-WRITER ACCESS BASELINE — G1.
 *
 * Successive refinement within one access slot is LEGITIMATE. Eight active
 * Electrical services do it deliberately: below_above_access establishes
 * ACCESSIBLE, then finished_space_both_sides narrows it to FINISHED, and the
 * narrower answer is the true one.
 *
 * So this does not ban the pattern. It makes it VISIBLE AND REVIEWED.
 *
 *   an existing, reviewed (service, slot) refinement   passes
 *   a NEW one                                          FAILS until reviewed
 *
 * The failure mode this exists for: refinement is indistinguishable, from the
 * outside, from a second question accidentally answering into a slot somebody
 * else already owns. The first is a design decision; the second is the bug that
 * repriced five routes when scoped access first tried to refuse it. Only a
 * person can tell them apart, so a new pattern stops the build and asks.
 *
 * SAME DISCIPLINE AS ADR-021. A failing run is never authority to re-record the
 * baseline. Red means either somebody introduced a refinement nobody reviewed,
 * or somebody reviewed one and has not recorded it — and those are different
 * facts with different fixes. Recording is deliberate:
 *
 *   npx tsx scripts/verify-access-writers.ts --record
 *
 * Reads only, unless --record is passed.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { PRIMARY_SLOT, parseAccessSlot, type AccessSlot } from "../lib/accessSlots";

const BASELINE = "docs/migration/access-writer-baseline.json";

/** One reviewed refinement: a service, a slot, and the questions that write it. */
type WriterRecord = {
  slug: string;
  slot: AccessSlot;
  /** Question keys that can establish this slot, sorted. */
  questions: string[];
};

const prisma = new PrismaClient();

/**
 * Every (service, slot) a contractor's catalog can write more than once.
 *
 * Counted over QUESTIONS rather than options: two options on ONE question are
 * alternative answers to the same question and can never both apply, so they
 * are not a refinement. Two questions both able to write one slot is the shape
 * that matters.
 */
async function currentWriters(): Promise<WriterRecord[]> {
  const contractors = await prisma.contractor.findMany({
    where: { active: true },
    select: { id: true, slug: true },
    orderBy: { slug: "asc" },
  });

  const out: WriterRecord[] = [];
  for (const c of contractors) {
    const services = await prisma.service.findMany({
      where: { contractorId: c.id, active: true },
      orderBy: { slug: "asc" },
      include: {
        questions: {
          orderBy: { order: "asc" },
          include: { options: true },
        },
      },
    });

    for (const s of services) {
      // slot -> the question keys that can establish it
      const bySlot = new Map<AccessSlot, string[]>();
      for (const q of s.questions) {
        const slots = new Set<AccessSlot>();
        for (const o of q.options) {
          if (!o.accessClassification) continue;
          slots.add(parseAccessSlot(o.accessSlot) ?? PRIMARY_SLOT);
        }
        for (const slot of slots) {
          const list = bySlot.get(slot) ?? [];
          list.push(q.key);
          bySlot.set(slot, list);
        }
      }
      for (const [slot, questions] of bySlot) {
        if (questions.length > 1) {
          out.push({ slug: s.slug, slot, questions: [...questions].sort() });
        }
      }
    }
  }

  // Deterministic, so the baseline diff is about content rather than ordering.
  return out.sort((a, b) => a.slug.localeCompare(b.slug) || a.slot.localeCompare(b.slot));
}

const key = (w: WriterRecord) => `${w.slug}::${w.slot}`;

function load(): WriterRecord[] | null {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, "utf8")) as WriterRecord[];
}

async function main() {
  const record = process.argv.includes("--record");
  console.log("\nMULTI-WRITER ACCESS BASELINE\n");

  const current = await currentWriters();

  if (record) {
    writeFileSync(BASELINE, JSON.stringify(current, null, 2) + "\n");
    console.log(`  recorded ${current.length} reviewed refinement(s) to ${BASELINE}`);
    for (const w of current) console.log(`    ${w.slug}  ${w.slot}  <- ${w.questions.join(", ")}`);
    console.log();
    await prisma.$disconnect();
    return;
  }

  const baseline = load();
  if (!baseline) {
    console.log(`  no baseline at ${BASELINE}.`);
    console.log(`  Review the list below, then record it deliberately with --record.\n`);
    for (const w of current) console.log(`    ${w.slug}  ${w.slot}  <- ${w.questions.join(", ")}`);
    console.log();
    await prisma.$disconnect();
    process.exit(1);
  }

  const known = new Map(baseline.map((w) => [key(w), w]));
  const live = new Map(current.map((w) => [key(w), w]));

  const added = current.filter((w) => !known.has(key(w)));
  const removed = baseline.filter((w) => !live.has(key(w)));
  const changed = current.filter((w) => {
    const b = known.get(key(w));
    return b && b.questions.join(",") !== w.questions.join(",");
  });

  console.log(`  ${baseline.length} reviewed refinement(s) in the baseline`);
  console.log(`  ${current.length} present in the live catalog\n`);

  // A NEW pattern is the failure. It is not wrong — it is unreviewed, and the
  // difference between a deliberate refinement and an accidental collision is
  // not visible from here.
  if (added.length) {
    console.log("  FAIL  refinement introduced without review:");
    for (const w of added) console.log(`          ${w.slug}  ${w.slot}  <- ${w.questions.join(", ")}`);
    console.log("        If deliberate, review it and re-record with --record.");
  }

  // A CHANGED writer set is equally unreviewed: the pair was approved with a
  // particular set of questions, and a different set is a different decision.
  if (changed.length) {
    console.log("  FAIL  reviewed refinement now written by different questions:");
    for (const w of changed) {
      const b = known.get(key(w))!;
      console.log(`          ${w.slug}  ${w.slot}`);
      console.log(`            was: ${b.questions.join(", ")}`);
      console.log(`            now: ${w.questions.join(", ")}`);
    }
  }

  // A removed pattern is reported and does NOT fail. Simplifying a tree to one
  // writer is a good outcome, and failing on it would punish the fix.
  if (removed.length) {
    console.log("  note  reviewed refinement no longer present (not a failure):");
    for (const w of removed) console.log(`          ${w.slug}  ${w.slot}`);
  }

  const failed = added.length + changed.length;
  if (failed === 0) {
    console.log("  ok    every access refinement in the catalog has been reviewed");
  }
  console.log();
  await prisma.$disconnect();
  if (failed > 0) process.exit(1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
