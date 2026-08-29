/**
 * A retired component role stays unreachable — permanently.
 *
 * Retiring a role is a claim that nothing can select it. That claim decays:
 * an inactive service gets switched back on, a template revision reattaches an
 * old key, someone points an answer at the LEGACY JobComponent row instead of
 * the canonical one. Any of those silently revives a role whose economics were
 * deleted, and the symptom is a component that resolves to no price at all.
 *
 * THE LEGACY PATH IS THE ONE THAT MATTERS.
 *
 * AnswerOptionComponent can reference a pre-canonical JobComponent through
 * `componentId` INSTEAD of `canonicalComponentId`. A check that looks only at
 * the canonical side will call a reachable role dead. That was very nearly the
 * mistake in the migration this verifier generalises, so it is checked first
 * and named explicitly when it fires.
 *
 * Run in the deploy gate.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function main() {
  console.log("\nCOMPONENT RETIREMENT");

  const retired = await prisma.canonicalComponent.findMany({
    where: { active: false },
    select: { id: true, key: true },
  });

  console.log(`\n  ${retired.length} retired role(s)`);
  for (const r of retired) {
    const viaCanonical = await prisma.answerOptionComponent.findMany({
      where: { canonicalComponentId: r.id },
      select: { answerOption: { select: { label: true, question: { select: { service: { select: { slug: true, active: true } } } } } } },
    });
    const active = viaCanonical.filter((v) => v.answerOption.question.service.active);
    const inactive = viaCanonical.filter((v) => !v.answerOption.question.service.active);

    // The legacy row shares the key, and an option can point at it directly.
    const legacy = await prisma.jobComponent.findUnique({ where: { key: r.key }, select: { id: true } });
    const viaLegacy = legacy
      ? await prisma.answerOptionComponent.count({ where: { componentId: legacy.id } })
      : 0;

    const inTemplate = await prisma.templateAnswerOptionComponent.count({
      where: { canonicalComponentId: r.id },
    });

    ok(active.length === 0, `${r.key} — no ACTIVE service selects it`,
      `selected by: ${active.map((v) => v.answerOption.question.service.slug).join(", ")}`);
    ok(inactive.length === 0, `${r.key} — no INACTIVE service selects it`,
      `an inactive service can be switched back on: ${inactive.map((v) => v.answerOption.question.service.slug).join(", ")}`);
    ok(viaLegacy === 0, `${r.key} — nothing selects it through the LEGACY JobComponent row`,
      `${viaLegacy} answer option(s) reference componentId rather than canonicalComponentId`);
    ok(inTemplate === 0, `${r.key} — the template does not reattach it`,
      `${inTemplate} template answer option(s) still carry it; a new contractor would provision a dead role`);

    // Economics must not linger. Retiring while leaving a priced row is the
    // "latent configuration" this is meant to prevent.
    const configured = await prisma.contractorComponent.count({ where: { canonicalComponentId: r.id } });
    ok(configured === 0, `${r.key} — no contractor still carries its economics`,
      `${configured} ContractorComponent row(s) remain priced for a retired role`);
  }

  // Informational: a live role nothing selects is latent priced configuration.
  // Reported, not failed — it is untidy rather than incorrect.
  const live = await prisma.canonicalComponent.findMany({
    where: { active: true }, select: { id: true, key: true },
  });
  const orphans: string[] = [];
  for (const l of live) {
    const n = await prisma.answerOptionComponent.count({ where: { canonicalComponentId: l.id } });
    const t = await prisma.templateAnswerOptionComponent.count({ where: { canonicalComponentId: l.id } });
    const legacy = await prisma.jobComponent.findUnique({ where: { key: l.key }, select: { id: true } });
    const g = legacy ? await prisma.answerOptionComponent.count({ where: { componentId: legacy.id } }) : 0;
    if (n === 0 && t === 0 && g === 0) orphans.push(l.key);
  }
  console.log(`\n  ${orphans.length} active role(s) nothing currently selects` +
    (orphans.length ? ` — candidates for retirement, not a failure:\n      ${orphans.join("\n      ")}` : ""));

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
