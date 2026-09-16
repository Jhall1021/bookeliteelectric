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
import { MATERIAL_CATEGORIES } from "../lib/materialCategory";

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
  "components/portal/PortalChrome.tsx",
  "components/admin/MaterialsCatalogClient.tsx",
  "app/dashboard/materials/page.tsx",
  "app/api/admin/materials/route.ts",
  "scripts/verify-materials-catalog.ts",
  "package.json",
]);

function staticChecks() {
  console.log(`\nSTATIC CHECKS (no database)\n`);

  // ---- nothing touched outside this slice's own files ----------------------
  // Committed changes plus untracked new files — a fresh file with no commit
  // yet would otherwise pass this check by omission.
  let changed: string[] = [];
  try {
    const tracked = execSync("git diff --name-only main...HEAD", { encoding: "utf8" });
    const untracked = execSync("git ls-files --others --exclude-standard", { encoding: "utf8" });
    changed = [...tracked.split("\n"), ...untracked.split("\n")].map((l) => l.trim()).filter(Boolean);
  } catch (e) {
    console.log(`  · could not diff against main (${(e as Error).message.split("\n")[0]}) — skipping diff-scoped checks`);
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
    /action === "cost"[\s\S]{0,2000}setContractorMaterialCost\(/.test(routeSrc)
  );
  ok(
    `the "create" action recomputes via recomputeServicesUsingRole (shared helper, not a local reimplementation)`,
    /action === "create"[\s\S]{0,3000}recomputeServicesUsingRole\(/.test(routeSrc)
  );

  // ---- nav wiring ------------------------------------------------------------
  const modulesSrc = readFileSync("lib/portalModules.ts", "utf8");
  const chromeSrc = readFileSync("components/portal/PortalChrome.tsx", "utf8");
  ok(`/dashboard/materials is registered in lib/portalModules.ts`, modulesSrc.includes("/dashboard/materials"));
  ok(`/dashboard/materials is in the primary portal nav`, chromeSrc.includes("/dashboard/materials"));

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
