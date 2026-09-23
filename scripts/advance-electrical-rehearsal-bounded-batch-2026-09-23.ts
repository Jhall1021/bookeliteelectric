/**
 * Select the next bounded Electrical rehearsal batch, or activate the subset
 * whose complete storefront dependency/disclaimer checks also pass. Every
 * selected service has a complete atomic labor projection, resolved material
 * cost and no unresolved contractor route policy. Services with downstream
 * activation dependencies or contractor-authored disclosures remain selected
 * but inactive until those separate gates are resolved.
 *
 * Selection and activation stay separate so the normal duration and price
 * approval authorities run between them.
 *
 *   npx tsx scripts/advance-electrical-rehearsal-bounded-batch-2026-09-23.ts --select [--apply]
 *   npx tsx scripts/advance-electrical-rehearsal-bounded-batch-2026-09-23.ts --activate [--apply]
 *   npx tsx scripts/advance-electrical-rehearsal-bounded-batch-2026-09-23.ts --activate-panel-pair [--apply]
 *   npx tsx scripts/advance-electrical-rehearsal-bounded-batch-2026-09-23.ts --activate-garage-group [--apply]
 */
import { Prisma, PrismaClient } from "@prisma/client";
import { activateService, activationRefusal } from "../lib/serviceActivation";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const EXPECTED_REHEARSAL_ENDPOINT = "ep-wispy-union-ayxh5fr5";
const EXPECTED_PRODUCTION_MARKER_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const EXPECTED_CONTRACTOR = "rv2-pilot-rehearsal-manual-0922";
const APPROVAL_SERVICES = [
  "200a-service-upgrade",
  "electrical-panel-replacement",
  "exterior-gfci-other-routing",
  "exterior-gfci-standard",
  "fan-replacing-light",
  "generator-inlet-interlock",
  "new-ceiling-fan",
  "new-ceiling-light",
  "new-coax-line",
  "new-ethernet-line",
  "new-exterior-flood-camera",
  "new-wall-sconce",
  "recessed-lighting",
  "replace-bathroom-exhaust-fan",
  "replace-bathroom-exhaust-fan-with-light",
  "replace-range-hood",
  "replace-wall-sconce",
  "soundbar-installation",
  "under-cabinet-led-lighting",
] as const;
const ACTIVATION_SERVICES = [
  "exterior-gfci-other-routing",
  "exterior-gfci-standard",
  "fan-replacing-light",
  "generator-inlet-interlock",
  "new-ceiling-fan",
  "new-ceiling-light",
  "new-coax-line",
  "new-ethernet-line",
  "new-exterior-flood-camera",
  "new-wall-sconce",
  "recessed-lighting",
  "replace-bathroom-exhaust-fan",
  "replace-bathroom-exhaust-fan-with-light",
  "replace-range-hood",
  "replace-wall-sconce",
  "soundbar-installation",
  "under-cabinet-led-lighting",
] as const;
const GARAGE_SERVICES = [
  "240v-garage-outlet",
  "240v-garage-outlet-14-30",
  "240v-garage-outlet-14-50",
  "240v-garage-outlet-6-50",
] as const;

async function main() {
  const select = process.argv.includes("--select");
  const activate = process.argv.includes("--activate");
  const activatePanelPair = process.argv.includes("--activate-panel-pair");
  const activateGarageGroup = process.argv.includes("--activate-garage-group");
  const apply = process.argv.includes("--apply");
  if ([select, activate, activatePanelPair, activateGarageGroup].filter(Boolean).length !== 1) {
    throw new Error("choose exactly one of --select, --activate, --activate-panel-pair or --activate-garage-group");
  }
  const targetUrl = process.env.REHEARSAL_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!targetUrl) throw new Error("REHEARSAL_DATABASE_URL or DATABASE_URL is required");
  const identity = await probe(targetUrl);
  if (identity.endpoint !== EXPECTED_REHEARSAL_ENDPOINT
      || identity.lineage !== PRODUCTION_LINEAGE
      || identity.markerEndpoint !== EXPECTED_PRODUCTION_MARKER_ENDPOINT) {
    throw new Error(`refusing target ${identity.endpoint}: endpoint/lineage/marker did not match the designated rehearsal branch`);
  }

  const db = new PrismaClient({ datasources: { db: { url: targetUrl } } });
  try {
    const contractor = await db.contractor.findUnique({
      where: { slug: EXPECTED_CONTRACTOR },
      select: { id: true },
    });
    if (!contractor) throw new Error(`${EXPECTED_CONTRACTOR} does not exist`);
    const serviceSlugs = activateGarageGroup
      ? GARAGE_SERVICES
      : activatePanelPair
      ? ["200a-service-upgrade", "electrical-panel-replacement"]
      : select ? APPROVAL_SERVICES : ACTIVATION_SERVICES;
    const services = await db.service.findMany({
      where: { contractorId: contractor.id, slug: { in: [...serviceSlugs] } },
      select: { id: true, slug: true, offered: true, active: true },
      orderBy: { slug: "asc" },
    });
    if (services.length !== serviceSlugs.length) {
      const found = new Set(services.map((service) => service.slug));
      throw new Error(`missing batch services: ${serviceSlugs.filter((slug) => !found.has(slug)).join(", ")}`);
    }

    const mode = select ? "SELECT" : activatePanelPair ? "ACTIVATE PANEL PAIR" : activateGarageGroup ? "ACTIVATE GARAGE GROUP" : "ACTIVATE";
    console.log(`\nBOUNDED ELECTRICAL REHEARSAL BATCH — ${mode} ${apply ? "APPLY" : "REPORT"}`);
    console.log(`  target: ${identity.endpoint}`);
    console.log(`  contractor: ${EXPECTED_CONTRACTOR}\n`);

    if (select) {
      const pending = services.filter((service) => !service.offered);
      for (const service of services) console.log(`  ${service.slug}: offered=${service.offered}, active=${service.active}`);
      if (!apply) {
        console.log(`\n  would select ${pending.length} service(s); no duration, price or activation is implied\n`);
        return;
      }
      if (pending.length) {
        await db.service.updateMany({
          where: { contractorId: contractor.id, id: { in: pending.map((service) => service.id) } },
          data: { offered: true },
        });
      }
      console.log(`\n  selected ${pending.length} service(s); duration, price and activation remain unchanged\n`);
      return;
    }

    if (activatePanelPair) {
      const bySlug = new Map(services.map((service) => [service.slug, service]));
      const upgrade = bySlug.get("200a-service-upgrade")!;
      const panel = bySlug.get("electrical-panel-replacement")!;
      const refusals = new Map<string, Awaited<ReturnType<typeof activationRefusal>>>();
      for (const service of [upgrade, panel]) {
        const refusal = await activationRefusal(db, contractor.id, service.id);
        refusals.set(service.slug, refusal);
        console.log(`  ${service.slug}: ${service.active ? "already active" : refusal ? `refused ${refusal.code}` : "ready"}`);
      }
      if (upgrade.active && panel.active) { console.log("\n  panel pair already active; no change\n"); return; }
      if (upgrade.active !== panel.active) {
        const pending = upgrade.active ? panel : upgrade;
        const result = apply ? await activateService(db, contractor.id, pending.id) : null;
        if (!apply) {
          const refusal = refusals.get(pending.slug);
          if (refusal) throw new Error(`${pending.slug} activation refused: ${refusal.code} — ${refusal.message}`);
          console.log(`\n  would activate ${pending.slug}; its paired destination is already live\n`);
        } else {
          if (!result?.ok) throw new Error(`${pending.slug} activation refused: ${result?.refusal.code} — ${result?.refusal.message}`);
          console.log(`\n  activated ${pending.slug}; its paired destination was already live\n`);
        }
        return;
      }
      const upgradeRefusal = refusals.get(upgrade.slug);
      const panelRefusal = refusals.get(panel.slug);
      const reciprocal = upgradeRefusal?.code === "DEPENDENCY_UNAVAILABLE"
        && panelRefusal?.code === "DEPENDENCY_UNAVAILABLE"
        && upgradeRefusal.missingPrerequisites?.length === 1
        && upgradeRefusal.missingPrerequisites[0] === panel.slug
        && panelRefusal.missingPrerequisites?.length === 1
        && panelRefusal.missingPrerequisites[0] === upgrade.slug;
      if (!reciprocal) throw new Error("panel pair is not blocked solely by its expected reciprocal dependency");
      if (!apply) {
        console.log("\n  would activate both services atomically; every non-dependency guard already passed\n");
        return;
      }

      await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM services
          WHERE id IN (${Prisma.join([upgrade.id, panel.id])})
            AND "contractorId" = ${contractor.id}
          ORDER BY id
          FOR UPDATE
        `);
        if (locked.length !== 2) throw new Error("panel pair changed before activation");
        const capacity = await tx.answerOption.findFirst({
          where: { question: { serviceId: panel.id, key: "panel_reason" }, value: "capacity" },
          select: { id: true, routeAction: true, rerouteServiceId: true, photosBlockBooking: true },
        });
        if (!capacity || capacity.routeAction !== "REROUTE_SERVICE" || capacity.rerouteServiceId !== upgrade.id) {
          throw new Error("panel capacity handoff no longer matches the reviewed reciprocal route");
        }

        // Break the cycle only inside this uncommitted transaction. Panel
        // replacement passes the ordinary activation authority while its
        // capacity answer is a blocking review; then restore the real handoff
        // and activate the upgrade while panel replacement is already live.
        // The commit exposes only the final state: both live, both reciprocal
        // routes intact. Any refusal throws and rolls the entire sequence back.
        await tx.answerOption.update({
          where: { id: capacity.id },
          data: { routeAction: "PHOTO_REVIEW", rerouteServiceId: null, photosBlockBooking: true },
        });
        const panelResult = await activateService(tx as unknown as PrismaClient, contractor.id, panel.id);
        if (!panelResult.ok) throw new Error(`panel replacement activation refused: ${panelResult.refusal.code} — ${panelResult.refusal.message}`);
        await tx.answerOption.update({
          where: { id: capacity.id },
          data: {
            routeAction: capacity.routeAction,
            rerouteServiceId: capacity.rerouteServiceId,
            photosBlockBooking: capacity.photosBlockBooking,
          },
        });
        const upgradeResult = await activateService(tx as unknown as PrismaClient, contractor.id, upgrade.id);
        if (!upgradeResult.ok) throw new Error(`200A upgrade activation refused: ${upgradeResult.refusal.code} — ${upgradeResult.refusal.message}`);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      console.log("\n  activated panel replacement and 200A upgrade atomically with both reciprocal routes intact\n");
      return;
    }

    if (activateGarageGroup) {
      const groupIds = new Set(services.map((service) => service.id));
      const pending = services.filter((service) => !service.active);
      if (pending.length !== 0 && pending.length !== services.length) {
        throw new Error("garage group is partially active; refusing an unexpected recovery state");
      }
      for (const service of services) {
        const refusal = await activationRefusal(db, contractor.id, service.id);
        console.log(`  ${service.slug}: ${service.active ? "already active" : refusal ? `refused ${refusal.code}` : "ready"}`);
        if (!service.active && (
          refusal?.code !== "DEPENDENCY_UNAVAILABLE"
          || !refusal.prerequisites?.every((prerequisite) => prerequisite.id && groupIds.has(prerequisite.id))
        )) {
          throw new Error(`${service.slug} is not blocked solely by the closed garage-service dependency group`);
        }
      }
      if (pending.length === 0) { console.log("\n  garage group already active; no change\n"); return; }
      if (!apply) {
        console.log("\n  would activate the four review-only services atomically and offer only the main garage-outlet entry\n");
        return;
      }

      await db.$transaction(async (tx) => {
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT id FROM services
          WHERE id IN (${Prisma.join(services.map((service) => service.id))})
            AND "contractorId" = ${contractor.id}
          ORDER BY id
          FOR UPDATE
        `);
        if (locked.length !== services.length) throw new Error("garage group changed before activation");
        const handoffs = await tx.answerOption.findMany({
          where: { question: { serviceId: { in: services.map((service) => service.id) } }, routeAction: "REROUTE_SERVICE" },
          select: { id: true, rerouteServiceId: true, photosBlockBooking: true },
        });
        if (!handoffs.length || handoffs.some((option) => !option.rerouteServiceId || !groupIds.has(option.rerouteServiceId))) {
          throw new Error("garage handoffs no longer form the reviewed closed service group");
        }
        await tx.answerOption.updateMany({
          where: { id: { in: handoffs.map((option) => option.id) } },
          data: { routeAction: "PHOTO_REVIEW", rerouteServiceId: null, photosBlockBooking: true },
        });
        for (const service of services) {
          const result = await activateService(tx as unknown as PrismaClient, contractor.id, service.id);
          if (!result.ok) throw new Error(`${service.slug} activation refused: ${result.refusal.code} — ${result.refusal.message}`);
        }
        for (const option of handoffs) {
          await tx.answerOption.update({
            where: { id: option.id },
            data: {
              routeAction: "REROUTE_SERVICE",
              rerouteServiceId: option.rerouteServiceId,
              photosBlockBooking: option.photosBlockBooking,
            },
          });
        }
        const offered = await tx.service.updateMany({
          where: { contractorId: contractor.id, slug: "240v-garage-outlet" },
          data: { offered: true },
        });
        if (offered.count !== 1) throw new Error("main garage-outlet entry disappeared during activation");
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
      console.log("\n  activated the four review-only garage services atomically; only the main entry is offered\n");
      return;
    }

    const refused: { slug: string; code: string; message: string }[] = [];
    const ready: typeof services = [];
    for (const service of services) {
      const refusal = await activationRefusal(db, contractor.id, service.id);
      if (refusal) refused.push({ slug: service.slug, code: refusal.code, message: refusal.message });
      else if (!service.active) ready.push(service);
      console.log(`  ${service.slug}: ${service.active ? "already active" : refusal ? `refused ${refusal.code}` : "ready"}`);
    }
    if (!apply) {
      console.log(`\n  would activate ${ready.length} ready service(s); ${refused.length} refused service(s) stay inactive\n`);
      return;
    }
    for (const service of ready) {
      const result = await activateService(db, contractor.id, service.id);
      if (!result.ok) throw new Error(`${service.slug} activation refused: ${result.refusal.code} — ${result.refusal.message}`);
    }
    console.log(`\n  activated ${ready.length} ready service(s); ${refused.length} refused service(s) remain inactive\n`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
