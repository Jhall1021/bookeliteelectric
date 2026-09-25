/**
 * Give one existing electrical contractor the same platform starting values
 * a fresh catalog install receives now.
 *
 * Report only by default. Applying never overwrites a contractor material or
 * an answered policy, never publishes a price, and never activates a service.
 */

import { PrismaClient } from "@prisma/client";
import { acceptMaterialBaselineVersion } from "../lib/materialCost";
import { preparedPolicyAnswer } from "../lib/electrical/preparedPolicyDefaults";
import { resolvePolicy } from "../lib/policyResolution";
import { probe, PRODUCTION_LINEAGE } from "./_lineage";
import { sanitizeForLog } from "./_sanitizeOutput";

const EXPECTED_PRODUCTION_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_RECOVERY_REHEARSAL_ENDPOINT = "ep-shiny-king-ayayoy5q";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const targetUrl = arg("target-url") ?? process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  const contractorSlug = arg("contractor");
  const apply = process.argv.includes("--apply");
  const recoveryRehearsal = process.argv.includes("--recovery-rehearsal");
  if (!targetUrl) throw new Error("--target-url or PRODUCTION_DATABASE_URL is required");
  if (!contractorSlug) throw new Error("--contractor is required");
  if (apply && !recoveryRehearsal && !process.argv.includes("--i-confirm-this-is-production")) {
    throw new Error("Applying requires --i-confirm-this-is-production");
  }
  if (apply && !recoveryRehearsal && !arg("recovery-point-confirmed")) {
    throw new Error("Applying requires --recovery-point-confirmed <branch-or-PITR>");
  }

  const identity = await probe(targetUrl);
  const expectedEndpoint = recoveryRehearsal
    ? EXPECTED_RECOVERY_REHEARSAL_ENDPOINT
    : EXPECTED_PRODUCTION_ENDPOINT;
  const validIdentity = identity.endpoint === expectedEndpoint &&
    identity.lineage === PRODUCTION_LINEAGE &&
    identity.markerEndpoint === EXPECTED_PRODUCTION_ENDPOINT;
  if (!validIdentity) {
    throw new Error(`Refusing ${identity.endpoint}: it is not the verified ${recoveryRehearsal ? "recovery rehearsal" : "production"} identity.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({
      where: { slug: contractorSlug },
      select: { id: true, slug: true, name: true },
    });
    if (!contractor) throw new Error(`Contractor ${contractorSlug} does not exist.`);

    const services = await db.service.findMany({
      where: { contractorId: contractor.id },
      select: { id: true },
    });
    const serviceIds = services.map((service) => service.id);
    const [serviceRoles, optionRoles, optionComponents] = await Promise.all([
      db.serviceMaterial.findMany({
        where: { serviceId: { in: serviceIds }, canonicalMaterialId: { not: null } },
        select: { canonicalMaterialId: true },
      }),
      db.answerOptionMaterial.findMany({
        where: { answerOption: { question: { serviceId: { in: serviceIds } } } },
        select: { canonicalMaterialId: true },
      }),
      db.answerOptionComponent.findMany({
        where: {
          answerOption: { question: { serviceId: { in: serviceIds } } },
          canonicalComponentId: { not: null },
        },
        select: { canonicalComponentId: true },
      }),
    ]);
    const componentIds = [...new Set(optionComponents.flatMap((row) =>
      row.canonicalComponentId ? [row.canonicalComponentId] : []))];
    const componentRoles = componentIds.length > 0
      ? await db.canonicalComponentMaterial.findMany({
          where: { canonicalComponentId: { in: componentIds } },
          select: { canonicalMaterialId: true },
        })
      : [];
    const roleIds = [...new Set([
      ...serviceRoles.flatMap((row) => row.canonicalMaterialId ? [row.canonicalMaterialId] : []),
      ...optionRoles.map((row) => row.canonicalMaterialId),
      ...componentRoles.map((row) => row.canonicalMaterialId),
    ])];

    const [existingMaterials, baselineRows, policies] = await Promise.all([
      db.contractorMaterial.findMany({
        where: { contractorId: contractor.id, canonicalMaterialId: { in: roleIds } },
        select: { canonicalMaterialId: true },
      }),
      db.materialBaselineVersion.findMany({
        where: { canonicalMaterialId: { in: roleIds } },
        orderBy: { sourcedAt: "desc" },
        select: { id: true, canonicalMaterialId: true },
      }),
      db.contractorPolicyValue.findMany({
        where: { contractorId: contractor.id },
        orderBy: { key: "asc" },
        select: { key: true, resolvedAt: true },
      }),
    ]);
    const existingRoleIds = new Set(existingMaterials.map((row) => row.canonicalMaterialId));
    const latestBaseline = new Map<string, string>();
    for (const row of baselineRows) {
      if (!latestBaseline.has(row.canonicalMaterialId)) latestBaseline.set(row.canonicalMaterialId, row.id);
    }
    const missingCosts = roleIds.filter((id) => !existingRoleIds.has(id));
    const adoptableCosts = missingCosts.filter((id) => latestBaseline.has(id));
    const missingBaselines = missingCosts.filter((id) => !latestBaseline.has(id));
    const openPolicies = policies.filter((policy) => !policy.resolvedAt);
    const adoptablePolicies = openPolicies.flatMap((policy) => {
      const answer = preparedPolicyAnswer("electrical", policy.key);
      return answer ? [{ key: policy.key, answer }] : [];
    });
    const policiesWithoutDefault = openPolicies.filter((policy) =>
      !preparedPolicyAnswer("electrical", policy.key));

    console.log(`\nPREPARED ELECTRICAL BASELINES — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${contractor.name} (${contractor.slug})`);
    console.log(`  services: ${services.length}`);
    console.log(`  required material roles: ${roleIds.length}`);
    console.log(`  missing contractor costs: ${missingCosts.length}`);
    console.log(`  prepared costs available: ${adoptableCosts.length}`);
    console.log(`  roles without a platform baseline: ${missingBaselines.length}`);
    console.log(`  unresolved policies: ${openPolicies.length}`);
    console.log(`  prepared policy defaults available: ${adoptablePolicies.length}`);
    console.log(`  policies without a prepared default: ${policiesWithoutDefault.map((policy) => policy.key).join(", ") || "none"}`);

    if (!apply) {
      console.log("\n  Report only; nothing changed.\n");
      return;
    }
    if (missingBaselines.length > 0) {
      throw new Error(`${missingBaselines.length} required material role(s) have no platform baseline; refusing a partial adoption.`);
    }

    let accepted = 0;
    for (const canonicalMaterialId of adoptableCosts) {
      const result = await acceptMaterialBaselineVersion(
        db,
        { contractorId: contractor.id, baselineVersionId: latestBaseline.get(canonicalMaterialId)! },
        { reason: "Prepared electrical catalog starting cost", actor: "prepared-electrical-baseline-adoption" },
      );
      if (!result.ok) throw new Error(`Material baseline adoption failed: ${result.code}`);
      accepted++;
    }

    let resolved = 0;
    for (const policy of adoptablePolicies) {
      const result = await resolvePolicy(db, contractor.id, policy.key, policy.answer);
      if (!result.ok) throw new Error(`${policy.key}: ${result.refusal.code} — ${result.refusal.message}`);
      resolved++;
    }

    console.log(`\n  Applied ${accepted} prepared material cost(s) and ${resolved} prepared policy default(s).`);
    console.log("  No price was approved, no service was selected, and no service was activated.\n");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(sanitizeForLog(error instanceof Error ? error.message : String(error)));
  process.exit(1);
});
