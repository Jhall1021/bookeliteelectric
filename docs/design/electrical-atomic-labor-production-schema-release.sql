-- Reviewed production -> atomic-labor candidate schema delta for the
-- Electrical onboarding release. Generated fresh on 2026-09-24 via:
--
--   npx prisma migrate diff \
--     --from-url <verified production direct connection> \
--     --to-schema-datamodel prisma/schema.prisma \
--     --script
--
-- Verified additive-only: one enum, four nullable quote-review columns,
-- two new contractor labor calibration tables, their indexes, and their
-- contractor foreign keys. There are no drops, renames, or narrowed columns.
-- The production release script re-derives this diff from the live target and
-- refuses before writing if any statement differs.
--
-- BEGIN REVIEWED DIFF -- everything below the next blank line is the exact,
-- unmodified output of the migrate diff command above. The release script
-- compares statement blocks order-insensitively before applying this file.

-- CreateEnum
CREATE TYPE "LaborOperationDecisionSource" AS ENUM ('DIRECT', 'APPROVED_PROPOSAL');

-- AlterTable
ALTER TABLE "quotes" ADD COLUMN     "reviewBasisFingerprint" TEXT,
ADD COLUMN     "reviewFactsSnapshot" JSONB,
ADD COLUMN     "reviewSuggestedPriceCents" INTEGER,
ADD COLUMN     "reviewedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "contractor_labor_scenario_answers" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "scenarioKey" TEXT NOT NULL,
    "scenarioHours" DOUBLE PRECISION NOT NULL,
    "scopeVersion" INTEGER NOT NULL DEFAULT 1,
    "answeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_labor_scenario_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contractor_labor_operation_decisions" (
    "id" TEXT NOT NULL,
    "contractorId" TEXT NOT NULL,
    "trade" TEXT NOT NULL,
    "operationKey" TEXT NOT NULL,
    "hoursPerUnit" DOUBLE PRECISION NOT NULL,
    "source" "LaborOperationDecisionSource" NOT NULL,
    "basis" JSONB NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contractor_labor_operation_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contractor_labor_scenario_answers_trade_scenarioKey_idx" ON "contractor_labor_scenario_answers"("trade", "scenarioKey");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_labor_scenario_answers_contractorId_trade_scenar_key" ON "contractor_labor_scenario_answers"("contractorId", "trade", "scenarioKey");

-- CreateIndex
CREATE INDEX "contractor_labor_operation_decisions_trade_operationKey_idx" ON "contractor_labor_operation_decisions"("trade", "operationKey");

-- CreateIndex
CREATE UNIQUE INDEX "contractor_labor_operation_decisions_contractorId_trade_ope_key" ON "contractor_labor_operation_decisions"("contractorId", "trade", "operationKey");

-- AddForeignKey
ALTER TABLE "contractor_labor_scenario_answers" ADD CONSTRAINT "contractor_labor_scenario_answers_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contractor_labor_operation_decisions" ADD CONSTRAINT "contractor_labor_operation_decisions_contractorId_fkey" FOREIGN KEY ("contractorId") REFERENCES "contractors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
