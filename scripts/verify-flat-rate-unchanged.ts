/**
 * Adding T&M did not change what a flat-rate customer pays — ADR-018.
 *
 * The engine gained an accumulator and the flow gained a branch. Both sit on
 * the path every existing Elite booking already takes, so "it should be fine"
 * is not good enough: the flat-rate route is replayed through the REAL engine
 * and its resolved prices are compared against a recorded baseline.
 *
 * Reads only. Safe to run any time.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { loadEnv } from "./_env";
import { startConfiguration, applyBranch, customerPrice } from "../lib/pricing";

loadEnv();
const prisma = new PrismaClient();
const BASELINE = "docs/migration/flat-rate-baseline.json";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/**
 * Walks each service's tree taking the FIRST answer at every question, which
 * is deterministic and exercises components, access classification and
 * conditional selection without needing a script per service.
 */
async function replay() {
  const c = await prisma.contractor.findFirstOrThrow({ where: { slug: "elite-electric" }, select: { id: true } });
  const services = await prisma.service.findMany({
    where: { contractorId: c.id, active: true },
    orderBy: { slug: "asc" },
    include: {
      questions: { orderBy: { order: "asc" }, include: {
        options: { orderBy: { order: "asc" }, include: {
          components: { include: { canonicalComponent: true } } } } } },
    },
  });
  const own = await prisma.contractorComponent.findMany({ where: { contractorId: c.id } });
  const byCanonical = new Map(own.map((o) => [o.canonicalComponentId, o]));

  const out: Record<string, unknown> = {};
  for (const s of services) {
    let cfg = startConfiguration(s);
    const answers: Record<string, string> = {};
    for (const q of s.questions) {
      const o = q.options[0];
      if (!o) continue;
      answers[q.key] = o.value;
      cfg = applyBranch(cfg, {
        overrideFieldLaborHours: o.overrideFieldLaborHours,
        overrideEstimatedMinutes: o.overrideEstimatedMinutes,
        overrideTechCount: o.overrideTechCount,
        addFieldLaborHours: o.addFieldLaborHours,
        addMaterialCostCents: o.addMaterialCostCents,
        addScheduleMinutes: o.addScheduleMinutes,
        accessClassification: o.accessClassification,
        priceModifierCents: o.priceModifierCents,
        approvedComponentPriceCents: o.approvedComponentPriceCents,
        components: o.components.map((sel) => {
          const c2 = byCanonical.get(sel.canonicalComponentId!);
          return {
            quantity: sel.quantity,
            conditionAccessClass: sel.conditionAccessClass,
            conditionAnswerKey: sel.conditionAnswerKey,
            conditionAnswerValue: sel.conditionAnswerValue,
            component: {
              key: sel.canonicalComponent?.key ?? "?",
              customerFacingLabel: sel.canonicalComponent?.customerFacingLabel ?? null,
              approvedPriceCents: c2?.approvedPriceCents ?? null,
              addFieldLaborHours: c2?.addFieldLaborHours ?? null,
              addMaterialCostCents: c2?.addMaterialCostCents ?? null,
              addScheduleMinutes: c2?.addScheduleMinutes ?? null,
              addTechCount: c2?.addTechCount ?? null,
            },
          };
        }),
      } as never, answers);
    }
    const priced = customerPrice(cfg, s.basePrice ?? null);
    // ONLY the customer-visible outcome is compared, so the same baseline can
    // be recorded from the tree BEFORE the T&M work and checked against the
    // tree after it. `addedCrewHours` is deliberately excluded: it does not
    // exist on the older engine, and the whole claim is that the flat-rate
    // total does not depend on it.
    out[s.slug] = {
      total: priced.totalCents ?? null,
      awaiting: cfg.awaitingComponentApproval,
      components: cfg.components.map((x) => `${x.key}x${x.quantity}`).sort(),
    };
  }
  return out;
}

async function main() {
  console.log("\nFLAT RATE — UNCHANGED BY T&M\n");
  const now = await replay();
  const count = Object.keys(now).length;

  if (!existsSync(BASELINE) || process.argv.includes("--record")) {
    writeFileSync(BASELINE, JSON.stringify(now, null, 2) + "\n");
    console.log(`  Recorded a baseline for ${count} services at ${BASELINE}.`);
    console.log(`  Re-run without --record to compare against it.\n`);
    await prisma.$disconnect();
    return;
  }

  const before = JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, unknown>;
  const changed: string[] = [];
  for (const [slug, v] of Object.entries(now)) {
    const b = (before as Record<string, unknown>)[slug];
    if (JSON.stringify(b) !== JSON.stringify(v))
      changed.push(`${slug}: ${JSON.stringify(b)} -> ${JSON.stringify(v)}`);
  }
  ok(Object.keys(before).length === count,
    `the same ${count} services resolve`, `${Object.keys(before).length} before`);
  ok(changed.length === 0,
    `every flat-rate route resolves to the same price and scope (${count} services)`,
    changed.slice(0, 5).join("\n         "));

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
