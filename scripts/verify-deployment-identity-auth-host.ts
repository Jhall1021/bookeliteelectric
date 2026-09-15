/**
 * /api/deployment-identity MUST REPORT THE AUTH BASE URL AUTH ACTUALLY USES.
 *
 *   npx tsx scripts/verify-deployment-identity-auth-host.ts
 *
 * The route restated the rule as `BETTER_AUTH_URL ?? …`, while the auth
 * instance's resolveBaseUrl() treats an EMPTY BETTER_AUTH_URL as unset and
 * falls back to the Vercel host. A preview configured with an empty override —
 * exactly the Stage 1A preview — therefore reported "" and could not prove
 * where sign-in links land.
 *
 * This calls the real GET handler under controlled environments and compares
 * its answer with resolveBaseUrl() itself, case by case. It never reaches a
 * database: DATABASE_URL is pointed at a closed local port before the route is
 * imported, and the route already reports a failed identity read as null.
 */
process.env.DATABASE_URL = "postgresql://verify@127.0.0.1:9/deployment-identity-auth-host";

import { readFileSync } from "node:fs";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const HOST_VARS = ["BETTER_AUTH_URL", "VERCEL_ENV", "VERCEL_PROJECT_PRODUCTION_URL", "VERCEL_BRANCH_URL", "VERCEL_URL"] as const;
type HostEnv = Partial<Record<(typeof HOST_VARS)[number], string>>;
const BYPASS = "verify-auth-host-bypass";

async function main() {
  console.log("\nDEPLOYMENT IDENTITY — AUTH BASE URL FOLLOWS THE REAL RESOLVER\n");
  const { GET } = await import("../app/api/deployment-identity/route");
  const { resolveBaseUrl } = await import("../lib/authBaseUrl");

  const saved = Object.fromEntries([...HOST_VARS, "VERCEL_AUTOMATION_BYPASS_SECRET"].map((k) => [k, process.env[k]]));
  const withEnv = async (env: HostEnv, headers: Record<string, string> = { "x-vercel-protection-bypass": BYPASS }) => {
    for (const k of HOST_VARS) delete process.env[k];
    Object.assign(process.env, env, { VERCEL_AUTOMATION_BYPASS_SECRET: BYPASS });
    const res = await GET(new Request("http://localhost/api/deployment-identity", { headers }));
    const body = await res.json();
    return { status: res.status, reported: body?.destinations?.authBaseUrl, resolved: resolveBaseUrl() ?? null };
  };

  try {
    const PREVIEW = { VERCEL_ENV: "preview", VERCEL_PROJECT_PRODUCTION_URL: "app.price2book.com",
      VERCEL_BRANCH_URL: "price2book-git-feat-x-price2-book.vercel.app", VERCEL_URL: "price2book-abc123-price2-book.vercel.app" };

    console.log("  A  EMPTY OVERRIDE ON A PREVIEW — the Stage 1A configuration\n");
    const a = await withEnv({ ...PREVIEW, BETTER_AUTH_URL: "" });
    ok(a.status === 200, "A  the bypassed request is answered", String(a.status));
    ok(a.reported === "https://price2book-git-feat-x-price2-book.vercel.app",
      "A  BETTER_AUTH_URL=\"\" + Vercel preview host → reports the PREVIEW BRANCH host", JSON.stringify(a.reported));
    ok(a.reported === a.resolved, "A  and it is exactly what the auth resolver returns", `${a.reported} vs ${a.resolved}`);
    ok(!String(a.reported).includes("app.price2book.com"), "A  and it is not the production host");
    // The removed expression, evaluated in the same environment case A left set.
    const old = process.env.BETTER_AUTH_URL ?? null;
    ok(old === "" && a.reported !== old, "A  (the old `??` form reports \"\" in this same environment)", JSON.stringify(old));

    console.log("\n  B  EMPTY OVERRIDE, PER-COMMIT HOST ONLY\n");
    const b = await withEnv({ VERCEL_ENV: "preview", VERCEL_URL: "price2book-abc123-price2-book.vercel.app", BETTER_AUTH_URL: "" });
    ok(b.reported === "https://price2book-abc123-price2-book.vercel.app" && b.reported === b.resolved,
      "B  falls back to VERCEL_URL, same as the resolver", JSON.stringify(b));

    console.log("\n  C  AN EXPLICIT OVERRIDE STILL WINS\n");
    const c = await withEnv({ ...PREVIEW, BETTER_AUTH_URL: "https://auth.explicit.example" });
    ok(c.reported === "https://auth.explicit.example" && c.reported === c.resolved,
      "C  non-empty BETTER_AUTH_URL wins over every Vercel host", JSON.stringify(c));

    console.log("\n  D  PRODUCTION AND LOCAL ARE UNCHANGED\n");
    const d = await withEnv({ VERCEL_ENV: "production", VERCEL_PROJECT_PRODUCTION_URL: "app.price2book.com",
      VERCEL_BRANCH_URL: "price2book-git-main-price2-book.vercel.app" });
    ok(d.reported === "https://app.price2book.com" && d.reported === d.resolved,
      "D  production with no override → the production domain, not the git-main alias", JSON.stringify(d));
    const e = await withEnv({});
    ok(e.reported === null && e.resolved === null, "D  no host at all → null (auth infers from the request)", JSON.stringify(e));

    console.log("\n  E  THE ROUTE STAYS PROTECTED AND THE AUTH INSTANCE SHARES THE RESOLVER\n");
    const f = await withEnv({ ...PREVIEW, BETTER_AUTH_URL: "" }, {});
    ok(f.status === 404, "E  without the bypass header the route is still a 404", String(f.status));
    const authSrc = readFileSync("lib/auth.ts", "utf8");
    ok(/import \{ resolveBaseUrl \} from "\.\/authBaseUrl";/.test(authSrc) && /baseURL: resolveBaseUrl\(\),/.test(authSrc)
      && !/function resolveBaseUrl/.test(authSrc),
      "E  lib/auth.ts configures Better Auth with this same resolveBaseUrl, with no second copy");
  } finally {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
  }

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  try { const { prisma } = await import("../lib/prisma"); await prisma.$disconnect(); } catch { /* never connected */ }
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
