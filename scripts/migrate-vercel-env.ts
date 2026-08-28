/**
 * Copy the required environment from BookElite to Price2Book — ADR-019.
 *
 * Deliberately NOT a clone. Three rules, each from the classification in
 * docs/migration/price2book-vercel-cutover.md:
 *
 *   COPY     things the application genuinely reads
 *   SKIP     things no code reads — STRIPE_* is read nowhere, and carrying it
 *            would imply a payments capability the product does not have
 *   REPLACE  hostname-dependent values, which must name the NEW origins rather
 *            than inherit the old single host
 *
 * NO VALUE IS EVER PRINTED. Values move source -> target in memory; the output
 * names keys and outcomes only.
 *
 *   npx vercel env pull <file> --environment=production      (source, via CLI)
 *   VERCEL_TOKEN=… npx tsx scripts/migrate-vercel-env.ts --from <file> [--apply]
 *
 * Reads a pulled env FILE rather than the source API. The CLI's stored token
 * expired mid-migration and the API refused it; the CLI refreshes its own auth,
 * so pulling through it is the path that keeps working.
 *
 * Four values are Vercel "Secret" type and CANNOT be pulled by design. Two of
 * them are the Stripe pair being left behind; the other two are reported for
 * manual entry rather than silently omitted.
 */
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { loadEnv } from "./_env";

loadEnv();
const API = "https://api.vercel.com";

const SOURCE = { token: process.env.SOURCE_VERCEL_TOKEN ?? "", project: "prj_1It8oJtHqAf2RsFSqvfKjq48xJEw",
                 team: "team_HKmHTQvv3B0oDD0DeYdxkh0x" };
const TARGET = { token: process.env.VERCEL_TOKEN ?? "", project: "prj_zB0QVq80340s2dVt7X3c1ewKgHtT",
                 team: "team_dAw8VA0u1R3VuwiPMP97otvK" };

/** Read by no code. Carrying these forward would be cloning, not migrating. */
const SKIP = new Set(["STRIPE_SECRET_KEY", "STRIPE_PUBLISHABLE_KEY", "NEXT_PUBLIC_SITE_URL"]);

/**
 * Hostname-dependent, so they are SET rather than copied. The old deployment's
 * single host is exactly what ADR-019 splits apart.
 */
const REPLACE: Record<string, string> = {
  APP_ORIGIN: "https://app.price2book.com",
  STOREFRONT_ORIGIN: "https://price2book.com",
  PLATFORM_WEB_ORIGIN: "https://price2book.com",
  BETTER_AUTH_URL: "https://app.price2book.com",
  EXPECTED_DATABASE_IDENTITY: "price2book-production",
};

/** Secret-type values Vercel refuses to export. Named, never guessed at. */
const UNPULLABLE = "[SENSITIVE]";

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${body.slice(0, 200)}`);
  return body ? JSON.parse(body) as T : ({} as T);
}

function readEnvFile(path: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)="?([\s\S]*?)"?$/);
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const i = process.argv.indexOf("--from");
  const file = i >= 0 ? process.argv[i + 1] : undefined;
  if (!file) { console.error("\n  --from <pulled env file> is required.\n"); process.exit(1); }
  if (!TARGET.token) { console.error("\n  VERCEL_TOKEN is required.\n"); process.exit(1); }

  const src = readEnvFile(file);
  console.log(`\nENVIRONMENT MIGRATION   ${apply ? "APPLY" : "DRY RUN"}\n`);

  let copied = 0, skipped = 0, manual = 0;
  const needManual: string[] = [];

  for (const [key, value] of [...src].sort()) {
    // Vercel's own build-time variables are supplied by the platform.
    if (/^(VERCEL|NX_|TURBO_)/.test(key)) continue;
    if (key in REPLACE) continue; // set below, to the new origin
    if (SKIP.has(key)) { console.log(`  skip     ${key.padEnd(30)} read by no code`); skipped++; continue; }
    if (value === UNPULLABLE || !value) {
      console.log(`  MANUAL   ${key.padEnd(30)} Vercel will not export a Secret-type value`);
      needManual.push(key); manual++; continue;
    }
    if (apply) {
      await api(TARGET.token, `/v10/projects/${TARGET.project}/env?teamId=${TARGET.team}&upsert=true`, {
        method: "POST",
        body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview"] }),
      });
    }
    console.log(`  copy     ${key.padEnd(30)} production, preview`);
    copied++;
  }

  for (const [key, value] of Object.entries(REPLACE)) {
    if (apply) {
      await api(TARGET.token, `/v10/projects/${TARGET.project}/env?teamId=${TARGET.team}&upsert=true`, {
        method: "POST",
        body: JSON.stringify({ key, value, type: "encrypted", target: ["production", "preview"] }),
      });
    }
    console.log(`  set      ${key.padEnd(30)} ${value}`);
  }

  console.log(`\n  ${copied} copied, ${Object.keys(REPLACE).length} set, ${skipped} skipped, ${manual} need manual entry.`);
  if (needManual.length) {
    console.log(`\n  Enter these by hand in the Price2Book project (Settings -> Environment Variables):`);
    for (const k of needManual) console.log(`    ${k}`);
    console.log(`  Stripe keys are NOT among them by design — no code reads them.`);
  }
  console.log(apply ? `\n  Written.\n` : `\n  Dry run — pass --apply.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ${(e as Error).message}\n`); process.exit(1); });
}
