/**
 * Jobber account switching must pass through Disconnect.
 *
 * Re-authorizing OAuth over an existing connection is unsafe: the new tokens
 * may belong to a different Jobber account while cached crew eligibility still
 * belongs to the old one. This verifier proves the server lifecycle, not the UI:
 *
 *   1. /connect refuses to start OAuth while a connection already exists.
 *   2. /disconnect clears both the connection and cached crew in one transaction.
 *   3. Both operations are scoped to the authenticated contractor.
 *
 * No database, Jobber credentials, network, or environment are required.
 */

import { readFileSync } from "node:fs";

let failures = 0;

function ok(label: string, condition: boolean) {
  if (!condition) failures += 1;
  console.log(`  ${condition ? "✓" : "✗"} ${label}`);
}

function source(path: string) {
  return readFileSync(path, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");
}

function main() {
  console.log("\nJOBBER ACCOUNT SWITCH — disconnect before reconnect\n");

  const connect = source("app/api/admin/jobber/connect/route.ts");
  const disconnect = source("app/api/admin/jobber/disconnect/route.ts");

  ok(
    "1. connect resolves the authenticated contractor",
    /resolveAdminContractor\(\)/.test(connect)
  );
  ok(
    "2. connect checks for an existing contractor-owned Jobber connection",
    /jobberConnection\.findUnique\([\s\S]*where:\s*\{\s*contractorId\s*\}/.test(connect)
  );
  ok(
    "3. an existing connection is refused before OAuth state is created",
    connect.indexOf("if (existingConnection)") >= 0 &&
      connect.indexOf("if (existingConnection)") < connect.indexOf("const state = randomUUID()") &&
      /already_connected/.test(connect)
  );

  ok(
    "4. disconnect runs under the tenant-scoped admin route",
    /withAdminRoute\(/.test(disconnect)
  );
  ok(
    "5. disconnect deletes cached crew for the authenticated contractor",
    /jobberCrewMember\.deleteMany\(\{\s*where:\s*\{\s*contractorId:\s*ctx\.contractorId\s*\}/.test(disconnect)
  );
  ok(
    "6. disconnect deletes the Jobber connection for the authenticated contractor",
    /jobberConnection\.deleteMany\(\{\s*where:\s*\{\s*contractorId:\s*ctx\.contractorId\s*\}/.test(disconnect)
  );
  ok(
    "7. crew and credentials are cleared in the same database transaction",
    /db\.\$transaction\(\[([\s\S]*?)jobberCrewMember\.deleteMany([\s\S]*?)jobberConnection\.deleteMany([\s\S]*?)\]\)/.test(disconnect)
  );

  console.log();
  console.log(
    failures
      ? `  ${failures} check(s) failed.\n`
      : "  Jobber account changes must clear old connection-bound crew before OAuth can restart.\n"
  );
  if (failures) process.exit(1);
}

main();
