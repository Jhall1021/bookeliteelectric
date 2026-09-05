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
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const prisma = new PrismaClient();

/**
 * british -> american, matched as SUBSTRINGS rather than whole words.
 *
 * "colours", "centred", "mislabelled", "greyscale" and "recolour" all have to
 * be caught, and a whole-word rule misses every one of them. Each stem here
 * was checked to make sure it cannot appear inside an unrelated English word —
 * which is not theoretical: an earlier draft of the sweep included "tyre", and
 * "tyre" is a substring of "properTYREsult".
 */
const FORBIDDEN: Record<string, string> = {
  labour: "labor",
  catalogue: "catalog",
  colour: "color",
  behaviour: "behavior",
  licence: "license",
  labelled: "labeled",
  labelling: "labeling",
  centre: "center",
  aluminium: "aluminum",
  grey: "gray",
  fibre: "fiber",
  cancelled: "canceled",
  cancelling: "canceling",
  storey: "story",
  itemise: "itemize",
  neighbour: "neighbor",
  recognise: "recognize",
  organisation: "organization",
  organise: "organize",
  defence: "defense",
  honour: "honor",
  customise: "customize",
  summarise: "summarize",
  optimise: "optimize",
  analyse: "analyze",
  modelling: "modeling",
  travelling: "traveling",
};

const ROOTS = ["lib", "app", "components", "scripts", "prisma", "docs"];

/** Files whose job is to LIST these words. See the note at the filter below. */
const ENUMERATE_FORBIDDEN = [
  "scripts/verify-us-spelling.ts",
  "scripts/verify-marketing-homepage.ts",
  "scripts/_spellingScan.ts",
];

/**
 * Recorded snapshots, not prose. flat-rate-baseline.json holds service slugs
 * and resolved prices captured at a point in time; rewriting a word inside a
 * recorded proof would quietly change what it proves.
 */
const RECORDED = ["docs/migration/flat-rate-baseline.json"];

let fail = 0;

function sourceScan() {
  console.log(`\n  SOURCE\n`);
  const files = execSync(
    `find ${ROOTS.join(" ")} -type f \\( -name '*.ts' -o -name '*.tsx' -o -name '*.md' -o -name '*.html' -o -name '*.json' \\) 2>/dev/null || true`,
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
    .filter((f) => !ENUMERATE_FORBIDDEN.some((e) => f.endsWith(e)))
    .filter((f) => !RECORDED.some((r) => f.endsWith(r)));

  /**
   * American words that CONTAIN a British one.
   *
   * "analyses" is the correct American plural of analysis and contains
   * "analyse"; a substring match calls it a misspelling. Reported as seven
   * failures in a design document that was spelled correctly, which is how a
   * spelling gate teaches people to ignore it.
   *
   * Masked before matching rather than added to a per-file allow list: the
   * word is right wherever it appears, and the next document to use it should
   * not have to be excused.
   */
  //
  // No word boundary: it also appears inside identifiers a schema legitimately
  // uses, like `pricesight_analyses`, where the preceding underscore is a word
  // character and a \b would not match. "analyses" is correct wherever it
  // appears, so it is masked wherever it appears.
  /**
   * FROZEN PROOF RECORDS. Not an exclusion — a pin.
   *
   * These three files record live proofs as they were run. Earlier review
   * required them to stay byte-identical, so their British spellings cannot be
   * corrected without destroying the guarantee that makes them evidence.
   *
   * The excuse is therefore as narrow as it can be made: THIS file, THIS term,
   * THIS many occurrences, and THIS blob. The blob hash is checked first — edit
   * a frozen record at all, for any reason, and the gate fails and says so. A
   * new violation in one of them cannot hide either, because the count is
   * pinned too. Nothing about `docs/evidence/` as a directory is excused: a new
   * file there is scanned like any other.
   */
  const FROZEN_RECORDS: Record<string, { blob: string; allow: Record<string, number> }> = {
    "docs/evidence/live-proofs/PROOF-MATRIX.md": {
      blob: "de493ff1ab792f1ca8c8a4b3a2066eb0f108a239", allow: { defence: 1 },
    },
    "docs/evidence/live-proofs/DEFERRED-DEBT.md": {
      blob: "f3e3cddfb49bc4df70cbe21dd1d658393caff7af", allow: { behaviour: 2 },
    },
    "docs/evidence/live-proofs/IMPLEMENTATION-DELTA.md": {
      blob: "6d4c753441ba2cf8678f68de486b97f00cdc5848", allow: { behaviour: 2 },
    },
  };
  for (const [file, pin] of Object.entries(FROZEN_RECORDS)) {
    if (!existsSync(file)) {
      fail++; console.log(`  \u2717 frozen record ${file} is missing — the pin cannot be checked`); continue;
    }
    const actual = execSync(`git hash-object ${JSON.stringify(file)}`, { encoding: "utf8" }).trim();
    if (actual !== pin.blob) {
      fail++;
      console.log(`  \u2717 frozen record CHANGED: ${file}`);
      console.log(`        pinned ${pin.blob}`);
      console.log(`        actual ${actual}`);
      console.log(`        These files are evidence. If the change is intended, re-pin it deliberately.`);
    }
  }

  const AMERICAN_CONTAINING_BRITISH = [/analyses/gi];
  const mask = (line: string) =>
    AMERICAN_CONTAINING_BRITISH.reduce((l, re) => l.replace(re, (m) => "·".repeat(m.length)), line);

  for (const [bad, good] of Object.entries(FORBIDDEN)) {
    const re = new RegExp(bad, "gi");
    const hits: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      const fileHits: string[] = [];
      text.split("\n").forEach((line, i) => {
        if (re.test(mask(line))) fileHits.push(`${f}:${i + 1}  ${line.trim().slice(0, 70)}`);
        re.lastIndex = 0;
      });
      // A frozen record forgives EXACTLY the occurrences pinned for it —
      // not at most that many. `<=` accepted fewer, so removing a violation and
      // deliberately re-pinning the blob would have passed silently: the pin is
      // a statement about what the record contains, and a record that lost a
      // word is as changed as one that gained it.
      const allowed = FROZEN_RECORDS[f]?.allow[bad] ?? 0;
      if (allowed > 0) {
        if (fileHits.length !== allowed) {
          fail++;
          console.log(
            `  \u2717 frozen record ${f} has "${bad}": ${fileHits.length} occurrence(s), exactly ${allowed} pinned`
          );
        }
        continue;
      }
      hits.push(...fileHits);
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
    const re = new RegExp(bad, "i");
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

/**
 * The CANONICAL catalog — the copy every future contractor installs.
 *
 * Scanned separately from the live scan above because the two can disagree,
 * and when they do it is always this way round: "storey" reached a homeowner
 * on a brand-new contractor's storefront while the live scan was green,
 * because Elite's rows had been remediated in place years earlier and the
 * template they were copied from never was. A fix applied to one tenant looks
 * finished and reintroduces itself on the next install.
 *
 * Template text is trade knowledge, so it is checked for every trade at once
 * rather than per-trade.
 */
async function canonicalScan() {
  console.log(`\n  CANONICAL TEMPLATE CONTENT\n`);

  const questions = await prisma.templateQuestion.findMany({
    select: { key: true, prompt: true, helpText: true },
  });
  const options = await prisma.templateAnswerOption.findMany({
    select: { value: true, label: true, labelPattern: true },
  });

  const rows: { where: string; text: string }[] = [];
  for (const q of questions)
    for (const [f, v] of Object.entries({ prompt: q.prompt, helpText: q.helpText }))
      if (typeof v === "string") rows.push({ where: `template question ${q.key}.${f}`, text: v });
  for (const o of options)
    for (const [f, v] of Object.entries({ label: o.label, labelPattern: o.labelPattern }))
      if (typeof v === "string") rows.push({ where: `template option ${o.value}.${f}`, text: v });

  for (const [bad, good] of Object.entries(FORBIDDEN)) {
    const re = new RegExp(bad, "i");
    const hits = rows.filter((r) => re.test(r.text));
    if (hits.length) {
      fail++;
      console.log(`  ✗ "${bad}" is in ${hits.length} CANONICAL field(s) — every new contractor would install it — should be "${good}"`);
      for (const h of hits.slice(0, 8)) console.log(`        ${h.where}`);
    } else {
      console.log(`  ✓ no "${bad}" in ${rows.length} canonical field(s)`);
    }
  }
}

async function main() {
  console.log(`\nUS SPELLING`);
  sourceScan();
  await databaseScan();
  await canonicalScan();
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
