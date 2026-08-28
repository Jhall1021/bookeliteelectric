/**
 * Prove which deployment is serving, and what it is connected to.
 *
 *   npx tsx scripts/verify-deployment-identity.ts --url https://… --bypass … \
 *     [--expect-identity price2book-production] [--expect-host ep-…]
 *
 * The host counterpart to `verify-database-identity`, and it exists for the
 * same reason that one does: a name proves nothing. An empty Neon branch
 * called "production" fooled this project three separate times, and a Vercel
 * project called "price2book" is exactly as trustworthy — which is to say not
 * at all. What settles it is the identity marker stamped INSIDE the database,
 * read through the deployment that is actually answering requests.
 *
 * Read-only. Safe to run against production at any point.
 */
import { pathToFileURL } from "node:url";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function main() {
  const url = arg("url");
  const bypass = arg("bypass") ?? process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
  if (!url) { console.error("\n  --url https://<deployment> is required.\n"); process.exit(1); }
  if (!bypass) { console.error("\n  --bypass <secret> or VERCEL_AUTOMATION_BYPASS_SECRET is required.\n"); process.exit(1); }

  const res = await fetch(`${url.replace(/\/$/, "")}/api/deployment-identity`, {
    headers: { "x-vercel-protection-bypass": bypass },
    redirect: "manual",
  });
  if (!res.ok) {
    console.error(`\n  ${url} answered ${res.status}. A 404 means the bypass secret did not match,`);
    console.error(`  which is deliberately indistinguishable from the route not existing.\n`);
    process.exit(1);
  }
  const d = await res.json() as Record<string, any>;

  console.log(`\nDEPLOYMENT IDENTITY\n  ${url}\n`);
  console.log(`  environment      ${d.deployment.vercelEnv ?? "-"}`);
  console.log(`  production URL   ${d.deployment.productionUrl ?? "-"}`);
  console.log(`  this deployment  ${d.deployment.deploymentUrl ?? "-"}`);
  console.log(`  database host    ${d.database.host ?? "-"}`);
  console.log(`  database stamp   ${d.database.identity?.key ?? "(none)"}`);
  console.log(`  stamped project  ${d.database.identity?.neonProject ?? "-"} / ${d.database.identity?.neonEndpoint ?? "-"}`);
  console.log(`  auth base        ${d.destinations.authBaseUrl ?? "(derived from request)"}`);
  console.log(`  app origin       ${d.destinations.appOrigin ?? "-"}`);
  console.log(`  storefront origin${d.destinations.storefrontOrigin ?? "-"}`);
  console.log(`  platform origin  ${d.destinations.platformOrigin ?? "-"}`);
  console.log(`  jobber callback  ${d.destinations.jobberCallback}`);
  console.log(`  write freeze     ${d.deployment.writeFreeze ?? "off"}\n`);

  ok(d.database.identity !== null,
    "the database carries an identity stamp",
    "An unstamped database is an unidentified one — see ADR-013.");

  const expectId = arg("expect-identity");
  if (expectId) {
    ok(d.database.identity?.key === expectId,
      `the stamp is "${expectId}"`, `found "${d.database.identity?.key ?? "none"}"`);
  }
  const expectHost = arg("expect-host");
  if (expectHost) {
    ok((d.database.host ?? "").includes(expectHost),
      `the database host contains "${expectHost}"`, `found "${d.database.host}"`);
  }
  if (d.database.expectedIdentity) {
    ok(d.database.matches === true,
      `the deployment's own EXPECTED_DATABASE_IDENTITY matches what it is connected to`,
      `expects "${d.database.expectedIdentity}", found "${d.database.identity?.key}"`);
  }

  // Destinations are checked against the CANONICAL origins, not against the
  // URL being probed. Once ADR-019 named three of them, "the callback must
  // match the host I typed" stopped being true: a preview deployment
  // legitimately points its callback at the canonical app origin, because that
  // is the URL registered with Jobber.
  const app = d.destinations.appOrigin;
  const store = d.destinations.storefrontOrigin;
  ok(!!app, "an app origin is configured", "unset — auth and the Jobber callback would guess");
  ok(!!store, "a storefront origin is configured", "unset — customer links would guess");
  ok(!!app && !!store && app !== store,
    `the app and storefront origins are DIFFERENT hosts (${app} vs ${store})`,
    "the same host for both is what ADR-019 exists to prevent");
  ok(d.destinations.authBaseUrl === app,
    "the auth base URL equals the app origin",
    `auth=${d.destinations.authBaseUrl} app=${app}`);
  ok(typeof d.destinations.jobberCallback === "string"
       && !!app && d.destinations.jobberCallback.startsWith(app),
    "the Jobber callback is on the app origin", String(d.destinations.jobberCallback));
  ok(!d.destinations.legacySiteUrl,
    "the retired single-host variable is gone",
    `NEXT_PUBLIC_SITE_URL is still set to ${d.destinations.legacySiteUrl}`);

  ok(d.configured.betterAuthSecret, "a session signing secret is configured");
  ok(d.configured.platformResend, "platform mail is configured (magic links)");
  ok(d.configured.transactionalResend, "transactional mail is configured");
  ok(d.configured.jobber, "Jobber credentials are configured");
  ok(d.configured.r2, "photo storage is configured");
  ok(!d.configured.stripeLegacy,
    "no obsolete Stripe configuration was carried over",
    "STRIPE_* is set but no code reads it — the legacy environment was cloned wholesale.");

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
