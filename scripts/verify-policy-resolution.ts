/**
 * An unresolved policy cannot reach a customer — ADR-014.
 *
 * A band answer arrives from the template reading "Less than {b1} feet". That
 * is deliberate: filling it in would mean choosing a number on the
 * contractor's behalf. But a hole that renders is worse than a wrong number,
 * so the hole and the block on publishing have to be the same fact.
 *
 * Static where it can be — the invariants below hold without a database — and
 * over live rows for the one thing only data can answer.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { loadEnv } from "./_env";
import { renderBandLabel, hasHoles, boundariesUsed, validateBoundaries, UnresolvedPolicyError } from "../lib/policyBands";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { publishSuggestedPrice } from "../lib/pricePublication";
import { activationRefusal } from "../lib/serviceActivation";
import { activationMaterialRoles } from "../lib/materialResolution";
import { resolvePolicy } from "../lib/policyResolution";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";

loadEnv();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

function statics() {
  ok(renderBandLabel("Less than {b1} feet", "k", [10]) === "Less than 10 feet", "renders a single boundary");
  ok(renderBandLabel("{b1+1} to {b2} feet", "k", [25, 50]) === "26 to 50 feet", "renders an offset boundary");
  ok(renderBandLabel("{b1} feet or less", "k", [8]) === "8 feet or less", "renders a trailing form");

  // The failure that matters: never quietly hand back the raw pattern.
  let threw = false;
  try { renderBandLabel("Less than {b1} feet", "run.x", []); } catch (e) { threw = e instanceof UnresolvedPolicyError; }
  ok(threw, "an unresolved policy throws rather than returning the pattern");

  threw = false;
  try { renderBandLabel("{b1} to {b2} feet", "run.x", [10]); } catch (e) { threw = e instanceof UnresolvedPolicyError; }
  ok(threw, "too few boundaries throws rather than rendering half a label");

  ok(hasHoles("Less than {b1} feet") && !hasHoles("Less than 10 feet"), "holes are detectable");
  ok(JSON.stringify(boundariesUsed("{b1+1} to {b2} feet")) === "[1,2]", "boundary usage is readable from the pattern");

  // A band set is valid as a SET. These are the configurations that would
  // produce overlapping or empty bands.
  ok(validateBoundaries([10, 20], 2).length === 0, "ascending boundaries validate");
  ok(validateBoundaries([20, 10], 2).some((p) => p.code === "ascending"), "descending boundaries are refused");
  ok(validateBoundaries([10, 10], 2).some((p) => p.code === "ascending"), "equal neighbors are refused (empty band)");
  ok(validateBoundaries([10], 2).some((p) => p.code === "count"), "a short set is refused");
  ok(validateBoundaries([0, 20], 2).some((p) => p.code === "positive"), "zero is not a boundary");
  ok(validateBoundaries([-5, 20], 2).some((p) => p.code === "positive"), "negative is not a boundary");
}

async function live(prisma: PrismaClient) {
  // Nothing customer-facing may carry a hole while it is published.
  const leaking = await prisma.answerOption.findMany({
    where: { labelPattern: { not: null }, question: { service: { publishedPriceApprovedAt: { not: null } } } },
    select: { label: true, question: { select: { key: true, service: { select: { slug: true } } } } },
  });
  const holes = leaking.filter((o) => hasHoles(o.label));
  ok(holes.length === 0, `no published service shows an unresolved band label (${leaking.length} band options on published services)`,
    holes.slice(0, 4).map((o) => `${o.question.service.slug}/${o.question.key}: ${o.label}`).join(" | "));

  // An option that says it depends on a policy must name one that exists.
  const orphan = await prisma.answerOption.findMany({
    where: { policyKey: { not: null } },
    select: { policyKey: true, question: { select: { service: { select: { contractorId: true, slug: true } } } } },
  });
  const known = new Set((await prisma.contractorPolicyValue.findMany({ select: { contractorId: true, key: true } }))
    .map((p) => `${p.contractorId}/${p.key}`));
  const dangling = orphan.filter((o) => !known.has(`${o.question.service.contractorId}/${o.policyKey}`));
  ok(dangling.length === 0, `every band option's policy exists for its contractor (${orphan.length} checked)`,
    dangling.slice(0, 4).map((o) => `${o.question.service.slug}: ${o.policyKey}`).join(", "));

  // A resolved policy is a valid band set, not merely a non-empty one.
  const resolved = await prisma.contractorPolicyValue.findMany({ where: { resolvedAt: { not: null } } });
  const bad = resolved.flatMap((p) => {
    const probs = validateBoundaries(p.boundaries, p.boundaryCount);
    return probs.length ? [`${p.key}: ${probs.map((x) => x.message).join("; ")}`] : [];
  });
  ok(bad.length === 0, `every resolved policy is internally consistent (${resolved.length} resolved)`, bad.slice(0, 4).join(" | "));

  // A service naming an unresolved policy must not be published.
  const published = await prisma.service.findMany({
    where: { publishedPriceApprovedAt: { not: null }, NOT: { unresolvedPolicyKeys: { isEmpty: true } } },
    select: { slug: true, unresolvedPolicyKeys: true },
  });
  ok(published.length === 0, "no published service depends on an unresolved policy",
    published.slice(0, 4).map((s) => `${s.slug}: ${s.unresolvedPolicyKeys.join(",")}`).join(" | "));
}

/**
 * THE REFUSALS, EXERCISED.
 *
 * `live()` above asserts that no published service currently depends on an
 * unresolved policy — a true and useful claim, and one that stays green if
 * both refusals are deleted, because it only reports the state of whatever
 * rows happen to exist. BrightPath passed it for weeks by having no services.
 *
 * These prove the two boundaries actually refuse, and that deciding the policy
 * is what lifts them — not clearing a flag.
 */
async function behavior(prisma: PrismaClient) {
  console.log(`\n  REFUSALS\n`);
  const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;
  const SLUG = "test-policy-refusal";
  const inTenant = <T>(id: string, fn: () => Promise<T>) =>
    withTenant({ contractorId: id, source: "test" }, fn);

  const teardown = async () => {
    for (const m of ["contractorPolicyValue", "contractorCategory", "contractorSite", "contractorOnboarding", "contractorTrade"] as const) {
      await (prisma as unknown as Record<string, { deleteMany(a: unknown): Promise<unknown> }>)[m]
        .deleteMany({ where: { contractor: { slug: SLUG } } }).catch(() => {});
    }
    await destroyContractor(prisma, SLUG).catch(() => {});
  };
  await teardown();

  try {
    const c = await prisma.contractor.create({
      data: { slug: SLUG, name: "Policy refusal probe", active: false, countryCode: "US" },
      select: { id: true },
    });
    await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
    const pre = await preflight(prisma, c.id, templateVersionSource(prisma, "electrical"));
    if (!pre.ok) throw new Error(pre.code);
    await installCatalog(prisma, c.id, pre.catalog);
    await prisma.pricingSettings.create({
      data: {
        contractorId: c.id, crewHourRateCents: 21500, primaryMinimumCents: 21500,
        roundingIncrementCents: 500, defaultPermitAdminCents: 0,
      },
    });

    // A service carrying a real unresolved policy, with everything else
    // cleared so only the policy can refuse.
    const svc = await prisma.service.findFirst({
      where: { contractorId: c.id, NOT: { unresolvedPolicyKeys: { isEmpty: true } } },
      select: { id: true, slug: true, unresolvedPolicyKeys: true },
    });
    if (!svc) { ok(false, "a freshly installed catalog carries an unresolved policy", "none found"); return; }
    const key = svc.unresolvedPolicyKeys[0];
    await prisma.service.update({
      where: { id: svc.id },
      data: { offered: true, fieldLaborHours: 1, materialCostResolved: true, unresolvedMaterialKeys: [] },
    });
    // "Everything else cleared" needs one more thing now. Material readiness
    // used to be the two cached fields above; it is DERIVED as of the B1 fix,
    // from the roles a reachable priceable path consumes — ServiceMaterial,
    // AnswerOptionMaterial and component recipes. Clearing the cache no longer
    // clears the blocker, so the roles are costed here. Without this the
    // service refuses with MATERIALS_UNRESOLVED, which is truthful and is not
    // what this test is about.
    for (const role of await activationMaterialRoles(prisma, svc.id)) {
      await prisma.contractorMaterial.upsert({
        where: { contractorId_canonicalMaterialId: { contractorId: c.id, canonicalMaterialId: role.canonicalMaterialId } },
        update: { unitCostCents: 1000 },
        create: { contractorId: c.id, canonicalMaterialId: role.canonicalMaterialId, unitCostCents: 1000 },
      });
    }

    const refusedPublish = await inTenant(c.id, () => publishSuggestedPrice(guarded, c.id, svc.id));
    ok(!refusedPublish.ok && refusedPublish.refusal.code === "POLICY_UNRESOLVED",
      "publishing a price is refused while a policy is undecided",
      refusedPublish.ok ? "published" : refusedPublish.refusal.code);

    // ACTIVATION IS THE BACKSTOP, not a second gate on the same path.
    //
    // Publication refuses first, so a service that came through the authority
    // can never reach activation with an undecided policy and no price. The
    // case activation exists for is the one BrightPath was actually in: an
    // approval stamped before the publication guard existed. Simulated by
    // stamping one directly — which is the only way this state now arises.
    await prisma.service.update({
      where: { id: svc.id },
      data: { basePrice: 21500, publishedPriceApprovedAt: new Date() },
    });
    const refusedActivate = await inTenant(c.id, () => activationRefusal(guarded, c.id, svc.id));
    ok(refusedActivate?.code === "POLICY_UNRESOLVED",
      "and a service already carrying a price is still refused activation",
      refusedActivate?.code ?? "allowed");
    await prisma.service.update({
      where: { id: svc.id },
      data: { basePrice: null, publishedPriceApprovedAt: null },
    });

    // Deciding it renders the labels. THIS is what lifts the refusal — a
    // surface that only cleared the key would leave the holes on screen.
    // EVERY key this service waits on, not just the first: a service can sit
    // behind two decisions, and answering one of them is not an answer.
    let allDecided = true;
    let lastMessage = "";
    for (const k of svc.unresolvedPolicyKeys) {
      const value = await prisma.contractorPolicyValue.findFirstOrThrow({
        where: { contractorId: c.id, key: k }, select: { boundaryCount: true },
      });
      const decided = await resolvePolicy(prisma, c.id, k,
        value.boundaryCount === 0
          ? { choice: "We supply it" }
          : { boundaries: Array.from({ length: value.boundaryCount }, (_, i) => (i + 1) * 10) });
      if (!decided.ok) { allDecided = false; lastMessage = decided.refusal.message; }
    }
    ok(allDecided, `deciding ${svc.unresolvedPolicyKeys.length} policy(ies) is accepted`, lastMessage);

    const stillHoley = await prisma.answerOption.count({
      where: { label: { contains: "{b" }, question: { service: { contractorId: c.id, id: svc.id } } },
    });
    ok(stillHoley === 0, "and rewrites the labels rather than only clearing the flag",
      `${stillHoley} label(s) still hold a pattern`);

    const after = await inTenant(c.id, () => publishSuggestedPrice(guarded, c.id, svc.id));
    ok(after.ok, "the same service can then be priced", after.ok ? "" : after.refusal.code);
  } finally {
    await teardown();
  }
  await (guarded as unknown as PrismaClient).$disconnect();
}

async function main() {
  console.log("\nPOLICY RESOLUTION\n");
  statics();
  const prisma = new PrismaClient();
  await live(prisma);
  await behavior(prisma);
  await prisma.$disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
