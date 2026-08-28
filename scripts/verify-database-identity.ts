/**
 * The connected database is the one we meant — ADR-013.
 *
 * > Production database identity is a verified property, not an
 * > environment-variable label.
 *
 * `DATABASE_URL` records where we connected. It cannot say what we connected
 * TO: a URL is a claim, and a wrong one is indistinguishable from a right one
 * until something reads the data.
 *
 * WHY POSTGRES CANNOT ANSWER THIS ON NEON
 *
 * Measured against this project's own production database and a branch of it:
 *
 *   pg_control_system().system_identifier   IDENTICAL (7674717396095314125)
 *   current_database()                      IDENTICAL ("neondb")
 *   inet_server_addr()                      IDENTICAL (169.254.254.254)
 *
 * A Neon branch is a copy-on-write clone and shares its parent's lineage, so
 * every intrinsic identifier matches. Asking the server who it is would return
 * "production" while connected to a copy — the precise failure that produced
 * two unusable rehearsal branches, one of them empty and named "production".
 *
 * SO: A STAMPED MARKER, CHECKED AGAINST THE LIVE ENDPOINT
 *
 * The DatabaseIdentity row records the endpoint it was stamped for. A copy
 * inherits the row verbatim, so the marker alone proves nothing — but the
 * endpoint in it will no longer match the endpoint actually connected to, and
 * that mismatch is the signal. A clone fails until someone deliberately
 * re-stamps it, which is exactly the moment a human decides the copy is now
 * the real database.
 *
 *   --expect <key>   required role, e.g. price2book-production
 *   --stamp          write/replace the marker for the connected database
 *   --project <id>   Neon project id, required with --stamp
 *   --note <text>    optional
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const urlVar = arg("url-var") ?? "DATABASE_URL";
const url = process.env[urlVar];
if (!url) { console.error(`\n  ${urlVar} is not set.\n`); process.exit(1); }

/** The endpoint actually connected to, read from the live connection string. */
function liveEndpoint(u: string): string {
  const host = u.replace(/^.*@/, "").split("/")[0];
  return host.split(".")[0];
}

const prisma = new PrismaClient({ datasources: { db: { url } } });

async function main() {
  const endpoint = liveEndpoint(url!);
  const stamp = process.argv.includes("--stamp");
  const expect = arg("expect") ?? process.env.EXPECTED_DATABASE_IDENTITY;

  console.log(`\nDATABASE IDENTITY`);
  console.log(`  connected endpoint: ${endpoint}   (from ${urlVar})\n`);

  if (stamp) {
    const key = arg("expect");
    const project = arg("project");
    if (!key || !project) {
      console.error("  --stamp requires --expect <key> and --project <neon project id>\n");
      process.exitCode = 1;
      return;
    }
    await prisma.databaseIdentity.upsert({
      where: { id: "singleton" },
      update: { key, neonProject: project, neonEndpoint: endpoint, note: arg("note") ?? null, stampedAt: new Date() },
      create: { key, neonProject: project, neonEndpoint: endpoint, note: arg("note") ?? null },
    });
    console.log(`  STAMPED  key=${key}  project=${project}  endpoint=${endpoint}\n`);
  }

  const row = await prisma.databaseIdentity.findUnique({ where: { id: "singleton" } });
  let failed = 0;
  const ok = (c: boolean, label: string, detail = "") => {
    if (c) console.log(`  ok    ${label}`);
    else { failed++; console.log(`  FAIL  ${label}${detail ? `\n          ${detail}` : ""}`); }
  };

  ok(row !== null, "the database carries an identity marker",
     "unstamped — run with --stamp once you have decided what this database is");
  if (!row) { process.exitCode = 1; return; }

  console.log(`        key=${row.key}  project=${row.neonProject}  stamped=${row.stampedAt.toISOString().slice(0, 19)}`);

  ok(row.neonEndpoint === endpoint,
     "the marker was stamped for the endpoint we are connected to",
     `marker says ${row.neonEndpoint}, connected to ${endpoint} — this looks like an ` +
     `un-restamped COPY of another database`);

  if (expect) {
    ok(row.key === expect, `the marker's role is "${expect}"`, `it is "${row.key}"`);
  } else {
    console.log(`  note  no --expect / EXPECTED_DATABASE_IDENTITY given; role not checked`);
  }

  console.log("\n" + "─".repeat(74));
  if (failed) {
    console.log(`\n  ${failed} check(s) failed. Do NOT treat this database as ${expect ?? "the intended one"}.\n`);
    process.exitCode = 1;
  } else {
    console.log(`\n  Verified: this is ${row.key}.\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
