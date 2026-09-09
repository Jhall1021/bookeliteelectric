/**
 * The labor wizard's core matching rule — explicit, bounded, and never
 * "automatic recipe similarity": a service matches a task when it carries
 * the task's designated canonical role and every OTHER ingredient is
 * incidental hardware (a wall plate, a box, small consumables), never a
 * second meaningful device or fixture.
 *
 * Server-side, against the real database with run-unique fixtures it
 * creates and destroys itself — the same discipline as
 * verify-material-baseline-pricing.ts. The browser-driven conversation
 * itself (the Q&A flow, editable proposals, crew-mismatch flagging, the
 * accept write) is covered separately by
 * verify-labor-wizard-browser-flow.ts, which needs a live dev server and is
 * not part of this chain.
 *
 *   npx tsx scripts/verify-labor-wizard.ts
 */
import { PrismaClient } from "@prisma/client";
import { ELECTRICAL_LABOR_TASKS, matchLaborTasks } from "../lib/laborWizard";

const raw = new PrismaClient();
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG_PREFIX = "test-labor-wizard";
const SLUG_A = `${SLUG_PREFIX}-${RUN}-a`;
const SLUG_B = `${SLUG_PREFIX}-${RUN}-b`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function removeContractor(slug: string) {
  const c = await raw.contractor.findUnique({ where: { slug }, select: { id: true } });
  if (!c) return;
  await raw.service.deleteMany({ where: { contractorId: c.id } }).catch(() => {});
  await raw.contractor.delete({ where: { id: c.id } }).catch(() => {});
}
async function teardown() {
  for (const s of [SLUG_A, SLUG_B]) await removeContractor(s);
}
async function sweepStale() {
  const cutoff = new Date(Date.now() - STALE_AFTER_MS);
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: SLUG_PREFIX }, NOT: { slug: { in: [SLUG_A, SLUG_B] } }, createdAt: { lt: cutoff } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

async function service(contractorId: string, slug: string, materialIds: string[]) {
  const cat = await raw.serviceCategory.findFirstOrThrow({ select: { id: true } });
  return raw.service.create({
    data: {
      contractorId, categoryId: cat.id, slug, name: slug, bookingType: "INSTANT", photoState: "NONE",
      materials: { create: materialIds.map((id, order) => ({ canonicalMaterialId: id, quantity: 1, order })) },
    },
    select: { id: true },
  });
}

async function main() {
  console.log(`\nLABOR WIZARD — matching rule: explicit role, bounded incidental parts, never similarity\n`);
  await teardown();
  await sweepStale();

  const [receptacle, wallPlate, consumablesSmall, breaker, switchRole] = await Promise.all([
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "RECEPTACLE_STANDARD" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "WALL_PLATE" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "CONSUMABLES_SMALL" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "BREAKER_SINGLE_POLE" }, select: { id: true } }),
    raw.canonicalMaterial.findUniqueOrThrow({ where: { key: "SWITCH_STANDARD" }, select: { id: true } }),
  ]);

  const a = await raw.contractor.create({ data: { slug: SLUG_A, name: "Labor Wizard Probe A", active: false }, select: { id: true } });
  const b = await raw.contractor.create({ data: { slug: SLUG_B, name: "Labor Wizard Probe B", active: false }, select: { id: true } });

  const clean = await service(a.id, "a-clean-outlet", [receptacle.id]);
  const withIncidentals = await service(a.id, "a-outlet-with-incidentals", [receptacle.id, wallPlate.id, consumablesSmall.id]);
  const withDistractor = await service(a.id, "a-outlet-with-breaker", [receptacle.id, breaker.id]);
  const switchOnly = await service(a.id, "a-switch-only", [switchRole.id]);
  const bOutlet = await service(b.id, "b-clean-outlet", [receptacle.id]);

  const OUTLET_TASK = ELECTRICAL_LABOR_TASKS.find((t) => t.key === "outlet_replacement")!;
  const matchedA = await matchLaborTasks(raw, a.id, [OUTLET_TASK]);
  const outletMatch = matchedA[0];
  const matchedSlugs = new Set(outletMatch.services.map((s) => s.slug));

  ok(`0. a service whose ONLY ingredient is the role matches`, matchedSlugs.has("a-clean-outlet"));
  ok(`1. a service with ONLY incidental extras (wall plate, small consumables) also matches`,
    matchedSlugs.has("a-outlet-with-incidentals"));
  ok(`2. a service carrying a SECOND meaningful device (a breaker) does NOT match — a different, larger job`,
    !matchedSlugs.has("a-outlet-with-breaker"));
  ok(`3. a service that doesn't use the role at all is absent`, !matchedSlugs.has("a-switch-only"));
  ok(`4. exactly the two genuine matches, nothing else`, matchedSlugs.size === 2);

  ok(`5. tenant isolation — B's own matching outlet service never appears in A's match set`,
    !outletMatch.services.some((s) => s.id === bOutlet.id));
  const matchedB = await matchLaborTasks(raw, b.id, [OUTLET_TASK]);
  ok(`   ...and B's own match correctly finds ITS OWN clean outlet service`,
    matchedB[0].services.some((s) => s.slug === "b-clean-outlet"));

  const allTasksA = await matchLaborTasks(raw, a.id, ELECTRICAL_LABOR_TASKS);
  const switchTask = allTasksA.find((t) => t.task.key === "switch_replacement")!;
  ok(`6. the switch task, matched independently, finds A's switch-only service`,
    switchTask.services.some((s) => s.slug === "a-switch-only"));
  const gfciTask = allTasksA.find((t) => t.task.key === "gfci_replacement")!;
  ok(`   ...and the GFCI task finds none of A's fixtures — none of them use that role`,
    gfciTask.services.length === 0);

  void clean; void withIncidentals; void withDistractor; void switchOnly;

  console.log(`\n  cleanup, then done\n`);
  await teardown();
  const residue = await raw.contractor.count({ where: { slug: { in: [SLUG_A, SLUG_B] } } });
  ok(`7. every fixture is gone at the end`, residue === 0);
  await raw.$disconnect();
  console.log(`\n  ${fail === 0 ? "all checks passed" : `${fail} check(s) failed`}\n`);
  if (fail > 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
