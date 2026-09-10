/**
 * A deliberate refusal must survive the trip to the contractor.
 *
 *   npx tsx scripts/verify-dependency-refusal-surface.ts
 *
 * verify-activation-dependencies proves the RULE: a service whose tree hands a
 * homeowner somewhere unlaunched may not go live. This proves the DELIVERY.
 *
 * The defect this exists to prevent had nothing wrong with the rule. The
 * refusal was correct, specific, and named the destination — and then the id
 * was dropped inside activationRefusal, the slugs were dropped again by the
 * admin route, and ServiceEditForm discarded the body and showed "Something
 * went wrong saving this service." A contractor met an unexplained error on a
 * form and was left to deduce an ordering rule nobody had told them.
 *
 * So the assertions follow the information, not the decision:
 *
 *   1. the refusal carries a prerequisite you can ACT on — a real id, owned by
 *      this contractor, not merely a label;
 *   2. the API forwards it instead of forwarding only material keys;
 *   3. the editor reports the platform's sentence and links to that service,
 *      rather than substituting a generic failure.
 *
 * Checks 2 and 3 read source. There is no DOM runner here, and the bug was a
 * FIELD BEING DROPPED at a boundary — which is exactly what a source check can
 * see and a passing API test would have missed, because the field's absence is
 * invisible to anything that doesn't look for it.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { activationRefusal } from "../lib/serviceActivation";
import { promiseFor } from "../lib/onboardingReadiness";
import { loadPricingSettings } from "../lib/routeResolver";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";

const raw = new PrismaClient();

/** Run-unique on a fixed prefix — the discipline #14/#15 forces. */
const PREFIX = "test-dependency-refusal-surface";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

async function removeContractor(slug: string) {
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorTrade.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}

async function sweepStale() {
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: PREFIX }, NOT: { slug: SLUG },
      createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

/** The two boundaries the information used to die at. */
function surfaceChecks() {
  console.log(`\n  2. THE API FORWARDS WHAT THE REFUSAL DECIDED\n`);
  const route = readFileSync("app/api/admin/services/[serviceId]/route.ts", "utf8");
  ok("the 409 body forwards refusal.prerequisites", /refusal\.prerequisites/.test(route),
    "the actionable identity is computed and then dropped here");
  ok("the 409 body forwards refusal.missingPrerequisites", /refusal\.missingPrerequisites/.test(route),
    "only material keys survive this boundary");

  console.log(`\n  3. THE EDITOR REPORTS THE REFUSAL, NOT A GENERIC FAILURE\n`);
  const form = readFileSync("components/admin/ServiceEditForm.tsx", "utf8");
  ok("it reads the response body on failure", /await res\.json\(\)/.test(form),
    "the body is discarded, so the platform's sentence never arrives");
  ok("it surfaces the platform's message", /data\.message/.test(form));
  const genericOnly = /setError\("Something went wrong saving this service\."\);/.test(form)
    && !/data\.message/.test(form);
  ok("the generic string is a fallback, never the whole story", !genericOnly,
    "every deliberate refusal is reported as an unexplained error");
  ok("a prerequisite is offered as a link to its own service page",
    /\/dashboard\/services\/\$\{/.test(form),
    "the contractor is told the rule but not shown the thing that satisfies it");
  ok("a prerequisite with no id does not render a dead link",
    /p\.id \?/.test(form) || /\.id \? \(/.test(form));
}

async function main() {
  console.log(`\nDEPENDENCY REFUSAL — does it reach the contractor?\n`);
  await sweepStale();
  await removeContractor(SLUG);

  console.log(`  1. THE REFUSAL CARRIES SOMETHING TO ACT ON\n`);
  const c = await raw.contractor.create({
    data: { slug: SLUG, name: "Dependency refusal surface probe", active: false,
      countryCode: "US", schedulingAuthority: "NATIVE", nativeConcurrentJobs: 1 },
    select: { id: true },
  });
  await raw.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  const pre = await preflight(raw, c.id, templateVersionSource(raw, "electrical"));
  if (!pre.ok) throw new Error(pre.code);
  await installCatalog(raw, c.id, pre.catalog);
  await raw.pricingSettings.create({
    data: { contractorId: c.id, crewHourRateCents: 21500, primaryMinimumCents: 21500,
      roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
  });
  // Costs cleared across the catalog: a dependency is invisible until the
  // contractor has costed, because an uncosted material sends every route to
  // review before the walk reaches a hand-off.
  await raw.service.updateMany({ where: { contractorId: c.id },
    data: { materialCostResolved: true, unresolvedMaterialKeys: [], unresolvedPolicyKeys: [] } });

  // The first service that refuses on a dependency, whichever it is.
  let refusal: Awaited<ReturnType<typeof activationRefusal>> = null;
  const candidates = await raw.service.findMany({
    where: { contractorId: c.id, bookingType: { not: "TROUBLESHOOT_ONLY" } },
    select: { id: true, slug: true }, orderBy: { slug: "asc" },
  });
  for (const s of candidates) {
    const svc = await raw.service.findUniqueOrThrow({ where: { id: s.id }, select: { id: true, bookingType: true } });
    const settings = await loadPricingSettings(raw as never, c.id);
    const promise = await promiseFor(raw as never, svc as never, settings);
    await raw.service.update({ where: { id: s.id },
      data: { offered: true, fieldLaborHours: 1, basePrice: 19900, publishedPriceApprovedAt: new Date() } });
    const r = await activationRefusal(raw, c.id, s.id);
    if (r?.code === "DEPENDENCY_UNAVAILABLE") { refusal = r; break; }
    void promise;
  }

  ok("a service refuses on an unlaunched destination", refusal !== null,
    "no dependency case found — the fixture, not the product");
  if (refusal) {
    ok("the message names the destination, not the rule",
      !!refusal.message && refusal.message.length > 40 && /live/.test(refusal.message),
      refusal.message);
    ok("missingPrerequisites still travels (existing contract intact)",
      Array.isArray(refusal.missingPrerequisites));
    const pres = refusal.prerequisites ?? [];
    ok("the refusal carries prerequisites", pres.length > 0,
      "named but not actionable — this is the defect");
    const actionable = pres.filter((p) => p.id !== null);
    ok("at least one prerequisite has an id to link to", actionable.length > 0,
      "the id was loaded to decide the refusal and then discarded");
    for (const p of actionable) {
      const owned = await raw.service.findFirst({
        where: { id: p.id!, contractorId: c.id }, select: { id: true } });
      ok(`the id belongs to this contractor (${p.label.slice(0, 40)})`, owned !== null,
        "a link that 404s, or worse, points across a tenant boundary");
    }
  }

  surfaceChecks();

  await removeContractor(SLUG);
  console.log(`\n  ${fail === 0 ? "A refusal the contractor can act on is a refusal that arrives." : `${fail} check(s) failed.`}\n`);
  await raw.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(`\n  ${(e as Error).stack}\n`);
  await removeContractor(SLUG).catch(() => {});
  await raw.$disconnect();
  process.exit(1);
});
