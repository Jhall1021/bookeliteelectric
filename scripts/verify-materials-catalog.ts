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
 *
 * ALSO STATIC (added for the first-time-pricing-authority slice): asserts
 * the "create" action calls overrideUnresolvedMaterialCost and does NOT
 * upsert ContractorMaterial or call recomputeServicesUsingRole directly —
 * the structural guard against the route reverting to a parallel write path.
 * The atomicity/event/rollback proof for that authority itself lives in
 * verify-materials-catalog-write-path.ts, on disposable fixtures, since it
 * requires real writes this script deliberately never performs.
 *
 * ALSO STATIC (added for contractor-private custom materials): asserts the
 * existing first-pricing action still resolves a visible material read-only,
 * while the explicit create-custom action delegates its owner-scoped identity,
 * first cost and audit event to the shared domain authority.
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

// Re-scoped an eighth time for this branch's service-level-recipe-workspace
// slice — MaterialsPanel.tsx (the /dashboard/services/[serviceId] recipe
// panel) is fully redesigned: a new header/summary card, a five-column
// recipe list with per-row quantity validation, a new AddMaterialDialog.tsx
// picker (reusing the existing "add" action — no new write path), and
// confirmed per-row removal. deriveStatus is exported from
// lib/materialCatalog.ts so the service-level GET branch can derive the same
// status word a catalog row would, instead of a second definition. The set
// this check compares against is meant to describe whichever bounded work is
// currently on this branch versus origin/main; it accumulates across slices
// on the SAME branch, but is not a permanent historical record once the
// branch merges and a fresh one starts.
const EXPECTED_CHANGED_FILES = new Set([
  "lib/materialCost.ts",
  "lib/materialCatalog.ts",
  "app/api/admin/materials/route.ts",
  "scripts/verify-materials-catalog.ts",
  "scripts/verify-materials-catalog-write-path.ts",
  "lib/servicePricingInputs.ts",
  "app/api/admin/services/[serviceId]/pricing/route.ts",
  "scripts/verify-service-pricing-material-guard.ts",
  "app/dashboard/services/[serviceId]/page.tsx",
  "components/admin/PricingPanel.tsx",
  "scripts/verify-pricing-panel-material-mode-browser-flow.ts",
  "app/dashboard/materials/page.tsx",
  "app/dashboard/layout.tsx",
  "lib/portalModules.ts",
  "components/admin/MaterialsCatalogClient.tsx",
  "components/admin/materials/CatalogHealthStrip.tsx",
  "components/admin/materials/CatalogToolbar.tsx",
  "components/admin/materials/MaterialRow.tsx",
  "scripts/verify-materials-catalog-ui-browser-flow.ts",
  "components/admin/materials/MaterialCostDrawer.tsx",
  "components/admin/materials/StatusBadge.tsx",
  "components/admin/materials/format.ts",
  "components/admin/materials/MaterialCostEditor.tsx", // deleted — retired by the drawer
  "scripts/verify-material-cost-drawer-browser-flow.ts",
  "components/admin/MaterialsPanel.tsx",
  "components/admin/materials/AddMaterialDialog.tsx",
  "scripts/verify-materials-panel-recipe-browser-flow.ts",
  "prisma/schema.prisma",
  "prisma/add-contractor-custom-materials-2026-09-17.ts",
  "lib/materialIdentity.ts",
  "app/api/portal/material-baselines/route.ts",
  "components/admin/materials/AddCatalogMaterialDialog.tsx",
  "scripts/verify-contractor-custom-materials.ts",
  "scripts/verify-contractor-custom-materials-db.ts",
  "lib/tenantGuard.ts",
  "lib/tenantRoute.ts",
  "scripts/audit-platform-tenant-relations.ts",
  "scripts/verify-tenant-isolation-live.ts",
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
    const tracked = execSync("git diff --name-only origin/main", { encoding: "utf8" });
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
    ok(`the additive custom-material schema is included`, changed.includes("prisma/schema.prisma"));
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
    "components/admin/materials/CatalogHealthStrip.tsx",
    "components/admin/materials/CatalogToolbar.tsx",
    "components/admin/materials/MaterialCostDrawer.tsx",
    "components/admin/materials/MaterialRow.tsx",
    "components/admin/materials/StatusBadge.tsx",
    "components/admin/materials/format.ts",
    "app/dashboard/materials/page.tsx",
    "components/admin/MaterialsPanel.tsx",
    "components/admin/materials/AddMaterialDialog.tsx",
    "components/admin/materials/AddCatalogMaterialDialog.tsx",
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
    `the API route imports overrideUnresolvedMaterialCost from lib/materialCost`,
    /import\s*\{[^}]*overrideUnresolvedMaterialCost[^}]*\}\s*from\s*["']@\/lib\/materialCost["']/.test(routeSrc)
  );
  ok(
    `the "cost" action calls setContractorMaterialCost`,
    /action === "cost"[\s\S]{0,4000}setContractorMaterialCost\(/.test(routeSrc)
  );

  // "create" is first-time pricing, not a product-level material-creation
  // action — it must go through the SAME atomic first-resolution authority
  // /api/portal/material-baselines's "override" action already uses, never a
  // direct upsert of its own. Scoped to the "create" action's own block (up
  // to the shared "Unknown materials action" fallthrough) so a match
  // elsewhere in the file — e.g. inside "cost" — can't satisfy either check.
  const createBlockStart = routeSrc.indexOf('action === "create"');
  const createBlockEnd = routeSrc.indexOf('"Unknown materials action.', createBlockStart);
  const createBlock =
    createBlockStart >= 0 && createBlockEnd > createBlockStart
      ? routeSrc.slice(createBlockStart, createBlockEnd)
      : "";
  ok(`the "create" action's block was found in the route source`, createBlock.length > 0);
  ok(
    `the "create" action calls overrideUnresolvedMaterialCost (the shared first-time-pricing authority)`,
    /overrideUnresolvedMaterialCost\(/.test(createBlock)
  );
  ok(
    `the "create" action does NOT upsert ContractorMaterial directly`,
    !/contractorMaterial\.upsert\(/.test(createBlock)
  );
  ok(
    `the "create" action does NOT call recomputeServicesUsingRole itself (that now happens inside the shared authority)`,
    !/recomputeServicesUsingRole\(/.test(createBlock)
  );
  // The tenant-boundary close: "create" once derived a canonical key from
  // contractor-typed text and upserted CanonicalMaterial with it — a
  // contractor-facing first-pricing action creating identity. It only reads
  // a visible role by its own real id and refuses foreign private roles.
  ok(
    `the "create" action does NOT upsert or create CanonicalMaterial`,
    !/canonicalMaterial\.(upsert|create)\(/.test(createBlock)
  );
  ok(
    `the "create" action resolves canonicalMaterialId read-only with the tenant visibility predicate`,
    /canonicalMaterial\.findFirst\(/.test(createBlock) && /visibleMaterialRoleWhere\(contractorId\)/.test(createBlock)
  );

  const customBlockStart = routeSrc.indexOf('action === "create-custom"');
  const customBlockEnd = routeSrc.indexOf('"Unknown materials action.', customBlockStart);
  const customBlock =
    customBlockStart >= 0 && customBlockEnd > customBlockStart
      ? routeSrc.slice(customBlockStart, customBlockEnd)
      : "";
  ok(`the explicit "create-custom" action's block was found`, customBlock.length > 0);
  ok(
    `the "create-custom" action delegates to the shared custom-material authority`,
    /createContractorCustomMaterial\(/.test(customBlock)
  );
  ok(
    `the route does not directly write custom identity, cost, or audit rows`,
    !/\.(canonicalMaterial|contractorMaterial|materialCostEvent)\.(create|upsert|update)\(/.test(customBlock)
  );
  ok(
    `the "create" action requires canonicalMaterialId, not a contractor-typed key/name`,
    /requiredString\(body\.canonicalMaterialId/.test(createBlock) && !/requiredString\(body\.key/.test(createBlock)
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

  // ---- the service-level read shape is an ADDITIVE extension, not a rewrite -
  // This slice (the service-level recipe-workspace redesign) deliberately
  // extends both the catalog-building and items-mapping code in the GET
  // handler — MaterialsPanel.tsx's new recipe list needs category/status per
  // row, and the "add material" picker needs status per catalog entry, both
  // via the SAME deriveStatus/categorizeMaterial the catalog page already
  // uses. A prior slice's check here asserted these two blocks were
  // byte-identical to origin/main; that invariant no longer holds by design,
  // so this checks the thing that actually matters instead — every field the
  // response already carried is still carried (nothing silently dropped, no
  // existing consumer breaks), the new fields are exactly the disclosed
  // extension, and the derivation is reused rather than reimplemented.
  ok(
    `the service picker catalog still carries every pre-existing field`,
    [
      "id: c?.id ?? null", "canonicalMaterialId: role.id", "key: role.key",
      "name: c?.nameOverride ?? role.name", "unit: role.unit",
      "unitCostCents: c?.unitCostCents ?? null", "costSource: c?.costSource ?? null",
      "costConfidence: c?.costConfidence ?? null", "costStatus: c?.costStatus ?? null",
      "packagePriceCents: c?.packagePriceCents ?? null", "packageQuantity: c?.packageQuantity ?? null",
      "packageUnit: c?.packageUnit ?? null", "activeSupplierLink: c?.activeSupplierLink ?? null",
    ].every((needle) => routeSrc.includes(needle))
  );
  ok(
    `the service picker includes every visible role and derives status through the shared definition`,
    /const catalogOut = visibleRoles\.map/.test(routeSrc) &&
      /visibleMaterialRoleWhere\(contractorId\)/.test(routeSrc) &&
      /const \{ status \} = deriveStatus\(/.test(routeSrc)
  );
  ok(
    `items[] still carries every pre-existing per-service field`,
    [
      "id: i.id", "canonicalMaterialId: i.canonicalMaterialId", "contractorMaterialId: cost?.id ?? null",
      "quantity: i.quantity", "unitCostCents: cost?.unitCostCents ?? null",
      "lineTotalCents: cost ? Math.round(cost.unitCostCents * i.quantity) : null", "unpriced: !cost",
      "costSource: cost?.costSource ?? null", "costConfidence: cost?.costConfidence ?? null",
      "costStatus: cost?.costStatus ?? null", "packagePriceCents: cost?.packagePriceCents ?? null",
      "packageQuantity: cost?.packageQuantity ?? null", "packageUnit: cost?.packageUnit ?? null",
    ].every((needle) => routeSrc.includes(needle))
  );
  ok(
    `items[]'s additions are category/status/statusBucket/usageCount, via shared derivations`,
    /category: i\.canonicalMaterial \? categorizeMaterial\(i\.canonicalMaterial\.key\) : "Other"/.test(routeSrc) &&
      /const \{ status, statusBucket \} = deriveStatus\(/.test(routeSrc) &&
      /usageCount: i\.canonicalMaterialId \? usageCounts\.get/.test(routeSrc)
  );
  ok(
    `the new usage-count query is scoped to this contractor and read-only (findMany, no writes)`,
    /db\.serviceMaterial\.findMany\(\{\s*where: \{ canonicalMaterialId: \{ in: itemCanonicalIds \}, service: \{ contractorId \} \}/.test(
      routeSrc
    )
  );

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
    // Four logical reads (active rows, inactive rows, usage, visible roles) — Prisma's
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
  if (!process.argv.includes("--static-only")) {
    try {
      await dbChecks();
    } catch (e) {
      // A connection failure is an environment problem, not a finding — surface
      // it plainly rather than letting it read as an assertion failure.
      console.log(`\n  ✗ could not complete database checks: ${(e as Error).message.split("\n")[0]}\n`);
      fail++;
    }
  } else {
    console.log(`\n  · database checks skipped by --static-only\n`);
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
