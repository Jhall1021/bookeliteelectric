/**
 * Labor hours — the catalog-wide pass.
 *
 *   npx tsx prisma/seed-labor-hours.ts
 *
 * Three models, per the handoff:
 *
 *   SET          one reliable standalone figure, one WWT figure
 *   ROUTE-BASED  base hours on the service, the rest on route components
 *   QUOTE        null is CORRECT, not incomplete — hours are established when
 *                the office builds the fixed quote
 *
 * The last one matters most. A blank fieldLaborHours on a quote service is the
 * right answer; filling it with an average to make the audit look complete
 * would be the mistake.
 *
 * Changing hours recalculates SUGGESTED prices only. Nothing published moves.
 *
 * Idempotent.
 */

import { PrismaClient } from "@prisma/client";
import { serviceSlugKey } from "./_serviceKey";

const prisma = new PrismaClient();

/**
 * SET: a standard job at an existing suitable location.
 *
 * WHAT THE SECOND FIGURE MEANS
 *
 * Same-visit hours are the INCREMENTAL crew time once a van is already at the
 * property. What gets saved is arrival, parking, greeting the homeowner and
 * writing the job up — and that is roughly a quarter hour whether the work
 * takes twenty minutes or two.
 *
 * So the gap between the two figures should be about 0.25 for most services,
 * NOT a fixed fraction. A two-hour job doesn't share more overhead than a
 * one-hour job; arrival takes as long as it takes.
 *
 * Five services previously saved 0.50 — all of them longer jobs, which is
 * proportional thinking rather than shared setup. They're corrected below.
 *
 * A saving of zero is legitimate: a device swap or a disposal reconnect
 * shares nothing beyond turning up.
 */
const SET: [string, number, number | null][] = [
  // Appliance
  ["garbage-disposal-install", 0.5, 0.5],
  ["dishwasher-electrical", 0.75, 0.5],
  ["install-new-microwave", 2.0, 1.75],
  ["otr-microwave-install", 1.5, 1.25],
  ["dryer-receptacle-replacement", 0.75, 0.5],
  ["range-receptacle-replacement", 0.75, 0.5],

  // Fans
  ["bathroom-fan-light-combo", 2.0, 1.75],
  ["replace-ceiling-fan", 1.25, 1.0],

  // Lighting
  ["replace-exterior-light-fixture", 1.0, 0.75],
  ["replace-interior-light-fixture", 0.75, 0.5],
  ["replace-motion-flood-light", 1.0, 0.75],

  // New outlets
  ["exterior-gfci-standard", 1.5, 1.25],

  // Outlets & switches — normal device replacement at a powered location
  ["customer-supplied-smart-switch", 0.75, 0.5],
  ["smart-switch-upgrade", 0.75, 0.5],
  ["occupancy-motion-switch", 0.5, 0.33],
  ["replace-3-way-switch", 0.5, 0.33],
  ["replace-gfci-outlet", 0.5, 0.33],
  ["replace-led-dimmer", 0.5, 0.33],
  ["replace-standard-outlet", 0.33, 0.33],
  ["replace-standard-switch", 0.33, 0.33],
  ["smart-outlet-upgrade", 0.75, 0.5],
  ["timer-switch-install", 0.75, 0.5],
  ["usb-outlet-upgrade", 0.5, 0.33],
  ["customer-supplied-non-smart-outlet", 0.33, 0.33],
  ["swap-out-customer-supplied-non-smart-switch", 0.33, 0.33],

  // Panels
  ["single-pole-breaker-replacement", 0.75, 0.5],
  ["double-pole-breaker-replacement", 1.0, 0.75],

  // Safety
  ["hardwired-smoke-detector", 0.5, 0.25],
  ["smoke-co-detector", 0.5, 0.25],
  ["home-electrical-safety-inspection", 1.5, 1.25],
  ["whole-house-surge-protection", 1.25, 1.0],

  // Smart home
  ["doorbell-transformer-replacement", 1.0, 0.75],
  ["floodlight-camera-existing", 1.0, 0.75],
  ["smart-thermostat-install", 0.75, 0.5],
  ["video-doorbell-existing-wiring", 0.75, 0.5],

  // TV & media
  ["tv-install-existing-location", 0.75, 0.5],
  ["soundbar-installation", 0.75, 0.5],

  // Troubleshooting: the initial diagnostic block. No WWT — a diagnostic
  // isn't something you add to another visit.
  ["electrical-troubleshooting", 1.0, null],
];

/**
 * ROUTE-BASED: the figure stored here is the BASE branch — the accessible,
 * shortest, single-technician case. Everything above it lives on components,
 * which is why this isn't the average the handoff warns against.
 */
const ROUTE_BASE: [string, number, number | null, string][] = [
  // 1.25 accessible / 1.75 finished, matching the recessed first-light
  // assumptions — both are "create a new lighting point". Switch and
  // switch-leg work stacks separately and is NOT in these hours.
  //
  // This computes to $315 against a published $375. That variance is correct
  // and the editor shows it. An earlier pass set 1.5 here so the calculation
  // would land on $375, which is back-solving labor from selling price — the
  // exact flaw the old primaryLaborUnits had, and the reason this field
  // exists.
  ["new-ceiling-light", 1.25, 1.0, "accessible ceiling; +0.50 component for finished"],
  ["new-ceiling-fan", 1.75, 1.5, "accessible ceiling; +0.50 component for finished"],
  ["fan-replacing-light", 1.5, 1.25, "accessible ceiling; +0.50 component for finished"],
    // Same as standalone. Being on site doesn't remove any of the first
  // light's work — the ceiling still gets cut, the wafer still gets wired.
  // What a second light saves is covered by the per-light components, which
  // are already much cheaper than the first.
  ["recessed-lighting", 1.25, 1.25, "first light; per-light components carry the rest"],
  ["new-120v-outlet", 1.0, 0.75, "accessible, under 10 ft; distance components carry the rest"],
  ["tv-installation", 1.5, 1.25, "both size tiers: one van, 1.5 crew-hours; the larger is a price premium"],
  ["replace-range-hood", 1.5, null, "standard existing-setup replacement only"],
  // Same matrix as New 120V Outlet, per the handoff. These don't have the
  // distance tree attached yet, so the base figure is all that applies until
  // they do — flagged below rather than left looking established.
  ["garage-door-opener-outlet", 1.0, 0.75, "New 120V Outlet matrix; distance tree not yet attached"],
  ["garage-door-opener-outlet-ev", 1.0, 0.75, "New 120V Outlet matrix; distance tree not yet attached"],
  ["bidet-smart-toilet-outlet", 1.0, 0.75, "New 120V Outlet matrix; distance tree not yet attached"],
  // Was on the QUOTE list, which nulled the hours its own seed had just set.
  // It stopped being quote-only when it got a tree and a published price —
  // this list is ordered after seed-exterior-gfci-routing.ts, so it was
  // silently undoing it on every full run.
  ["exterior-gfci-other-routing", 1.5, 1.25, "device work matches back-to-back; distance components carry the run"],
];

/**
 * Nothing held back any more.
 *
 * Dedicated Circuit was here on the understanding that its stored 2.5 hours
 * needed field validation. There were no stored hours — that figure lived in
 * a composition import that never ran against the database. Real figures are
 * now set by seed-dedicated-circuit-labor.ts.
 */
const HOLD_FOR_VALIDATION: string[] = [];

/**
 * QUOTE: null is the correct value. Hours are established per job when the
 * office builds the fixed price.
 */
const QUOTE = [
  "electric-fireplace-circuit",
  "freezer-fridge-dedicated-circuit",
  "new-240v-appliance-circuit",
  "sump-pump-dedicated-circuit",
  "240v-garage-outlet",
  "level-2-ev-charger",
  "generator-inlet-interlock",
  "transfer-switch",
  "new-exterior-lighting-locations",
  "outdoor-landscape-lighting",
  "under-cabinet-led-lighting",
  "200a-service-upgrade",
  "electrical-panel-replacement",
  "hot-tub-spa-electrical",
  "pool-equipment-electrical",
];

/**
 * GRADUATED — off the list, and the reason recorded so nobody puts them back.
 *
 *   new-exterior-flood-camera               2.5h  $705   23 Aug scope model
 *   remove-and-replace-existing-chandelier  2.0h  $530   23 Aug scope model
 *   replace-bathroom-exhaust-fan            1.75h $535   29 Aug fan packages
 *   new-video-doorbell-wiring               2.0h  $530   29 Aug Phase F rescue
 *
 * Each gained a bounded scope, real crew-hours and a derived price. Leaving
 * them here would have nulled the hours under the price on the next full run
 * and recreated the exact defect this file's QUOTE list exists to prevent — a
 * published price with nothing behind it. See the exterior-gfci note in
 * ROUTE_BASE: this list has done that silently once already.
 */

/** Add-on only: no standalone labor, and none established incrementally. */
const ADDON_ONLY = ["elite-tilt-mount", "elite-articulating-mount"];

async function main() {
  let set = 0;
  const missing: string[] = [];

  for (const [slug, field, wwt] of SET) {
    const svc = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
    if (!svc) {
      missing.push(slug);
      continue;
    }
    await prisma.service.update({
      where: { id: svc.id },
      data: { fieldLaborHours: field, wwtLaborHours: wwt },
    });
    set++;
  }
  console.log(`  ✓ ${set} SET services given standalone and add-on hours`);

  let routed = 0;
  for (const [slug, field, wwt] of ROUTE_BASE) {
    const svc = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
    if (!svc) {
      missing.push(slug);
      continue;
    }
    await prisma.service.update({
      where: { id: svc.id },
      data: { fieldLaborHours: field, wwtLaborHours: wwt },
    });
    routed++;
  }
  console.log(`  ✓ ${routed} ROUTE-BASED services given their base-branch hours`);

  let quoted = 0;
  const graduated: string[] = [];
  for (const slug of QUOTE) {
    const svc = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
    if (!svc) {
      missing.push(slug);
      continue;
    }
    // A service that has since been given a real scope must not be quietly
    // dragged back. This list nulls hours, and it used to do so unconditionally
    // — which meant a service could gain a measured scope on Tuesday and lose
    // it to a full seed run on Wednesday, leaving a published price with
    // nothing behind it. That is the precise defect the list exists to prevent,
    // arrived at from the other direction.
    //
    // Refuses rather than warns. A seed that reports a problem and does the
    // damage anyway is monitoring, not enforcement.
    if (svc.basePrice !== null || svc.fieldLaborHours !== null) {
      graduated.push(
        `${slug} — ${svc.fieldLaborHours ?? "no"} crew-hours, ` +
          `price ${svc.basePrice === null ? "none" : `$${(svc.basePrice / 100).toFixed(0)}`}`
      );
      continue;
    }
    // Explicitly null. A quote service with hours invites someone to trust
    // a number that was never measured.
    await prisma.service.update({
      where: { id: svc.id },
      data: { fieldLaborHours: null, wwtLaborHours: null },
    });
    quoted++;
  }
  console.log(`  ✓ ${quoted} QUOTE services left with no hours — correct, not incomplete`);

  if (graduated.length) {
    console.error(`\n  ✗ ${graduated.length} service(s) on the QUOTE list have a scope now:\n`);
    for (const g of graduated) console.error(`      ${g}`);
    console.error(
      `\n  Nulling their hours would leave a published price with nothing behind\n` +
        `  it. Take them off QUOTE and record why, next to the others that\n` +
        `  graduated. Nothing was written for them.\n`
    );
    process.exitCode = 1;
  }

  for (const slug of ADDON_ONLY) {
    const svc = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
    if (!svc) continue;
    await prisma.service.update({
      where: { id: svc.id },
      data: {
        isPrimaryEligible: false,
        fieldLaborHours: null,
        // Mount-install time is already inside Professional TV Installation.
        // Charging labor here would bill it twice.
        wwtLaborHours: null,
      },
    });
  }
  console.log(`  ✓ ${ADDON_ONLY.length} add-on-only mounts: no labor, not primary-eligible`);

  // TV crew handling lives in seed-tv-installation.ts now. It used to set an
  // overrideTechCount of 2 here, which charged for the helper already riding
  // in every van — see that seed for the full reasoning.

  if (missing.length) {
    console.log(`\n  ! ${missing.length} slug(s) not in the catalog:`);
    for (const m of missing) console.log(`      ${m}`);
  }

  for (const slug of HOLD_FOR_VALIDATION) {
    const svc = await prisma.service.findUnique({ where: await serviceSlugKey(prisma, slug) });
    if (!svc) continue;
    console.log(
      `  · ${slug} — holding ${svc.fieldLaborHours ?? "null"} hr unchanged, pending field validation`
    );
  }

  const all = await prisma.service.findMany({
    where: { active: true },
    select: { slug: true, name: true, fieldLaborHours: true, wwtLaborHours: true, whileWeThereBasePrice: true },
  });
  const noHours = all.filter((s) => s.fieldLaborHours === null);
  const expected = new Set([...QUOTE, ...ADDON_ONLY, ...HOLD_FOR_VALIDATION]);
  const unexpected = noHours.filter((s) => !expected.has(s.slug));

  console.log(`\n  ${all.length} active services`);
  console.log(`    with standalone hours : ${all.length - noHours.length}`);
  console.log(`    deliberately null     : ${noHours.length - unexpected.length}`);
  if (unexpected.length) {
    console.log(`    UNACCOUNTED FOR       : ${unexpected.length}`);
    for (const u of unexpected) console.log(`        ${u.name} (${u.slug})`);
  }

  const sellingNoAddon = all.filter(
    (s) => s.whileWeThereBasePrice !== null && s.wwtLaborHours === null && !expected.has(s.slug)
  );
  if (sellingNoAddon.length) {
    console.log(`\n  ${sellingNoAddon.length} service(s) still sell an add-on with no add-on hours:`);
    for (const s of sellingNoAddon) console.log(`      ${s.name}`);
  }

  console.log(`
Suggested prices only. Nothing published moved, no booking eligibility
changed. The $250 minimum still floors any standalone job of an hour or less,
so several of these will show a suggested price identical to today's — the
difference is that there's now a real figure behind it.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
