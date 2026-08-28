/**
 * What does this credential actually see?
 *
 *   VERCEL_TOKEN=… npx tsx scripts/vercel-inventory.ts
 *
 * Written because the CLI misled twice in one sitting. `vercel project ls`
 * answers for its SAVED DEFAULT SCOPE, and the REST API answers for whichever
 * account the credential belongs to — so "one project" looked like a fact
 * about the estate when it was a fact about the scope. This names the account
 * first, every time, so an answer can never be read without knowing whose it
 * is.
 *
 * Reads only. Prints no secret: environment variables appear as names,
 * targets and ages, never values.
 */
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const API = "https://api.vercel.com";

async function api<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${await res.text().catch(() => "")}`.slice(0, 300));
  return res.json() as Promise<T>;
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    console.error(`\n  VERCEL_TOKEN is not set.\n`);
    console.error(`  Create one under the account you want to inspect:`);
    console.error(`  Vercel -> Settings -> Tokens, then put it in .env.local as VERCEL_TOKEN=...\n`);
    console.error(`  .env.local is gitignored. The token is never printed by this script.\n`);
    process.exit(1);
  }

  // WHOSE credential this is, before anything it reports.
  const { user } = await api<{ user: { username: string; email: string; id: string } }>(token, "/v2/user");
  console.log(`\nVERCEL INVENTORY\n`);
  console.log(`  account   ${user.email}  (${user.username})`);
  console.log(`  user id   ${user.id}\n`);

  const { teams } = await api<{ teams: { id: string; slug: string; name: string }[] }>(token, "/v2/teams?limit=50");
  const scopes: { label: string; q: string }[] = [
    { label: `${user.username} (personal)`, q: "" },
    ...teams.map((t) => ({ label: `${t.slug} (${t.id})`, q: `&teamId=${t.id}` })),
  ];

  for (const sc of scopes) {
    console.log(`  ── ${sc.label}`);
    const { projects } = await api<{ projects: { id: string; name: string }[] }>(
      token, `/v9/projects?limit=100${sc.q}`);
    if (!projects.length) console.log(`     no projects`);
    for (const p of projects) {
      console.log(`     ${p.name}   id=${p.id}`);
      const doms = await api<{ domains: { name: string; verified: boolean }[] }>(
        token, `/v9/projects/${p.id}/domains?limit=50${sc.q}`).catch(() => ({ domains: [] }));
      for (const d of doms.domains) console.log(`        domain  ${d.name}${d.verified ? "" : "  (unverified)"}`);
      const envs = await api<{ envs: { key: string; target: string[] | string; type: string }[] }>(
        token, `/v9/projects/${p.id}/env?limit=200${sc.q}`).catch(() => ({ envs: [] }));
      const byKey = new Map<string, string[]>();
      for (const e of envs.envs) {
        const t = Array.isArray(e.target) ? e.target : [String(e.target)];
        byKey.set(e.key, [...new Set([...(byKey.get(e.key) ?? []), ...t])]);
      }
      if (byKey.size) console.log(`        env (${byKey.size} names, values never read):`);
      for (const [k, t] of [...byKey].sort()) console.log(`          ${k.padEnd(30)} ${t.sort().join(", ")}`);
    }
    console.log("");
  }

  const { domains } = await api<{ domains: { name: string }[] }>(token, "/v5/domains?limit=50");
  console.log(`  account-level domains: ${domains.length ? domains.map((d) => d.name).join(", ") : "none"}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ${(e as Error).message}\n`); process.exit(1); });
}
