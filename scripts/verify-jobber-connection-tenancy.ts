/**
 * Jobber OAuth tokens never cross a tenant boundary.
 *
 * WHAT WAS WRONG
 *
 * `JobberConnection.id` defaulted to the literal string "default", and
 * `saveJobberTokens` upserted on `where: { id: "default" }`. Every connection
 * was therefore the SAME ROW. A second contractor completing OAuth matched the
 * first contractor's row and updated it — writing their access and refresh
 * tokens over the first contractor's, while `contractorId` still named the
 * first contractor.
 *
 * The read path had the same key, so afterwards every Jobber call in the
 * product used whichever tokens landed last, against whichever account they
 * belonged to. That is not a data leak in the usual sense: it dispatches real
 * crews from one business's calendar using another business's credentials.
 *
 * WHAT ENFORCES IT NOW
 *
 *   database   contractorId @unique — one connection per contractor, and it
 *              already existed; nothing was relying on it
 *   write      upsert keyed on contractorId, never on a literal id
 *   read       getValidJobberAccessToken(contractorId) and every Jobber call
 *              takes contractorId as its FIRST argument, so omitting it is a
 *              compile error rather than a silent fallback
 *   callback   the OAuth callback resolves the contractor from the admin
 *              SESSION, never from anything the browser supplied
 *
 * Creates a throwaway contractor, proves the isolation, and removes it.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { saveJobberTokens } from "../lib/jobber";

loadEnv();
const prisma = new PrismaClient();

const DUMMY_SLUG = "__jobber_tenancy_probe__";
let pass = 0, fail = 0;
function ok(cond: boolean, label: string, detail = "") {
  if (cond) { pass++; console.log(`    ok   ${label}`); }
  else { fail++; console.log(`    FAIL ${label}${detail ? `\n           ${detail}` : ""}`); }
}

const tok = (n: string) => ({
  access_token: `access_${n}`,
  refresh_token: `refresh_${n}`,
  expires_in: 3600,
});

async function conn(contractorId: string) {
  return prisma.jobberConnection.findUnique({ where: { contractorId } });
}

async function main() {
  console.log("\nJOBBER CONNECTION TENANCY\n");

  const elite = await prisma.contractor.findFirstOrThrow({
    where: { slug: { not: DUMMY_SLUG } },
    select: { id: true, name: true },
  });
  const dummy = await prisma.contractor.upsert({
    where: { slug: DUMMY_SLUG },
    update: {},
    create: { slug: DUMMY_SLUG, name: "Jobber tenancy probe" },
  });

  // Elite's real connection, preserved and restored at the end.
  const eliteBefore = await conn(elite.id);
  console.log(`  ${elite.name}: ${eliteBefore ? "has a live connection (will be restored)" : "no connection"}`);
  console.log(`  probe contractor: ${dummy.name}\n`);

  try {
    console.log("  STORING");
    await saveJobberTokens(tok("elite_1"), elite.id);
    ok((await conn(elite.id))?.accessToken === "access_elite_1",
       "Elite OAuth stores Elite's connection");

    await saveJobberTokens(tok("dummy_1"), dummy.id);
    ok((await conn(dummy.id))?.accessToken === "access_dummy_1",
       "Dummy OAuth stores the DUMMY's connection");

    ok((await prisma.jobberConnection.count()) >= 2,
       "two distinct rows exist — not one shared row",
       `found ${await prisma.jobberConnection.count()}`);

    console.log("\n  RECONNECTING — the overwrite that used to happen");
    await saveJobberTokens(tok("dummy_2"), dummy.id);
    ok((await conn(dummy.id))?.accessToken === "access_dummy_2",
       "Dummy reconnect updates the DUMMY's connection");
    ok((await conn(elite.id))?.accessToken === "access_elite_1",
       "and does NOT overwrite Elite's tokens",
       `Elite's access token is now ${(await conn(elite.id))?.accessToken}`);
    ok((await conn(elite.id))?.refreshToken === "refresh_elite_1",
       "Elite's REFRESH token is intact too — the one that grants new access");

    await saveJobberTokens(tok("elite_2"), elite.id);
    ok((await conn(elite.id))?.accessToken === "access_elite_2",
       "Elite reconnect updates Elite's connection");
    ok((await conn(dummy.id))?.accessToken === "access_dummy_2",
       "and does NOT overwrite the Dummy's tokens",
       `Dummy's access token is now ${(await conn(dummy.id))?.accessToken}`);

    console.log("\n  OWNERSHIP INTEGRITY");
    const rows = await prisma.jobberConnection.findMany({ select: { id: true, contractorId: true } });
    ok(new Set(rows.map((r) => r.id)).size === rows.length,
       "every connection has a distinct id — no shared primary key");
    ok(!rows.some((r) => r.id === "default") || rows.filter((r) => r.id === "default").length === 1,
       "at most one legacy id=\"default\" row survives (Elite's original)");

    console.log("\n  DISCONNECTING");
    await prisma.jobberConnection.deleteMany({ where: { contractorId: dummy.id } });
    ok((await conn(dummy.id)) === null, "the Dummy's connection is gone");
    ok((await conn(elite.id))?.accessToken === "access_elite_2",
       "and Elite's is untouched by the Dummy's disconnect");

    console.log("\n  THE OAUTH CALLBACK CANNOT BE STEERED BY THE BROWSER");
    const cb = readFileSync("app/api/admin/jobber/callback/route.ts", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^[ \t]*\/\/.*$/gm, "");
    ok(/resolveAdminContractor\(\)/.test(cb),
       "the contractor comes from resolveAdminContractor() — the admin session");
    ok(!/searchParams\.get\(\s*["'](contractor|contractorId|tenant|site)/.test(cb),
       "no contractor is read from the query string");
    ok(!/x-price2book-site|siteIdentifierFrom|requireSiteFromRequest/.test(cb),
       "no contractor is read from a site header either — this is an admin surface");
    ok(!/saveJobberTokens\([^)]*(body|params|searchParams)/.test(cb),
       "saveJobberTokens is not handed anything browser-supplied as the owner");
  } finally {
    // NOTE: updatedAt cannot be restored. It is @updatedAt, so writing the
    // restore is itself a write and bumps it. Every VALUE returns to what it
    // was; the timestamp keeps a fingerprint that this suite ran. Proven by
    // db-parity's content checksums, which found exactly that and nothing else.
    console.log("\n  CLEANUP");
    await prisma.jobberConnection.deleteMany({ where: { contractorId: dummy.id } });
    await prisma.contractor.deleteMany({ where: { id: dummy.id } });
    if (eliteBefore) {
      await prisma.jobberConnection.upsert({
        where: { contractorId: elite.id },
        update: {
          accessToken: eliteBefore.accessToken,
          refreshToken: eliteBefore.refreshToken,
          expiresAt: eliteBefore.expiresAt,
        },
        create: {
          contractorId: elite.id,
          accessToken: eliteBefore.accessToken,
          refreshToken: eliteBefore.refreshToken,
          expiresAt: eliteBefore.expiresAt,
        },
      });
      const restored = await conn(elite.id);
      ok(restored?.accessToken === eliteBefore.accessToken &&
         restored?.refreshToken === eliteBefore.refreshToken,
         "Elite's REAL Jobber tokens restored — every value byte-identical");
    } else {
      await prisma.jobberConnection.deleteMany({ where: { contractorId: elite.id } });
      console.log("    Elite had no connection before; probe rows removed.");
    }
    await prisma.contractor.deleteMany({ where: { slug: DUMMY_SLUG } });
  }

  console.log("\n" + "─".repeat(76));
  console.log(fail === 0
    ? `\n  ${pass} checks passed. Jobber tokens are per-contractor.\n`
    : `\n  ${fail} of ${pass + fail} FAILED.\n`);
  process.exitCode = fail === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exitCode = 1; })
        .finally(() => prisma.$disconnect());
}
