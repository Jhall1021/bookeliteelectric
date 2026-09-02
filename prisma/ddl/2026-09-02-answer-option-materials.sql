-- Create the two branch-material tables in a database that already carries
-- in-flight columns `main` does not have.
--
--   npx prisma db execute --file prisma/ddl/2026-09-02-answer-option-materials.sql \
--     --schema prisma/schema.prisma
--
-- WHY THIS FILE EXISTS INSTEAD OF `prisma db push`
--
-- The shared database holds G1 and G2 work that is not on main. A push from
-- main compares the DB against main's schema and proposes removing anything it
-- cannot see — FOUR columns, not two:
--
--   answer_option_components.conditionAccessSlot   (G1)
--   answer_options.accessSlot                      (G1)
--   canonical_disclaimers.accessSlot               (G1)
--   services.tradeKey                              (G2)
--
-- None of those is main's to drop. So this is the CREATE half of that diff,
-- taken verbatim from `prisma migrate diff --script` and with every destructive
-- statement removed by hand.
--
-- REVIEWED: 9 statements — 2 CREATE TABLE, 3 CREATE INDEX, 4 ADD CONSTRAINT.
-- Zero DROP, zero TRUNCATE, zero DELETE FROM. The four `ON DELETE` clauses
-- below are foreign-key referential actions on the NEW tables, not deletions.
--
-- Additive and idempotent-by-failure: re-running it errors on the existing
-- table rather than altering anything.
--
-- Verify afterwards that all four columns above still exist, and that
-- `prisma migrate diff` proposes nothing further for these two tables.
--
-- Generated from prisma/schema.prisma at 06e41a5 lineage; d7d7573 introduced
-- the models.

-- CreateTable
CREATE TABLE "template_answer_option_materials" (
    "id" TEXT NOT NULL,
    "templateAnswerOptionId" TEXT NOT NULL,
    "canonicalMaterialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "template_answer_option_materials_pkey" PRIMARY KEY ("id")
);
-- CreateTable
CREATE TABLE "answer_option_materials" (
    "id" TEXT NOT NULL,
    "answerOptionId" TEXT NOT NULL,
    "canonicalMaterialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "order" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "answer_option_materials_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE UNIQUE INDEX "template_answer_option_materials_templateAnswerOptionId_can_key" ON "template_answer_option_materials"("templateAnswerOptionId", "canonicalMaterialId");
-- CreateIndex
CREATE INDEX "answer_option_materials_canonicalMaterialId_idx" ON "answer_option_materials"("canonicalMaterialId");
-- CreateIndex
CREATE UNIQUE INDEX "answer_option_materials_answerOptionId_canonicalMaterialId_key" ON "answer_option_materials"("answerOptionId", "canonicalMaterialId");
-- AddForeignKey
ALTER TABLE "template_answer_option_materials" ADD CONSTRAINT "template_answer_option_materials_templateAnswerOptionId_fkey" FOREIGN KEY ("templateAnswerOptionId") REFERENCES "template_answer_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "template_answer_option_materials" ADD CONSTRAINT "template_answer_option_materials_canonicalMaterialId_fkey" FOREIGN KEY ("canonicalMaterialId") REFERENCES "canonical_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "answer_option_materials" ADD CONSTRAINT "answer_option_materials_answerOptionId_fkey" FOREIGN KEY ("answerOptionId") REFERENCES "answer_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- AddForeignKey
ALTER TABLE "answer_option_materials" ADD CONSTRAINT "answer_option_materials_canonicalMaterialId_fkey" FOREIGN KEY ("canonicalMaterialId") REFERENCES "canonical_materials"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
