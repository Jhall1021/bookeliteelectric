/**
 * Which code can change a customer's price.
 *
 *   npx tsx scripts/audit-price-writers.ts
 *
 * Greps the repo for every write to `basePrice`, `whileWeThereBasePrice` and
 * `publishedPriceApprovedAt`, and sorts them by whether they're allowed to.
 *
 * The rule: a seed may establish labor and material INPUTS freely, and may
 * initialize a specifically owner-approved price. It must not compute a price
 * and then stamp `publishedPriceApprovedAt` on its own output — that's a
 * script approving its own work, and it's how the recessed lighting base
 * moved without anyone deciding it should.
 *
 * Report only.
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";

const ROOT = process.cwd();

const WRITES = ["basePrice", "whileWeThereBasePrice", "publishedPriceApprovedAt"];

/**
 * Seeds that legitimately publish, because the price they write is one an
 * owner approved rather than one the seed worked out.
 *
 * Anything not on this list that stamps an approval is a governance problem,
 * whether or not its number happens to be right.
 */
const APPROVED_PUBLISHERS: Record<string, string> = {
  "scripts/verify-tenant-isolation-live.ts":
    "ATTEMPTS a basePrice write and proves it is REFUSED. The admin pricing " +
    "route publishes prices by service id, and until 27 Aug did so with no " +
    "contractor condition; proving that path is closed means performing the " +
    "exact operation. The attempt runs inside a throwaway contractor's " +
    "context against Elite's service, can only fail, and Elite's published " +
    "price is asserted unchanged immediately afterwards.",
  "prisma/seed.ts": "Bootstrap. Establishes the original catalog.",
  "prisma/seed-pricing-settings.ts": "Settings only, no service prices.",
  "prisma/reconcile-scope-services.ts":
    "Named owner-approved migration, 23 Aug: chandelier and flood/camera, once both had scope models.",
  "prisma/seed-bathroom-fans.ts":
    "Sets the Elite-supplied fan to quote-only by clearing its prices to null. Removing a price, not setting one.",
  "prisma/seed-appliance-services.ts":
    "Creates Replace Range Hood, which needs a first price. CREATE branch only — the update branch writes no price.",
  "app/api/admin/services/[serviceId]/pricing/route.ts":
    "The admin Publish action. This is the intended route for approving a price.",
  "app/api/admin/services/[serviceId]/route.ts":
    "The admin service editor. A person typing a price into a form.",
  "app/api/admin/services/route.ts":
    "Creating a service in the admin, which includes setting its first price.",
  "components/admin/ServiceEditForm.tsx":
    "The form behind the admin editor — sends what a person typed.",
  "components/admin/NewServiceForm.tsx":
    "The form for creating a service in the admin.",
  "prisma/reconcile-2026-08-23.ts":
    "Named owner-approved migration, 23 Aug: dedicated circuit, whole-house surge, troubleshooting.",
  "prisma/reconcile-price-book.ts":
    "Named owner-approved migration, 23 Aug: the full price-book reconciliation, 46 services.",
  "prisma/quote-only-2026-08-23.ts":
    "Named owner-approved migration, 23 Aug: five services converted to quote-only, prices cleared.",
  "prisma/publish-low-voltage-sconces-2026-08-24.ts":
    "Named owner-approved migration, 24 Aug: ethernet, coax and the two sconce services published at their model figures. Refuses to write over a price already set, so a rerun cannot overwrite a later owner edit.",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git", "public"].includes(entry)) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

type Hit = { file: string; line: number; field: string; text: string };

function main() {
  const hits: Hit[] = [];

  for (const file of walk(ROOT)) {
    const rel = relative(ROOT, file);
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      const trimmed = text.trim();
      if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;

      for (const field of WRITES) {
        const m = new RegExp(`${field}\\s*:\\s*(.+)$`).exec(text);
        if (!m) continue;
        const value = m[1].trim();

        // A trailing comment mentioning a field isn't a write.
        if (text.slice(0, text.indexOf(field)).includes("//")) continue;

        // `basePrice: true` is a Prisma select. `basePrice: number | null` is
        // a type. Neither changes anything, and reporting them buried the
        // three real problems in 200 lines of noise.
        if (/^(true|false)[,\s]*$/.test(value)) continue;
        if (/^(number|string|Date|Int|Float)\b/.test(value)) continue;

        // The decisive test: is this inside a write? Prisma writes put the
        // fields under `data:`, so look back a little for one. A read like
        // `basePrice: service.basePrice` in a DTO has no `data:` above it.
        const before = lines.slice(Math.max(0, i - 14), i).join("\n");
        const isWrite =
          /\bdata\s*:/.test(before) ||
          /\.(update|updateMany|create|createMany|upsert)\s*\(/.test(before);
        if (!isWrite) continue;

        hits.push({ file: rel, line: i + 1, field, text: trimmed.slice(0, 90) });
      }
    });
  }

  const byFile = new Map<string, Hit[]>();
  for (const h of hits) byFile.set(h.file, [...(byFile.get(h.file) ?? []), h]);

  const approved: string[] = [];
  const problems: string[] = [];

  for (const [file, list] of [...byFile].sort()) {
    const stampsApproval = list.some((h) => h.field === "publishedPriceApprovedAt");
    const setsPrice = list.some((h) => h.field !== "publishedPriceApprovedAt");
    if (APPROVED_PUBLISHERS[file]) approved.push(file);
    else if (stampsApproval) problems.push(file);
    else if (setsPrice) problems.push(file);
  }

  console.log(`\nWHO CAN CHANGE A PUBLISHED PRICE\n`);
  console.log(`  ${hits.length} write(s) across ${byFile.size} file(s)\n`);

  console.log(`${"─".repeat(74)}\nALLOWED\n`);
  for (const f of approved) {
    console.log(`  ${f}`);
    console.log(`      ${APPROVED_PUBLISHERS[f]}`);
  }

  if (problems.length) {
    console.log(`\n${"─".repeat(74)}\nNEEDS A DECISION\n`);
    for (const f of problems) {
      const list = byFile.get(f)!;
      const stamps = list.some((h) => h.field === "publishedPriceApprovedAt");
      console.log(`  ${f}${stamps ? "   ← stamps its own approval" : ""}`);
      for (const h of list) console.log(`      ${String(h.line).padStart(4)}  ${h.text}`);
      console.log();
    }
  }

  console.log(`${"─".repeat(74)}`);
  console.log(`\n  ${problems.length} file(s) can move a customer's price outside the admin.`);
  console.log(`  A seed setting an owner-approved figure is fine — it just needs`);
  console.log(`  to be on the allowed list above, with the reason written down.`);
  console.log(`\n  Nothing was changed.\n`);

  // Exits non-zero so this can gate a build. It reported and returned 0 until
  // 27 August, which made ADR-003's "enforced" a description of intent rather
  // than of behaviour — an unsanctioned price writer would have printed a
  // warning into a log nobody reads and shipped.
  process.exitCode = problems.length === 0 ? 0 : 1;
}

main();
