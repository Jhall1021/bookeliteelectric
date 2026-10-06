/**
 * Publish bounded instant pricing for the Exterior GFCI continuation flow and
 * add the standard finished-wall doorway detour to its measurement card.
 *
 * Report-only by default. Pass --apply after the production identity guard.
 */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";

import { DOORWAY_DETOUR_FEET, doorwayAnswerKey } from "../lib/electrical/doorwayRouting";
import { EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES } from "../lib/electrical/exteriorGfciRouteLaborPackages";
import { suggestConfigurationPrice } from "../lib/pricing";
import { loadPricingSettings } from "../lib/routeResolver";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const CONTRACTOR_SLUG = "electrical-onboarding-test";
const SERVICE_SLUG = "exterior-gfci-other-routing";
const DISTANCE_KEY = "ext_gfci_distance";
const DOORWAY_ANSWER_KEY = doorwayAnswerKey(DISTANCE_KEY);
const DOORWAY_COMPONENT_KEY = "EXT_GFCI_FINISHED_DOORWAY_BYPASS";
const SUPPORTED_VALUES = ["under_10", "10_to_20"];
const NOTES =
  "One standard doorway adds fourteen feet of 12/2 cable and two ordinary drywall access openings to route above the header. Removed drywall pieces are resecured; patching, caulking, sanding, texture, primer, and paint are not included.";

type PriceInput = {
  laborHours: number;
  materialCostCents: number;
  scheduleMinutes: number;
};

async function main() {
  const apply = process.argv.includes("--apply");
  const databaseUrl = process.env.PRODUCTION_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("PRODUCTION_DATABASE_URL or DATABASE_URL is required");

  const identity = await probe(databaseUrl);
  if (
    identity.endpoint !== EXPECTED_ENDPOINT ||
    identity.lineage !== PRODUCTION_LINEAGE ||
    identity.markerEndpoint !== EXPECTED_ENDPOINT
  ) {
    throw new Error(`Refusing ${identity.endpoint}: production endpoint, lineage, or marker did not match.`);
  }

  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  try {
    const contractor = await db.contractor.findUniqueOrThrow({
      where: { slug: CONTRACTOR_SLUG },
      select: { id: true, name: true },
    });
    const service = await db.service.findUniqueOrThrow({
      where: { contractorId_slug: { contractorId: contractor.id, slug: SERVICE_SLUG } },
      select: {
        id: true,
        materialMultiplier: true,
        laborCrewType: true,
        questions: {
          where: { key: DISTANCE_KEY },
          select: {
            id: true,
            options: {
              where: { value: { in: SUPPORTED_VALUES } },
              select: { id: true, value: true, routeAction: true, photosBlockBooking: true },
            },
          },
        },
      },
    });
    assert.equal(service.questions.length, 1, `expected one ${DISTANCE_KEY} question`);
    assert.equal(service.questions[0].options.length, SUPPORTED_VALUES.length, "expected both supported distance bands");

    const routeKeys = EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES.map(({ componentKey }) => componentKey);
    const [routeComponents, wire, laborDecisions, settings] = await Promise.all([
      db.canonicalComponent.findMany({
        where: { key: { in: routeKeys } },
        include: { materials: true },
      }),
      db.canonicalMaterial.findUniqueOrThrow({ where: { key: "WIRE_12_2" }, select: { id: true } }),
      db.contractorLaborOperationDecision.findMany({
        where: {
          contractorId: contractor.id,
          trade: "electrical",
          operationKey: { in: ["ELEC_FISH_CABLE_CONCEALED", "ELEC_CUT_DRYWALL_ACCESS_OPENING"] },
        },
        select: { operationKey: true, hoursPerUnit: true },
      }),
      loadPricingSettings(db, contractor.id),
    ]);
    assert.equal(routeComponents.length, routeKeys.length, "all four exterior GFCI route components must exist");
    const laborByKey = new Map(laborDecisions.map((row) => [row.operationKey, row.hoursPerUnit]));
    const fishHours = laborByKey.get("ELEC_FISH_CABLE_CONCEALED");
    const openingHours = laborByKey.get("ELEC_CUT_DRYWALL_ACCESS_OPENING");
    assert.notEqual(fishHours, undefined, "concealed cable labor decision is required");
    assert.notEqual(openingHours, undefined, "drywall access labor decision is required");

    const materialIds = new Set<string>([wire.id]);
    for (const component of routeComponents) {
      for (const line of component.materials) materialIds.add(line.canonicalMaterialId);
    }
    const materialRows = await db.contractorMaterial.findMany({
      where: { contractorId: contractor.id, canonicalMaterialId: { in: [...materialIds] }, active: true },
      select: { canonicalMaterialId: true, unitCostCents: true },
    });
    const materialCosts = new Map(materialRows.map((row) => [row.canonicalMaterialId, row.unitCostCents]));
    const wireCost = materialCosts.get(wire.id);
    assert.notEqual(wireCost, undefined, "active 12/2 cable cost is required");

    const price = ({ laborHours, materialCostCents, scheduleMinutes }: PriceInput) => {
      const suggestion = suggestConfigurationPrice(
        {
          accessClass: null,
          accessBySlot: {},
          awaitingComponentMaterialCost: false,
          awaitingComponentLabor: false,
          awaitingComponentApproval: false,
          fieldLaborHours: laborHours,
          materialCostCents,
          estimatedMinutes: scheduleMinutes,
          techCount: 1,
          components: [],
          addedCrewHours: laborHours,
          approvedIncrementCents: 0,
          legacyModifierCents: 0,
        },
        {
          materialMultiplier: service.materialMultiplier,
          permitAdminCents: 0,
          otherDirectCostCents: 0,
          isPrimaryEligible: false,
          laborCrewType: service.laborCrewType,
        },
        settings,
        false,
      ).totalCents;
      assert.notEqual(suggestion, null, "component price must resolve from current contractor economics");
      return suggestion!;
    };

    const canonicalByKey = new Map(routeComponents.map((component) => [component.key, component]));
    const routeProposals = EXTERIOR_GFCI_ROUTE_LABOR_PACKAGES.map((baseline) => {
      const component = canonicalByKey.get(baseline.componentKey)!;
      const directMaterial = component.materials.reduce((total, line) => {
        const unitCost = materialCosts.get(line.canonicalMaterialId);
        assert.notEqual(unitCost, undefined, `${baseline.componentKey} material cost is required`);
        return total + unitCost! * line.quantity;
      }, 0);
      return {
        component,
        laborHours: baseline.incrementHours,
        materialCostCents: directMaterial,
        scheduleMinutes: baseline.incrementScheduleMinutes,
        approvedPriceCents: price({
          laborHours: baseline.incrementHours,
          materialCostCents: directMaterial,
          scheduleMinutes: baseline.incrementScheduleMinutes,
        }),
        notes: `${baseline.evidence}; priced from current contractor labor and material settings`,
      };
    });
    const doorwayInput = {
      laborHours: fishHours! * DOORWAY_DETOUR_FEET + openingHours! * 2,
      materialCostCents: wireCost! * DOORWAY_DETOUR_FEET,
      scheduleMinutes: Math.ceil((fishHours! * DOORWAY_DETOUR_FEET + openingHours! * 2) * 60),
    };
    const doorwayApprovedPriceCents = price(doorwayInput);

    const currentCount = await db.contractorComponent.count({
      where: { contractorId: contractor.id, canonicalComponent: { key: { in: routeKeys } } },
    });
    console.log(`EXTERIOR GFCI FINISHED ROUTING — ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint} / ${contractor.name}`);
    console.log(`  route approvals present: ${currentCount}/${routeKeys.length}`);
    for (const proposal of routeProposals) {
      console.log(
        `  ${proposal.component.key}: ${proposal.laborHours.toFixed(2)} hr, ` +
          `$${(proposal.materialCostCents / 100).toFixed(2)} direct material -> $${(proposal.approvedPriceCents / 100).toFixed(2)}`,
      );
    }
    console.log(
      `  doorway: ${doorwayInput.laborHours.toFixed(2)} hr, ` +
        `$${(doorwayInput.materialCostCents / 100).toFixed(2)} direct material -> $${(doorwayApprovedPriceCents / 100).toFixed(2)}`,
    );
    if (!apply) {
      console.log("  Report only. Re-run with --apply to publish the guarded catalog update.");
      return;
    }

    await db.$transaction(async (tx) => {
      const doorway = await tx.canonicalComponent.upsert({
        where: { key: DOORWAY_COMPONENT_KEY },
        update: {
          name: "Exterior GFCI — finished-wall doorway bypass",
          customerFacingLabel: "Route the concealed exterior-outlet wiring around one doorway",
          notes: NOTES,
          active: true,
        },
        create: {
          key: DOORWAY_COMPONENT_KEY,
          name: "Exterior GFCI — finished-wall doorway bypass",
          customerFacingLabel: "Route the concealed exterior-outlet wiring around one doorway",
          notes: NOTES,
          active: true,
        },
      });
      await tx.canonicalComponentMaterial.upsert({
        where: {
          canonicalComponentId_canonicalMaterialId: {
            canonicalComponentId: doorway.id,
            canonicalMaterialId: wire.id,
          },
        },
        update: { quantity: DOORWAY_DETOUR_FEET, order: 0 },
        create: {
          canonicalComponentId: doorway.id,
          canonicalMaterialId: wire.id,
          quantity: DOORWAY_DETOUR_FEET,
          order: 0,
        },
      });

      for (const proposal of routeProposals) {
        await tx.contractorComponent.upsert({
          where: {
            contractorId_canonicalComponentId: {
              contractorId: contractor.id,
              canonicalComponentId: proposal.component.id,
            },
          },
          update: {
            approvedPriceCents: proposal.approvedPriceCents,
            addFieldLaborHours: proposal.laborHours,
            addMaterialCostCents: proposal.materialCostCents,
            addScheduleMinutes: proposal.scheduleMinutes,
            active: true,
            notes: proposal.notes,
          },
          create: {
            contractorId: contractor.id,
            canonicalComponentId: proposal.component.id,
            approvedPriceCents: proposal.approvedPriceCents,
            addFieldLaborHours: proposal.laborHours,
            addMaterialCostCents: proposal.materialCostCents,
            addScheduleMinutes: proposal.scheduleMinutes,
            active: true,
            notes: proposal.notes,
          },
        });
      }
      await tx.contractorComponent.upsert({
        where: {
          contractorId_canonicalComponentId: {
            contractorId: contractor.id,
            canonicalComponentId: doorway.id,
          },
        },
        update: {
          approvedPriceCents: doorwayApprovedPriceCents,
          addFieldLaborHours: doorwayInput.laborHours,
          addMaterialCostCents: doorwayInput.materialCostCents,
          addScheduleMinutes: doorwayInput.scheduleMinutes,
          active: true,
          notes: NOTES,
        },
        create: {
          contractorId: contractor.id,
          canonicalComponentId: doorway.id,
          approvedPriceCents: doorwayApprovedPriceCents,
          addFieldLaborHours: doorwayInput.laborHours,
          addMaterialCostCents: doorwayInput.materialCostCents,
          addScheduleMinutes: doorwayInput.scheduleMinutes,
          active: true,
          notes: NOTES,
        },
      });

      const liveOptions = await tx.answerOption.findMany({
        where: { questionId: service.questions[0].id, value: { in: ["under_10", "10_to_20"] } },
        select: { id: true },
      });
      for (const option of liveOptions) {
        await tx.answerOption.update({
          where: { id: option.id },
          data: { routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false, requiredPhotoLabels: [] },
        });
        await tx.answerOptionComponent.upsert({
          where: {
            answerOptionId_canonicalComponentId: {
              answerOptionId: option.id,
              canonicalComponentId: doorway.id,
            },
          },
          update: {
            quantity: 1,
            conditionAccessClass: "FINISHED",
            conditionAccessSlot: "PRIMARY",
            conditionAnswerKey: DOORWAY_ANSWER_KEY,
            conditionAnswerValue: "yes",
          },
          create: {
            answerOptionId: option.id,
            canonicalComponentId: doorway.id,
            quantity: 1,
            conditionAccessClass: "FINISHED",
            conditionAccessSlot: "PRIMARY",
            conditionAnswerKey: DOORWAY_ANSWER_KEY,
            conditionAnswerValue: "yes",
          },
        });
      }

      const templateOptions = await tx.templateAnswerOption.findMany({
        where: {
          value: { in: ["under_10", "10_to_20"] },
          templateQuestion: {
            key: DISTANCE_KEY,
            templateService: { key: SERVICE_SLUG, templateVersion: { trade: "electrical" } },
          },
        },
        select: { id: true },
      });
      for (const option of templateOptions) {
        await tx.templateAnswerOption.update({
          where: { id: option.id },
          data: { routeAction: "RESOLVE_ADJUSTED", photosBlockBooking: false },
        });
        await tx.templateAnswerOptionComponent.upsert({
          where: {
            templateAnswerOptionId_canonicalComponentId: {
              templateAnswerOptionId: option.id,
              canonicalComponentId: doorway.id,
            },
          },
          update: {
            quantity: 1,
            conditionAccessClass: "FINISHED",
            conditionAccessSlot: "PRIMARY",
            conditionAnswerKey: DOORWAY_ANSWER_KEY,
            conditionAnswerValue: "yes",
          },
          create: {
            templateAnswerOptionId: option.id,
            canonicalComponentId: doorway.id,
            quantity: 1,
            conditionAccessClass: "FINISHED",
            conditionAccessSlot: "PRIMARY",
            conditionAnswerKey: DOORWAY_ANSWER_KEY,
            conditionAnswerValue: "yes",
          },
        });
      }
      assert.ok(templateOptions.length > 0, "at least one electrical template distance band must be updated");
    }, { timeout: 120000 });

    console.log("  Published: supported finished-wall distances price instantly and one checked doorway adds its measured labor and 12/2 cable allowance.");
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
