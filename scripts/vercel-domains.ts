/**
 * Attach Price2Book's marketing domains to the Price2Book project — ADR-020.
 *
 *   npx tsx scripts/vercel-domains.ts              # report only, changes nothing
 *   npx tsx scripts/vercel-domains.ts --apply
 *   npx tsx scripts/vercel-domains.ts --dns      # the records DNS needs
 *
 * WHY A SCRIPT AND NOT TWO CURL COMMANDS
 *
 * Attaching a domain is the moment a marketing site becomes publicly
 * reachable, and the estate has two Vercel accounts holding similarly-named
 * projects. The cutover notes record the lesson in as many words: a confident
 * answer from the wrong scope is the same failure as a confident answer from a
 * mis-named branch. So nothing here is inferred — the account, team and project
 * are asserted against the API before a single write, and the script refuses
 * outright if any of them is not the one named below.
 *
 * It is also the reason this exists as a reviewable, re-runnable file rather
 * than an opaque shell command: the permission rule that lets it run is scoped
 * to this path, so what it may do is fixed by what is written here.
 *
 * Reads only, unless --apply is passed. Prints no secret.
 */
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";

loadEnv();
const API = "https://api.vercel.com";

/**
 * The intended target, stated so it can be CHECKED rather than assumed.
 * Every one of these is verified against the API before any write.
 */
const TARGET = {
  account: "admin@price2book.com",
  teamId: "team_dAw8VA0u1R3VuwiPMP97otvK",
  teamSlug: "price2-book",
  projectId: "prj_zB0QVq80340s2dVt7X3c1ewKgHtT",
  projectName: "price2book",
} as const;

/** Apex serves the marketing site; www is a permanent redirect onto it. */
const APEX = "price2book.com";
const WWW = `www.${APEX}`;

type Domain = {
  name: string;
  verified: boolean;
  redirect?: string | null;
  redirectStatusCode?: number | null;
  verification?: { type: string; domain: string; value: string; reason: string }[];
};

async function api<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`${path} -> ${res.status} ${text}`.slice(0, 400));
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return (text ? JSON.parse(text) : {}) as T;
}

/** Every request is team-scoped. `sep` keeps it valid whether or not the path
 *  already carries a query string — appending "?teamId=" to a path that has
 *  one produces a second "?" and Vercel rejects the whole request. */
const team = `teamId=${TARGET.teamId}`;
const scoped = (path: string) => `${path}${path.includes("?") ? "&" : "?"}${team}`;

/** Refuse before writing anything if this credential is not the intended one. */
async function assertTarget(token: string) {
  const { user } = await api<{ user: { email: string; username: string } }>(token, "/v2/user");
  console.log(`  account   ${user.email}`);
  if (user.email !== TARGET.account) {
    throw new Error(
      `REFUSING: this token belongs to ${user.email}, not ${TARGET.account}. ` +
        `Two Vercel accounts hold similarly-named projects; attaching a domain under the wrong one ` +
        `would point the product's own name at another account's deployment.`,
    );
  }

  const { teams } = await api<{ teams: { id: string; slug: string }[] }>(token, "/v2/teams?limit=50");
  const found = teams.find((t) => t.id === TARGET.teamId);
  if (!found) throw new Error(`REFUSING: team ${TARGET.teamId} (${TARGET.teamSlug}) is not visible to this token.`);
  console.log(`  team      ${found.slug}  (${found.id})`);

  const project = await api<{ id: string; name: string }>(token, scoped(`/v9/projects/${TARGET.projectId}`));
  if (project.id !== TARGET.projectId || project.name !== TARGET.projectName) {
    throw new Error(`REFUSING: project id resolved to "${project.name}", expected "${TARGET.projectName}".`);
  }
  console.log(`  project   ${project.name}  (${project.id})\n`);
}

async function currentDomains(token: string): Promise<Domain[]> {
  const { domains } = await api<{ domains: Domain[] }>(
    token, scoped(`/v9/projects/${TARGET.projectId}/domains?limit=50`));
  return domains;
}

function describe(d: Domain): string {
  const redirect = d.redirect ? ` -> ${d.redirect} (${d.redirectStatusCode ?? "?"})` : "";
  return `${d.name}${redirect}${d.verified ? "" : "   NOT VERIFIED — DNS has not been pointed here yet"}`;
}

/** Adding a domain that is already attached is success, not failure. */
async function attach(token: string, body: Record<string, unknown>): Promise<Domain | null> {
  try {
    return await api<Domain>(token, scoped(`/v10/projects/${TARGET.projectId}/domains`), {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (e) {
    const err = e as Error & { status?: number };
    if (err.status === 409) {
      console.log(`  already attached: ${body.name}`);
      return null;
    }
    throw err;
  }
}

/**
 * What DNS actually has to say, asked of Vercel rather than recited.
 *
 * The generic advice ("A record to 76.76.21.21") is right often enough to be
 * dangerous: it is wrong for a domain whose nameservers Vercel runs, and wrong
 * again for an apex served through a proxy. Reading the live config means the
 * records handed to whoever edits Cloudflare are this domain's, today.
 */
async function dns(token: string) {
  console.log(`\n  DNS — what each name needs before it serves anything:`);
  for (const name of [APEX, WWW]) {
    // Ranked alternatives, best first: [{ rank: 1, value: ["…", "…"] }, …].
    type Ranked = { rank: number; value: string[] };
    const cfg = await api<{
      configuredBy?: string | null;
      nameservers?: string[];
      aValues?: string[];
      cnames?: { value?: string }[];
      recommendedIPv4?: Ranked[];
      recommendedCNAME?: unknown;
    }>(token, scoped(`/v6/domains/${name}/config`)).catch((e) => ({ error: String(e) }) as never);

    if (process.argv.includes("--raw")) { console.log(`\n    ${name}\n${JSON.stringify(cfg, null, 6)}`); continue; }
    console.log(`\n    ${name}`);
    if ("error" in cfg) { console.log(`      could not read config: ${String(cfg.error).slice(0, 160)}`); continue; }

    // The two fields do NOT share a shape: recommendedIPv4 is a ranked list of
    // value-arrays, recommendedCNAME is a flat list of names. Read both rather
    // than trusting either — this is Vercel's response, not our type.
    const best = (r?: unknown): string[] => {
      if (!Array.isArray(r) || !r.length) return [];
      if (typeof r[0] === "string") return r as string[];
      const ranked = (r as Ranked[]).slice().sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0));
      const v = ranked[0]?.value;
      return Array.isArray(v) ? v : typeof v === "string" ? [v] : [];
    };
    console.log(`      points here  ${cfg.configuredBy ? "yes" : "NO — DNS has not been changed yet"}`);
    if (cfg.nameservers?.length) console.log(`      nameservers  ${cfg.nameservers.join(", ")}`);
    if (cfg.aValues?.length) console.log(`      A today      ${cfg.aValues.join(", ")}`);

    // An apex needs A records; a subdomain is better off on the CNAME.
    const set = name === APEX ? best(cfg.recommendedIPv4) : best(cfg.recommendedCNAME);
    const kind = name === APEX ? "A" : "CNAME";
    if (set.length) console.log(`      SET ${kind.padEnd(8)} ${set.join("   ")}`);
  }
  console.log(`
    On Cloudflare each record must be DNS only (grey cloud), not proxied.
    A proxied record is what made app.price2book.com answer 525 until it was
    switched, and an orange-clouded apex is why price2book.com answers nothing
    on http and https alike right now.
`);
}

async function main() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) {
    console.error(`\n  VERCEL_TOKEN is not set. Put it in .env.local (gitignored, never printed).\n`);
    process.exit(1);
  }
  const apply = process.argv.includes("--apply");

  console.log(`\nPRICE2BOOK MARKETING DOMAINS${apply ? "" : "   (report only — pass --apply to change anything)"}\n`);
  await assertTarget(token);

  console.log(`  attached today:`);
  const before = await currentDomains(token);
  for (const d of before) console.log(`    ${describe(d)}`);

  if (process.argv.includes("--dns")) { await dns(token); return; }

  if (!apply) {
    const missing = [APEX, WWW].filter((n) => !before.some((d) => d.name === n));
    console.log(`\n  would attach: ${missing.length ? missing.join(", ") : "nothing — both already attached"}`);
    if (missing.includes(WWW)) console.log(`  would set:    ${WWW} -> ${APEX} as a 308 permanent redirect`);
    console.log(`\n  Nothing was changed.\n`);
    return;
  }

  console.log(`\n  attaching:`);
  await attach(token, { name: APEX });
  // The redirect is set at attach time; www never serves the site itself, so
  // there is exactly one canonical marketing address.
  await attach(token, { name: WWW, redirect: APEX, redirectStatusCode: 308 });

  console.log(`\n  attached now:`);
  const after = await currentDomains(token);
  for (const d of after) console.log(`    ${describe(d)}`);

  // Attaching does NOT route traffic. Until DNS points here, these are claims
  // on a name, and the site stays exactly as reachable as it was a minute ago.
  const unverified = after.filter((d) => !d.verified);
  if (unverified.length) {
    console.log(`\n  DNS still has to be pointed here before any of this serves traffic.`);
    console.log(`  price2book.com is on Cloudflare and currently proxied (orange cloud), which is`);
    console.log(`  what made app.price2book.com answer 525 until it was set to DNS-only.\n`);
    for (const d of unverified) {
      for (const v of d.verification ?? []) {
        console.log(`    ${d.name}`);
        console.log(`      ${v.type}  ${v.domain}  ->  ${v.value}`);
      }
    }
  }
  console.log();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => { console.error(`\n  ${e.message}\n`); process.exit(1); });
}
