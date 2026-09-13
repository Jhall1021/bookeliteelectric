/**
 * Jobber account switching must pass through Disconnect.
 *
 * Re-authorizing OAuth over an existing connection is unsafe: the new tokens
 * may belong to a different Jobber account while cached crew eligibility still
 * belongs to the old one. This verifier proves the server lifecycle, not the UI:
 *
 *   1. /connect refuses to start OAuth while a connection already exists.
 *   2. /callback creates the connection once; it never overwrites one.
 *   3. /disconnect clears both the connection and cached crew in one transaction.
 *   4. All ownership comes from the authenticated contractor context.
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
  const callback = source("app/api/admin/jobber/callback/route.ts");
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
    "4. callback re-resolves the authenticated contractor",
    /resolveAdminContractor\(\)/.test(callback)
  );
  ok(
    "5. callback writes a new Jobber connection with create, not upsert",
    /jobberConnection\.create\(/.test(callback) &&
      !/jobberConnection\.upsert\(/.test(callback) &&
      !/saveJobberTokens\(/.test(callback)
  );
  ok(
    "6. a concurrent callback losing the unique race becomes already_connected",
    /isUniqueViolation\(err\)/.test(callback) && /already_connected/.test(callback)
  );
  ok(
    "7. callback stamps the authenticated contractor on the new connection",
    /data:\s*\{[\s\S]*contractorId[\s\S]*accessToken/.test(callback)
  );

  ok(
    "8. disconnect runs under the tenant-scoped admin route",
    /withAdminRoute\(/.test(disconnect)
  );
  ok(
    "9. disconnect deletes cached crew for the authenticated contractor",
    /jobberCrewMember\.deleteMany\(\{\s*where:\s*\{\s*contractorId:\s*ctx\.contractorId\s*\}/.test(disconnect)
  );
  ok(
    "10. disconnect deletes the Jobber connection for the authenticated contractor",
    /jobberConnection\.deleteMany\(\{\s*where:\s*\{\s*contractorId:\s*ctx\.contractorId\s*\}/.test(disconnect)
  );
  ok(
    "11. crew and credentials are cleared in the same database transaction",
    /db\.\$transaction\(\[([\s\S]*?)jobberCrewMember\.deleteMany([\s\S]*?)jobberConnection\.deleteMany([\s\S]*?)\]\)/.test(disconnect)
  );

  console.log();
  console.log(
    failures
      ? `  ${failures} check(s) failed.\n`
      : "  The first successful OAuth callback wins; changing accounts requires a full disconnect.\n"
  );
  if (failures) process.exit(1);
}

main();
