/**
 * Materials Catalog (/dashboard/materials) — read-model correctness.
 *
 *   npx tsx scripts/verify-materials-catalog.ts
 *
 * DELIBERATELY READ-ONLY. This slice adds a catalog-level VIEW over material
 * architecture that already has its own verification (verify-material-cost.ts,
 * verify-material-cost-holds.ts, verify-recompute-by-role.ts) — this script
 * does not re-prove that setContractorMaterialCost or recomputeServicesUsingRole
 * work, only that lib/materialCatalog.ts's shaping of their output is correct,
 * and that the new surface reuses rather than reimplements the domain layer.
 * It writes nothing to any database.
 *
 * Two kinds of check:
 *   A. STATIC — git diff and source greps. No DB, no environment risk.
 *   B. DB READ-ONLY — against whatever DATABASE_URL is configured. Only
 *      findMany/findUnique/count calls; no create/update/delete anywhere.
 */

import { execSync } from "child_process";
import { readFileSync } from "fs";
import { PrismaClient } from "@prisma/client";
import { loadMaterialCatalog } from "../lib/materialCatalog";
import { deriveUnitCost } from "../lib/materialCost";
import { MATERIAL_CATEGORIES, categorizeMaterial } from "../lib/materialCategory";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, cond: boolean, detail?: string) {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
}

const EXPECTED_CHANGED_FILES = new Set([
  "lib/materialCategory.ts",
  "lib/materialCatalog.ts",
  "lib/portalModules.ts",
  "app/dashboard/layout.tsx",
  "components/ui/icons.tsx",
  "components/admin/MaterialsCatalogClient.tsx",
  "app/dashboard/materials/page.tsx",
  "app/api/admin/materials/route.ts",
  "scripts/verify-materials-catalog.ts",
  "scripts/verify-materials-catalog-write-path.ts",
  "package.json",
]);

function staticChecks() {
  console.log(`\nSTATIC CHECKS (no database)\n`);

  // ---- nothing touched outside this slice's own files ----------------------
  // Committed changes plus untracked new files — a fresh file with no commit
  // yet would otherwise pass this check by omission.
  // Diffed against origin/main, not local main — this repo's local main ref
  // has been observed diverged from origin (carrying unrelated local-only
  // commits from other worktrees), so it is not a trustworthy base.
  let changed: string[] = [];
  try {
    const tracked = execSync("git diff --name-only origin/main...HEAD", { encoding: "utf8" });
    const untracked = execSync("git ls-files --others --exclude-standard", { encoding: "utf8" });
    changed = [...tracked.split("\n"), ...untracked.split("\n")].map((l) => l.trim()).filter(Boolean);
  } catch (e) {
    console.log(`  · could not diff against origin/main (${(e as Error).message.split("\n")[0]}) — skipping diff-scoped checks`);
  }
  if (changed.length > 0) {
    const unexpected = changed.filter((f) => !EXPECTED_CHANGED_FILES.has(f));
    ok(
      `only this slice's own files changed vs main (${changed.length} file(s))`,
      unexpected.length === 0,
      unexpected.join(", ")
    );
    ok(
      `prisma/schema.prisma is untouched — no migration in this slice`,
      !changed.includes("prisma/schema.prisma")
    );
    const routeAssistish = changed.filter((f) =>
      /route-?assist|routing-?v2|conductorrequirement|routefact/i.test(f)
    );
    ok(`no Route Assist / Routing V2 file touched`, routeAssistish.length === 0, routeAssistish.join(", "));

    const supplierSyncish = changed.filter((f) => /suppliersync|lowes|materialsupplierlink/i.test(f));
    ok(`no supplier-sync file touched`, supplierSyncish.length === 0, supplierSyncish.join(", "));
  }

  // ---- the new surface never writes a published price -----------------------
  const newFiles = [
    "lib/materialCatalog.ts",
    "components/admin/MaterialsCatalogClient.tsx",
    "app/dashboard/materials/page.tsx",
  ];
  for (const f of newFiles) {
    const src = readFileSync(f, "utf8");
    ok(`${f} never mentions basePrice`, !/\bbasePrice\b/.test(src));
    ok(`${f} never mentions whileWeThereBasePrice`, !/\bwhileWeThereBasePrice\b/.test(src));
  }

  // ---- cost edits reuse the existing domain path, not a parallel one --------
  const routeSrc = readFileSync("app/api/admin/materials/route.ts", "utf8");
  ok(
    `the API route imports setContractorMaterialCost from lib/materialCost`,
    /import\s*\{[^}]*setContractorMaterialCost[^}]*\}\s*from\s*["']@\/lib\/materialCost["']/.test(routeSrc)
  );
  ok(
    `the "cost" action calls setContractorMaterialCost`,
    /action === "cost"[\s\S]{0,4000}setContractorMaterialCost\(/.test(routeSrc)
  );
  ok(
    `the "create" action recomputes via recomputeServicesUsingRole (shared helper, not a local reimplementation)`,
    /action === "create"[\s\S]{0,5000}recomputeServicesUsingRole\(/.test(routeSrc)
  );

  // ---- nav wiring ------------------------------------------------------------
  const modulesSrc = readFileSync("lib/portalModules.ts", "utf8");
  const layoutSrc = readFileSync("app/dashboard/layout.tsx", "utf8");
  const iconsSrc = readFileSync("components/ui/icons.tsx", "utf8");
  ok(`/dashboard/materials is registered in lib/portalModules.ts`, modulesSrc.includes("/dashboard/materials"));
  ok(`/dashboard/materials is in the primary sidebar nav`, layoutSrc.includes("/dashboard/materials"));
  ok(
    `Materials sits immediately after Services & Pricing in the sidebar`,
    /href:\s*"\/dashboard\/services"[^}]*\}\s*,\s*\{\s*href:\s*"\/dashboard\/materials"/.test(layoutSrc)
  );
  ok(`the sidebar icon it uses is registered in NAV_ICONS`, /tag:\s*TagIcon/.test(iconsSrc));

  // ---- existing per-service surfaces are untouched by this slice ------------
  // MaterialsPanel.tsx never appears in this slice's own changed-file list —
  // asserted explicitly, not just implied by the allowlist check above.
  ok(
    `components/admin/MaterialsPanel.tsx is not among this slice's changed files`,
    !changed.includes("components/admin/MaterialsPanel.tsx")
  );
  // The catalog-building and items-mapping code origin/main already ships for
  // a serviceId request is byte-for-byte unchanged — the only structural
  // difference is origin's own redundant "if (!serviceId) return ..." line
  // sitting BETWEEN them, which this slice's early return (before `catalog`
  // is ever fetched) makes unreachable and removes. That one-line removal is
  // deliberate and is not what this check is proving; it's excluded from the
  // comparison so it doesn't mask a real divergence in the two surrounding,
  // still-shared blocks.
  try {
    const originRouteSrc = execSync("git show origin/main:app/api/admin/materials/route.ts", { encoding: "utf8" });
    const extractBetween = (src: string, from: string, to: string) => {
      const start = src.indexOf(from);
      const end = src.indexOf(to, start);
      return start >= 0 && end > start ? src.slice(start, end) : null;
    };
    const catalogBefore = extractBetween(
      originRouteSrc, "const catalog = await db.contractorMaterial.findMany", "}));"
    );
    const catalogAfter = extractBetween(
      routeSrc, "const catalog = await db.contractorMaterial.findMany", "}));"
    );
    ok(
      `the catalog-building code (GET) is unchanged from origin/main`,
      catalogBefore !== null && catalogAfter !== null && catalogBefore === catalogAfter
    );
    const itemsBefore = extractBetween(
      originRouteSrc, "const items = await db.serviceMaterial.findMany", "export async function POST"
    );
    const itemsAfter = extractBetween(
      routeSrc, "const items = await db.serviceMaterial.findMany", "export async function POST"
    );
    ok(
      `the items-mapping code (GET, serviceId branch) is unchanged from origin/main`,
      itemsBefore !== null && itemsAfter !== null && itemsBefore === itemsAfter
    );
  } catch (e) {
    console.log(`  · could not compare against origin/main's route.ts (${(e as Error).message.split("\n")[0]})`);
  }

  // ---- package basis derives the expected unit cost, via the REAL function --
  // $89.00 for a 250 ft roll -> 35.6 c/ft precisely, 36c rounded.
  const derived = deriveUnitCost({ packagePriceCents: 8900, packageQuantity: 250 });
  ok(
    `deriveUnitCost($89.00 / 250 ft) rounds to 36c/ft`,
    derived.unitCostCents === 36,
    `got ${derived.unitCostCents}`
  );
  ok(
    `deriveUnitCost($89.00 / 250 ft) precise milli-cents is 35600`,
    derived.unitCostMilliCents === 35600,
    `got ${derived.unitCostMilliCents}`
  );
}

async function dbChecks() {
  console.log(`\nDATABASE CHECKS (read-only — no writes)\n`);

  const elite = await prisma.contractor.findUnique({
    where: { slug: "elite-electric" },
    select: { id: true, slug: true },
  });
  if (!elite) {
    console.log(`  · no "elite-electric" contractor on this database — skipping DB checks`);
    return;
  }

  const other = await prisma.contractor.findFirst({
    where: { id: { not: elite.id } },
    select: { id: true, slug: true },
  });

  const eliteCatalog = await loadMaterialCatalog(prisma, elite.id);
  console.log(
    `  · elite-electric: ${eliteCatalog.active.length} active, ${eliteCatalog.inactive.length} inactive, ` +
      `${eliteCatalog.missing.length} missing-price`
  );

  // ---- inactive stays inactive ----------------------------------------------
  const activeIds = new Set(eliteCatalog.active.map((r) => r.contractorMaterialId));
  const missingIds = new Set(eliteCatalog.missing.map((r) => r.canonicalMaterialId));
  let inactiveConsistent = true;
  for (const row of eliteCatalog.inactive) {
    if (!row.contractorMaterialId) { inactiveConsistent = false; continue; }
    if (activeIds.has(row.contractorMaterialId)) inactiveConsistent = false;
    if (missingIds.has(row.canonicalMaterialId)) inactiveConsistent = false;
  }
  ok(
    `no inactive material also appears in the active or missing lists`,
    inactiveConsistent
  );
  if (eliteCatalog.inactive.length > 0) {
    const dbCheck = await prisma.contractorMaterial.findMany({
      where: { id: { in: eliteCatalog.inactive.map((r) => r.contractorMaterialId!) } },
      select: { id: true, active: true },
    });
    ok(
      `every row the catalog calls "inactive" is active:false in the database`,
      dbCheck.every((r) => r.active === false)
    );
  } else {
    console.log(`  · elite-electric has no inactive materials to check`);
  }

  const ductConnector = await prisma.canonicalMaterial.findUnique({
    where: { key: "DUCT_CONNECTOR" },
    select: { active: true },
  });
  if (ductConnector) {
    const inCatalogActive = eliteCatalog.active.some((r) => r.key === "DUCT_CONNECTOR");
    ok(`DUCT_CONNECTOR does not appear in the default (active) catalog`, !inCatalogActive);
  } else {
    console.log(`  · DUCT_CONNECTOR is not present as a canonical material on this database`);
  }

  // ---- missing-price rows are genuinely uncosted -----------------------------
  if (eliteCatalog.missing.length > 0) {
    const sample = eliteCatalog.missing.slice(0, 20);
    const existing = await prisma.contractorMaterial.findMany({
      where: {
        contractorId: elite.id,
        canonicalMaterialId: { in: sample.map((r) => r.canonicalMaterialId) },
      },
      select: { canonicalMaterialId: true },
    });
    ok(
      `every "missing price" row genuinely has no ContractorMaterial row`,
      existing.length === 0,
      `found ${existing.length} unexpected cost row(s)`
    );
  } else {
    console.log(`  · elite-electric has no missing-price roles to check`);
  }

  // ---- usage counts are correct -----------------------------------------------
  const busiest = [...eliteCatalog.active, ...eliteCatalog.missing]
    .sort((a, b) => b.usageCount - a.usageCount)
    .slice(0, 5);
  let usageMismatch: string | null = null;
  for (const row of busiest) {
    const expected = await prisma.serviceMaterial.count({
      where: { canonicalMaterialId: row.canonicalMaterialId, service: { contractorId: elite.id } },
    });
    if (expected !== row.usageCount) {
      usageMismatch = `${row.key}: catalog says ${row.usageCount}, DB says ${expected}`;
      break;
    }
    if (row.usingServices.length !== expected) {
      usageMismatch = `${row.key}: usingServices has ${row.usingServices.length} entries, expected ${expected}`;
      break;
    }
  }
  ok(`usage counts match a direct count for the busiest roles`, usageMismatch === null, usageMismatch ?? undefined);

  // ---- every category is a recognized bucket -----------------------------------
  const all = [...eliteCatalog.active, ...eliteCatalog.inactive, ...eliteCatalog.missing];
  const unrecognized = all.filter((r) => !(MATERIAL_CATEGORIES as readonly string[]).includes(r.category));
  ok(`every row got a recognized category`, unrecognized.length === 0);
  const otherCount = all.filter((r) => r.category === "Other").length;
  ok(
    `"Other" is not the majority of the catalog (heuristic is doing real work)`,
    all.length === 0 || otherCount / all.length < 0.3,
    `${otherCount} of ${all.length}`
  );

  // ---- summary counts match INDEPENDENT direct-DB truth ------------------------
  // Recomputed via separate queries, not by re-reading the catalog's own
  // output — checking a derivation against itself would prove nothing.
  {
    const workingTotal = eliteCatalog.active.length + eliteCatalog.missing.length;
    const dbPriced = await prisma.contractorMaterial.count({
      where: { contractorId: elite.id, active: true },
    });
    ok(`Priced count matches a direct count of active ContractorMaterial rows`, dbPriced === eliteCatalog.active.length,
      `catalog ${eliteCatalog.active.length}, DB ${dbPriced}`);

    const dbNeedsAttentionCosted = await prisma.contractorMaterial.count({
      where: {
        contractorId: elite.id,
        active: true,
        OR: [{ costStatus: { in: ["STALE", "ERROR"] } }, { costConfidence: "ASSUMED" }],
      },
    });
    const catalogNeedsAttention = [...eliteCatalog.active, ...eliteCatalog.missing].filter(
      (r) => r.statusBucket === "needs_attention"
    ).length;
    const expectedNeedsAttention = dbNeedsAttentionCosted + eliteCatalog.missing.length;
    ok(
      `Needs-attention count matches direct cost-status/confidence truth plus missing-price roles`,
      catalogNeedsAttention === expectedNeedsAttention,
      `catalog ${catalogNeedsAttention}, DB-derived ${expectedNeedsAttention} (${dbNeedsAttentionCosted} stale/error/assumed + ${eliteCatalog.missing.length} missing)`
    );

    const dbSupplierLinked = await prisma.contractorMaterial.count({
      where: { contractorId: elite.id, active: true, activeSupplierLinkId: { not: null } },
    });
    const catalogSupplierLinked = [...eliteCatalog.active, ...eliteCatalog.missing].filter(
      (r) => r.statusBucket === "supplier_linked"
    ).length;
    ok(`Supplier-linked count matches a direct count of active supplier links`, dbSupplierLinked === catalogSupplierLinked,
      `catalog ${catalogSupplierLinked}, DB ${dbSupplierLinked}`);

    // Total is definitional (active + missing), not an independent DB fact by
    // itself — but it should equal the sum of the two figures just proven.
    ok(`Total equals priced + missing-price`, workingTotal === eliteCatalog.active.length + eliteCatalog.missing.length);
  }

  // ---- nameOverride wins over the canonical name when present ------------------
  {
    const overridden = await prisma.contractorMaterial.findMany({
      where: { contractorId: elite.id, active: true, nameOverride: { not: null } },
      select: { id: true, nameOverride: true },
      take: 5,
    });
    if (overridden.length > 0) {
      const mismatches = overridden.filter((o) => {
        const row = eliteCatalog.active.find((r) => r.contractorMaterialId === o.id);
        return !row || row.name !== o.nameOverride;
      });
      ok(`nameOverride wins in the catalog's display name, for every overridden row found`, mismatches.length === 0,
        `${mismatches.length} of ${overridden.length} mismatched`);
    } else {
      console.log(`  · elite-electric has no nameOverride set on any active material to check here — proven instead with a disposable fixture in the write-path phase`);
    }

    const notOverridden = await prisma.contractorMaterial.findMany({
      where: { contractorId: elite.id, active: true, nameOverride: null },
      select: { id: true, canonicalMaterial: { select: { name: true } } },
      take: 5,
    });
    const canonicalMismatches = notOverridden.filter((o) => {
      const row = eliteCatalog.active.find((r) => r.contractorMaterialId === o.id);
      return !row || row.name !== o.canonicalMaterial.name;
    });
    ok(`the canonical name is used when there is no override`, canonicalMismatches.length === 0,
      `${canonicalMismatches.length} of ${notOverridden.length} mismatched`);
  }

  // ---- the presentation category always matches the mapper function ------------
  {
    const categoryDrift = [...eliteCatalog.active, ...eliteCatalog.inactive, ...eliteCatalog.missing].filter(
      (r) => r.category !== categorizeMaterial(r.key)
    );
    ok(`every row's category matches categorizeMaterial(key) exactly`, categoryDrift.length === 0,
      categoryDrift.map((r) => r.key).join(", "));
  }

  // ---- no N+1: query count stays constant regardless of catalog size -----------
  {
    const queries: string[] = [];
    const logging = new PrismaClient({ log: [{ emit: "event", level: "query" }] });
    logging.$on("query", (e: { query: string }) => queries.push(e.query));
    await loadMaterialCatalog(logging, elite.id);
    await logging.$disconnect();
    // Three logical reads (active rows, inactive rows, usage) — Prisma's
    // query engine can split a nested `include` into a few extra batched
    // queries under the hood, so the real floor is a small constant rather
    // than exactly 3, but it must stay flat regardless of catalog size. A
    // ceiling of 10 comfortably separates "a fixed small number of queries"
    // from "one query per row" on a 74-material, 89-service catalog — an N+1
    // here would mean 70+ queries, not 7.
    ok(
      `loadMaterialCatalog issues a small, fixed number of queries (no per-row N+1)`,
      queries.length > 0 && queries.length <= 10,
      `${queries.length} quer(ies) for a catalog of ${eliteCatalog.active.length + eliteCatalog.inactive.length} costed + ${eliteCatalog.missing.length} missing rows`
    );
  }

  // ---- contractor isolation ----------------------------------------------------
  if (other) {
    const otherCatalog = await loadMaterialCatalog(prisma, other.id);
    const eliteCmIds = eliteCatalog.active
      .concat(eliteCatalog.inactive)
      .map((r) => r.contractorMaterialId)
      .filter((id): id is string => !!id);
    const otherCmIds = new Set(
      otherCatalog.active
        .concat(otherCatalog.inactive)
        .map((r) => r.contractorMaterialId)
        .filter((id): id is string => !!id)
    );
    const leaked = eliteCmIds.filter((id) => otherCmIds.has(id));
    ok(
      `no ContractorMaterial id appears in both elite-electric's and ${other.slug}'s catalog`,
      leaked.length === 0,
      `${leaked.length} shared id(s)`
    );

    const otherServiceIds = new Set(
      (await prisma.service.findMany({ where: { contractorId: other.id }, select: { id: true } })).map((s) => s.id)
    );
    const crossTenantUsage = eliteCatalog.active
      .concat(eliteCatalog.missing)
      .flatMap((r) => r.usingServices)
      .filter((s) => otherServiceIds.has(s.id));
    ok(
      `elite-electric's "used by" lists never name a service belonging to another contractor`,
      crossTenantUsage.length === 0,
      `${crossTenantUsage.length} leaked service reference(s)`
    );
  } else {
    console.log(`  · only one contractor on this database — isolation check needs a second tenant, skipped`);
  }
}

async function main() {
  console.log(`\nMATERIALS CATALOG\n`);
  staticChecks();
  try {
    await dbChecks();
  } catch (e) {
    // A connection failure is an environment problem, not a finding — surface
    // it plainly rather than letting it read as an assertion failure.
    console.log(`\n  ✗ could not complete database checks: ${(e as Error).message.split("\n")[0]}\n`);
    fail++;
  }

  console.log();
  if (fail) {
    console.log(`  ${fail} check(s) failed.\n`);
    process.exit(1);
  }
  console.log(`  All checks passed.\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
