/**
 * Put BrightPath back to where the UI has to do the work.
 *
 *   npx tsx scripts/reset-contractor-two-for-ui.ts --commit
 *
 * The self-service proof is only worth anything if the values under test were
 * never written by a script. This undoes exactly the six the contractor is
 * supposed to enter themselves — labor hours, policy decisions, native
 * capacity, service selection, price approval and launch — and leaves
 * everything earlier alone, because those steps were already proved and
 * re-doing them proves nothing twice.
 *
 * Kept: business profile, storefront, trade enrolment, the installed catalog,
 * contractor economics, material costs, business hours, service area, and the
 * four real bookings a homeowner already made.
 */
import { PrismaClient } from "@prisma/client";

const raw = new PrismaClient();
const SLUG = "brightpath-electric";
const COMMIT = process.argv.includes("--commit");

async function main() {
  const c = await raw.contractor.findFirstOrThrow({
    where: { slug: SLUG }, select: { id: true, name: true },
  });
  console.log(`\nRESET FOR UI PROOF — ${c.name}`);
  console.log(COMMIT ? "  COMMITTING\n" : "  DRY RUN\n");

  // Which policy each band option belongs to, matched the way provisioning
  // derived it: the template option's own policy definition, found through the
  // pattern the contractor's copy still carries.
  const patternToKey = new Map<string, string>();
  const rows: { labelPattern: string; key: string }[] = await raw.$queryRawUnsafe(
    `select o."labelPattern", d.key
     from template_answer_options o
     join template_policy_definitions d on d.id = o."templatePolicyDefinitionId"
     where o."labelPattern" is not null`
  );
  for (const r of rows) patternToKey.set(r.labelPattern, r.key);
  console.log(`  ${patternToKey.size} band pattern(s) map to a policy`);

  // Policies that arrive WITHOUT a question. Who supplies a bathroom fan is
  // not something a homeowner is asked, so it has no band pattern to find it
  // by — it is linked to the service directly, and a reset derived only from
  // patterns would quietly drop it.
  const directRows: { slug: string; key: string }[] = await raw.$queryRawUnsafe(
    `select ts.slug, d.key
     from template_service_policies sp
     join template_services ts on ts.id = sp."templateServiceId"
     join template_policy_definitions d on d.id = sp."templatePolicyDefinitionId"`
  );
  const directBySlug = new Map<string, string[]>();
  for (const r of directRows) {
    directBySlug.set(r.slug, [...(directBySlug.get(r.slug) ?? []), r.key]);
  }
  console.log(`  ${directRows.length} service-level polic(y/ies) with no question behind them`);

  const services = await raw.service.findMany({
    where: { contractorId: c.id },
    select: {
      id: true, slug: true, offered: true, active: true,
      questions: { select: { options: { select: { id: true, labelPattern: true } } } },
    },
  });

  let relabeled = 0;
  const perService = new Map<string, string[]>();
  for (const s of services) {
    const keys = new Set<string>(directBySlug.get(s.slug) ?? []);
    for (const q of s.questions) {
      for (const o of q.options) {
        if (!o.labelPattern) continue;
        const key = patternToKey.get(o.labelPattern);
        if (key) keys.add(key);
        if (COMMIT) {
          // The hole comes back with the decision: a label is only concrete
          // because a policy was answered, so un-answering has to un-render.
          await raw.answerOption.update({
            where: { id: o.id }, data: { label: o.labelPattern },
          });
        }
        relabeled++;
      }
    }
    perService.set(s.id, [...keys].sort());
  }
  console.log(`  ${relabeled} band label(s) returned to their pattern`);

  if (COMMIT) {
    for (const [id, keys] of perService) {
      await raw.service.update({ where: { id }, data: { unresolvedPolicyKeys: keys } });
    }
    await raw.contractorPolicyValue.updateMany({
      where: { contractorId: c.id },
      data: { boundaries: [], choice: null, resolvedAt: null },
    });
    await raw.service.updateMany({
      where: { contractorId: c.id },
      data: {
        fieldLaborHours: null, wwtLaborHours: null,
        offered: false, active: false,
        basePrice: null, whileWeThereBasePrice: null, publishedPriceApprovedAt: null,
      },
    });
    await raw.contractor.update({
      where: { id: c.id }, data: { nativeConcurrentJobs: null },
    });
  }

  const waiting = [...perService.values()].filter((k) => k.length > 0).length;
  console.log(`  ${waiting} service(s) wait on at least one policy`);
  console.log(`  policies unresolved, labor hours cleared, nothing offered, nothing live, no capacity`);

  if (!COMMIT) { console.log(`\n  Nothing was changed.\n`); await raw.$disconnect(); return; }

  const after = await raw.contractor.findUniqueOrThrow({
    where: { id: c.id }, select: { nativeConcurrentJobs: true },
  });
  const live = await raw.service.count({ where: { contractorId: c.id, active: true } });
  const offered = await raw.service.count({ where: { contractorId: c.id, offered: true } });
  const priced = await raw.service.count({ where: { contractorId: c.id, publishedPriceApprovedAt: { not: null } } });
  const decided = await raw.contractorPolicyValue.count({ where: { contractorId: c.id, resolvedAt: { not: null } } });
  const holes = await raw.answerOption.count({
    where: { label: { contains: "{b" }, question: { service: { contractorId: c.id } } },
  });
  console.log(`\n  capacity=${after.nativeConcurrentJobs ?? "unset"}  offered=${offered}  live=${live}  priced=${priced}  policiesDecided=${decided}  holeyLabels=${holes}`);
  console.log(`\n  Ready for a contractor to do it themselves.\n`);
  await raw.$disconnect();
}

main().catch(async (e) => { console.error(e); await raw.$disconnect(); process.exit(1); });
