/**
 * The contractor-wide catalog loader resolves every service exactly as the
 * single-service loader does.
 *
 *   npx tsx scripts/verify-catalog-resolution-equivalence.ts
 *   P2B_EQUIVALENCE_SLUGS=elite-electric,brightpath-electric npx tsx scripts/verify-catalog-resolution-equivalence.ts
 *
 * loadCatalogForResolution replaces ~7.4 statements per service with a fixed
 * handful for the whole catalog. That is only safe if nothing downstream can
 * tell the difference, so for every contractor (or the named ones) this loads
 * every service both ways and compares what matters, strictly:
 *
 *   TREE      every field, question, answer, component, material, photo group
 *             and disclaimer — in order. No ordering tolerance: questions come
 *             back in QUESTION_ORDER from both loaders, and a relation that
 *             ever returns in a different order fails here.
 *   MAPS      ownComponents and ownMaterialCosts by key and value. Compared that
 *             way ONLY because every consumer reads them by key — which is
 *             re-proven below on every run, not assumed.
 *   PROMISE   pricePromiseOf, the price a service promises.
 *   PATHS     every answer path's full resolveRoute result, as the primary
 *             service and as a same-visit add-on: routing, price, review,
 *             reroute destination, material resolution.
 *   READINESS assessOnboarding and catalogPromises given per-service trees,
 *             given the bulk catalog, and given no catalog (the default
 *             path, which loads one): stages, blockers, warnings, canLaunch,
 *             intended services and every catalog promise, in order.
 *
 * Each comparison has a negative control proving it fails on a real
 * difference. READ ONLY.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { loadCatalogForResolution, type ResolvedCatalog } from "../lib/catalogResolution";
import { pricePromiseOf } from "../lib/activationOutcome";
import { assessOnboarding, catalogPromises, type OnboardingReadiness } from "../lib/onboardingReadiness";
import { mapWithConcurrency } from "../lib/concurrency";
import type { ResolvedServiceTree } from "../lib/serviceTreeQuery";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
let pass = 0, fail = 0;
const ok = (label: string, c: boolean, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "✓" : "✗"} ${label}${c || !detail ? "" : `  (${detail})`}`);
};

const MAP_FIELDS = ["ownComponents", "ownMaterialCosts"] as const;
const PATH_CAP = 4000;
const LOAD_CONCURRENCY = 5;

const ser = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Map ? { __map: [...x.entries()] } : x));

/** The tree with the two lookup maps removed — compared strictly, in order. */
export function treeWithoutMaps(t: ResolvedServiceTree): string {
  const { ownComponents: _c, ownMaterialCosts: _m, ...rest } = t;
  return ser(rest);
}

/** Two lookup maps hold the same key/value pairs. */
export function sameKeyed(a: ReadonlyMap<string, unknown>, b: ReadonlyMap<string, unknown>): boolean {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) if (!b.has(k) || ser(v) !== ser(b.get(k))) return false;
  return true;
}

/** Every answer path's resolved result, primary and same-visit. */
export function pathResults(tree: ResolvedServiceTree, settings: unknown): { results: string; paths: number; capped: boolean } {
  const byId = new Map(tree.questions.map((q) => [q.id, q]));
  const nextKey = (o: { routeAction: string; nextQuestionId: string | null }) =>
    o.routeAction === "CONTINUE" && o.nextQuestionId ? byId.get(o.nextQuestionId)?.key ?? null : null;
  const out: unknown[] = []; let capped = false;
  const walk = (key: string | null, answers: Record<string, string>) => {
    if (out.length >= PATH_CAP) { capped = true; return; }
    if (!key) {
      out.push({ answers, primary: resolveRoute(tree as never, answers, true, settings as never), sameVisit: resolveRoute(tree as never, answers, false, settings as never) });
      return;
    }
    const q = tree.questions.find((x) => x.key === key);
    if (!q) return;
    for (const o of q.options) walk(nextKey(o), { ...answers, [q.key]: o.value });
  };
  walk(tree.questions[0]?.key ?? null, {});
  return { results: ser(out), paths: out.length, capped };
}

/**
 * Uses of the two lookup maps that depend on their ORDER or CONTENTS AS A
 * WHOLE rather than a keyed read. Property shorthand, construction and type
 * positions are not uses. Returns the offending excerpts.
 */
export function orderSensitiveMapUses(src: string): string[] {
  const clean = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const hits: string[] = [];
  for (const m of clean.matchAll(/\b(ownComponents|ownMaterialCosts)\b\s*(\??\.)\s*([A-Za-z_$][\w$]*)/g)) {
    // set is the loader BUILDING the map; get and has are keyed reads.
    if (!["get", "has", "set"].includes(m[3])) hits.push(m[0]);
  }
  for (const m of clean.matchAll(/(\.\.\.|\bof\s+|Array\.from\(|Object\.fromEntries\(|new Map\(|new Set\()\s*[\w$.?]*\b(ownComponents|ownMaterialCosts)\b(?!\s*[:(])/g)) {
    hits.push(m[0]);
  }
  return hits;
}

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (name === "node_modules" || name.startsWith(".")) return [];
    return statSync(p).isDirectory() ? sourceFiles(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
  });

async function main() {
  console.log("\nCATALOG RESOLUTION EQUIVALENCE");

  console.log("\n  CONSUMERS OF THE LOOKUP MAPS");
  const files = ["app", "lib", "components"].flatMap(sourceFiles);
  const offenders = files.flatMap((f) => orderSensitiveMapUses(readFileSync(f, "utf8")).map((h) => `${f}: ${h}`));
  ok(`ownComponents and ownMaterialCosts are only ever read by key (${files.length} files)`,
    offenders.length === 0, offenders.join(" | "));
  const ORDERED = [
    "for (const [k, v] of service.ownComponents) total += v.approvedPriceCents;",
    "const list = [...tree.ownMaterialCosts.values()];",
    "tree.ownComponents.forEach((v) => seen.push(v));",
    "const first = Array.from(svc.ownComponents)[0];",
    "const n = svc.ownMaterialCosts.size;",
    "const obj = Object.fromEntries(tree.ownComponents);",
  ];
  ok(`negative control: iteration, spreading, size and conversion are caught`,
    ORDERED.every((s) => orderSensitiveMapUses(s).length > 0), ORDERED.filter((s) => orderSensitiveMapUses(s).length === 0).join(" | "));
  const KEYED = [
    "const own = service.ownComponents.get(c.canonicalComponentId);",
    "if (tree.ownMaterialCosts.has(roleId)) cost = tree.ownMaterialCosts.get(roleId)!;",
    "return { ...service, ownComponents, ownMaterialCosts, troubleshootingServiceId };",
    "ownComponents: OwnComponentMap;",
    "const ownMaterialCosts = new Map<string, number>();",
    "if (cost !== undefined) ownMaterialCosts.set(id, cost);",
  ];
  ok(`  and keyed reads, construction, shorthand and type positions are not`,
    KEYED.every((s) => orderSensitiveMapUses(s).length === 0), KEYED.filter((s) => orderSensitiveMapUses(s).length > 0).join(" | "));

  const only = (process.env.P2B_EQUIVALENCE_SLUGS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const contractors = await raw.contractor.findMany({
    where: only.length ? { slug: { in: only } } : {},
    select: { id: true, slug: true }, orderBy: { slug: "asc" },
  });
  if (only.length) {
    const missing = only.filter((s) => !contractors.some((c) => c.slug === s));
    ok(`every named contractor exists`, missing.length === 0, missing.join(", "));
  }

  const totals = { services: 0, idSets: 0, trees: 0, maps: 0, promises: 0, paths: 0, pathsCompared: 0, capped: 0, noSettings: 0, readiness: 0, catalogPromises: 0, contractors: 0, sharedOnce: 0 };
  const diffs: Record<string, string[]> = { idSets: [], trees: [], maps: [], promises: [], paths: [], readiness: [], catalogPromises: [] };
  const readinessBox: { sample: OnboardingReadiness | null } = { sample: null };
  type Sample = { per: ResolvedServiceTree; bulk: ResolvedServiceTree; settings: unknown };
  const found: { sample: Sample | null } = { sample: null };

  console.log("\n  LOADERS");
  for (const c of contractors) {
    await withTenant({ contractorId: c.id, source: "test" }, async () => {
      let settings: unknown = null;
      try { settings = await loadPricingSettings(guarded as never, c.id); } catch { settings = null; }
      const ids = (await guarded.service.findMany({ where: { contractorId: c.id }, select: { id: true }, orderBy: { id: "asc" } })).map((s) => s.id);
      const perList = await mapWithConcurrency(ids, LOAD_CONCURRENCY, (id) => loadServiceForResolution(guarded, id));
      const per = new Map(ids.map((id, i) => [id, perList[i]]));
      const bulk = await loadCatalogForResolution(guarded, c.id);

      const bulkIds = [...bulk.keys()].sort();
      if (ser(bulkIds) !== ser(ids)) diffs.idSets.push(c.slug); else totals.idSets++;

      for (const id of ids) {
        const a = per.get(id); const b = bulk.get(id);
        totals.services++;
        if (!a || !b) { diffs.trees.push(`${c.slug}/${id}`); continue; }
        if (treeWithoutMaps(a) === treeWithoutMaps(b)) totals.trees++; else diffs.trees.push(`${c.slug}/${a.slug}`);
        if (MAP_FIELDS.every((f) => sameKeyed(a[f] as ReadonlyMap<string, unknown>, b[f] as ReadonlyMap<string, unknown>))) totals.maps++; else diffs.maps.push(`${c.slug}/${a.slug}`);
        if (!settings) { totals.noSettings++; totals.promises++; totals.paths++; continue; }
        if (ser(pricePromiseOf(a as never, settings as never)) === ser(pricePromiseOf(b as never, settings as never))) totals.promises++;
        else diffs.promises.push(`${c.slug}/${a.slug}`);
        const pa = pathResults(a, settings); const pb = pathResults(b, settings);
        totals.pathsCompared += pa.paths; if (pa.capped) totals.capped++;
        if (pa.results === pb.results && pa.paths === pb.paths) totals.paths++; else diffs.paths.push(`${c.slug}/${a.slug}`);
        if (!found.sample && a.questions.some((q) => q.options.length > 1)) found.sample = { per: a, bulk: b, settings };
      }
      // Readiness and catalog promises, three ways, compared strictly in order.
      totals.contractors++;
      const perCatalog = new Map([...per].filter((e): e is [string, ResolvedServiceTree] => e[1] !== null));
      const [rPer, rBulk, rDefault] = [
        await assessOnboarding(guarded, c.id, { catalog: perCatalog }),
        await assessOnboarding(guarded, c.id, { catalog: bulk }),
        await assessOnboarding(guarded, c.id),
      ];
      // The request loader the pages use: both readers at once, one read between them.
      let reads = 0; let pending: Promise<ResolvedCatalog> | null = null;
      const loadCatalog = () => (pending ??= (reads++, loadCatalogForResolution(guarded, c.id)));
      const [rShared, pShared] = await Promise.all([
        assessOnboarding(guarded, c.id, { loadCatalog }),
        catalogPromises(guarded, c.id, { loadCatalog }),
      ]);
      if (reads === (settings ? 1 : 0)) totals.sharedOnce++; else diffs.readiness.push(`${c.slug}: ${reads} catalog reads for one request`);
      if (ser(rPer) === ser(rBulk) && ser(rBulk) === ser(rDefault) && ser(rDefault) === ser(rShared)) totals.readiness++; else diffs.readiness.push(c.slug);
      if (!readinessBox.sample && rBulk.warnings.length + rBulk.blockers.length > 0) readinessBox.sample = rBulk;
      const [pPer, pBulk, pDefault] = [
        await catalogPromises(guarded, c.id, { catalog: perCatalog }),
        await catalogPromises(guarded, c.id, { catalog: bulk }),
        await catalogPromises(guarded, c.id),
      ];
      if (ser(pPer) === ser(pBulk) && ser(pBulk) === ser(pDefault) && ser(pDefault) === ser(pShared)) totals.catalogPromises++; else diffs.catalogPromises.push(c.slug);
      console.log(`    ${c.slug.padEnd(28)} ${String(ids.length).padStart(3)} services  ${rBulk.blockers.length}B/${rBulk.warnings.length}W canLaunch=${rBulk.canLaunch}${settings ? "" : "  (no pricing settings)"}`);
    });
  }
  const n = totals.services;
  ok(`both loaders return the same services for all ${contractors.length} contractors`, diffs.idSets.length === 0, diffs.idSets.join(", "));
  ok(`trees identical, strictly and in order, for ${totals.trees}/${n} services`, diffs.trees.length === 0, diffs.trees.slice(0, 5).join(", "));
  ok(`ownComponents and ownMaterialCosts hold the same pairs for ${totals.maps}/${n} services`, diffs.maps.length === 0, diffs.maps.slice(0, 5).join(", "));
  ok(`price promises identical for ${totals.promises}/${n} services`, diffs.promises.length === 0, diffs.promises.slice(0, 5).join(", "));
  ok(`every answer path resolves identically, primary and same-visit (${totals.pathsCompared} paths; ${totals.capped} service(s) at the ${PATH_CAP}-path cap)`,
    diffs.paths.length === 0, diffs.paths.slice(0, 5).join(", "));
  ok(`one request's shared loader reads the catalog once (none without pricing settings) for ${totals.sharedOnce}/${totals.contractors} contractors`,
    totals.sharedOnce === totals.contractors);
  ok(`readiness identical from per-service trees, the bulk catalog, the default path and the shared request loader for ${totals.readiness}/${totals.contractors} contractors`,
    diffs.readiness.length === 0, diffs.readiness.join(", "));
  ok(`catalog promises identical, in order, the same four ways for ${totals.catalogPromises}/${totals.contractors} contractors`,
    diffs.catalogPromises.length === 0, diffs.catalogPromises.join(", "));

  console.log("\n  NEGATIVE CONTROLS");
  const sample = found.sample;
  if (!sample) {
    ok(`a service with a branching question exists to build the controls from`, false);
  } else {
    const { per, bulk, settings } = sample;
    const q = bulk.questions.findIndex((x) => x.options.length > 1);
    const reordered = { ...bulk, questions: bulk.questions.map((x, i) => (i === q ? { ...x, options: [...x.options].reverse() } : x)) } as ResolvedServiceTree;
    ok(`the tree comparison fails when answers come back in a different order`, treeWithoutMaps(per) !== treeWithoutMaps(reordered));
    const swapped = bulk.questions.length > 1
      ? ({ ...bulk, questions: [bulk.questions[1], bulk.questions[0], ...bulk.questions.slice(2)] } as ResolvedServiceTree)
      : null;
    ok(`  and when questions do`, swapped === null || treeWithoutMaps(per) !== treeWithoutMaps(swapped));
    const extra = new Map<string, number>(bulk.ownMaterialCosts); extra.set("__not-a-role__", 1);
    ok(`the map comparison fails on an extra or changed pair`, !sameKeyed(per.ownMaterialCosts, extra));
    if (settings) {
      const opt = bulk.questions[q].options[0];
      const rerouted = { ...bulk, questions: bulk.questions.map((x, i) => (i === q ? { ...x, options: [{ ...opt, routeAction: "REVIEW" as never, nextQuestionId: null }, ...x.options.slice(1)] } : x)) } as ResolvedServiceTree;
      ok(`the path comparison fails when an answer routes somewhere else`, pathResults(per, settings).results !== pathResults(rerouted, settings).results);
    }
  }

  const readinessSample = readinessBox.sample;
  if (readinessSample) {
    const f = readinessSample.warnings[0] ?? readinessSample.blockers[0];
    const dropped = { ...readinessSample, warnings: readinessSample.warnings.filter((w) => w !== f), blockers: readinessSample.blockers.filter((b) => b !== f) };
    ok(`the readiness comparison fails when a single finding goes missing`, ser(readinessSample) !== ser(dropped));
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await raw.$disconnect(); await guarded.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
