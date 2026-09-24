-- Reviewed production -> two-crew-rate / prepared-baseline candidate schema
-- delta for the Electrical onboarding release. Generated fresh on 2026-09-24 via:
--
--   npx prisma migrate diff \
--     --from-url <verified production direct connection> \
--     --to-schema-datamodel prisma/schema.prisma \
--     --script
--
-- Verified additive-only: one enum, one enum value, three nullable pricing
-- settings columns, six nullable audit columns, and one defaulted crew-type
-- column on services and template services. There are no drops, renames, or
-- narrowed columns.
-- The production release script re-derives this diff from the live target and
-- refuses before writing if any statement differs.
--
-- BEGIN REVIEWED DIFF -- everything below the next blank line is the exact,
-- unmodified output of the migrate diff command above. The release script
-- compares statement blocks order-insensitively before applying this file.

-- CreateEnum
CREATE TYPE "LaborCrewType" AS ENUM ('ELECTRICIAN', 'ELECTRICIAN_AND_HELPER');

-- AlterEnum
ALTER TYPE "LaborOperationDecisionSource" ADD VALUE 'PLATFORM_BASELINE';

-- AlterTable
ALTER TABLE "pricing_settings" ADD COLUMN     "electricianHourRateCents" INTEGER,
ADD COLUMN     "fixtureHeight12Percent" INTEGER,
ADD COLUMN     "fixtureHeight14Percent" INTEGER;

-- AlterTable
ALTER TABLE "pricing_settings_changes" ADD COLUMN     "fromElectricianHourRateCents" INTEGER,
ADD COLUMN     "fromFixtureHeight12Percent" INTEGER,
ADD COLUMN     "fromFixtureHeight14Percent" INTEGER,
ADD COLUMN     "toElectricianHourRateCents" INTEGER,
ADD COLUMN     "toFixtureHeight12Percent" INTEGER,
ADD COLUMN     "toFixtureHeight14Percent" INTEGER;

-- AlterTable
ALTER TABLE "services" ADD COLUMN     "laborCrewType" "LaborCrewType" NOT NULL DEFAULT 'ELECTRICIAN_AND_HELPER';

-- AlterTable
ALTER TABLE "template_services" ADD COLUMN     "laborCrewType" "LaborCrewType" NOT NULL DEFAULT 'ELECTRICIAN_AND_HELPER';
