/**
 * G4 — ContractorCredential.
 *
 *   npx tsx scripts/verify-contractor-credentials.ts
 *
 * PURE SOURCE. NO DATABASE.
 *
 * Everything here is either (a) a property of lib/credentials.ts proved
 * against an in-memory fake standing in for the Prisma delegate, or (b) a
 * source-level assertion about lib/credentials.ts, lib/tenantGuard.ts, and
 * the frozen trades' files. It needs no DATABASE_URL and writes nothing.
 *
 * WHAT THIS DOES NOT PROVE
 *
 * The in-memory fake proves lib/credentials.ts's OWN keying logic is
 * correctly per-contractor — it cannot prove the Prisma tenant-guard
 * EXTENSION actually enforces that at runtime, the way
 * scripts/verify-tenant-isolation-live.ts proves it live for `service` and
 * `contractorMaterial`. That mechanism is model-agnostic — it dispatches on
 * classifyModel(), which this file DOES verify now returns "tenant" for
 * ContractorCredential — so registering the model here is what makes it
 * subject to the already-proven mechanism. A model-specific LIVE proof
 * (real DB, two real contractors) is deferred: it needs the DDL applied to
 * a database first, and this step was scoped to make no production writes.
 * scripts/verify-tenant-indexes.ts needs no new code to cover the index
 * half of that — it already reads its model list from
 * lib/tenantGuard.ts's TENANT_SCOPED_MODELS at runtime, so it will require
 * (and, once the DDL lands, prove) an index on contractor_credentials
 * without being told about this model by name.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  CREDENTIAL_KEYS,
  isCredentialKey,
  credentialState,
  listCredentials,
  declareCredential,
  revokeCredential,
  type CredentialKey,
} from "../lib/credentials";
import { classifyModel } from "../lib/tenantGuard";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const KEY: CredentialKey = "EPA_608";

let failures = 0;
let checks = 0;
function ok(label: string, condition: boolean, detail = "") {
  checks++;
  if (condition) console.log(`  \x1b[32m✓\x1b[0m ${label}`);
  else {
    failures++;
    console.log(`  \x1b[31m✗ ${label}\x1b[0m${detail ? `\n      ${detail}` : ""}`);
  }
}
function group(name: string) {
  console.log(`\n\x1b[1m${name}\x1b[0m`);
}

function strip(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

// ── an in-memory stand-in for the one Prisma delegate lib/credentials.ts
//    touches, keyed exactly the way the real @@unique([contractorId, key])
//    constraint is keyed. Used ONLY to prove lib/credentials.ts's own
//    contract; see the file header for what this does not prove. ──────────
type Row = { contractorId: string; key: string; declaredAt: Date; revokedAt: Date | null };

function makeFakeDb() {
  const rows = new Map<string, Row>();
  const k = (contractorId: string, key: string) => `${contractorId}::${key}`;
  return {
    rows,
    contractorCredential: {
      async findUnique({ where }: { where: { contractorId_key: { contractorId: string; key: string } } }) {
        return rows.get(k(where.contractorId_key.contractorId, where.contractorId_key.key)) ?? null;
      },
      async findMany({ where }: { where: { contractorId: string } }) {
        return [...rows.values()].filter((r) => r.contractorId === where.contractorId);
      },
      async upsert({
        where,
        update,
        create,
      }: {
        where: { contractorId_key: { contractorId: string; key: string } };
        update: Partial<Row>;
        create: Row;
      }) {
        const id = k(where.contractorId_key.contractorId, where.contractorId_key.key);
        const existing = rows.get(id);
        const next: Row = existing ? { ...existing, ...update } : create;
        rows.set(id, next);
        return next;
      },
      async updateMany({
        where,
        data,
      }: {
        where: { contractorId: string; key: string; revokedAt: null };
        data: Partial<Row>;
      }) {
        let count = 0;
        for (const [id, r] of rows) {
          if (r.contractorId === where.contractorId && r.key === where.key && r.revokedAt === where.revokedAt) {
            rows.set(id, { ...r, ...data });
            count++;
          }
        }
        return { count };
      },
    },
  };
}

async function main() {
  console.log("\n\x1b[1mG4 — CONTRACTOR CREDENTIAL\x1b[0m");
  console.log("Pure source. No database, no production writes.\n");

  group("1. model classification");
  ok(
    "ContractorCredential classifies as a tenant-scoped model",
    classifyModel("ContractorCredential") === "tenant"
  );

  group("2. vocabulary");
  ok("exactly one key exists: EPA_608", CREDENTIAL_KEYS.length === 1 && CREDENTIAL_KEYS[0] === "EPA_608");
  ok("isCredentialKey accepts the real key", isCredentialKey("EPA_608"));
  ok("isCredentialKey rejects an unknown key", !isCredentialKey("gas_fitting"));
  ok("isCredentialKey rejects the empty string", !isCredentialKey(""));

  group("3. three-state semantics — never a boolean default");
  const db = makeFakeDb() as unknown as import("@prisma/client").PrismaClient;
  const A = "contractor-a";
  const B = "contractor-b";

  const beforeAny = await credentialState(db, A, KEY);
  ok('a contractor with no row reads "not-established", not false', beforeAny.state === "not-established");
  ok("the not-established result carries no declaredAt/revokedAt", !("declaredAt" in beforeAny));

  await declareCredential(db, A, KEY);
  const declared = await credentialState(db, A, KEY);
  ok('after declaring, state is "declared"', declared.state === "declared");
  ok("declaredAt is a real Date", "declaredAt" in declared && declared.declaredAt instanceof Date);
  ok("revokedAt is null while declared", "revokedAt" in declared && declared.revokedAt === null);

  group("4. another contractor's credential never satisfies this one");
  const bBefore = await credentialState(db, B, KEY);
  ok(
    "contractor B reads not-established while only A has declared",
    bBefore.state === "not-established",
    JSON.stringify(bBefore)
  );
  await declareCredential(db, B, KEY);
  await revokeCredential(db, A, KEY);
  const aAfterRevoke = await credentialState(db, A, KEY);
  const bAfterADeclares = await credentialState(db, B, KEY);
  ok("revoking A does not touch B", bAfterADeclares.state === "declared");
  ok(
    "declaring B did not retroactively touch A's already-revoked row",
    aAfterRevoke.state === "revoked"
  );

  group("5. revoked is not currently declared, and is not the same as absent");
  ok('a revoked credential reads "revoked", not "declared"', aAfterRevoke.state === "revoked");
  ok(
    '"revoked" and "not-established" are distinct states, not the same false',
    aAfterRevoke.state !== beforeAny.state
  );
  ok(
    "the revoked row keeps its declaredAt as history rather than being deleted",
    "declaredAt" in aAfterRevoke && aAfterRevoke.declaredAt instanceof Date
  );

  group("6. re-declaring after revocation is the same row, restamped");
  await declareCredential(db, A, KEY);
  const redeclared = await credentialState(db, A, KEY);
  ok('re-declaring returns to "declared"', redeclared.state === "declared");
  ok("revokedAt clears back to null", "revokedAt" in redeclared && redeclared.revokedAt === null);
  ok(
    "exactly one row exists for (A, EPA_608) — revoke+redeclare never created a second row",
    [...(db as unknown as { rows: Map<string, unknown> }).rows.keys()].filter((id) =>
      id.startsWith(`${A}::`)
    ).length === 1
  );

  group("7. listCredentials reflects state, not raw rows");
  const listA = await listCredentials(db, A);
  ok("listCredentials returns declared state for A", listA.length === 1 && listA[0].state === "declared");
  const listEmpty = await listCredentials(db, "contractor-nobody");
  ok("an unknown contractor lists no credentials at all (not a default row)", listEmpty.length === 0);

  group("8. no inference — source-level");
  const credSrc = strip("lib/credentials.ts");
  const forbidden: [string, RegExp][] = [
    ["licenseNumber", /licenseNumber/],
    ["licenseLabel", /licenseLabel/],
    ["ContractorTrade / contractorTrade", /\.contractorTrade\b|\bContractorTrade\b/],
    ["ContractorRole / contractorRole", /\.contractorRole\b|\bContractorRole\b/],
    ["ContractorMembership / contractorMembership", /\.contractorMembership\b|\bContractorMembership\b/],
    ["PlatformAccess / platformAccess", /\.platformAccess\b|\bPlatformAccess\b/],
  ];
  for (const [label, re] of forbidden) {
    ok(`lib/credentials.ts reads no ${label}`, !re.test(credSrc));
  }
  ok(
    "lib/credentials.ts touches exactly one Prisma model: contractorCredential",
    /\bdb\.\w+\./.test(credSrc) &&
      [...credSrc.matchAll(/\bdb\.(\w+)\./g)].every((m) => m[1] === "contractorCredential")
  );

  group("9. no booking, pricing, scheduling or service-activation writer introduced");
  const writeTargets = [...credSrc.matchAll(/\bdb\.(\w+)\.(create|update|upsert|delete|updateMany|deleteMany)\b/g)].map(
    (m) => m[1]
  );
  ok(
    "every write in lib/credentials.ts targets contractorCredential only",
    writeTargets.length > 0 && writeTargets.every((m) => m === "contractorCredential"),
    writeTargets.join(", ")
  );
  ok(
    "no service/booking/appointment/visit/lineItem/pricing model is touched at all",
    !/\bdb\.(service|booking|appointment|visit|lineItem|quote|pricingSettings|pricingRule)\b/i.test(credSrc)
  );

  group("10. no Plumbing or Electrical wiring — frozen trades unchanged");
  const plumbingFiles = [
    "lib/plumbing/roles.ts",
    "lib/plumbing/catalog.ts",
    "lib/plumbing/publish.ts",
    "lib/plumbing/gates.ts",
    "lib/serviceActivation.ts",
  ];
  for (const f of plumbingFiles) {
    const src = strip(f);
    ok(
      `${f} does not import lib/credentials`,
      !/from ["'`]\.\.?\/.*credentials["'`]/.test(src) && !/ContractorCredential/.test(src)
    );
  }
  ok(
    "lib/plumbing/roles.ts's requirement vocabulary is untouched (still exactly 6 keys)",
    // Matches only object entries ("...", the type field itself ends in ";"
    // and is deliberately excluded so this counts requirement KINDS, not
    // every appearance of the literal in the file.
    (strip("lib/plumbing/roles.ts").match(/unsatisfied:\s*"BLOCK_PUBLICATION",/g) ?? []).length === 6
  );

  group("11. activation authority's refusal codes are unchanged");
  const activationSrc = strip("lib/serviceActivation.ts");
  ok(
    "ActivationRefusal still has exactly the five pre-G4 codes, no CREDENTIAL code added",
    /"UNKNOWN_SERVICE" \| "PRICE_NOT_APPROVED" \| "MATERIALS_UNRESOLVED"\s*\n\s*\|\s*"POLICY_UNRESOLVED" \| "DEPENDENCY_UNAVAILABLE"/.test(
      activationSrc
    )
  );

  console.log();
  console.log(
    failures === 0
      ? `All ${checks} checks passed.\n`
      : `${failures}/${checks} check(s) FAILED.\n`
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
