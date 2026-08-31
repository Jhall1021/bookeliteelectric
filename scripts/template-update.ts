/**
 * Detecting and adopting a template update — ADR-014.
 *
 * The hard half. Provisioning a new contractor is straightforward; the real
 * question is what happens six months later when the template learns that a
 * scope question should be better, without overwriting what a contractor has
 * already customized or priced.
 *
 *   --status   what changed between the provisioned version and the newest.
 *              READ ONLY. Nothing is written, ever, by this mode.
 *   --adopt <templateKey>   apply ONE change, explicitly.
 *
 * Adoption may write STRUCTURE only. A newly adopted answer option arrives
 * with no price modifier and marks the service unresolved — the template can
 * say what to ask, never what to charge.
 *
 * Where the contractor has already changed the same thing, the change is
 * reported as a CONFLICT and adoption keeps theirs.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const prisma = new PrismaClient();
const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

type Change =
  | { kind: "question-added"; key: string; prompt: string }
  | { kind: "option-added"; questionKey: string; value: string; label: string }
  | { kind: "wording-changed"; questionKey: string; from: string; to: string; conflict: boolean };

async function detect(contractorSlug: string, serviceKey: string) {
  const c = await prisma.contractor.findUniqueOrThrow({ where: { slug: contractorSlug }, select: { id: true } });
  const svc = await prisma.service.findFirstOrThrow({
    where: { contractorId: c.id, templateKey: serviceKey },
    include: { questions: { include: { options: true } } },
  });
  const from = await prisma.templateVersion.findUniqueOrThrow({ where: { id: svc.templateVersionId! } });
  // The newest version that actually CONTAINS this service — not simply the
  // newest version.
  //
  // This used to take the highest version number and then demand the service
  // be in it, which crashed with P2025 for every service a delta does not
  // touch: 74 of Electrical's 75 today. A delta is changes to some services,
  // so "has there been an update to THIS service" is a question about the
  // service, not about the trade's version counter.
  const newest = await prisma.templateService.findFirst({
    where: { key: serviceKey, templateVersion: { trade: from.trade } },
    orderBy: { templateVersion: { version: "desc" } },
    include: { templateVersion: true, questions: { include: { options: true } } },
  });
  if (!newest) return { svc, from, latest: from, changes: [] as Change[] };
  const latest = newest.templateVersion;
  if (latest.id === from.id) return { svc, from, latest, changes: [] as Change[] };

  const newer = newest;
  const older = await prisma.templateService.findFirstOrThrow({
    where: { templateVersionId: from.id, key: serviceKey },
    include: { questions: { include: { options: true } } },
  });

  const changes: Change[] = [];
  for (const q of newer.questions) {
    const was = older.questions.find((x) => x.key === q.key);
    if (!was) { changes.push({ kind: "question-added", key: q.key, prompt: q.prompt }); continue; }
    if (was.prompt !== q.prompt) {
      // Has the contractor already edited this wording themselves? If so the
      // update is a conflict, not an improvement to apply over the top.
      const mine = svc.questions.find((x) => x.key === q.key);
      changes.push({ kind: "wording-changed", questionKey: q.key, from: was.prompt, to: q.prompt,
                     conflict: !!mine && mine.prompt !== was.prompt });
    }
    for (const o of q.options) {
      if (!was.options.find((x) => x.value === o.value))
        changes.push({ kind: "option-added", questionKey: q.key, value: o.value, label: o.label });
    }
  }
  return { svc, from, latest, changes };
}

async function main() {
  const contractorSlug = arg("contractor")!;
  const serviceKey = arg("service")!;
  const { svc, from, latest, changes } = await detect(contractorSlug, serviceKey);

  console.log(`\nTEMPLATE UPDATE  ${serviceKey}`);
  console.log(`  provisioned from v${from.version}, newest is v${latest.version}\n`);

  if (process.argv.includes("--status")) {
    if (!changes.length) { console.log("  nothing to adopt\n"); await prisma.$disconnect(); return; }
    for (const ch of changes) {
      if (ch.kind === "question-added") console.log(`  + question  [${ch.key}] "${ch.prompt}"`);
      if (ch.kind === "option-added") console.log(`  + option    ${ch.questionKey}/${ch.value} "${ch.label}"`);
      if (ch.kind === "wording-changed") console.log(`  ~ wording   [${ch.questionKey}]${ch.conflict ? "  CONFLICT — you have already changed this; yours is kept" : ""}\n      was: "${ch.from}"\n      now: "${ch.to}"`);
    }
    console.log(`\n  ${changes.length} change(s) available. Nothing has been applied.\n`);
    await prisma.$disconnect(); return;
  }

  const adopt = arg("adopt");
  if (!adopt) { console.error("  --status or --adopt <key>"); process.exit(1); }

  const newer = await prisma.templateService.findFirstOrThrow({
    where: { templateVersionId: latest.id, key: serviceKey },
    include: { questions: { include: { options: true } } },
  });

  let applied = 0;
  for (const ch of changes) {
    const id = ch.kind === "question-added" ? ch.key
      : ch.kind === "option-added" ? `${ch.questionKey}/${ch.value}` : ch.questionKey;
    if (id !== adopt) continue;

    if (ch.kind === "wording-changed" && ch.conflict) {
      console.log(`  SKIPPED [${ch.questionKey}] — you have already changed this wording. Yours is kept.\n`);
      await prisma.$disconnect(); return;
    }
    if (ch.kind === "question-added") {
      const tq = newer.questions.find((q) => q.key === ch.key)!;
      const q = await prisma.question.create({
        data: { serviceId: svc.id, key: tq.key, prompt: tq.prompt, helpText: tq.helpText,
                inputType: tq.inputType, order: tq.order, templateVersionId: latest.id, templateKey: tq.key },
      });
      for (const o of tq.options) {
        await prisma.answerOption.create({
          data: { questionId: q.id, value: o.value, label: o.label, routeAction: o.routeAction, order: o.order,
                  requiredPhotoLabels: o.requiredPhotoLabels, photosBlockBooking: o.photosBlockBooking,
                  illustrationUrls: o.illustrationUrls,
                  // No price modifier. Structure only.
                  templateVersionId: latest.id, templateKey: `${tq.key}/${o.value}` },
        });
      }
      applied++;
    }
    if (ch.kind === "option-added") {
      const tq = newer.questions.find((q) => q.key === ch.questionKey)!;
      const to = tq.options.find((o) => o.value === ch.value)!;
      const mine = await prisma.question.findFirstOrThrow({ where: { serviceId: svc.id, key: ch.questionKey } });
      await prisma.answerOption.create({
        data: { questionId: mine.id, value: to.value, label: to.label, routeAction: to.routeAction, order: to.order,
                requiredPhotoLabels: to.requiredPhotoLabels, photosBlockBooking: to.photosBlockBooking,
                illustrationUrls: to.illustrationUrls,
                templateVersionId: latest.id, templateKey: `${ch.questionKey}/${to.value}` },
      });
      applied++;
    }
    if (ch.kind === "wording-changed") {
      await prisma.question.updateMany({ where: { serviceId: svc.id, key: ch.questionKey }, data: { prompt: ch.to } });
      applied++;
    }
  }

  if (!applied) { console.log(`  no change matched "${adopt}"\n`); await prisma.$disconnect(); return; }

  // A structural addition can introduce a new economic decision. The service
  // goes back to unresolved rather than publishing something nobody priced.
  //
  // THE PRICE COMES DOWN WITH THE APPROVAL. Clearing only the stamp left the
  // old price on the storefront — the service kept publishing exactly what
  // this comment says it must not, because until the price/approval pair
  // became a database invariant nothing read the stamp. The customer now sees
  // no price until the contractor prices what the adoption added, which is
  // what "unresolved again" was always supposed to mean.
  await prisma.service.update({
    where: { id: svc.id },
    data: { materialCostResolved: false, publishedPriceApprovedAt: null, basePrice: null },
  });
  console.log(`  adopted "${adopt}" — structure only. The service is unresolved again ` +
              `until you price what it added.\n`);
  await prisma.$disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
