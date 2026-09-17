/**
 * Contractor-private custom materials — structural and pure-function guards.
 *
 *   node --import tsx scripts/verify-contractor-custom-materials.ts
 *
 * This verifier deliberately needs no database. The browser flow exercises
 * the real API and persistence on an isolated test database after the additive
 * schema migration has been applied there.
 */

import { readFileSync } from "node:fs";
import {
  customMaterialKey,
  normalizeCustomMaterialName,
  visibleMaterialRoleWhere,
} from "../lib/materialIdentity";
import { classifyModel, scopeArgs } from "../lib/tenantGuard";
import { CrossTenantError } from "../lib/tenantContext";

let failures = 0;
function check(label: string, condition: boolean) {
  console.log(`  ${condition ? "✓" : "✗"} ${label}`);
  if (!condition) failures++;
}

function source(path: string) {
  return readFileSync(path, "utf8");
}

console.log("\nCONTRACTOR-PRIVATE CUSTOM MATERIALS\n");

const schema = source("prisma/schema.prisma");
check(
  "CanonicalMaterial has an optional contractor owner",
  /ownerContractorId\s+String\?/.test(schema) && /ContractorCustomMaterialRoles/.test(schema),
);
check(
  "normalized names are unique within one contractor",
  /@@unique\(\[ownerContractorId, ownerNormalizedName\]\)/.test(schema),
);

const migration = source("prisma/add-contractor-custom-materials-2026-09-17.ts");
check(
  "migration requires an unpooled direct database URL",
  migration.includes("DATABASE_URL_UNPOOLED") && migration.includes('includes("-pooler")'),
);
check(
  "migration is report-only unless --apply is explicit",
  migration.includes('process.argv.includes("--apply")') && migration.includes("Report only"),
);
check(
  "migration requires private owners and normalized names to appear together",
  migration.includes("canonical_materials_owner_name_consistency_check"),
);

const authority = source("lib/materialCost.ts");
const authorityStart = authority.indexOf("export async function createContractorCustomMaterial");
const authorityEnd = authority.indexOf("export type OfferedBaseline", authorityStart);
const authorityBlock = authority.slice(authorityStart, authorityEnd);
check("custom-material authority exists", authorityStart >= 0 && authorityEnd > authorityStart);
check(
  "identity, first cost and event share one transaction",
  /db\.\$transaction/.test(authorityBlock) &&
    /tx\.canonicalMaterial\.create/.test(authorityBlock) &&
    /createResolvedContractorMaterialInTransaction/.test(authorityBlock),
);
check(
  "custom identity is always stamped with its contractor owner",
  /ownerContractorId:\s*input\.contractorId/.test(authorityBlock),
);

const route = source("app/api/admin/materials/route.ts");
check(
  "recipe additions enforce material visibility",
  /action === "add"[\s\S]*?canonicalMaterial\.findFirst\([\s\S]*?visibleMaterialRoleWhere\(contractorId\)/.test(route),
);
check(
  "custom creation delegates to the domain authority",
  /action === "create-custom"[\s\S]*?createContractorCustomMaterial\(/.test(route),
);

const baselineRoute = source("app/api/portal/material-baselines/route.ts");
check(
  "platform baseline overrides exclude contractor-private identities",
  /ownerContractorId:\s*null/.test(baselineRoute),
);

const client = source("components/admin/MaterialsCatalogClient.tsx");
const dialog = source("components/admin/materials/AddCatalogMaterialDialog.tsx");
check(
  "Materials page exposes the Add material control",
  client.includes("Add material") && client.includes("AddCatalogMaterialDialog"),
);
check(
  "dialog supports both Price2Book catalog selection and private custom creation",
  dialog.includes("Choose a Price2Book material") && dialog.includes("Create custom material"),
);

check(
  "name normalization is Unicode-aware, trimmed, whitespace-collapsed and case-insensitive",
  normalizeCustomMaterialName("  ＧＦＣＩ   Outlet  ") ===
    normalizeCustomMaterialName("gfci outlet"),
);
const visibility = visibleMaterialRoleWhere("contractor-a");
check(
  "visibility means platform roles OR the current contractor's private roles",
  JSON.stringify(visibility) ===
    JSON.stringify({ active: true, OR: [{ ownerContractorId: null }, { ownerContractorId: "contractor-a" }] }),
);
check("CanonicalMaterial is classified as hybrid, not globally platform", classifyModel("CanonicalMaterial") === "hybrid");
const guardedRead = scopeArgs("CanonicalMaterial", "findMany", {}, "contractor-a");
check(
  "the shared tenant guard applies platform-or-owner visibility",
  JSON.stringify(guardedRead).includes('"ownerContractorId":null') &&
    JSON.stringify(guardedRead).includes('"ownerContractorId":"contractor-a"'),
);
const guardedCreate = scopeArgs(
  "CanonicalMaterial",
  "create",
  { data: { key: "CUSTOM_TEST", name: "Test" } },
  "contractor-a",
);
check(
  "the shared tenant guard stamps custom identity creation with its owner",
  (guardedCreate.data as { ownerContractorId?: string }).ownerContractorId === "contractor-a",
);
let foreignOwnerRefused = false;
try {
  scopeArgs(
    "CanonicalMaterial",
    "create",
    { data: { key: "CUSTOM_TEST", name: "Test", ownerContractorId: "contractor-b" } },
    "contractor-a",
  );
} catch (error) {
  foreignOwnerRefused = error instanceof CrossTenantError;
}
check("the shared tenant guard refuses a foreign custom-material owner", foreignOwnerRefused);
const key = customMaterialKey("contractor-a", "7ac1-2f");
check(
  "custom keys are opaque internal identifiers, not names or supplier SKUs",
  key === "CUSTOM_CONTRACTOR_A_7AC1_2F",
);

for (const path of [
  "components/admin/MaterialsCatalogClient.tsx",
  "components/admin/materials/AddCatalogMaterialDialog.tsx",
  "lib/materialIdentity.ts",
  "lib/tenantGuard.ts",
]) {
  const contents = source(path);
  check(`${path} does not write published base prices`, !/\b(basePrice|whileWeThereBasePrice)\b/.test(contents));
}

if (failures) {
  console.error(`\n${failures} custom-material check(s) failed.\n`);
  process.exit(1);
}
console.log("\nAll custom-material checks passed.\n");
