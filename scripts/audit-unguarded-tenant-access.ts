/**
 * Repository-wide sweep for unguarded tenant access — ADR-007a criterion 4.
 *
 *   npx tsx scripts/audit-unguarded-tenant-access.ts
 *
 * WHY THIS IS A SCRIPT AND NOT A GREP
 *
 * It was a grep twice, and the grep was wrong twice — both times because the
 * model list was written down by hand and then went stale:
 *
 *   1. The first sweep hardcoded the pass-two models, so it never looked at
 *      Service or ContractorCategory. It reported 21 of 21 sites converted
 *      while 28 remained.
 *   2. The second hardcoded twelve models, then five more were reclassified as
 *      tenant-owned an hour later. It reported zero unexplained while
 *      eighteen sites existed — one of them customer-facing.
 *
 * Both are the same failure the PricingSettings defect was: a list kept beside
 * the truth instead of derived from it. So this derives its model list from
 * `lib/tenantGuard.ts` at runtime. Reclassify a model and this follows on the
 * next run, with nothing to remember.
 *
 * WHAT IT REPORTS
 *
 * Every access to a tenant-owned or derived-owned model through a client that
 * is not the guarded one, in app/, lib/ and components/. Each is classified,
 * and anything unclassified fails.
 *
 * `prisma/` and `scripts/` are excluded: they construct their own client, are
 * platform-level by design, and write across tenants deliberately.
 */

import { pathToFileURL } from "node:url";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { TENANT_SCOPED_MODELS, DERIVED_TENANT_MODELS } from "../lib/tenantGuard";

/** Identifiers that ARE the guarded client, however the callback named it. */
const GUARDED_IDENTIFIERS = new Set(["db", "tx", "guarded"]);

/**
 * Known, classified sites. Anything not here and not adopted is a failure.
 *
 * `file::Model` -> the reason it is acceptable today.
 */
const CLASSIFIED: Record<string, string> = {
  // The six "awaiting per-contractor auth" entries are GONE as of 27 August.
  // Admin surfaces resolve their contractor from the signed-in user's
  // membership through withAdminContractor, so there is nothing left here to
  // exempt.

  // ---- dependency-injected helpers --------------------------------------
  //
  // These take a client and run on whatever they are handed. The parameter is
  // named `prisma` for historical reasons, which is why they appear here at
  // all; the caller decides whether it is guarded.
  "lib/businessHours.ts::BusinessHours": "dependency-injected helper — runs on the client its caller hands it",

  // ---- integration ------------------------------------------------------
  //
  // lib/jobber.ts holds the OAuth token exchange and refresh. It runs from
  // callbacks and background paths that have no request and therefore no
  // tenant context, so it takes a contractorId explicitly instead.
  "lib/jobber.ts::JobberConnection": "OAuth token handling, runs outside any request context; takes contractorId explicitly",
};

function accessor(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

function guardedModels(): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of TENANT_SCOPED_MODELS) out.set(accessor(m), m);
  for (const m of DERIVED_TENANT_MODELS.keys()) out.set(accessor(m), m);
  return out;
}

function walk(dir: string, acc: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else if ((p.endsWith(".ts") || p.endsWith(".tsx")) && !/ \d+\.tsx?$/.test(p)) acc.push(p);
  }
  return acc;
}

type Hit = { file: string; line: number; model: string; op: string; text: string };

function sweep(): { hits: Hit[]; models: Map<string, string> } {
  const models = guardedModels();
  const hits: Hit[] = [];
  for (const file of ["app", "lib", "components"].flatMap((d) => walk(d))) {
    readFileSync(file, "utf8")
      .split("\n")
      .forEach((raw, i) => {
        const t = raw.trimStart();
        if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return;
        const code = raw.split("//")[0];
        for (const m of code.matchAll(/\b(\w+)\s*\.\s*(\w+)\s*\.\s*(\w+)\s*\(/g)) {
          const [, client, acc, op] = m;
          const model = models.get(acc);
          if (!model || GUARDED_IDENTIFIERS.has(client)) continue;
          hits.push({ file, line: i + 1, model, op, text: code.trim() });
        }
      });
  }
  return { hits, models };
}

function main() {
  const adopted = new Set(
    [...readFileSync("scripts/audit-guard-adoption.ts", "utf8").matchAll(/^\s*"([^"]+)",/gm)].map(
      (m) => m[1]
    )
  );
  const { hits, models } = sweep();

  console.log(`\nUNGUARDED TENANT ACCESS — ADR-007a criterion 4\n`);
  console.log(`  ${models.size} tenant-owned models, read from lib/tenantGuard.ts\n`);

  const buckets = { adopted: [] as Hit[], classified: [] as Hit[], unexplained: [] as Hit[] };
  for (const h of hits) {
    if (adopted.has(h.file)) buckets.adopted.push(h);
    else if (CLASSIFIED[`${h.file}::${h.model}`]) buckets.classified.push(h);
    else buckets.unexplained.push(h);
  }

  console.log(`  adopted files (guard-adoption audit covers drift) ... ${buckets.adopted.length}`);
  console.log(`  classified exceptions ............................... ${buckets.classified.length}`);
  console.log(`  UNEXPLAINED ......................................... ${buckets.unexplained.length}\n`);

  for (const h of buckets.classified) {
    console.log(`    ok  ${h.file}:${h.line}  ${h.model}.${h.op}`);
    console.log(`          ${CLASSIFIED[`${h.file}::${h.model}`]}`);
  }
  for (const h of buckets.unexplained) {
    console.log(`    !!  ${h.file}:${h.line}  ${h.model}.${h.op}`);
    console.log(`          ${h.text.slice(0, 92)}`);
  }

  // An adopted file reaching tenant data unguarded is the other audit's job;
  // reporting it here too would double-count a finding rather than add one.
  if (buckets.adopted.length > 0) {
    console.log(
      `\n  ${buckets.adopted.length} hit(s) are in adopted files and are covered by\n` +
        `  scripts/audit-guard-adoption.ts, which fails on drift there.`
    );
  }

  console.log(`\n${"─".repeat(74)}\n`);
  if (buckets.unexplained.length === 0) {
    console.log(`  0 unexplained. Every unguarded tenant access is accounted for.\n`);

    // Say what is still deliberately outstanding. "0 unexplained" alone reads
    // as "nothing left to do", and it does not mean that — it means nothing
    // left UNACCOUNTED FOR. The two are easy to confuse in a green build.
    const byReason = new Map<string, Set<string>>();
    for (const h of buckets.classified) {
      const reason = CLASSIFIED[`${h.file}::${h.model}`];
      if (!byReason.has(reason)) byReason.set(reason, new Set());
      byReason.get(reason)!.add(h.file);
    }
    if (byReason.size > 0) {
      console.log(`  INTENTIONALLY BLOCKED — accounted for, not finished:\n`);
      for (const [reason, files] of byReason) {
        console.log(`    ${files.size} file(s): ${reason}`);
        for (const f of files) console.log(`        ${f}`);
      }
      console.log();
    } else {
      console.log(`  Nothing is intentionally blocked.\n`);
    }
  } else {
    console.log(
      `  ${buckets.unexplained.length} UNEXPLAINED unguarded tenant access(es).\n\n` +
        `  Convert the route to the guarded client — see lib/tenantRoute.ts and\n` +
        `  lib/siteRouting.ts — or add it to CLASSIFIED in this file with the\n` +
        `  reason it is acceptable.\n`
    );
  }
  process.exitCode = buckets.unexplained.length === 0 ? 0 : 1;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirectly) main();
