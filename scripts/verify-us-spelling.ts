/**
 * US spelling, in the source and in the database.
 *
 *   npx tsx scripts/verify-us-spelling.ts
 *
 * Price2Book sells to American contractors serving American homeowners. The
 * handoff specified US spelling and "Your labour." shipped to the live site
 * anyway, because a headline is exactly the kind of line nobody re-reads after
 * the first review.
 *
 * verify-marketing-homepage caught that ONE string, on ONE page, by asserting
 * the corrected copy was present. It could not catch the same word appearing
 * in a service description, an answer label, a disclaimer, or a comment that
 * someone later copies into customer-facing copy. This is the general form.
 *
 * TWO PLACES, because they fail differently. Source is where a mistake is
 * cheap to fix and easy to miss; the DATABASE is what a customer actually
 * reads, and a wrong spelling there is live until somebody notices.
 *
 * DELIBERATELY NARROW. Only words where the British form is unambiguously
 * wrong for this product and cannot appear as a legitimate identifier, quoted
 * proper noun or third-party name. Adding a word here is a decision to correct
 * every instance of it, so the list grows only when someone means that.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const prisma = new PrismaClient();

/** british -> american. Whole-word, case-insensitive. */
const FORBIDDEN: Record<string, string> = {
  labour: "labor",
};

const ROOTS = ["lib", "app", "components", "scripts", "prisma", "docs"];

/** Files whose job is to LIST these words. See the note at the filter below. */
const ENUMERATE_FORBIDDEN = [
  "scripts/verify-us-spelling.ts",
  "scripts/verify-marketing-homepage.ts",
];

let fail = 0;

function sourceScan() {
  console.log(`\n  SOURCE\n`);
  const files = execSync(
    `find ${ROOTS.join(" ")} -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.html' \\) 2>/dev/null || true`,
    { encoding: "utf8" }
  )
    .split("\n")
    .filter(Boolean)
    // Two files necessarily contain every word they forbid: this one, in its
    // map, and the marketing verifier, in its BRITISH regex. That is not an
    // exemption — it is the distinction between a word being the SUBJECT and
    // a word being a mistake.
    //
    // The distinction is load-bearing. A repo-wide replace once rewrote the
    // marketing regex from "labour" to "labor", turning a rule that caught
    // British spelling into one that rejected American spelling. It failed
    // loudly, which is the only reason it was noticed within the minute.
    .filter((f) => !ENUMERATE_FORBIDDEN.some((e) => f.endsWith(e)));

  for (const [bad, good] of Object.entries(FORBIDDEN)) {
    const re = new RegExp(`\\b${bad}\\b`, "gi");
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      text.split("\n").forEach((line, i) => {
        if (re.test(line)) hits.push(`${f}:${i + 1}  ${line.trim().slice(0, 70)}`);
        re.lastIndex = 0;
      });
    }
    if (hits.length) {
      fail++;
      console.log(`  ✗ "${bad}" appears ${hits.length} time(s) — should be "${good}"`);
      for (const h of hits.slice(0, 8)) console.log(`        ${h}`);
      if (hits.length > 8) console.log(`        ... and ${hits.length - 8} more`);
    } else {
      console.log(`  ✓ no "${bad}" in ${files.length} source file(s)`);
    }
  }
}

async function databaseScan() {
  console.log(`\n  CUSTOMER-VISIBLE DATABASE CONTENT\n`);

  // Every field a homeowner can read. Listed rather than discovered, because a
  // new customer-facing column should be a deliberate addition here too.
  const services = await prisma.service.findMany({
    select: { slug: true, name: true, shortDescription: true, disclaimer: true, startingPriceLabel: true },
  });
  const questions = await prisma.question.findMany({ select: { key: true, prompt: true, helpText: true } });
  const options = await prisma.answerOption.findMany({ select: { value: true, label: true, disclaimer: true } });

  const rows: { where: string; text: string }[] = [];
  for (const s of services)
    for (const [f, v] of Object.entries({
      name: s.name, shortDescription: s.shortDescription,
      disclaimer: s.disclaimer, startingPriceLabel: s.startingPriceLabel,
    })) if (typeof v === "string") rows.push({ where: `service ${s.slug}.${f}`, text: v });
  for (const q of questions)
    for (const [f, v] of Object.entries({ prompt: q.prompt, helpText: q.helpText }))
      if (typeof v === "string") rows.push({ where: `question ${q.key}.${f}`, text: v });
  for (const o of options)
    for (const [f, v] of Object.entries({ label: o.label, disclaimer: o.disclaimer }))
      if (typeof v === "string") rows.push({ where: `option ${o.value}.${f}`, text: v });

  for (const [bad, good] of Object.entries(FORBIDDEN)) {
    const re = new RegExp(`\\b${bad}\\b`, "i");
    const hits = rows.filter((r) => re.test(r.text));
    if (hits.length) {
      fail++;
      console.log(`  ✗ "${bad}" is LIVE in ${hits.length} customer-visible field(s) — should be "${good}"`);
      for (const h of hits.slice(0, 8)) console.log(`        ${h.where}`);
    } else {
      console.log(`  ✓ no "${bad}" in ${rows.length} customer-visible field(s)`);
    }
  }
}

async function main() {
  console.log(`\nUS SPELLING`);
  sourceScan();
  await databaseScan();
  console.log();
  if (fail) {
    console.log(`  ${fail} check(s) failed.\n`);
    process.exit(1);
  }
  console.log(`  American spelling, in the code and in what customers read.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
