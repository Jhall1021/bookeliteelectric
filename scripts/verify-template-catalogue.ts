/**
 * Electrical Template v1 is independent of Elite — ADR-014, catalogue scale.
 *
 * The single-service proof showed the mechanism works. This one asks the
 * question that actually decides whether we have a product: can a contractor
 * who is not Elite be stood up from this template without inheriting Elite's
 * prices, allowances, thresholds, policies or name.
 *
 * It creates a throwaway contractor, provisions the whole catalogue into it,
 * and deletes it. Elite is fingerprinted before and after — a proof that the
 * exercise changed nothing about them is worth more than any assurance that it
 * was not supposed to.
 *
 * MUTATES REAL DATA. Lives in `npm run verify:template`, never in the deploy
 * gate: a killed build partway through would leave a throwaway contractor and
 * a half-provisioned catalogue behind.
 */
import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { loadEnv } from "./_env";
import { hasHoles } from "../lib/policyBands";

loadEnv();
const prisma = new PrismaClient();
const THROWAWAY = "__template-catalogue-proof__";
const TRADE = "electrical";
const VERSION = 1;

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/**
 * Everything about Elite that this exercise could plausibly disturb, hashed.
 * Deliberately includes prices and approvals: "we only read Elite" is the
 * claim, and a fingerprint is how it stops being a claim.
 */
async function fingerprintElite(contractorId: string) {
  const services = await prisma.service.findMany({
    where: { contractorId },
    orderBy: { slug: "asc" },
    include: {
      materials: { orderBy: { id: "asc" } },
      questions: { orderBy: { key: "asc" }, include: { options: { orderBy: { value: "asc" } } } },
    },
  });
  const sig = services.map((s) =>
    [s.slug, s.name, s.basePrice, s.whileWeThereBasePrice, s.materialCostCents, s.materialMultiplier,
     s.publishedPriceApprovedAt?.toISOString(), s.materialCostResolved, s.unresolvedMaterialKeys.join(","),
     s.unresolvedPolicyKeys.join(","),
     s.materials.map((m) => `${m.canonicalMaterialId}:${m.quantity}`).join(","),
     s.questions.map((q) => `${q.key}|${q.prompt}|` +
       q.options.map((o) => `${o.value}=${o.label}@${o.priceModifierCents}/${o.approvedComponentPriceCents}`).join(";")).join("~"),
    ].join("|")).join("\n");
  return { hash: createHash("sha256").update(sig).digest("hex"), services: services.length };
}

async function main() {
  console.log(`\nELECTRICAL TEMPLATE v${VERSION} — CATALOGUE-SCALE INDEPENDENCE\n`);

  const elite = await prisma.contractor.findFirstOrThrow({
    where: { slug: { notIn: [THROWAWAY] } }, select: { id: true, name: true, slug: true },
  });
  const before = await fingerprintElite(elite.id);
  console.log(`  Elite: ${elite.name} (${before.services} services)  fingerprint ${before.hash.slice(0, 16)}…\n`);

  await prisma.contractor.deleteMany({ where: { slug: THROWAWAY } });
  const proof = await prisma.contractor.create({
    data: { slug: THROWAWAY, name: "Throwaway Proof Electric", active: false },
    select: { id: true },
  });

  try {
    execFileSync("npx", ["tsx", "scripts/provision-from-template.ts",
      "--contractor", THROWAWAY, "--trade", TRADE, "--version", String(VERSION), "--apply"],
      { encoding: "utf8", stdio: "pipe" });

    const tv = await prisma.templateVersion.findUniqueOrThrow({
      where: { trade_version: { trade: TRADE, version: VERSION } },
    });
    const tplServices = await prisma.templateService.findMany({
      where: { templateVersionId: tv.id },
      include: { questions: { include: { options: true } } },
    });
    const got = await prisma.service.findMany({
      where: { contractorId: proof.id },
      include: { materials: true, questions: { include: { options: {
        include: { components: true, conditionalDisclaimers: true } } } } },
    });

    // 1 — the whole catalogue arrives
    ok(got.length === 75 && got.length === tplServices.length,
      `all 75 services provision (${got.length} of ${tplServices.length} template services)`);

    // 2 — same slugs coexist with Elite
    const eliteSlugs = new Set((await prisma.service.findMany({
      where: { contractorId: elite.id }, select: { slug: true } })).map((s) => s.slug));
    const shared = got.filter((s) => eliteSlugs.has(s.slug));
    ok(shared.length > 60, `same slugs coexist with Elite's (${shared.length} shared)`,
      `only ${shared.length} overlap; the per-contractor slug unique is not doing its job`);

    // 3 — structure corresponds to the template
    const tplByKey = new Map(tplServices.map((t) => [t.slug, t]));
    const mismatched = got.filter((s) => {
      const t = tplByKey.get(s.slug);
      if (!t) return true;
      if (t.questions.length !== s.questions.length) return true;
      return t.questions.flatMap((q) => q.options).length !== s.questions.flatMap((q) => q.options).length;
    });
    ok(mismatched.length === 0, "structure matches Electrical Template v1 question-for-question",
      `${mismatched.length} differ: ${mismatched.slice(0, 4).map((s) => s.slug).join(", ")}`);

    // 4 — no pricing came across
    const priced = got.filter((s) => s.basePrice !== null || s.whileWeThereBasePrice !== null ||
      s.publishedPriceApprovedAt !== null);
    ok(priced.length === 0, "no service carries a price or an approval",
      `${priced.length} priced: ${priced.slice(0, 4).map((s) => s.slug).join(", ")}`);

    const modifiers = got.flatMap((s) => s.questions.flatMap((q) => q.options))
      .filter((o) => o.priceModifierCents !== 0 || o.approvedComponentPriceCents !== null);
    ok(modifiers.length === 0, "no answer option carries a price modifier or approved increment",
      `${modifiers.length} option(s) carry one`);

    // 5 — no material costs, and no allowance quantities
    const costed = got.filter((s) => s.materialCostCents !== null || s.materialMultiplier !== null);
    ok(costed.length === 0, "no service carries a material cost or multiplier", `${costed.length} do`);

    const eliteMats = await prisma.serviceMaterial.findMany({
      where: { service: { contractorId: elite.id } }, select: { canonicalMaterialId: true, quantity: true } });
    const eliteQty = new Map(eliteMats.map((m) => [m.canonicalMaterialId, m.quantity]));
    const leakedQty = got.flatMap((s) => s.materials).filter((m) =>
      /WIRE|CABLE|CONSUMABLE/i.test("") ? false : eliteQty.get(m.canonicalMaterialId) === m.quantity && m.quantity > 1);
    ok(leakedQty.length === 0, "no allowance quantity matches Elite's", `${leakedQty.length} match`);

    // 6 — no disclaimer text
    const disclaimers = got.flatMap((s) => s.questions.flatMap((q) => q.options))
      .filter((o) => o.disclaimer !== null);
    const attached = got.flatMap((s) => s.questions.flatMap((q) => q.options.flatMap((o) => o.conditionalDisclaimers)));
    ok(disclaimers.length === 0 && attached.length === 0,
      "no contractor disclaimer text copied, inline or attached",
      `${disclaimers.length} inline, ${attached.length} attached`);

    // 7 — no Elite branding anywhere customer-facing
    const BRAND = /\bElite\b/i;
    const branded: string[] = [];
    for (const s of got) {
      if (BRAND.test(s.name) || BRAND.test(s.shortDescription ?? "")) branded.push(`service ${s.slug}`);
      for (const q of s.questions) {
        if (BRAND.test(q.prompt) || BRAND.test(q.helpText ?? "")) branded.push(`${s.slug}/${q.key}`);
        for (const o of q.options) if (BRAND.test(o.label)) branded.push(`${s.slug}/${q.key}/${o.value}`);
      }
    }
    ok(branded.length === 0, "no Elite name or branding in customer-facing text",
      `${branded.length}: ${branded.slice(0, 4).join(", ")}`);

    const brandedSlug = got.filter((s) => /elite/i.test(s.slug));
    ok(brandedSlug.length === 0, "no service slug names Elite",
      brandedSlug.map((s) => s.slug).join(", "));

    // 8 — no dollar amounts in canonical or provisioned copy
    const MONEY = /\$\s?[\d,]+/;
    const money: string[] = [];
    for (const t of tplServices) {
      if (MONEY.test(t.name) || MONEY.test(t.shortDescription ?? "")) money.push(`template ${t.key}`);
      for (const q of t.questions) {
        if (MONEY.test(q.prompt) || MONEY.test(q.helpText ?? "")) money.push(`template ${t.key}/${q.key}`);
        for (const o of q.options) if (MONEY.test(o.label)) money.push(`template ${t.key}/${q.key}/${o.value}`);
      }
    }
    ok(money.length === 0, "no dollar amount anywhere in the canonical template",
      `${money.length}: ${money.slice(0, 4).join(", ")}`);

    // 9 — the decisions that must stay unresolved, stayed unresolved
    // Only services that USE materials can be material-unresolved. A service
    // with no materials has nothing to be unresolved about, and asserting
    // otherwise would be demanding a flag that means nothing.
    const withMats = got.filter((s) => s.materials.length > 0 || s.unresolvedMaterialKeys.length > 0);
    const stillResolved = withMats.filter((s) => s.materialCostResolved);
    ok(withMats.length > 0 && stillResolved.length === 0,
      `every service that uses materials is unresolved (${withMats.length} of ${got.length} use materials)`,
      stillResolved.slice(0, 4).map((s) => s.slug).join(", "));

    const policies = await prisma.contractorPolicyValue.findMany({ where: { contractorId: proof.id } });
    ok(policies.length === 10, `all 10 breakpoint policies recorded (${policies.length})`);
    ok(policies.every((p) => p.resolvedAt === null && p.boundaries.length === 0),
      "every breakpoint policy is unresolved, and unresolved means EMPTY not zero",
      policies.filter((p) => p.boundaries.length).map((p) => `${p.key}=[${p.boundaries}]`).join(", "));

    const withPolicy = got.filter((s) => s.unresolvedPolicyKeys.length > 0);
    ok(withPolicy.length > 0, `services depending on a policy say so (${withPolicy.length})`);

    // A band label must still carry its hole. If provisioning had filled one
    // in, it would be with Elite's number.
    const bandOpts = got.flatMap((s) => s.questions.flatMap((q) => q.options)).filter((o) => o.labelPattern);
    ok(bandOpts.length > 0 && bandOpts.every((o) => hasHoles(o.label)),
      `every band label is still unresolved (${bandOpts.length} options)`,
      bandOpts.filter((o) => !hasHoles(o.label)).slice(0, 4).map((o) => o.label).join(" / "));

    // Elite's actual numbers must appear nowhere in the throwaway's labels.
    const ELITE_NUMBERS = /\b(8|9|10|11|12|20|25|26|50)\s?(feet|ft)\b/i;
    const leaked = bandOpts.filter((o) => ELITE_NUMBERS.test(o.label));
    ok(leaked.length === 0, "none of Elite's boundary numbers reached the throwaway",
      leaked.slice(0, 4).map((o) => o.label).join(" / "));

    // 10 — nothing publishes because Elite's equivalent does
    const elitePublished = await prisma.service.count({
      where: { contractorId: elite.id, publishedPriceApprovedAt: { not: null } } });
    const proofPublished = got.filter((s) => s.publishedPriceApprovedAt !== null);
    ok(proofPublished.length === 0,
      `nothing publishes on Elite's coat-tails (Elite has ${elitePublished} published, throwaway has ${proofPublished.length})`);
    const active = got.filter((s) => s.active);
    ok(active.length === 0, `nothing arrives active (${active.length} active)`);

    // 11 — the template itself was not written to
    const tplAfter = await prisma.templateService.count({ where: { templateVersionId: tv.id } });
    ok(tplAfter === tplServices.length, "provisioning did not write to the template", `${tplAfter} vs ${tplServices.length}`);

    // 12 — Elite is untouched while the throwaway exists
    const during = await fingerprintElite(elite.id);
    ok(during.hash === before.hash, "Elite unchanged while the throwaway exists",
      `${before.hash.slice(0, 16)} -> ${during.hash.slice(0, 16)}`);
  } finally {
    // services -> contractor is RESTRICT on purpose: nobody deletes a
    // contractor by accident. So the throwaway comes apart explicitly, and
    // the ordering is the FK graph rather than anything clever.
    const ids = (await prisma.service.findMany({ where: { contractorId: proof.id }, select: { id: true } }))
      .map((s) => s.id);
    await prisma.answerOption.deleteMany({ where: { question: { serviceId: { in: ids } } } });
    await prisma.question.deleteMany({ where: { serviceId: { in: ids } } });
    await prisma.serviceMaterial.deleteMany({ where: { serviceId: { in: ids } } });
    await prisma.service.deleteMany({ where: { contractorId: proof.id } });
    await prisma.contractor.delete({ where: { id: proof.id } });
  }

  const after = await fingerprintElite(elite.id);
  ok(after.hash === before.hash, "Elite unchanged after the throwaway is deleted",
    `${before.hash.slice(0, 16)} -> ${after.hash.slice(0, 16)}`);
  ok((await prisma.contractor.count({ where: { slug: THROWAWAY } })) === 0, "throwaway removed");

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
