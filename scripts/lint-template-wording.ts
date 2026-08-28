/**
 * No contractor branding and no economics in canonical template content.
 *
 * Permanent. Runs in the deploy gate against whatever is in the template
 * tables, because the extractor's checks only protect the moment of
 * extraction — this protects everything that has ever been written there,
 * including by hand through the wording manifest.
 *
 * The template is the one artefact Price2Book claims is trade knowledge. A
 * price or a company name inside it is a claim we do not have the right to
 * make on every contractor's behalf.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();

/** Money in any of the forms a human writes it. */
const MONEY = /\$\s?[\d,]+(\.\d+)?|\b\d+\s?(dollars?|bucks)\b|\bfrom \$/i;
/**
 * Known contractor names. Grows as contractors are extracted from; a name is
 * only detectable if we know to look for it, which is why the wording manifest
 * carries a human's reason rather than relying on this alone.
 */
const BRANDS = /\bElite(\s+Electric)?\b/i;

let fail = 0;
const bad = (what: string, where: string, text: string) => {
  fail++;
  console.log(`  ✗ ${what}\n      ${where}\n      "${text.slice(0, 96)}"`);
};

async function main() {
  console.log(`\nTEMPLATE WORDING\n`);

  const services = await prisma.templateService.findMany({
    include: {
      templateVersion: { select: { trade: true, version: true } },
      questions: { include: { options: true } },
    },
  });

  if (services.length === 0) {
    console.log(`  No template content yet. Nothing to lint.\n`);
    await prisma.$disconnect();
    return;
  }

  let checked = 0;
  for (const s of services) {
    const v = `${s.templateVersion.trade} v${s.templateVersion.version}`;
    const texts: [string, string][] = [
      [`${v} ${s.key}.name`, s.name],
      ...(s.shortDescription ? [[`${v} ${s.key}.shortDescription`, s.shortDescription] as [string, string]] : []),
    ];
    for (const q of s.questions) {
      texts.push([`${v} ${s.key}/${q.key}.prompt`, q.prompt]);
      if (q.helpText) texts.push([`${v} ${s.key}/${q.key}.helpText`, q.helpText]);
      for (const o of q.options) texts.push([`${v} ${s.key}/${q.key}/${o.value}.label`, o.label]);
    }
    for (const [where, text] of texts) {
      checked++;
      if (MONEY.test(text)) bad("a price is in canonical template copy", where, text);
      if (BRANDS.test(text)) bad("a contractor is named in canonical template copy", where, text);
    }
  }
  console.log(`  ${checked} piece(s) of template copy checked across ${services.length} service(s)`);

  // The manifest must justify itself: an entry with no reason is a decision
  // nobody recorded.
  const manifest = "prisma/template/electrical.wording.json";
  if (existsSync(manifest)) {
    const m = JSON.parse(readFileSync(manifest, "utf8")) as {
      entries: Record<string, { label?: string; reason?: string }>;
    };
    for (const [key, e] of Object.entries(m.entries)) {
      if (!e.reason || e.reason.trim().length < 20)
        bad("wording entry has no recorded reason", `${manifest} :: ${key}`, e.label ?? "");
      if (e.label && MONEY.test(e.label))
        bad("hand-authored wording contains a price", `${manifest} :: ${key}`, e.label);
      if (e.label && BRANDS.test(e.label))
        bad("hand-authored wording names a contractor", `${manifest} :: ${key}`, e.label);
    }
    console.log(`  ${Object.keys(m.entries).length} hand-authored wording entr(y/ies), each with a reason`);
  }

  console.log("\n" + "─".repeat(74));
  if (fail) {
    console.log(`\n  ${fail} problem(s). Canonical template content must be trade knowledge —\n` +
                `  not one contractor's prices, and not one contractor's name.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  Template copy is free of prices and contractor names.\n`);
  }
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
