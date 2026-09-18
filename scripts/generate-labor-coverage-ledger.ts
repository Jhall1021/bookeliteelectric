/**
 * Generate the trade-agnostic labor coverage ledger for one contractor/trade.
 *
 * Read-only. It never changes labor, prices, trees, contractor data or audit
 * evidence. The contractor supplies the live runtime composition; the checked-
 * in audit supplies published evidence and adjudication context.
 *
 *   npx tsx scripts/generate-labor-coverage-ledger.ts \
 *     --contractor elite-electric --trade electrical \
 *     --out docs/audits/electrical-labor-coverage-ledger
 */
import { PrismaClient } from "@prisma/client";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  buildLaborCoverageLedger,
  renderLaborCoverageMarkdown,
  type AuditTask,
  type LaborComponent,
  type LaborService,
  type LaborSnapshot,
} from "../lib/laborCoverage";

type Flags = {
  contractor: string;
  trade: string;
  out: string;
  snapshot: string | null;
  audit: string | null;
  includeUnclassified: boolean;
};

function parseFlags(argv: string[]): Flags {
  const value = (name: string) => {
    const i = argv.indexOf(name);
    if (i < 0 || !argv[i + 1] || argv[i + 1].startsWith("--")) throw new Error(`${name} requires a value`);
    return argv[i + 1];
  };
  return {
    contractor: value("--contractor"),
    trade: value("--trade"),
    out: value("--out"),
    snapshot: argv.includes("--snapshot") ? value("--snapshot") : null,
    audit: argv.includes("--audit") ? value("--audit") : null,
    includeUnclassified: argv.includes("--include-unclassified"),
  };
}

type AuditFile = { tasks: AuditTask[]; evidenceObservations: unknown[] };

export async function loadLaborSnapshot(
  db: PrismaClient,
  contractorSlug: string,
  trade: string,
  includeUnclassified = false,
): Promise<LaborSnapshot> {
  const contractor = await db.contractor.findUnique({
    where: { slug: contractorSlug },
    select: { id: true },
  });
  if (!contractor) throw new Error(`contractor "${contractorSlug}" was not found`);

  const [rawServices, rawComponents] = await Promise.all([
    db.service.findMany({
      where: {
        contractorId: contractor.id,
        ...(includeUnclassified ? { OR: [{ tradeKey: trade }, { tradeKey: null }] } : { tradeKey: trade }),
      },
      orderBy: [{ sortOrder: "asc" }, { slug: "asc" }],
      select: {
        slug: true, name: true, tradeKey: true, active: true, offered: true,
        bookingType: true, pricingMethod: true, fieldLaborHours: true,
        questions: {
          orderBy: [{ order: "asc" }, { key: "asc" }],
          select: {
            id: true, key: true, inputType: true, order: true,
            numberMin: true, numberMax: true,
            options: {
              orderBy: [{ order: "asc" }, { value: "asc" }],
              select: {
                id: true, value: true, routeAction: true, nextQuestionId: true,
                photosBlockBooking: true, overrideFieldLaborHours: true,
                addFieldLaborHours: true, accessClassification: true, accessSlot: true,
                components: {
                  select: {
                    quantity: true, quantityAnswerKey: true,
                    conditionAnswerKey: true, conditionAnswerValue: true,
                    conditionAccessClass: true, conditionAccessSlot: true,
                    canonicalComponent: {
                      select: {
                        key: true, name: true, referenceLaborHours: true,
                        referenceLaborUnit: true, referenceLaborStatus: true,
                        _count: { select: { laborEvidence: true } },
                        contractorComponents: {
                          where: { contractorId: contractor.id },
                          select: { addFieldLaborHours: true, active: true },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    }),
    db.canonicalComponent.findMany({
      orderBy: { key: "asc" },
      select: {
        key: true, name: true, referenceLaborHours: true,
        referenceLaborUnit: true, referenceLaborStatus: true,
        _count: { select: { laborEvidence: true } },
        contractorComponents: {
          where: { contractorId: contractor.id },
          select: { addFieldLaborHours: true, active: true },
        },
      },
    }),
  ]);

  const component = (raw: (typeof rawComponents)[number]): LaborComponent => {
    const own = raw.contractorComponents[0];
    return {
      key: raw.key,
      name: raw.name,
      referenceLaborHours: raw.referenceLaborHours,
      referenceLaborUnit: raw.referenceLaborUnit,
      referenceLaborStatus: String(raw.referenceLaborStatus),
      evidenceCount: raw._count.laborEvidence,
      contractorLaborHours: own?.addFieldLaborHours ?? null,
      contractorComponentPresent: !!own,
      contractorComponentActive: own?.active ?? false,
    };
  };

  const services: LaborService[] = rawServices.map((service) => ({
    ...service,
    bookingType: String(service.bookingType),
    pricingMethod: String(service.pricingMethod),
    questions: service.questions.map((question) => ({
      ...question,
      inputType: String(question.inputType),
      options: question.options.map((option) => ({
        ...option,
        routeAction: String(option.routeAction),
        accessClassification: option.accessClassification ? String(option.accessClassification) : null,
        components: option.components.flatMap((binding) => {
          if (!binding.canonicalComponent) return [];
          return [{
            quantity: binding.quantity,
            quantityAnswerKey: binding.quantityAnswerKey,
            conditionAnswerKey: binding.conditionAnswerKey,
            conditionAnswerValue: binding.conditionAnswerValue,
            conditionAccessClass: binding.conditionAccessClass ? String(binding.conditionAccessClass) : null,
            conditionAccessSlot: binding.conditionAccessSlot,
            component: component(binding.canonicalComponent),
          }];
        }),
      })),
    })),
  }));

  return {
    contractorSlug,
    trade,
    services,
    canonicalComponents: rawComponents.map(component),
  };
}

export async function generateLaborCoverageLedger(flags: Flags, db = new PrismaClient()) {
  const auditPath = resolve(flags.audit ?? `docs/audits/${flags.trade}-atomic-labor-readjudication.json`);
  const audit = JSON.parse(await readFile(auditPath, "utf8")) as AuditFile;
  const snapshot = flags.snapshot
    ? JSON.parse(await readFile(resolve(flags.snapshot), "utf8")) as LaborSnapshot
    : await loadLaborSnapshot(db, flags.contractor, flags.trade, flags.includeUnclassified);
  if (snapshot.contractorSlug !== flags.contractor || snapshot.trade !== flags.trade) {
    throw new Error(`snapshot identity ${snapshot.contractorSlug}/${snapshot.trade} does not match requested ${flags.contractor}/${flags.trade}`);
  }
  const ledger = buildLaborCoverageLedger(snapshot, audit.tasks, audit.evidenceObservations.length);
  const jsonPath = resolve(`${flags.out}.json`);
  const markdownPath = resolve(`${flags.out}.md`);
  await writeFile(jsonPath, `${JSON.stringify(ledger, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, renderLaborCoverageMarkdown(ledger), "utf8");
  return { ledger, jsonPath, markdownPath };
}

export async function runCli(argv = process.argv.slice(2)) {
  const flags = parseFlags(argv);
  const db = new PrismaClient();
  try {
    const { ledger, jsonPath, markdownPath } = await generateLaborCoverageLedger(flags, db);
    console.log("\nLABOR COVERAGE LEDGER");
    console.log(`  services: ${ledger.summary.services}`);
    console.log(`  terminal paths examined: ${ledger.summary.pathsExamined}`);
    console.log(`  priceable route groups: ${ledger.summary.priceableRouteGroups}`);
    console.log(`  clean priceable route groups: ${ledger.summary.cleanPriceableRouteGroups}`);
    console.log(`  JSON: ${jsonPath}`);
    console.log(`  Markdown: ${markdownPath}`);
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
