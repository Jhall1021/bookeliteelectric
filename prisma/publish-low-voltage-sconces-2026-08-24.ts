/**
 * Publish approved prices — four services, 24 August 2026.
 *
 *   npx tsx prisma/publish-low-voltage-sconces-2026-08-24.ts            (report)
 *   npx tsx prisma/publish-low-voltage-sconces-2026-08-24.ts --apply    (write)
 *
 * A NAMED DATED MIGRATION. Only the admin and scripts like this one may set a
 * published customer price. Everything else — seeds, syncs, recomputes —
 * writes inputs and lets the model move; the gap between model and published
 * is the governance, and this file is one of the few places it may be closed.
 *
 * WHAT IS BEING PUBLISHED, AND WHERE IT CAME FROM
 *
 * Four services carried no published price at all since they were seeded on
 * 24 August. They appeared in reconcile-prices.ts under "unknown", which is
 * what that report says when a service has labor and materials but nothing to
 * compare them against.
 *
 * The figures below are the model's own output from those services' recorded
 * crew-hours and itemized materials, reviewed and approved by the owner. They
 * are not new numbers. This script publishes what the model already said;
 * it does not derive, adjust, or back-solve anything.
 *
 *   Install New Ethernet / Network Line   $415 standalone / $355 same-visit
 *   Install New Coax / Cable TV Line      $420 standalone / $355 same-visit
 *   Install a New Wall Sconce             $340 standalone / $275 same-visit
 *   Replace an Existing Wall Sconce       $255 standalone / $130 same-visit
 *
 * The finished-route components stay separate and are NOT touched here:
 * +$190 for ethernet and coax, +$125 for the new sconce. They are modelled as
 * added crew-hours on an answer option, which is what keeps the extra time
 * visible as time rather than buried in a second price.
 *
 * WHY IT REFUSES TO OVERWRITE
 *
 * Every target must currently be null. If a price is already set, this script
 * has either run before or the owner has since edited the figure in the
 * admin — and in both cases the right move is to stop, not to reassert an
 * August number over a later decision. Re-running is therefore safe and
 * produces no writes.
 *
 * Nothing else is modified. No labor hours, no materials, no routing, no
 * booking type.
 */

import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import {
  suggestPrimaryPrice,
  suggestWwtPrice,
  type PricingSettings,
  type ServicePricingInputs,
} from "../lib/pricing";

const prisma = new PrismaClient();

/** Rounding is $5, so agreement within that is agreement. */
const TOLERANCE_CENTS = 500;

type Target = {
  slug: string;
  name: string;
  basePriceCents: number;
  wwtPriceCents: number;
};

/**
 * Exact stable slugs. Matching by name would break on a wording change, and
 * matching by pattern could catch a service nobody approved.
 */
const TARGETS: Target[] = [
  {
    slug: "new-ethernet-line",
    name: "Install New Ethernet / Network Line",
    basePriceCents: 41500,
    wwtPriceCents: 35500,
  },
  {
    slug: "new-coax-line",
    name: "Install New Coax / Cable TV Line",
    basePriceCents: 42000,
    wwtPriceCents: 35500,
  },
  {
    slug: "new-wall-sconce",
    name: "Install a New Wall Sconce",
    basePriceCents: 34000,
    wwtPriceCents: 27500,
  },
  {
    slug: "replace-wall-sconce",
    name: "Replace an Existing Wall Sconce",
    basePriceCents: 25500,
    wwtPriceCents: 13000,
  },
];

// ---------------------------------------------------------------------------
// Decision logic, kept pure so it can be tested without a database.
// ---------------------------------------------------------------------------

export type CurrentState = {
  basePrice: number | null;
  whileWeThereBasePrice: number | null;
};

export type Decision =
  | { action: "publish"; fields: ("basePrice" | "whileWeThereBasePrice")[] }
  | { action: "already-published"; conflicts: string[] }
  | { action: "partial-conflict"; conflicts: string[] };

/**
 * Whether a service may be published.
 *
 * Both targets null      -> publish both.
 * Both already set       -> nothing to do; this has run before.
 * One set, one null      -> STOP. A half-published service means something
 *                           happened between then and now that this script
 *                           doesn't know about, and filling in the gap would
 *                           be guessing at intent.
 */
export function decide(current: CurrentState, target: Target): Decision {
  const baseSet = current.basePrice !== null;
  const wwtSet = current.whileWeThereBasePrice !== null;

  if (!baseSet && !wwtSet) {
    return { action: "publish", fields: ["basePrice", "whileWeThereBasePrice"] };
  }

  const conflicts: string[] = [];
  if (baseSet) {
    conflicts.push(
      `basePrice already $${(current.basePrice! / 100).toFixed(2)} ` +
        `(this script would have set $${(target.basePriceCents / 100).toFixed(2)})`
    );
  }
  if (wwtSet) {
    conflicts.push(
      `whileWeThereBasePrice already $${(current.whileWeThereBasePrice! / 100).toFixed(2)} ` +
        `(this script would have set $${(target.wwtPriceCents / 100).toFixed(2)})`
    );
  }

  return baseSet && wwtSet
    ? { action: "already-published", conflicts }
    : { action: "partial-conflict", conflicts };
}

/**
 * The columns this script reads, spelled out.
 *
 * Annotated rather than inferred from the Prisma result: this file is
 * type-checked at build alongside the seeds, and a wrong relation or field
 * name here fails the whole deploy rather than just this script. Extending
 * ServicePricingInputs means the pricing fields can't drift out of step with
 * what the engine expects.
 */
type ServiceRow = ServicePricingInputs & {
  id: string;
  slug: string;
  name: string;
  basePrice: number | null;
  whileWeThereBasePrice: number | null;
};

const $ = (c: number | null) => (c === null ? "not set" : `$${(c / 100).toFixed(2)}`);

async function main() {
  const apply = process.argv.includes("--apply");

  // Historical publish script. Reads the SOLE contractor's settings rather
  // than a literal id — it verifies approved figures against the rate that
  // produced them, and that rate belongs to a contractor.
  const only = await prisma.contractor.findMany({ select: { id: true }, take: 2 });
  if (only.length !== 1) {
    console.error(
      `This script predates multi-tenancy and assumes one contractor; found ${only.length}. ` +
        `Re-scope it before running.`
    );
    process.exit(1);
  }
  const maybeSettings = (await prisma.pricingSettings.findUnique({
    where: { contractorId: only[0].id },
  })) as PricingSettings | null;
  if (!maybeSettings) {
    console.error("No pricing settings — cannot verify the approved figures. Stopping.");
    process.exit(1);
    return;
  }
  const settings: PricingSettings = maybeSettings;

  console.log(`\nPUBLISH — low-voltage and sconce services, 24 Aug 2026`);
  console.log(apply ? `  APPLYING\n` : `  Report only. Re-run with --apply to publish.\n`);

  const services: ServiceRow[] = await prisma.service.findMany({
    where: { slug: { in: TARGETS.map((t) => t.slug) } },
    select: {
      id: true,
      slug: true,
      name: true,
      basePrice: true,
      whileWeThereBasePrice: true,
      fieldLaborHours: true,
      wwtLaborHours: true,
      requiresTechCount: true,
      materialCostCents: true,
      materialMultiplier: true,
      permitAdminCents: true,
      otherDirectCostCents: true,
      isPrimaryEligible: true,
    },
  });

  const bySlug = new Map<string, ServiceRow>();
  for (const s of services) bySlug.set(s.slug, s);

  // 1. Fail loudly on a missing service. A publication script that silently
  //    publishes three of four is worse than one that refuses.
  const missing = TARGETS.filter((t) => !bySlug.has(t.slug));
  if (missing.length) {
    console.error(`STOPPING — ${missing.length} expected service(s) not in the catalog:\n`);
    for (const m of missing) console.error(`    ${m.slug}  (${m.name})`);
    console.error(`\nRun prisma/seed-low-voltage-and-sconces.ts first, or fix the slug.`);
    console.error(`Nothing was changed.\n`);
    process.exit(1);
  }

  // 2. Report current -> proposed, and check each approved figure still
  //    agrees with what the model produces from the service's own inputs.
  //
  //    This is a CHECK, not a calculation: the published figure comes from
  //    the TARGETS table above, approved by the owner. If the inputs have
  //    drifted since approval, publishing would create an immediate
  //    reconciler divergence, and that's worth knowing before it happens
  //    rather than after.
  const decisions: { target: Target; svc: ServiceRow; decision: Decision }[] = [];
  let modelDisagreements = 0;

  for (const target of TARGETS) {
    const svc = bySlug.get(target.slug)!;
    const inputs = {
      fieldLaborHours: svc.fieldLaborHours,
      wwtLaborHours: svc.wwtLaborHours,
      requiresTechCount: svc.requiresTechCount,
      materialCostCents: svc.materialCostCents,
      materialMultiplier: svc.materialMultiplier,
      permitAdminCents: svc.permitAdminCents,
      otherDirectCostCents: svc.otherDirectCostCents,
      isPrimaryEligible: svc.isPrimaryEligible,
    };
    const modelBase = suggestPrimaryPrice(inputs, settings).totalCents;
    const modelWwt = suggestWwtPrice(inputs, settings).totalCents;

    const baseOff =
      modelBase === null || Math.abs(modelBase - target.basePriceCents) > TOLERANCE_CENTS;
    const wwtOff =
      modelWwt === null || Math.abs(modelWwt - target.wwtPriceCents) > TOLERANCE_CENTS;
    if (baseOff || wwtOff) modelDisagreements++;

    const decision = decide(
      { basePrice: svc.basePrice, whileWeThereBasePrice: svc.whileWeThereBasePrice },
      target
    );
    decisions.push({ target, svc, decision });

    console.log(`  ${target.name}`);
    console.log(`      slug            ${target.slug}`);
    console.log(
      `      standalone      ${$(svc.basePrice).padEnd(10)} ->  $${(target.basePriceCents / 100).toFixed(2)}` +
        (baseOff ? `   ** model now says ${$(modelBase)} **` : `   (model ${$(modelBase)})`)
    );
    console.log(
      `      same-visit      ${$(svc.whileWeThereBasePrice).padEnd(10)} ->  $${(target.wwtPriceCents / 100).toFixed(2)}` +
        (wwtOff ? `   ** model now says ${$(modelWwt)} **` : `   (model ${$(modelWwt)})`)
    );
    if (decision.action !== "publish") {
      for (const c of decision.conflicts) console.log(`      SKIP: ${c}`);
    }
    console.log();
  }

  if (modelDisagreements) {
    console.log(`${"─".repeat(74)}`);
    console.log(
      `  ${modelDisagreements} service(s) no longer match the model figures that were approved.\n` +
        `  The inputs have changed since 24 Aug. Publishing anyway would show up\n` +
        `  immediately in reconcile-prices.ts as a price differing with no recorded\n` +
        `  reason. Re-approve the current figures rather than publishing stale ones.\n`
    );
  }

  const toPublish = decisions.filter((d) => d.decision.action === "publish");
  const conflicts = decisions.filter((d) => d.decision.action === "partial-conflict");
  const done = decisions.filter((d) => d.decision.action === "already-published");

  console.log(`${"─".repeat(74)}`);
  console.log(`  ${toPublish.length} to publish, ${done.length} already published, ${conflicts.length} conflicted\n`);

  // 3. A half-published service means something happened this script doesn't
  //    know about. Refuse the whole run rather than guess.
  if (conflicts.length) {
    console.error(`STOPPING — ${conflicts.length} service(s) have one price set and one not.\n`);
    for (const c of conflicts) {
      console.error(`    ${c.target.slug}`);
      if (c.decision.action !== "publish") {
        for (const line of c.decision.conflicts) console.error(`        ${line}`);
      }
    }
    console.error(`\nSomeone set one of these by hand. Decide deliberately rather than`);
    console.error(`letting an August script fill in the other half.`);
    console.error(`Nothing was changed.\n`);
    process.exit(1);
  }

  if (!toPublish.length) {
    console.log(`  Nothing to do — every target already carries a published price.\n`);
    return;
  }

  if (!apply) {
    console.log(`  Nothing was changed. Re-run with --apply to publish the figures above.\n`);
    return;
  }

  if (modelDisagreements) {
    console.error(`  Refusing to apply while approved figures disagree with the model.\n`);
    process.exit(1);
  }

  // 4. Write ONLY the two price fields, all or nothing.
  const writes = [];
  for (const { target, svc } of toPublish) {
    writes.push(
      prisma.service.update({
        where: { id: svc.id },
        data: {
          basePrice: target.basePriceCents,
          whileWeThereBasePrice: target.wwtPriceCents,
        },
      })
    );
  }
  await prisma.$transaction(writes);

  // 5. Read back from the database rather than reprinting what was sent.
  const after = await prisma.service.findMany({
    where: { slug: { in: TARGETS.map((t) => t.slug) } },
    // One field per line deliberately. audit-price-writers.ts treats
    // `basePrice: true` as a Prisma select and skips it, but only when the
    // whole captured value is the bare literal — a multi-field select on one
    // line reads as `true, whileWeThereBasePrice: true },` and gets reported
    // as a write. Formatting around it here rather than loosening the
    // auditor, which should stay suspicious.
    select: {
      slug: true,
      name: true,
      basePrice: true,
      whileWeThereBasePrice: true,
    },
    orderBy: { name: "asc" },
  });

  console.log(`  PUBLISHED — read back from the database:\n`);
  for (const s of after) {
    console.log(
      `      ${s.name.slice(0, 38).padEnd(40)}` +
        `standalone ${$(s.basePrice).padStart(9)}` +
        `      same-visit ${$(s.whileWeThereBasePrice).padStart(9)}`
    );
  }

  let published = 0;
  for (const s of after) {
    if (s.basePrice !== null && s.whileWeThereBasePrice !== null) published++;
  }
  console.log(`\n  ${published * 2} figure(s) published across ${published} service(s).`);
  console.log(`  Run npm run db:reconcile — these should now match the model.\n`);
}

/**
 * Only run when invoked directly.
 *
 * `decide` above is exported so scripts/verify-publication-guard.ts can test
 * the overwrite refusal without a database. Without this guard, importing
 * that one function would execute main() as a side effect and open a
 * connection to the production database just to run a unit test.
 */
const invokedDirectly =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedDirectly) {
  main()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
