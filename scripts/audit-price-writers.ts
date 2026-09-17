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

import { existsSync, readFileSync, readdirSync, statSync } from "fs";
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
  "scripts/rehearse-plumbing-two-contractor.ts":
    "The two-contractor Plumbing rehearsal. It approves prices on throwaway " +
    "contractors it creates and destroys within the run, because activation " +
    "cannot be reached without an approved price and the whole point is to " +
    "prove the guards fire in isolation. It refuses to run anywhere but a " +
    "proven branch of production, and touches no real contractor's price.",
  "scripts/verify-dependency-refusal-surface.ts":
    "Stamps an approved price on each candidate service in a THROWAWAY " +
    "contractor's catalog before probing for DEPENDENCY_UNAVAILABLE — " +
    "PRICE_NOT_APPROVED precedes it in activationRefusal's own order and " +
    "would otherwise mask the refusal this file exists to test. The " +
    "contractor is created and destroyed by the run; no real contractor's " +
    "price is read or written.",
  "scripts/verify-material-readiness-lifecycle.ts":
    "Proves a missing material cost blocks activation, stops blocking when the " +
    "contractor enters the cost, and blocks again when it is removed — the B1 " +
    "defect, where a blocker captured at provisioning could never be cleared. " +
    "It sets and withdraws an approved price on its OWN throwaway contractors, " +
    "created and destroyed inside the run, because the price gate is checked " +
    "before the material gate and would otherwise mask the thing under test. No " +
    "real contractor's price is read or written, and it refuses to run anywhere " +
    "but a proven branch of production.",
  "scripts/verify-platform-onboarding.ts":
    "READS basePrice and publishedPriceApprovedAt, and writes neither: after a " +
    "mixed founder launch of two quote-only services on a THROWAWAY contractor " +
    "it counts rows carrying either value and asserts the count is ZERO — the " +
    "proof that launching invented no price. The contractor is created and " +
    "destroyed inside the run; no real contractor's price is read or written.",
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
  "scripts/reset-contractor-two-for-ui.ts":
    "ONLY EVER WRITES NULL. Retracts BrightPath's approvals so the " +
    "self-service proof has to re-earn them through the admin surfaces " +
    "instead of inheriting them from an earlier scripted run — a proof that " +
    "starts from an approved price proves nothing about approving one. It " +
    "names its contractor by slug, sets no figure anywhere, and cannot raise " +
    "or lower what a customer is shown: the only reachable outcome is that " +
    "the storefront stops showing a price at all, which is the safe " +
    "direction and is asserted at the end of the run.",
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
  "scripts/verify-labor-wizard.ts":
    "Stamps basePrice/whileWeThereBasePrice/publishedPriceApprovedAt on a THROWAWAY service so it can prove the labor wizard's shared write authority (saveServicePricingInputs) never touches them — a fieldLaborHours-only call and a full-form call are both re-read afterward to show the published price survives untouched. The contractor is created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/verify-labor-wizard-browser-flow.ts":
    "Stamps basePrice/whileWeThereBasePrice/publishedPriceApprovedAt on a THROWAWAY service so the browser flow can prove accepting a labor-time proposal through the real panel never moves the published price — re-read and asserted unchanged after acceptance. The contractor is created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/verify-services-workspace-redesign.ts":
    "Stamps basePrice/publishedPriceApprovedAt on a THROWAWAY branching service so the admin question-tree preview (lib/adminQuestionPreview.ts) can be proven against a route that actually resolves to a price — resolveRoute correctly refuses a RESOLVE_INSTANT route with no published base price, so the fixture needs one to exercise the priced branch at all. Re-read and asserted UNCHANGED after every preview step, proving the preview never writes. The contractor and its services are created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/verify-question-editor-navigation-guard-browser-flow.ts":
    "Stamps basePrice/publishedPriceApprovedAt on a THROWAWAY service, created through the real sign-up pipeline and destroyed by the test, purely so the fixture is a real INSTANT service the admin question editor can open — this script proves the unsaved-changes navigation guard (Stay/Discard/Save-clears-dirty), not anything about pricing, and never touches the price again after creating it.",
  "scripts/verify-question-editor-save-integrity-browser-flow.ts":
    "Stamps basePrice/publishedPriceApprovedAt on two THROWAWAY services, created through the real sign-up pipeline and destroyed by the test, purely so the fixtures are real INSTANT services the admin question editor can open — this script proves the editor's save path (stable ids and routing across a second save with no reload, Save/Cancel staying available after deleting the last question), not anything about pricing, and never touches the price again after creating it.",
  "scripts/verify-back-navigation-config-browser-flow.ts":
    "Stamps basePrice/whileWeThereBasePrice on THROWAWAY services (a target, its referenced mount, and a filler with a deliberately smaller standalone/WWT gap) so the real guided flow has fixed, distinguishable numbers to prove goBack() restores the full prior configuration by — leaving a paid mount charge on screen after switching to customer-supplied would otherwise be invisible without two genuinely different prices to tell apart. The contractor and its services are created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/verify-concurrent-session-creation-browser-flow.ts":
    "Stamps basePrice on a THROWAWAY, questionless service purely so POST /api/guided-flow-sessions has a real, active service to resolve — this script proves N concurrent requests for one contractor+session+service resolve to the same GuidedFlowSession identity, not anything about pricing, and the price is never read back. The contractor and its service are created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/verify-delayed-network-answer-save-browser-flow.ts":
    "Stamps basePrice on a THROWAWAY target and its referenced mount (deliberately different, so a stale vs. final answer produce distinguishable totals) so the real guided flow has a real price to resolve to while proving persistAnswers' save queue survives a delayed, overlapping Back-and-re-answer with no data loss and no self-inflicted 409. The contractor and its services are created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/verify-troubleshooting-note-directbook-browser-flow.ts":
    "Stamps basePrice on a THROWAWAY, questionless TROUBLESHOOT_ONLY service so it qualifies for directBook and reaches a real Booking through a real no-deposit checkout — proving the diagnostic note field is reachable and its final text survives into the stored visit and booking, not anything about pricing. The contractor and its service are created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/verify-cross-device-stale-queue-browser-flow.ts":
    "Stamps basePrice on a THROWAWAY, two-question service purely so the real guided flow has a real service to answer while proving the save queue drops a stale payload on a genuine 409 from an independent second writer — not anything about pricing, and the price is never read back. The contractor and its service are created and destroyed by the test; no real contractor's price is read or written.",
  "scripts/reconcile-missing-elite-tv-mount-services.ts":
    "A bounded, owner-approved reconciliation for the two known missing Elite " +
    "services — articulating-tv-mount at $145.00 and tilt-tv-mount at $95.00 — " +
    "not a general price publisher. It targets only those two named services " +
    "and refuses (does not skip silently) if either already exists on the " +
    "contractor. The figures it stamps are the ones the owner already approved " +
    "for this reconciliation, never derived or invented at the point of " +
    "writing. Guarded by production identity: --apply refuses unless " +
    "DATABASE_URL is verified, by marker, to BE the authoritative production " +
    "database itself, not a branch of it — the inverse of most guards on this " +
    "list, deliberately, since this script exists to close a real gap in " +
    "production and running it anywhere else should be a harmless dry run. " +
    "Pre-existing on main from PR #72; unchanged by this PR.",
  "scripts/apply-dedicated-circuit-entry-aliases.ts":
    "A bounded, two-service reconciliation, not a general price publisher. " +
    "It targets only sump-pump-dedicated-circuit and " +
    "freezer-fridge-dedicated-circuit -- both pre-seeded dormant placeholder " +
    "rows this script ADOPTS (activates, adds their one-question tree) " +
    "rather than creates from scratch. It never invents, derives, or " +
    "independently approves a price: basePrice and publishedPriceApprovedAt " +
    "are copied verbatim from the canonical dedicated-120v-circuit-outlet " +
    "service's own already-approved figure and timestamp, and the script " +
    "refuses outright if that canonical price is absent. It also refuses if " +
    "either alias's existing category does not match the canonical " +
    "service's. The mirrored price is needed only because " +
    "GuidedFlowEngine.evaluate()'s existing ordering checks lib/pricing.ts's " +
    "customerPrice() mustReview flag before looking at an answer's " +
    "routeAction at all, and a null basePrice forces mustReview " +
    "unconditionally -- which would otherwise silently pre-empt these " +
    "aliases' REROUTE_SERVICE branch before it ever routes anywhere. " +
    "Whether that evaluate()/customerPrice() ordering itself should change " +
    "is a separate, undecided follow-up; this script works within the " +
    "existing behavior rather than changing it.",
  "scripts/verify-materials-catalog-write-path.ts":
    "Seeds basePrice/whileWeThereBasePrice/publishedPriceApprovedAt on " +
    "THROWAWAY fixture services — never a real contractor's — so the " +
    "Materials Catalog regression can prove the opposite of what a publisher " +
    "does: that editing a material's cost through the catalog's unit-cost " +
    "path and its package-cost path, both routed through the existing " +
    "setContractorMaterialCost domain function, leaves a service's published " +
    "price and approval untouched. It snapshots all three fields before " +
    "either edit, performs the unit-cost edit and the package-cost edit, then " +
    "re-reads and asserts every one of the three fields is byte-for-byte " +
    "unchanged on every fixture service. The throwaway contractor and its " +
    "fixture services are created and destroyed in a finally block; no real " +
    "contractor's price is read or written. This is a non-mutation regression " +
    "proof, not a publication authority — it approves nothing.",
};

/**
 * NOT PRICE WRITERS, AND HELD TO IT — the opposite of the allowed list.
 *
 * Each of these once wrote `basePrice: null` / `publishedPriceApprovedAt: null`
 * into a service it had just created. That moved no price, but it was a price
 * write in a file with no business writing one, and the fix was to stop, not to
 * be excused: the columns are nullable with no default, and pricing state
 * belongs to the supported lifecycle (publishSuggestedPrice, the derived-scope
 * approval), never to a seed or a verifier.
 *
 * An allowed-list entry trusts a path. These are CHECKED instead, so the file
 * cannot quietly become what the reason says it is not:
 *   - no price-column token anywhere outside comments — not a write, not a
 *     null, not a select (stricter than the write heuristic below, which a
 *     spread or a distant `data:` can slip past);
 *   - never on APPROVED_PUBLISHERS — excusing one reopens the question;
 *   - nothing that makes a service live (`active: true`, `offered: true`) and
 *     no bulk writer (`updateMany`, `upsert`) — a fixture writer turned into a
 *     general tenant writer turns this red;
 *   - plus each file's own structural claim, below.
 * A renamed or deleted file fails too: coverage must move with the file, not
 * lapse.
 */
const NOT_PRICE_WRITERS: Record<string, { why: string; mustMatch: [RegExp, string][] }> = {
  "prisma/seed-surface-mounted-services.ts": {
    why:
      "Creates the three surface-mounted services inactive and unoffered under Elite's " +
      "new-120v-outlet anchor. An EXISTING service is updated with name and description " +
      "only, so a rerun cannot clear a price an existing service has earned. Writes no " +
      "price column, not even null.",
    mustMatch: [
      [/data: \{ name: def\.name, shortDescription: def\.shortDescription \}/,
        "the update branch writes name and shortDescription and nothing else"],
      [/active: false, offered: false,/, "the create branch creates the service inactive and unoffered"],
    ],
  },
  "prisma/seed-routing-v2-fixtures.ts": {
    why:
      "Creates the rv2-fixture-* proving-harness services inactive and unoffered under " +
      "Elite. Create-only: an existing fixture is left untouched. Writes no price " +
      "column, not even null.",
    mustMatch: [
      [/const svc = existing \?\? await db\.service\.create\(/, "create-only: an existing fixture is reused, never updated"],
      [/slug: "rv2-fixture-/, "every fixture slug carries the rv2-fixture- prefix"],
      [/active: false, offered: false,/, "fixtures are created inactive and unoffered"],
    ],
  },
  "scripts/verify-no-base-material-lifecycle.ts": {
    why:
      "Verification only. Creates run-unique fixture services inside one transaction " +
      "that always throws its ROLLBACK sentinel, and asserts afterwards that none " +
      "persisted. It exercises material state, never pricing state, and writes no " +
      "price column.",
    mustMatch: [
      [/await prisma\.\$transaction\(async \(tx\) => \{/, "fixtures are written inside a transaction"],
      [/throw new Error\(ROLLBACK\);/, "the transaction always ends by throwing the rollback sentinel"],
      [/slug: `\$\{RUN\}-\$\{suffix\}`/, "fixture slugs are run-unique"],
      [/leaked === 0/, "it asserts nothing persisted"],
    ],
  },
};

function codeOnly(src: string): string {
  // Comments removed; `//` preceded by `:` is a URL, not a comment.
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

function checkNotPriceWriters(): string[] {
  const failures: string[] = [];
  for (const [file, rule] of Object.entries(NOT_PRICE_WRITERS)) {
    if (!existsSync(join(ROOT, file))) { failures.push(`${file}: missing — move this entry with the file`); continue; }
    if (APPROVED_PUBLISHERS[file]) failures.push(`${file}: is on APPROVED_PUBLISHERS — it must not be excused`);
    const code = codeOnly(readFileSync(join(ROOT, file), "utf8"));
    for (const field of WRITES) {
      if (new RegExp(`\\b${field}\\b`).test(code)) failures.push(`${file}: names ${field}`);
    }
    if (/\bactive\s*:\s*true\b/.test(code)) failures.push(`${file}: sets active: true`);
    if (/\boffered\s*:\s*true\b/.test(code)) failures.push(`${file}: sets offered: true`);
    if (/\.(updateMany|upsert)\s*\(/.test(code)) failures.push(`${file}: contains a bulk writer (updateMany/upsert)`);
    for (const [re, claim] of rule.mustMatch) {
      if (!re.test(code)) failures.push(`${file}: no longer holds — ${claim}`);
    }
  }
  return failures;
}

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

  const notWriterFailures = checkNotPriceWriters();
  console.log(`${"─".repeat(74)}\nNOT PRICE WRITERS — checked, not trusted\n`);
  for (const [f, rule] of Object.entries(NOT_PRICE_WRITERS)) {
    const mine = notWriterFailures.filter((x) => x.startsWith(`${f}:`));
    console.log(`  ${mine.length ? "FAIL" : "ok  "} ${f}`);
    console.log(`      ${rule.why}`);
    for (const m of mine) console.log(`      ✗ ${m.slice(f.length + 2)}`);
  }
  console.log();

  console.log(`${"─".repeat(74)}`);
  console.log(`\n  ${problems.length} file(s) can move a customer's price outside the admin.`);
  if (notWriterFailures.length) console.log(`  ${notWriterFailures.length} NOT-PRICE-WRITER check(s) failed.`);
  console.log(`  A seed setting an owner-approved figure is fine — it just needs`);
  console.log(`  to be on the allowed list above, with the reason written down.`);
  console.log(`\n  Nothing was changed.\n`);

  // Exits non-zero so this can gate a build. It reported and returned 0 until
  // 27 August, which made ADR-003's "enforced" a description of intent rather
  // than of behavior — an unsanctioned price writer would have printed a
  // warning into a log nobody reads and shipped.
  process.exitCode = problems.length === 0 && notWriterFailures.length === 0 ? 0 : 1;
}

main();
