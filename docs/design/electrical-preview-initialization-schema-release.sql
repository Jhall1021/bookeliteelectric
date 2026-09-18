-- Reviewed main -> candidate schema delta for the Electrical catalog
-- release. Generated fresh on 2026-09-18 via:
--
--   npx prisma migrate diff \
--     --from-schema-datamodel <origin/main's prisma/schema.prisma> \
--     --to-schema-datamodel prisma/schema.prisma \
--     --script
--
-- Verified additive-only: 5 new enums, 2 new enum values on
-- TemplatePolicyType, widened-nullable columns on existing tables, and 5
-- new tables (contractor_material_systems, contractor_derived_pricing_
-- approvals, component_labor_evidence, template_adoption_receipts,
-- contractor_capabilities). No drops, no narrowing, no renames. Currently
-- serving production application code is unaffected by applying this —
-- every new column is nullable-or-defaulted and every new table is
-- unreferenced by any code path production currently runs.
--
-- This file is applied by scripts/release-electrical-catalog-to-
-- production.ts BEFORE the services_price_requires_approval constraint
-- install and BEFORE the catalog rebuild — see that script's own preflight
-- (assertSchemaMatchesReviewedDiff), which re-derives this SAME diff
-- against the live target at run time and refuses on any mismatch before
-- this file is ever applied.
--
-- BEGIN REVIEWED DIFF — everything below the next blank line is the
-- exact, unmodified output of the migrate diff command above; the
-- release script slices the file there and compares the remainder,
-- statement-block by statement-block (order-insensitive — a live diff
-- against a database orders blocks differently than a file-to-file
-- diff, proven by rehearsal), against a freshly recomputed live diff.
-- Nothing above this line may be mistaken for part of the reviewed SQL.

-- CreateEnum
CREATE TYPE "RacewayGroundingStrategy" AS ENUM ('SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR', 'SYSTEM_PROVIDES_GROUNDING_PATH');

-- CreateEnum
CREATE TYPE "RacewayTerminationRequirement" AS ENUM ('FITTING_REQUIRED', 'DIRECT_ENTRY');

-- CreateEnum
CREATE TYPE "LaborEvidenceScopeMatch" AS ENUM ('DIRECT', 'PARTIAL', 'SCOPE_DIFFERENT', 'SCOPE_BLOCKED');

-- CreateEnum
CREATE TYPE "ReferenceLaborStatus" AS ENUM ('VERIFIED', 'PARTIAL', 'DISPUTED', 'NONE');

-- CreateEnum
CREATE TYPE "ServicePricingMethod" AS ENUM ('LEGACY_PUBLISHED', 'DERIVED_RESOLVED_SCOPE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TemplatePolicyType" ADD VALUE 'MEASUREMENT';
ALTER TYPE "TemplatePolicyType" ADD VALUE 'MATERIAL_SPECIFICATION';

-- AlterTable
ALTER TABLE "canonical_materials" ADD COLUMN     "displayCategory" TEXT;

-- AlterTable
ALTER TABLE "service_materials" ADD COLUMN     "quantityIsPolicy" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "quantity" DROP NOT NULL,
ALTER COLUMN "quantity" DROP DEFAULT;

-- AlterTable
ALTER TABLE "canonical_components" ADD COLUMN     "referenceLaborHours" DOUBLE PRECISION,
ADD COLUMN     "referenceLaborStatus" "ReferenceLaborStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "referenceLaborUnit" TEXT;

-- AlterTable
ALTER TABLE "contractor_components" ALTER COLUMN "addFieldLaborHours" DROP NOT NULL,
ALTER COLUMN "addFieldLaborHours" DROP DEFAULT;

-- AlterTable
ALTER TABLE "answer_option_components" ADD COLUMN     "quantityAnswerKey" TEXT;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "pricingMethod" "ServicePricingMethod" NOT NULL DEFAULT 'LEGACY_PUBLISHED',
ADD COLUMN     "unresolvedDisclaimerKeys" TEXT[];

-- AlterTable
ALTER TABLE "questions" ADD COLUMN     "numberAllowsDecimal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numberMax" INTEGER,
ADD COLUMN     "numberMin" INTEGER;

-- AlterTable
ALTER TABLE "answer_options" ADD COLUMN     "numberAtLeast" INTEGER,
ADD COLUMN     "numberAtLeastExclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numberAtMost" INTEGER,
ADD COLUMN     "requiresCapabilityKey" TEXT;

-- AlterTable
ALTER TABLE "guided_flow_sessions" ADD COLUMN     "activeSessionKey" TEXT;

-- AlterTable
ALTER TABLE "line_items" ADD COLUMN     "resolvedEconomicBasis" TEXT,
ADD COLUMN     "resolvedMaterialCostCents" INTEGER;

-- AlterTable
ALTER TABLE "pricing_settings" ALTER COLUMN "crewHourRateCents" DROP NOT NULL,
ALTER COLUMN "primaryMinimumCents" DROP NOT NULL,
ALTER COLUMN "roundingIncrementCents" DROP NOT NULL,
ALTER COLUMN "defaultPermitAdminCents" DROP NOT NULL;

-- AlterTable
ALTER TABLE "template_policy_definitions" ADD COLUMN     "choices" TEXT[];

-- AlterTable
ALTER TABLE "contractor_policy_values" ADD COLUMN     "measurement" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "template_services" ADD COLUMN     "pricingMethod" "ServicePricingMethod" NOT NULL DEFAULT 'LEGACY_PUBLISHED';

-- AlterTable
ALTER TABLE "template_questions" ADD COLUMN     "numberAllowsDecimal" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numberMax" INTEGER,
ADD COLUMN     "numberMin" INTEGER;

-- AlterTable
ALTER TABLE "template_answer_options" ADD COLUMN     "accessClassification" "AccessClassification",
ADD COLUMN     "accessSlot" TEXT NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN     "numberAtLeast" INTEGER,
ADD COLUMN     "numberAtLeastExclusive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "numberAtMost" INTEGER,
ADD COLUMN     "requiresCapabilityKey" TEXT;

-- AlterTable
ALTER TABLE "template_answer_option_components" ADD COLUMN     "conditionAccessClass" "AccessClassification",
ADD COLUMN     "conditionAccessSlot" TEXT NOT NULL DEFAULT 'PRIMARY',
ADD COLUMN     "quantityAnswerKey" TEXT;

-- CreateTable
CREATE TABLE "contractor_material_systems" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "systemKey" TEXT NOT NULL,
    "declaredSystemLabel" TEXT,
    "groundingStrategy" "RacewayGroundingStrategy",
    "supportSpacingFt" DOUBLE PRECISION,
    "supportAtEachTerminus" BOOLEAN,
    "sourceTermination" "RacewayTerminationRequirement",
    "sourceTerminationMaterialId" TEXT,
    "destinationTermination" "RacewayTerminationRequirement",
    "destinationTerminationMaterialId" TEXT,
    "declaredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_material_systems_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_derived_pricing_approvals" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "approvedBasisFingerprint" TEXT NOT NULL,
    "approvedTotalCents" INTEGER NOT NULL,
    "approvedLaborCents" INTEGER NOT NULL,
    "approvedMaterialCents" INTEGER NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL,
    "approvedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_derived_pricing_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "component_labor_evidence" (
    "id" TEXT NOT NULL,
    "canonicalComponentId" TEXT NOT NULL,
    "observationId" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "edition" TEXT NOT NULL,
    "sourceRef" TEXT,
    "url" TEXT,
    "publishedLineItem" TEXT NOT NULL,
    "publishedValue" TEXT NOT NULL,
    "originalUnit" TEXT NOT NULL,
    "crewConvention" TEXT,
    "difficulty" TEXT,
    "normalizedLabor" DOUBLE PRECISION NOT NULL,
    "normalizedUnit" TEXT NOT NULL,
    "materialSystem" TEXT,
    "sizeApplicability" TEXT,
    "scopeMatch" "LaborEvidenceScopeMatch" NOT NULL,
    "confidence" TEXT NOT NULL,
    "caution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "component_labor_evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "template_adoption_receipts" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "unitKind" TEXT NOT NULL,
    "unitKey" TEXT NOT NULL,
    "acceptedProjection" JSONB NOT NULL,
    "sourceTemplateVersionId" TEXT NOT NULL,
    "priorReceiptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "template_adoption_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_capabilities" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "declaredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_capabilities_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractor_material_systems_contractorId_idx" ON "contractor_material_systems"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_material_systems_contractorId_systemKey_key" ON "contractor_material_systems"("contractorId", "systemKey");

-- CreateIndex
CREATE INDEX "contractor_derived_pricing_approvals_serviceId_idx" ON "contractor_derived_pricing_approvals"("serviceId");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_derived_pricing_approvals_contractorId_serviceId_key" ON "contractor_derived_pricing_approvals"("contractorId", "serviceId");

-- CreateIndex
CREATE INDEX "component_labor_evidence_canonicalComponentId_idx" ON "component_labor_evidence"("canonicalComponentId");

-- CreateIndex
CREATE UNIQUE INDEX "component_labor_evidence_canonicalComponentId_observationId_key" ON "component_labor_evidence"("canonicalComponentId", "observationId");

-- CreateIndex
CREATE UNIQUE INDEX "template_adoption_receipts_priorReceiptId_key" ON "template_adoption_receipts"("priorReceiptId");

-- CreateIndex
CREATE INDEX "template_adoption_receipts_serviceId_unitKind_unitKey_creat_idx" ON "template_adoption_receipts"("serviceId", "unitKind", "unitKey", "createdAt");

-- CreateIndex
CREATE INDEX "contractor_capabilities_contractorId_idx" ON "contractor_capabilities"("contractorId");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_capabilities_contractorId_key_key" ON "contractor_capabilities"("contractorId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "guided_flow_sessions_activeSessionKey_key" ON "guided_flow_sessions"("activeSessionKey");

-- AddForeignKey
ALTER TABLE "contractor_material_systems" ADD CONSTRAINT "contractor_material_systems_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_material_systems" ADD CONSTRAINT "contractor_material_systems_sourceTerminationMaterialId_fkey" FOREIGN KEY ("sourceTerminationMaterialId") REFERENCES "canonical_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_material_systems" ADD CONSTRAINT "contractor_material_systems_destinationTerminationMaterial_fkey" FOREIGN KEY ("destinationTerminationMaterialId") REFERENCES "canonical_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_derived_pricing_approvals" ADD CONSTRAINT "contractor_derived_pricing_approvals_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_derived_pricing_approvals" ADD CONSTRAINT "contractor_derived_pricing_approvals_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "component_labor_evidence" ADD CONSTRAINT "component_labor_evidence_canonicalComponentId_fkey" FOREIGN KEY ("canonicalComponentId") REFERENCES "canonical_components"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_adoption_receipts" ADD CONSTRAINT "template_adoption_receipts_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "services"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_adoption_receipts" ADD CONSTRAINT "template_adoption_receipts_sourceTemplateVersionId_fkey" FOREIGN KEY ("sourceTemplateVersionId") REFERENCES "template_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "template_adoption_receipts" ADD CONSTRAINT "template_adoption_receipts_priorReceiptId_fkey" FOREIGN KEY ("priorReceiptId") REFERENCES "template_adoption_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_capabilities" ADD CONSTRAINT "contractor_capabilities_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
