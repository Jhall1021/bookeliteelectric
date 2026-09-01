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
  "scripts/verify-launch-behavior.ts":
    "READS these fields, never writes them. It proves the opposite property: " +
    "that activating a service writes no price and stamps no approval, and " +
    "that a service whose tree can quote a price is REFUSED activation while " +
    "none is approved. The flagged line is a select on a throwaway " +
    "contractor's own service, checked immediately after activation to show " +
    "the price columns are still null. No real contractor's price is read or " +
    "written.",
  "scripts/verify-onboarding-readiness.ts":
    "Builds a THROWAWAY contractor with one priced, approved service so it can " +
    "prove the two conditional readiness rules: Stripe blocks only once a " +
    "service actually asks for a deposit, and zero eligible crew blocks only " +
    "once Jobber is the scheduling authority. Both need a service the engine " +
    "considers intended, and intent requires an approved price. The contractor " +
    "and its service are created and destroyed by the test, no real " +
    "contractor's price is read or written, and the readiness engine itself " +
    "writes nothing at all.",
  "scripts/verify-pricing-boundary.ts":
    "ATTEMPTS to break the price/approval pair — clearing the approval from a " +
    "priced service, and clearing the price from an approved one — and proves " +
    "Postgres REFUSES both. A constraint nobody has tried to break is a " +
    "constraint nobody knows is still connected. Both attempts run inside a " +
    "transaction that always rolls back, and the script re-reads every " +
    "published price afterwards to prove none moved.",
  "scripts/republish-legacy-approved-prices.ts":
    "Re-approves five prices published before the approval boundary existed, " +
    "at amounts that do not change: each one's inputs already reproduce its " +
    "published figure to the cent, so the stamp records a decision about a " +
    "number that was already correct. Owner-authorized 30 Aug 2026 for five " +
    "named slugs only. It derives through the same suggestPrimaryPrice the " +
    "admin route calls and REFUSES if the engine no longer reproduces what is " +
    "published — which would make it a repricing rather than a re-approval. " +
    "new-coax-line is deliberately excluded: it publishes $420.00 and derives " +
    "$405.00, and that gap is a decision, not a migration.",
  "scripts/verify-tenant-isolation-live.ts":
    "ATTEMPTS a basePrice write and proves it is REFUSED. The admin pricing " +
    "route publishes prices by service id, and until 27 Aug did so with no " +
    "contractor condition; proving that path is closed means performing the " +
    "exact operation. The attempt runs inside a throwaway contractor's " +
    "context against Elite's service, can only fail, and Elite's published " +
    "price is asserted unchanged immediately afterwards.",
  "scripts/publish-phase-f-package.ts":
    "One publisher for the Phase F starting packages, replacing a bespoke script " +
    "per service once the gates stopped changing. Publishes ONLY a slug listed in " +
    "its own APPROVED map with the exact figure the owner signed off, and refuses " +
    "if the engine no longer derives that figure — an approval is given for a " +
    "number, and a material cost can move between the approval and the write (10/3 " +
    "moved 64%). Also refuses an existing price, unresolved material, any recipe " +
    "role on a cost hold, and a tree that does not enforce the scope the price " +
    "assumes.",
  "scripts/publish-generator-package.ts":
    "Publishes the Phase F generator inlet package at the price its economics " +
    "DERIVE — 3.0 owner-approved crew-hours and a five-role recipe through " +
    "suggestPrimaryPrice, refusing if the engine yields none. Four gates before " +
    "the write: the tree must enforce the scope (exactly one pricing route, at " +
    "least eight reaching review, none reaching nothing), no price may already " +
    "exist, the material cost must be resolved, and NO ROLE IN THE RECIPE MAY BE " +
    "ON A COST HOLD. That last one is why this service waited: its 10/3 was " +
    "costed from a short package and the recheck moved it $2.88/ft. Touches this " +
    "one service.",
  "scripts/publish-doorbell-package.ts":
    "Publishes the Phase F video-doorbell starting package at the price its own " +
    "economics DERIVE — 2.0 owner-approved crew-hours and a three-role recipe " +
    "through suggestPrimaryPrice, refusing outright if the engine yields no " +
    "price. The figure is never typed in. Before writing it, the script walks " +
    "the service's own tree and refuses unless exactly one route prices, at " +
    "least five reach review, and none reaches nothing: a starting price is a " +
    "promise about scope, and publishing one over a tree that does not enforce " +
    "that scope would be the chandelier defect committed on purpose. Refuses if " +
    "any price is already present, since repricing is a reconciliation decision. " +
    "Touches this one service.",
  "scripts/verify-policy-resolution.ts":
    "STAMPS an approval and then removes it again, inside the refusal probe. " +
    "Activation refuses an undecided policy as a BACKSTOP for services " +
    "published before that guard existed — BrightPath was in exactly that " +
    "state — and publication now refuses first, so the only way to reach it " +
    "is to put a service into it directly. Written onto a throwaway " +
    "contractor built for the run, cleared on the next line, and the " +
    "contractor is destroyed in the finally block. No real service is " +
    "touched and no figure is invented: the amount is the one the fixture's " +
    "own economics derive.",
  "lib/pricePublication.ts":
    "THE publication authority. Everything that publishes a price goes through " +
    "publishSuggestedPrice, so the one place that stamps an approval is here — " +
    "which is the point of extracting it: the admin route, the onboarding of a " +
    "new contractor and the tests all run this same code rather than three " +
    "sympathetic copies. It takes no figure from its caller. It derives through " +
    "suggestPrimaryPrice and refuses with NO_SUGGESTED_PRICE if the engine " +
    "yields nothing, so an approval can only ever be stamped on a number the " +
    "contractor's own economics produced.",
  "scripts/publish-chandelier-price.ts":
    "Restores the one price in the catalog that was approved and then lost. " +
    "remove-and-replace-existing-chandelier is the only service carrying a " +
    "publishedPriceApprovedAt with a NULL basePrice: the 23 Aug scope-model " +
    "reconciliation derived $530, stamped it 91ms before its sibling in the " +
    "same loop, and the sibling kept its money while this one did not. The " +
    "script does not restore that figure on trust — it re-derives through " +
    "suggestPrimaryPrice and REFUSES if the engine no longer reproduces the " +
    "amount the standing approval was given for, because a moved cost would " +
    "make this a pricing change rather than a restore. It refuses outright if " +
    "any price is already present, leaves the 23 Aug approval stamp alone " +
    "rather than relabeling an old decision as a new one, and touches this " +
    "one service.",
  "scripts/build-fan-packages.ts":
    "Publishes the two bathroom exhaust fan packages, which the owner approved " +
    "explicitly: 1.75 crew-hours for fan-only and 2.0 for fan-and-light, at the " +
    "prices those hours DERIVE. The figures are not typed in — the script runs " +
    "the package economics through suggestPrimaryPrice and throws rather than " +
    "publish if the engine yields no price, so the approval is of the inputs and " +
    "the rounding rules, not of a number somebody chose. The historical $525/$595 " +
    "calibration is reported against, never written. Touches these two services " +
    "and nothing else.",
  "scripts/demo-contractor.ts":
    "Publishes prices on the DEMONSTRATION contractor used for marketing " +
    "screenshots, and on nothing else. The figures are not invented at the " +
    "point of writing: crew-hours and material costs go through the same " +
    "suggestPrimaryPrice the admin uses, so the screenshots show numbers the " +
    "product actually computes. The tenant is created and destroyed by this " +
    "script, its name is asserted before any deletion, and the script refuses " +
    "to touch a contractor it did not create. No real contractor's price is " +
    "read or written, and it never runs in the deploy gate.",
  "scripts/verify-template-update.ts":
    "Sets an approved price on a THROWAWAY contractor's service so it can " +
    "prove that adopting a template update takes that price back DOWN. " +
    "Proving a service stops publishing an un-re-approved number requires a " +
    "published number to start from. The contractor is created and destroyed " +
    "by the test, no real contractor's price is read or written, and it runs " +
    "in verify:template rather than the deploy gate.",
  "scripts/verify-pricing-strategy.ts":
    "Writes an approved price and approved estimate bounds onto a THROWAWAY " +
    "contractor's own service, to prove that switching pricing strategy " +
    "preserves the other strategy's configuration. Proving that requires both " +
    "configurations to exist. The contractor is created and destroyed by the " +
    "test, no real contractor's row is read or written, and the whole file " +
    "runs in verify:template rather than the deploy gate.",
  "prisma/seed.ts": "Bootstrap. Establishes the original catalog.",
  "prisma/seed-pricing-settings.ts": "Settings only, no service prices.",
  "prisma/reconcile-scope-services.ts":
    "Named owner-approved migration, 23 Aug: chandelier and flood/camera, once both had scope models.",
  "scripts/template-update.ts":
    "Adopting a template update CLEARS the published price and its approval "  +
    "together, and sets " +
    "materialCostResolved false. It un-approves: a structural change may have " +
    "introduced a decision nobody has priced, so the service must stop being " +
    "publishable until the contractor prices it. ADR-014 forbids an adoption " +
    "from writing any economic value, and this writes the absence of one. " +
    "Removing an approval, never granting one.",
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
        //
        // Closers are stripped first: a one-line select closes on the same
        // line (`...select: { publishedPriceApprovedAt: true } });`), and the
        // unstripped `true } });` slipped past this test into the look-back
        // below, where any unrelated update within fourteen lines convicted it.
        if (/^(true|false)$/.test(value.replace(/[)}\];,\s]+$/, ""))) continue;
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
  // than of behavior — an unsanctioned price writer would have printed a
  // warning into a log nobody reads and shipped.
  process.exitCode = problems.length === 0 ? 0 : 1;
}

main();
