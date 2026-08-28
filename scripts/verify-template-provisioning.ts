/**
 * The template provisions structure and never economics — ADR-014.
 *
 * The first-service acceptance test, mechanised. It exists because "we
 * successfully copied v1" is the easy half; the claim that matters is that
 * NONE of Elite's economics came with it, and that Elite is untouched.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { withThrowaway, provision } from "./_throwaway";

loadEnv();
const prisma = new PrismaClient();
const PROOF = "__template-proof-contractor__";
const KEY = "new-120v-outlet";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string, d = "") => { c ? pass++ : fail++; console.log(`    ${c ? "ok  " : "FAIL"} ${l}${c ? "" : "\n           " + d}`); };

async function main() {
  console.log("\nTEMPLATE PROVISIONING\n");
  const elite = await prisma.contractor.findFirstOrThrow({ where: { slug: { not: PROOF } }, select: { id: true } });
  await withThrowaway(prisma, PROOF, "Throwaway Proof Electric", async (proofId) => {
  provision(PROOF, ["--service", KEY]);
  const proof = { id: proofId };

  // Pinned to v1 deliberately. This lookup used to match on key alone, which
  // was indistinguishable from correct until the update suite's simulated v2
  // outlived a run — then it compared the v1 provisioning against the v2
  // template and reported a structure mismatch that was really a version mix-up.
  const v1 = await prisma.templateVersion.findUniqueOrThrow({
    where: { trade_version: { trade: "electrical", version: 1 } }, select: { id: true } });
  const tpl = await prisma.templateService.findFirstOrThrow({
    where: { key: KEY, templateVersionId: v1.id },
    include: { questions: { include: { options: true } }, materials: true },
  });
  const inc = { questions: { include: { options: true } }, materials: true } as const;
  const got = await prisma.service.findFirstOrThrow({ where: { contractorId: proof.id, slug: KEY }, include: inc });
  const src = await prisma.service.findFirstOrThrow({ where: { contractorId: elite.id, slug: KEY }, include: inc });

  console.log("  STRUCTURE MATCHES THE TEMPLATE");
  ok(got.questions.length === tpl.questions.length, `questions ${got.questions.length} = template ${tpl.questions.length}`);
  const tOpts = tpl.questions.flatMap((q) => q.options).length;
  const gOpts = got.questions.flatMap((q) => q.options).length;
  ok(gOpts === tOpts, `answer options ${gOpts} = template ${tOpts}`);
  ok(got.bookingType === tpl.bookingType && got.photoState === tpl.photoState, "bookingType and photoState carried");
  ok(got.requiresTechCount === tpl.requiresTechCount, "requiresTechCount carried (structural, not economic)");
  const tKeys = tpl.questions.map((q) => q.key).sort().join(",");
  const gKeys = got.questions.map((q) => q.key).sort().join(",");
  ok(tKeys === gKeys, "every question key present");

  console.log("\n  CANONICAL IDENTITY RESOLVES");
  const cc = await prisma.contractorCategory.findFirstOrThrow({ where: { contractorId: proof.id }, select: { canonicalCategoryId: true } });
  ok(cc.canonicalCategoryId === tpl.canonicalCategoryId, "category resolves to the same canonical concept as the template");
  const comps = await prisma.answerOptionComponent.count({ where: { answerOption: { question: { serviceId: got.id } } } });
  console.log(`    info  ${comps} component link(s) — unpriced components are deliberately not linked`);

  console.log("\n  NO ECONOMICS IN TEMPLATE STORAGE");
  const cols = await prisma.$queryRawUnsafe(
    `SELECT column_name FROM information_schema.columns WHERE table_name IN
     ('template_services','template_questions','template_answer_options')`) as { column_name: string }[];
  const econ = cols.map((c) => c.column_name).filter((c) =>
    /price|cost|labor|labour|hours|minutes|markup|multiplier|cents/i.test(c));
  ok(econ.length === 0, "no economic column exists on any template table", `found: ${econ.join(", ")}`);

  console.log("\n  NONE OF ELITE'S ECONOMICS COPIED");
  for (const [f, v] of [["basePrice", got.basePrice], ["whileWeThereBasePrice", got.whileWeThereBasePrice],
    ["fieldLaborHours", got.fieldLaborHours], ["wwtLaborHours", got.wwtLaborHours],
    ["primaryLaborUnits", got.primaryLaborUnits], ["addOnLaborUnits", got.addOnLaborUnits],
    ["estimatedMinutes", got.estimatedMinutes], ["materialCostCents", got.materialCostCents],
    ["permitAdminCents", got.permitAdminCents], ["otherDirectCostCents", got.otherDirectCostCents]] as [string, unknown][])
    ok(v === null, `${f} is null (not 0, not Elite's)`, `it is ${v}`);
  const gMods = got.questions.flatMap((q) => q.options).filter((o) => o.priceModifierCents !== 0);
  ok(gMods.length === 0, "no answer option carries a price modifier");
  const eliteLabels = new Set(src.questions.flatMap((q) => q.options).map((o) => o.label));
  const moneyLabels = got.questions.flatMap((q) => q.options).filter((o) => /\$\s?\d/.test(o.label));
  ok(moneyLabels.length === 0, "no answer label contains a price", moneyLabels.map((o) => o.label).join(" | "));
  const branded = got.questions.flatMap((q) => q.options).filter((o) => /\bElite\b/i.test(o.label));
  ok(branded.length === 0, "no answer label names the other contractor", branded.map((o) => o.label).join(" | "));
  void eliteLabels;

  console.log("\n  EVERY ECONOMIC DECISION IS UNRESOLVED, AND IT CANNOT PUBLISH");
  ok(got.unresolvedMaterialKeys.length > 0, `${got.unresolvedMaterialKeys.length} material(s) marked unresolved`);
  ok(got.materialCostResolved === false, "materialCostResolved is false");
  ok(got.active === false, "the service is not active");
  ok(got.publishedPriceApprovedAt === null, "no published price has been approved");

  console.log("\n  ELITE IS UNCHANGED");
  ok(src.basePrice === 28000 && src.fieldLaborHours === 1, `Elite still base=${src.basePrice} fieldHrs=${src.fieldLaborHours}`);
  ok(src.templateKey === null, "Elite's service carries no provenance — it was the SOURCE, not provisioned");
  ok(src.questions.length === 7, `Elite still has ${src.questions.length} questions`);

  console.log("\n  PROVENANCE IS A RECORD, NOT A DEPENDENCY");
  ok(got.templateKey === KEY && got.templateVersionId !== null, "the provisioned service records key and version");
  const q0 = got.questions[0];
  ok(q0.templateKey !== null, "questions carry provenance too");
  // The proof that it is not a dependency: the FK is nullable and nothing in
  // the app reads it. A contractor-authored row leaves it null and behaves
  // identically.
  const nullable = (await prisma.$queryRawUnsafe(
    `SELECT is_nullable FROM information_schema.columns WHERE table_name='services' AND column_name='templateVersionId'`
  ) as { is_nullable: string }[])[0];
  ok(nullable.is_nullable === "YES", "provenance is nullable — a contractor-authored service is not a second class");

  });

  console.log("\n" + "─".repeat(74));
  console.log(fail === 0 ? `\n  ${pass} checks passed.\n` : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
