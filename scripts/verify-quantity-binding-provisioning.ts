/**
 * ROUTING V2 — a quantity binding must survive template extraction and
 * provisioning UNCHANGED.
 *
 * Why this is its own verifier: the template model is a deliberate SUBSET of
 * the live one, and both copies are explicit field lists rather than spreads
 * (lib/templateProvisioning.ts, scripts/extract-template-service.ts). A field
 * omitted from either list does not error — it silently becomes the static
 * quantity, which prices a 31-foot route as one foot.
 *
 * The failure this catches has no symptom at the point it happens.
 *
 * Fixtures are named with a run-unique prefix and removed at the end. Nothing
 * global is reset: this branch is disposable, not ownerless.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const prisma = new PrismaClient();
const RUN = `rv2qb-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function main() {
  console.log("\nROUTING V2 — QUANTITY BINDING SURVIVES PROVISIONING\n");
  console.log(`  fixture prefix: ${RUN}\n`);

  // The column must physically exist on BOTH tables before anything else is
  // worth asserting.
  const liveCol: { c: bigint }[] = await prisma.$queryRawUnsafe(
    `select count(*)::bigint as c from information_schema.columns
      where table_name = 'answer_option_components' and column_name = 'quantityAnswerKey'`);
  const tplCol: { c: bigint }[] = await prisma.$queryRawUnsafe(
    `select count(*)::bigint as c from information_schema.columns
      where table_name = 'template_answer_option_components' and column_name = 'quantityAnswerKey'`);
  ok(Number(liveCol[0].c) === 1, "the live model carries quantityAnswerKey");
  ok(Number(tplCol[0].c) === 1, "the template model carries it too — it is NOT inherited by analogy");

  // Both copy sites are field lists. Assert the field is named in each, so a
  // future edit that rebuilds either list cannot quietly drop it.
  const prov = readFileSync("lib/templateProvisioning.ts", "utf8");
  const extract = readFileSync("scripts/extract-template-service.ts", "utf8");
  ok(/quantityAnswerKey:\s*string \| null/.test(prov),
    "provisioning's typed component shape names it");
  ok(/quantityAnswerKey:\s*c\.quantityAnswerKey/.test(prov),
    "provisioning's create copies it");
  ok(/quantityAnswerKey:\s*c\.quantityAnswerKey/.test(extract),
    "template extraction copies it");

  // Round trip on real rows: write a binding on a template component, read it
  // back through the same column provisioning reads.
  const anyCanon = await prisma.canonicalComponent.findFirst({ select: { id: true, key: true } });
  const anyTplOpt = await prisma.templateAnswerOption.findFirst({ select: { id: true } });
  if (!anyCanon || !anyTplOpt) {
    ok(false, "the rehearsal branch has a canonical component and a template answer option to test with",
      `canonical=${!!anyCanon} templateOption=${!!anyTplOpt}`);
  } else {
    const created = await prisma.templateAnswerOptionComponent.create({
      data: {
        templateAnswerOptionId: anyTplOpt.id,
        canonicalComponentId: anyCanon.id,
        quantity: 1,
        quantityAnswerKey: `${RUN}_route_feet`,
      },
      select: { id: true, quantityAnswerKey: true, quantity: true },
    });
    ok(created.quantityAnswerKey === `${RUN}_route_feet`,
      "a template binding persists the key it was given", JSON.stringify(created));
    const read = await prisma.templateAnswerOptionComponent.findUniqueOrThrow({
      where: { id: created.id },
      select: { quantityAnswerKey: true, quantity: true },
    });
    ok(read.quantityAnswerKey === `${RUN}_route_feet` && read.quantity === 1,
      "and reads back identically — static quantity untouched alongside it", JSON.stringify(read));
    await prisma.templateAnswerOptionComponent.delete({ where: { id: created.id } });
    const gone = await prisma.templateAnswerOptionComponent.findUnique({ where: { id: created.id } });
    ok(gone === null, "fixture removed — this run owns only what it created");
  }

  // ── the authored range is part of the same contract ────────────────────
  //
  // resolveBoundQuantity refuses a bound NUMBER question that declares no
  // range. So a range lost in provisioning fails CLOSED rather than
  // underpricing — but it disables the contractor's service after provisioning,
  // which is its own kind of silent.
  console.log("\n  AUTHORED NUMERIC RANGE SURVIVES THE SAME LIFECYCLE\n");
  for (const [table, col] of [
    ["questions", "numberMin"], ["questions", "numberMax"],
    ["template_questions", "numberMin"], ["template_questions", "numberMax"],
  ] as const) {
    const r: { c: bigint }[] = await prisma.$queryRawUnsafe(
      `select count(*)::bigint as c from information_schema.columns
        where table_name = '${table}' and column_name = '${col}'`);
    ok(Number(r[0].c) === 1, `${table}.${col} exists`);
  }

  const src = {
    extract: readFileSync("scripts/extract-template-service.ts", "utf8"),
    prov: readFileSync("lib/templateProvisioning.ts", "utf8"),
    mod: readFileSync("prisma/_moduleHelpers.ts", "utf8"),
  };
  // COUNTED, NOT MERELY PRESENT. Each file carries the field at more than one
  // site — extraction has a shape AND a create, upsertQuestion has an update AND
  // a create — and a substring test lets one site cover for the other. Removing
  // either half is exactly the mutation that must fail here.
  const times = (re: RegExp, hay: string) => (hay.match(re) ?? []).length;
  ok(times(/numberMin: q\.numberMin/g, src.extract) === 2 && times(/numberMax: q\.numberMax/g, src.extract) === 2,
    "extraction carries the range at BOTH its sites (shape and template create)",
    `min=${times(/numberMin: q\.numberMin/g, src.extract)} max=${times(/numberMax: q\.numberMax/g, src.extract)}, expected 2 each`);
  ok(times(/numberMin: number \| null/g, src.prov) === 1 && times(/numberMin: qq\.numberMin/g, src.prov) === 1,
    "provisioning names it in the typed shape AND copies it in the create",
    `type=${times(/numberMin: number \| null/g, src.prov)} create=${times(/numberMin: qq\.numberMin/g, src.prov)}, expected 1 each`);
  ok(times(/numberMin: data\.numberMin/g, src.mod) === 2 && times(/numberMax: data\.numberMax/g, src.mod) === 2,
    "upsertQuestion carries it on BOTH paths (update and create)",
    `min=${times(/numberMin: data\.numberMin/g, src.mod)} max=${times(/numberMax: data\.numberMax/g, src.mod)}, expected 2 each`);
  ok(/inputType\?:/.test(src.mod),
    "and upsertQuestion can author a NUMBER question at all (it hard-coded SINGLE_SELECT)");

  // Round trip on real rows.
  const tplSvc = await prisma.templateService.findFirst({ select: { id: true } });
  if (!tplSvc) {
    ok(false, "the branch has a template service to round-trip a question through");
  } else {
    const tq = await prisma.templateQuestion.create({
      data: { templateServiceId: tplSvc.id, key: `${RUN}_route_feet`, prompt: "How many feet?",
              inputType: "NUMBER", order: 9999, numberMin: 1, numberMax: 300 },
      select: { id: true, numberMin: true, numberMax: true, inputType: true },
    });
    ok(tq.numberMin === 1 && tq.numberMax === 300 && tq.inputType === "NUMBER",
      "a template NUMBER question persists its authored range", JSON.stringify(tq));
    const back = await prisma.templateQuestion.findUniqueOrThrow({
      where: { id: tq.id }, select: { numberMin: true, numberMax: true } });
    ok(back.numberMin === 1 && back.numberMax === 300,
      "and reads back as 1\u2013300, the range provisioning must hand on", JSON.stringify(back));
    await prisma.templateQuestion.delete({ where: { id: tq.id } });
    ok((await prisma.templateQuestion.findUnique({ where: { id: tq.id } })) === null,
      "question fixture removed");
  }

  // ── numeric ROUTING predicates travel the same road ────────────────────
  console.log("\n  NUMERIC ROUTING PREDICATES SURVIVE THE SAME LIFECYCLE\n");
  for (const table of ["answer_options", "template_answer_options"] as const) {
    for (const col of ["numberAtLeast", "numberAtMost"] as const) {
      const r: { c: bigint }[] = await prisma.$queryRawUnsafe(
        `select count(*)::bigint as c from information_schema.columns
          where table_name = '${table}' and column_name = '${col}'`);
      ok(Number(r[0].c) === 1, `${table}.${col} exists`);
    }
  }
  // Counted per site, for the reason the earlier attempt failed: extraction has
  // a shape AND a create, and a substring test lets one cover for the other.
  ok(times(/numberAtLeast: o\.numberAtLeast/g, src.extract) === 2,
    "extraction carries the predicates at BOTH sites",
    `${times(/numberAtLeast: o\.numberAtLeast/g, src.extract)}, expected 2`);
  ok(times(/numberAtLeast: number \| null/g, src.prov) === 1 &&
     times(/numberAtLeast: o\.numberAtLeast/g, src.prov) === 1,
    "provisioning names them in the typed shape AND copies them in the create",
    `type=${times(/numberAtLeast: number \| null/g, src.prov)} create=${times(/numberAtLeast: o\.numberAtLeast/g, src.prov)}`);

  const tq2 = await prisma.templateQuestion.findFirst({ select: { id: true } });
  if (tq2) {
    const to = await prisma.templateAnswerOption.create({
      data: { templateQuestionId: tq2.id, value: `${RUN}_within`, label: "Within",
              routeAction: "CONTINUE", order: 9999, numberAtLeast: 1, numberAtMost: 20 },
      select: { id: true, numberAtLeast: true, numberAtMost: true },
    });
    ok(to.numberAtLeast === 1 && to.numberAtMost === 20,
      "a template option persists its authored range", JSON.stringify(to));
    await prisma.templateAnswerOption.delete({ where: { id: to.id } });
    ok((await prisma.templateAnswerOption.findUnique({ where: { id: to.id } })) === null,
      "option fixture removed");
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
