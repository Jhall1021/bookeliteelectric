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

async function main() {
  console.log("\nPOLICY RESOLUTION\n");
  statics();
  const prisma = new PrismaClient();
  await live(prisma);
  await prisma.$disconnect();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
