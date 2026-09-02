/**
 * A valid identifier belonging to somebody else is still not a key.
 *
 *   npx tsx scripts/verify-cross-tenant-resource-access.ts
 *   npx tsx scripts/verify-cross-tenant-resource-access.ts \
 *     --attacker=brightpath-electric --victim=elite-electric
 *
 * THE INVARIANT
 *
 *   Contractor A can never read, mutate, price, schedule, pay against or
 *   administer Contractor B's data, even when A supplies a valid identifier
 *   belonging to B.
 *
 * Every route in this application takes ids from the URL or the body:
 * serviceId, bookingId, visitId, customerId, quoteId, crewMemberId. Those ids
 * are real, they are guessable, and one of them turning up in the wrong
 * request is the whole risk.
 *
 * WHY REAL IDS AND NOT INVENTED ONES
 *
 * A test that probes with a made-up id proves the database has no such row.
 * It proves nothing about isolation, because the row it is looking for does
 * not exist for anyone. These probes use Elite's ACTUAL primary keys, read
 * beforehand, and then try to reach them from another contractor's context —
 * which is precisely what a hostile or careless caller would do.
 *
 * WHY THE ATTACKER CAN BE A REAL CONTRACTOR
 *
 * The default probe attacks from a throwaway contractor created for the run.
 * That tenant is INACTIVE and owns nothing, so a guard could pass here by
 * short-circuiting on either fact and still leak between two live tenants.
 * `--attacker` and `--victim` point the same probes at real, persistent
 * contractors, in either direction, where neither shortcut is available.
 *
 * Read AND write, because a guard that hides a row from a read but lets an
 * update through has not isolated anything.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant, asPlatform } from "../lib/tenantContext";
import { findOpenVisit } from "../lib/openVisit";

const raw = new PrismaClient();
const guarded = withTenantGuard(new PrismaClient()) as unknown as PrismaClient;

/**
 * RUN-UNIQUE, because the worktree and the database are shared. A fixed slug
 * races whenever two runs overlap — a Vercel build (npm run verify runs
 * inside next build) and a local run, or two workstreams — because the
 * cleanup below deletes by slug and would take out the other run's live
 * probe. Same shape as verify-activation-dependencies, deliberately.
 *
 * The prefix stays fixed so a probe from a crashed run is still sweepable.
 */
const DUMMY_PREFIX = "test-cross-tenant-probe";
const DUMMY_SLUG = `${DUMMY_PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;

/** Old enough that no run could still be using it. */
const STALE_AFTER_MS = 60 * 60 * 1000;
const arg = (k: string) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split("=")[1];
const VICTIM = arg("victim") ?? "elite-electric";
const ATTACKER = arg("attacker") ?? null; // null => throwaway
let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };

/** A read that returns another tenant's row, or a write that lands, is a leak. */
async function refuses(what: string, run: () => Promise<unknown>): Promise<boolean> {
  try {
    const r = await run();
    // findUnique/findFirst returning null is a correct refusal. Anything else
    // means the row came back, or the write was accepted.
    if (r === null) return true;
    if (typeof r === "object" && r !== null && "count" in (r as Record<string, unknown>)) {
      return (r as { count: number }).count === 0;
    }
    console.log(`        ${what} RETURNED: ${JSON.stringify(r).slice(0, 120)}`);
    return false;
  } catch {
    return true; // threw — refused loudly, which is also correct
  }
}

async function main() {
  const victim = await raw.contractor.findFirstOrThrow({
    where: { slug: VICTIM }, select: { id: true, name: true },
  });
  console.log(`\nCROSS-TENANT RESOURCE ACCESS — ${ATTACKER ?? "a throwaway contractor"} ` +
    `against ${victim.name}'s real ids\n`);

  // The victim's real primary keys, read outside any tenant context.
  const ids = await asPlatform(async () => ({
    service: (await raw.service.findFirst({ where: { contractorId: victim.id } }))?.id,
    visit: (await raw.visit.findFirst({ where: { contractorId: victim.id } }))?.id,
    booking: (await raw.booking.findFirst({ where: { visit: { contractorId: victim.id } } }))?.id,
    customer: (await raw.customer.findFirst({ where: { contractorId: victim.id } }))?.id,
    quote: (await raw.quote.findFirst({ where: { visit: { contractorId: victim.id } } }))?.id,
    crew: (await raw.jobberCrewMember.findFirst({ where: { contractorId: victim.id } }))?.id,
    area: (await raw.serviceArea.findFirst({ where: { contractorId: victim.id } }))?.id,
    hours: (await raw.businessHours.findFirst({ where: { contractorId: victim.id } }))?.id,
    settings: (await raw.pricingSettings.findFirst({ where: { contractorId: victim.id } }))?.id,
    site: (await raw.contractorSite.findFirst({ where: { contractorId: victim.id } }))?.id,
    material: (await raw.contractorMaterial.findFirst({ where: { contractorId: victim.id } }))?.id,
    question: (await raw.question.findFirst({ where: { service: { contractorId: victim.id } } }))?.id,
    payment: (await raw.paymentEvent.findFirst({ where: { booking: { visit: { contractorId: victim.id } } } }))?.id,
  }));

  // A real, live session id from one of Elite's open visits.
  const victimSession = await asPlatform(async () =>
    (await raw.visit.findFirst({
      where: { contractorId: victim.id, status: "OPEN", sessionId: { not: null } },
      select: { sessionId: true },
    }))?.sessionId ?? null
  );

  const missing = Object.entries(ids).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.log(`  (no ${victim.name} row to probe with for: ${missing.join(", ")})\n`);

  // A real attacker is used as it stands and is NEVER cleaned up; only the
  // throwaway this run creates is torn down.
  const attacker = ATTACKER
    ? await raw.contractor.findFirstOrThrow({ where: { slug: ATTACKER }, select: { id: true } })
    : await (async () => {
        // Only genuinely abandoned siblings. Deleting every one of them
        // would take out a CONCURRENT run's live probe — the collision the
        // run-unique slug exists to prevent, reintroduced by the cleanup.
        const stale = await raw.contractor.deleteMany({
          where: {
            slug: { startsWith: DUMMY_PREFIX },
            NOT: { slug: DUMMY_SLUG },
            createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) },
          },
        });
        if (stale.count) console.log(`  (swept ${stale.count} abandoned probe(s))`);
        return raw.contractor.create({
          data: { slug: DUMMY_SLUG, name: "Cross-tenant probe", active: false },
          select: { id: true },
        });
      })();
  if (attacker.id === victim.id) throw new Error("attacker and victim are the same contractor");

  try {
    await withTenant({ contractorId: attacker.id, source: "test" }, async () => {
      const g = guarded as unknown as Record<string, {
        findUnique(a: unknown): Promise<unknown>;
        findFirst(a: unknown): Promise<unknown>;
        updateMany(a: unknown): Promise<unknown>;
      }>;

      // Every identifier a route accepts, tried as the wrong contractor.
      const cases: { label: string; model: string; id?: string }[] = [
        { label: "serviceId",     model: "service",            id: ids.service },
        { label: "visitId",       model: "visit",              id: ids.visit },
        { label: "bookingId",     model: "booking",            id: ids.booking },
        { label: "customerId",    model: "customer",           id: ids.customer },
        { label: "quoteId",       model: "quote",              id: ids.quote },
        { label: "crewMemberId",  model: "jobberCrewMember",   id: ids.crew },
        { label: "serviceAreaId", model: "serviceArea",        id: ids.area },
        { label: "businessHoursId", model: "businessHours",    id: ids.hours },
        { label: "pricingSettingsId", model: "pricingSettings", id: ids.settings },
        { label: "materialId",    model: "contractorMaterial", id: ids.material },
        { label: "questionId",    model: "question",           id: ids.question },
        { label: "paymentEventId", model: "paymentEvent",      id: ids.payment },
      ];

      for (const c of cases) {
        if (!c.id) continue;
        const readUnique = await refuses(`${c.model}.findUnique`, () =>
          g[c.model].findUnique({ where: { id: c.id } }));
        const readFirst = await refuses(`${c.model}.findFirst`, () =>
          g[c.model].findFirst({ where: { id: c.id } }));
        ok(`${c.label.padEnd(20)} the other contractor's real row is unreachable by id`,
          readUnique && readFirst, `unique=${readUnique} first=${readFirst}`);
      }

      // ONE MEANINGFUL WRITE, rolled back.
      //
      // An empty `data: {}` update reports zero rows changed whether it was
      // refused or simply had nothing to change, so it proves nothing — this
      // suite briefly used one and it passed everywhere for the wrong reason.
      // The write mechanism is covered thoroughly by
      // verify-tenant-isolation-live; this is the one probe that shows reads
      // and writes agree on the same id, inside a transaction that always
      // rolls back so a guard failure cannot damage the victim's catalog.
      if (ids.service) {
        let landed = false;
        try {
          await guarded.$transaction(async (tx) => {
            const r = await (tx as unknown as { service: { updateMany(a: unknown): Promise<{ count: number }> } })
              .service.updateMany({ where: { id: ids.service }, data: { sortOrder: 999 } });
            landed = r.count > 0;
            throw new Error("ROLLBACK");
          });
        } catch (e) {
          if (!(e instanceof Error) || e.message !== "ROLLBACK") landed = false;
        }
        ok(`a real UPDATE against the other contractor's service changes nothing`, !landed);
      }

      // Counting is a read too: a count that sees another tenant's rows leaks
      // how much work they have, which is commercially real even without ids.
      //
      // A real attacker owns rows of its own, so the assertion is not "sees
      // nothing" but "sees exactly its own" — the throwaway's own count is
      // zero, which keeps the original meaning without a second code path.
      const svcCount = await guarded.service.count();
      const [ownCount, victimCount] = await asPlatform(async () => [
        await raw.service.count({ where: { contractorId: attacker.id } }),
        await raw.service.count({ where: { contractorId: victim.id } }),
      ]);
      ok(`counts include only the caller's own rows`,
        svcCount === ownCount && victimCount > 0,
        `saw ${svcCount}, owns ${ownCount}, victim has ${victimCount}`);

      // ContractorSite is READABLE across tenants, deliberately: reading it is
      // what establishes tenant context, so requiring context to read it would
      // be circular. That is only defensible while it stays routing data, so
      // the classification is checked rather than assumed.
      // A BROWSER SESSION IS NOT A TENANT (ADR-011).
      //
      // The session cookie is one cookie with no contractor dimension, so the
      // same visitor carries it onto every storefront. Resolving a visit from
      // the session alone would hand contractor A's cart to contractor B —
      // which is why the lookup takes the contractor first and the session
      // second. Proved with a REAL session id belonging to the victim.
      if (victimSession) {
        const stolen = await findOpenVisit(guarded, attacker.id, victimSession);
        ok(`a real booking session from another storefront resolves to nothing`,
          stolen === null, stolen ? "returned a visit" : "");
      }

      const site = await guarded.contractorSite.findFirst({ where: { id: ids.site } });
      const guardSrc = readFileSync("lib/tenantGuard.ts", "utf8");
      ok(`ContractorSite is cross-tenant readable BY DESIGN, and says why`,
        site !== null && /PLATFORM BY NECESSITY[\s\S]{0,900}"ContractorSite"/.test(guardSrc));
      ok(`   and carries only routing data — no economics, no customer`,
        site !== null &&
        !Object.keys(site as Record<string, unknown>).some((k) =>
          /price|cost|deposit|customer|email|phone|address/i.test(k)),
        site ? Object.keys(site as Record<string, unknown>).join(",") : "");
    });
  } finally {
    if (!ATTACKER) await raw.contractor.deleteMany({ where: { slug: DUMMY_SLUG } });
  }

  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  A real id from another contractor opens nothing.\n`);
  await raw.$disconnect();
  await (guarded as unknown as PrismaClient).$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => { console.error(e); await raw.contractor.deleteMany({ where: { slug: DUMMY_SLUG } }).catch(() => {}); process.exit(1); });
