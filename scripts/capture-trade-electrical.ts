/**
 * Capture what Price2Book has actually modeled for electrical.
 *
 * READ ONLY, on the same terms as scripts/capture-hero-flow.ts: no create,
 * update, upsert, delete or raw execute, and `assertReadOnly` poisons those
 * methods so a later edit fails loudly instead of quietly writing to a
 * production database.
 *
 * WHY THE TEMPLATE AND NOT A CONTRACTOR
 *
 * /trades/electrical answers "do they understand my work?", which is a
 * question about the TRADE, not about Elite. The canonical template is
 * exactly that: TemplateVersion(trade: "electrical") → TemplateService →
 * CanonicalCategory, the catalog any new electrical contractor is provisioned
 * from, referenced rather than copied per ADR-006.
 *
 * It also carries NO ECONOMICS, which is the property that makes it safe to
 * publish. POSITIONING.md has said since the first pass that the template
 * holds trade structure and no prices — the contractor supplies those. So a
 * trade page built from it proves breadth and depth without putting one
 * contractor's retail prices on a public page, and without the marketing site
 * needing an opinion about what anything costs.
 *
 * WHAT THE PAGE IS ALLOWED TO SAY, DERIVED RATHER THAN ASSERTED
 *
 * Every service declares a bookingType and a photoState, and those two fields
 * are the whole "what can be priced online" story:
 *
 *   INSTANT / ADJUSTED + NONE          resolves to a price online
 *   … + PREPARATION                    price resolves, photos help us arrive ready
 *   REVIEW_REQUIRED                    photos gate the price; the office issues it
 *   REMOTE_QUOTE / TROUBLESHOOT_ONLY   never priced automatically
 *
 * The counter-example the sitemap requires — work that should NOT get an
 * online price — is therefore read out of the catalog rather than chosen by a
 * marketer, and it cannot drift away from what the product does.
 *
 *   npx tsx scripts/capture-trade-electrical.ts           # capture and write
 *   npx tsx scripts/capture-trade-electrical.ts --check   # fail if it drifted
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";

const prisma = new PrismaClient();

function assertReadOnly() {
  const forbidden = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"] as const;
  const models = ["templateVersion", "templateService", "canonicalCategory", "templateQuestion", "templateAnswerOption"] as const;
  for (const m of models) {
    const model = (prisma as any)[m];
    if (!model) continue;
    for (const f of forbidden) {
      if (typeof model[f] === "function") {
        model[f] = () => { throw new Error(`capture-trade-electrical is READ ONLY — ${m}.${f}`); };
      }
    }
  }
  (prisma as any).$executeRaw = () => { throw new Error("capture-trade-electrical is READ ONLY"); };
  (prisma as any).$executeRawUnsafe = () => { throw new Error("capture-trade-electrical is READ ONLY"); };
}

const TRADE = "electrical";
const OUT = "components/marketing/trades/electricalTemplate.ts";

/** How a service resolves for a homeowner, in the page's vocabulary. */
type Resolution = "priced" | "priced_with_photos" | "reviewed" | "quoted";

function resolutionOf(bookingType: string, photoState: string): Resolution {
  if (bookingType === "REMOTE_QUOTE" || bookingType === "TROUBLESHOOT_ONLY") return "quoted";
  if (photoState === "REVIEW_REQUIRED") return "reviewed";
  if (photoState === "PREPARATION") return "priced_with_photos";
  return "priced";
}

async function main() {
  assertReadOnly();
  const checking = process.argv.includes("--check");
  console.log(`\nELECTRICAL TEMPLATE — ${checking ? "checking" : "capturing"}\n`);

  /**
   * The newest SNAPSHOT, not the newest version.
   *
   * A DELTA carries only the services that changed, so building a catalog page
   * from one would publish a trade that offers four things. The distinction is
   * why TemplateVersionKind is required with no default.
   */
  const version = await prisma.templateVersion.findFirst({
    where: { trade: TRADE, kind: "SNAPSHOT" },
    orderBy: { version: "desc" },
    select: { id: true, version: true, publishedAt: true, notes: true },
  });
  if (!version) throw new Error(`no published SNAPSHOT for trade "${TRADE}" — there is nothing to prove yet`);

  const services = await prisma.templateService.findMany({
    where: { templateVersionId: version.id },
    select: {
      key: true, slug: true, name: true, shortDescription: true,
      bookingType: true, photoState: true, isPrimaryEligible: true,
      canonicalCategory: { select: { slug: true, name: true, active: true } },
      _count: { select: { questions: true } },
    },
    orderBy: { name: "asc" },
  });
  if (!services.length) throw new Error(`template v${version.version} has no services`);

  /** Grouped by the canonical category, which is trade truth, not presentation. */
  const byCategory = new Map<string, { slug: string; name: string; services: any[] }>();
  for (const s of services) {
    const c = s.canonicalCategory;
    if (!c.active) continue;
    if (!byCategory.has(c.slug)) byCategory.set(c.slug, { slug: c.slug, name: c.name, services: [] });
    byCategory.get(c.slug)!.services.push({
      key: s.key,
      name: s.name,
      description: s.shortDescription,
      questions: s._count.questions,
      resolution: resolutionOf(s.bookingType, s.photoState),
    });
  }
  const categories = [...byCategory.values()]
    .map((c) => ({ ...c, services: c.services.sort((a, b) => a.name.localeCompare(b.name)) }))
    .sort((a, b) => b.services.length - a.services.length || a.name.localeCompare(b.name));

  const counts = services.reduce<Record<Resolution, number>>((acc, s) => {
    const r = resolutionOf(s.bookingType, s.photoState);
    acc[r] = (acc[r] ?? 0) + 1;
    return acc;
  }, { priced: 0, priced_with_photos: 0, reviewed: 0, quoted: 0 });

  /**
   * One real Guided Pricing example, chosen by shape rather than by taste.
   *
   * The page needs a question whose answers visibly do DIFFERENT things —
   * a tree where every answer continues proves nothing about routing. So the
   * pick is the service with the most distinct route actions on a single
   * question, and ties break on fewer options so the example stays readable.
   */
  const trees = await prisma.templateService.findMany({
    where: { templateVersionId: version.id, questions: { some: {} } },
    select: {
      name: true, slug: true,
      questions: {
        orderBy: { order: "asc" },
        select: {
          key: true, prompt: true, helpText: true,
          options: { orderBy: { order: "asc" }, select: { label: true, routeAction: true } },
        },
      },
    },
  });

  let example: any = null;
  for (const svc of trees) {
    for (const q of svc.questions) {
      const distinct = new Set(q.options.map((o) => o.routeAction)).size;
      const score = distinct * 100 - q.options.length;
      if (!example || score > example.score) {
        example = {
          score, service: svc.name, questionKey: q.key, prompt: q.prompt, helpText: q.helpText,
          options: q.options.map((o) => ({ label: o.label, routeAction: o.routeAction })),
        };
      }
    }
  }
  if (!example) throw new Error("no template question carries options — nothing to show");
  delete example.score;

  const snapshot = {
    generatedBy: "scripts/capture-trade-electrical.ts",
    trade: TRADE,
    templateVersion: version.version,
    note:
      "Captured read-only from the canonical electrical template — the catalog a new electrical contractor is provisioned from. It carries trade structure and no economics, which is why it is safe to publish.",
    categoryCount: categories.length,
    serviceCount: services.length,
    counts,
    categories,
    example,
  };

  console.log(`  template v${version.version} · ${categories.length} categories · ${services.length} services`);
  console.log(`  priced ${counts.priced} · priced+photos ${counts.priced_with_photos} · reviewed ${counts.reviewed} · quoted ${counts.quoted}`);
  for (const c of categories) console.log(`    ${c.name.padEnd(30)} ${c.services.length}`);
  console.log(`  guided pricing example: ${example.service} — "${example.prompt.slice(0, 60)}"`);

  const file =
    `/**\n * GENERATED — do not edit by hand.\n *\n` +
    ` * Written by scripts/capture-trade-electrical.ts from the canonical\n` +
    ` * electrical template. Categories, services, routing behavior and the\n` +
    ` * Guided Pricing example are the product's, not a marketer's.\n *\n` +
    ` * Regenerate:  npx tsx scripts/capture-trade-electrical.ts\n` +
    ` * Check drift: npx tsx scripts/capture-trade-electrical.ts --check\n */\n` +
    `export const ELECTRICAL_TEMPLATE = ${JSON.stringify(snapshot, null, 2)} as const;\n`;

  if (!checking) {
    writeFileSync(OUT, file);
    console.log(`\n  wrote ${OUT}\n`);
    await prisma.$disconnect();
    return;
  }

  if (!existsSync(OUT)) {
    console.error(`  FAIL ${OUT} does not exist — run the capture\n`);
    process.exit(1);
  }
  const committed = (await import(pathToFileURL(`${process.cwd()}/${OUT}`).href)).ELECTRICAL_TEMPLATE;
  const differences = diff(committed, snapshot, "");
  if (!differences.length) {
    console.log(`\n  ok   /trades/electrical still matches the canonical template\n`);
    await prisma.$disconnect();
    return;
  }
  console.error(`\n  FAIL the electrical trade page no longer matches the template:`);
  for (const d of differences.slice(0, 25)) console.error(`         ${d}`);
  if (differences.length > 25) console.error(`         …and ${differences.length - 25} more`);
  console.error(`\n       Re-capture: npx tsx scripts/capture-trade-electrical.ts`);
  console.error(`       Then read the page — a service that changed how it resolves changes what it claims.\n`);
  process.exit(1);
}

function diff(a: any, b: any, at: string): string[] {
  if (a === b) return [];
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    return [`${at || "(root)"}: committed ${JSON.stringify(a)} — live ${JSON.stringify(b)}`];
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.flatMap((k) => diff(a[k], b[k], at ? `${at}.${k}` : k));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => {
    console.error(`\n  ${e.message}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
}
