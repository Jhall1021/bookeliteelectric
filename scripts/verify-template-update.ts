/**
 * A template update is visible, opt-in, structural, and never overwrites the
 * contractor — ADR-014.
 *
 * The half that actually matters. Creating Contractor #2's first price book is
 * straightforward; the architecture is designed for what happens six months
 * later, when the template learns something and the contractor has already
 * customized and priced their tree.
 */
import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { withThrowaway, provision } from "./_throwaway";

loadEnv();
const prisma = new PrismaClient();
const PROOF = "__template-proof-contractor__";
const KEY = "new-120v-outlet";

let pass = 0, fail = 0;
const ok = (c: boolean, l: string, d = "") => { c ? pass++ : fail++; console.log(`    ${c ? "ok  " : "FAIL"} ${l}${c ? "" : "\n           " + d}`); };
const run = (...a: string[]) => execFileSync("npx", ["tsx", ...a], { encoding: "utf8", stdio: "pipe" });

async function svcNow() {
  const c = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF }, select: { id: true } });
  return prisma.service.findFirstOrThrow({
    where: { contractorId: c.id, templateKey: KEY },
    include: { questions: { include: { options: true } } },
  });
}

async function main() {
  console.log("\nTEMPLATE UPDATE CYCLE\n");
  await withThrowaway(prisma, PROOF, "Throwaway Proof Electric", async () => {
  provision(PROOF, ["--service", KEY]);

  // The contractor edits one question's wording in their own words. This used
  // to arrive by accident, carried on a hand-made fixture nobody maintained —
  // which meant the conflict half of the suite was passing for a reason the
  // suite did not state. Now the edit is part of the scenario: a contractor
  // who has made the tree theirs is the whole premise of the conflict test.
  const c0 = await prisma.contractor.findUniqueOrThrow({ where: { slug: PROOF }, select: { id: true } });
  const edited = await prisma.question.updateMany({
    where: { key: "below_above_access", service: { contractorId: c0.id, templateKey: KEY } },
    data: { prompt: "Can we get to it from below or above without cutting drywall?" },
  });
  if (edited.count !== 1) throw new Error(`expected to customize exactly one question, updated ${edited.count}`);

  const base = "scripts/template-update.ts";
  const args = ["--contractor", PROOF, "--service", KEY];

  console.log("  THE CONTRACTOR CAN SEE THE UPDATE");
  const status = run(base, ...args, "--status");
  ok(/newest is v2/.test(status), "it reports a newer version exists");
  ok(/\+ question\s+\[afci_protection\]/.test(status), "the new question is offered");
  ok(/\+ option\s+outlet_run_distance\/over_40/.test(status), "the new answer option is offered");
  ok(/CONFLICT/.test(status), "the wording change they already customized is flagged as a CONFLICT");

  console.log("\n  NOTHING CHANGES BEFORE EXPLICIT ADOPTION");
  const before = await svcNow();
  run(base, ...args, "--status");
  run(base, ...args, "--status");
  const after = await svcNow();
  ok(before.questions.length === after.questions.length, "running --status repeatedly adds no questions");
  ok(before.questions.flatMap(q=>q.options).length === after.questions.flatMap(q=>q.options).length,
     "and no answer options");
  ok(after.questions.find(q=>q.key==="afci_protection") === undefined, "the offered question is still absent");

  console.log("\n  THE CONTRACTOR'S OWN EDIT IS NEVER OVERWRITTEN");
  const mine = after.questions.find((q) => q.key === "below_above_access")!;
  ok(/without cutting drywall/.test(mine.prompt), "their wording is intact before adoption");
  const skipped = run(base, ...args, "--adopt", "below_above_access");
  ok(/SKIPPED/.test(skipped) && /Yours is kept/.test(skipped), "adopting a conflicted change is refused, not merged");
  const stillMine = (await svcNow()).questions.find((q) => q.key === "below_above_access")!;
  ok(stillMine.prompt === mine.prompt, "and their wording is still exactly theirs afterwards",
     `it became "${stillMine.prompt}"`);

  console.log("\n  ADOPTION APPLIES STRUCTURE ONLY");
  // A published price and its approval are one fact now, so the fixture sets
  // both. It used to stamp an approval onto a service with no price, which the
  // database refuses — and which was never a state a real service could be in.
  await prisma.service.update({
    where: { id: after.id },
    data: { basePrice: 25000, publishedPriceApprovedAt: new Date(), materialCostResolved: true },
  });
  run(base, ...args, "--adopt", "afci_protection");
  const adopted = await svcNow();
  const q = adopted.questions.find((x) => x.key === "afci_protection");
  ok(!!q, "the new question now exists on the contractor's service");
  ok(q!.options.length === 3, `with its ${q?.options.length} answer options`);
  ok(q!.options.every((o) => o.priceModifierCents === 0), "no adopted option carries a price modifier");
  ok(q!.templateKey === "afci_protection" && q!.templateVersionId !== null, "the adopted rows record v2 provenance");

  console.log("\n  A NEW STRUCTURAL REQUIREMENT MAKES THE SERVICE UNRESOLVED AGAIN");
  ok(adopted.materialCostResolved === false, "materialCostResolved was reset to false by the adoption");
  ok(adopted.publishedPriceApprovedAt === null, "the approval was cleared");
  ok(adopted.basePrice === null,
     "and the PRICE came down with it — the service stops publishing a number nobody re-approved",
     `basePrice is still ${adopted.basePrice}`);

  console.log("\n  ONE ADOPTION DOES NOT ADOPT THE REST");
  const remaining = run(base, ...args, "--status");
  ok(/over_40/.test(remaining), "the un-adopted option is still merely offered");
  ok(adopted.questions.find((x) => x.key === "outlet_run_distance")!.options.every((o) => o.value !== "over_40"),
     "and is still absent from the contractor's tree");

  console.log("\n  ELITE IS UNTOUCHED BY ANY OF IT");
  const elite = await prisma.service.findFirstOrThrow({
    where: { slug: KEY, contractorId: { not: adopted.contractorId } },
    include: { questions: true },
  });
  ok(elite.questions.length === 7, `Elite still has ${elite.questions.length} questions, not the template's 8`);
  ok(elite.basePrice === 28000, "and its published price is unchanged");
  ok(elite.templateKey === null, "and it still carries no provenance");

  });

  console.log("\n" + "─".repeat(74));
  console.log(fail === 0 ? `\n  ${pass} checks passed.\n` : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
