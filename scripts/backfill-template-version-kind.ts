/**
 * Say what each published template version actually is.
 *
 *   npx tsx scripts/backfill-template-version-kind.ts            dry run
 *   npx tsx scripts/backfill-template-version-kind.ts --commit   writes
 *
 * NAMED, NOT INFERRED. A rule like "the one with the most services is the
 * snapshot" would be right for today's data and wrong the first time a trade
 * publishes a small complete catalog or a large update. Each version is
 * classified here by a human who looked at it, with the evidence written down.
 *
 * The script REFUSES to finish if any published version is left unclassified,
 * because a version that does not say what it is cannot be installed safely —
 * that is the whole defect this closes.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

/** trade/version -> what it is, and the evidence for saying so. */
const CLASSIFIED: Record<string, { kind: "SNAPSHOT" | "DELTA"; evidence: string }> = {
  "electrical/1": {
    kind: "SNAPSHOT",
    evidence:
      "75 services — the complete Electrical catalog, extracted from Elite's " +
      "live services. Every provisioned contractor to date came from this.",
  },
  "electrical/2": {
    kind: "DELTA",
    evidence:
      "One service (new-120v-outlet), notes read \"simulated: AFCI question + " +
      "insulation option + clearer wording\". It exists to exercise the " +
      "adoption path, and installing it as a catalog would give a contractor " +
      "a one-service business.",
  },
};

async function main() {
  console.log(`\nTEMPLATE VERSION KIND`);
  console.log(COMMIT ? `  COMMITTING\n` : `  DRY RUN — nothing is written.\n`);

  const versions = await prisma.templateVersion.findMany({
    select: { id: true, trade: true, version: true, kind: true, _count: { select: { services: true } } },
    orderBy: [{ trade: "asc" }, { version: "asc" }],
  });

  const unclassified: string[] = [];
  for (const v of versions) {
    const key = `${v.trade}/${v.version}`;
    const entry = CLASSIFIED[key];
    if (!entry) { unclassified.push(key); continue; }
    console.log(`  ${key.padEnd(16)} ${entry.kind.padEnd(9)} ${v._count.services} service(s)`);
    console.log(`     ${entry.evidence}`);
    if (COMMIT) {
      await prisma.templateVersion.update({ where: { id: v.id }, data: { kind: entry.kind } });
    }
  }

  if (unclassified.length) {
    console.error(`\n  ${unclassified.length} published version(s) nobody has classified:`);
    for (const k of unclassified) console.error(`      ${k}`);
    console.error(`  Add each to CLASSIFIED with the evidence. A version that does not`);
    console.error(`  say what it is cannot be installed safely.\n`);
    process.exit(1);
  }

  if (COMMIT) {
    // The column is required now, so the database itself refuses an
    // unclassified version. This ran while it was still nullable.
    console.log(`\n  All ${versions.length} published version(s) classified.\n`);
  } else {
    console.log(`\n  Rerun with --commit to apply.\n`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
