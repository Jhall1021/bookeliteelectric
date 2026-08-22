/**
 * The full seed sequence, in order.
 *
 *   npm run db:seed:all
 *
 * Why this exists: the current business logic lives across two dozen
 * specialized seeds, and the order between some of them matters — access
 * classification has to run after the trees exist, the fixture
 * acknowledgement after classification, materials before anything that
 * itemizes them. That order has been living in a chat log and in whichever
 * commands got pasted last, which is not somewhere it can survive.
 *
 * Every seed here is idempotent. None can overwrite a published customer
 * price — that goes through the admin Publish action or an explicit
 * reconciliation migration (see _priceGuard.ts).
 *
 * Stops at the first failure rather than carrying on, because a seed that
 * errors halfway usually leaves a tree half-wired, and the ones after it
 * assume the ones before succeeded.
 */

import { execSync } from "child_process";

type Step = { file: string; why: string };

/**
 * Order is load-bearing in four places:
 *
 *   materials          before anything that itemizes a service
 *   trees              before access normalization can classify their answers
 *   normalization      before the fixture acknowledgement, which finds
 *                      finished routes by classification
 *   conditional text   after the questions it attaches to exist
 */
const STEPS: Step[] = [
  { file: "prisma/seed.ts", why: "bootstrap — categories, services, service area" },
  { file: "prisma/seed-questions.ts", why: "the original decision trees" },
  { file: "prisma/seed-pricing-settings.ts", why: "crew-hour rate, service-call minimum" },
  { file: "prisma/seed-materials.ts", why: "parts catalog — must precede itemization" },

  { file: "prisma/seed-height-access.ts", why: "universal height/access module" },
  { file: "prisma/seed-lighting-control.ts", why: "switch-leg module and distance bands" },
  { file: "prisma/seed-recessed-lighting.ts", why: "per-light model" },
  { file: "prisma/seed-breakers.ts", why: "breaker trees, panel photos as preparation" },
  { file: "prisma/seed-device-and-finish-modules.ts", why: "device replacement across 13 services" },

  { file: "prisma/seed-new-outlet.ts", why: "outlet distance bands" },
  { file: "prisma/seed-exterior-gfci.ts", why: "back-to-back GFCI" },
  { file: "prisma/seed-exterior-gfci-routing.ts", why: "GFCI new-location run" },
  { file: "prisma/seed-bathroom-fans.ts", why: "owner-supplied and Elite-supplied fans" },
  { file: "prisma/seed-customer-supplied.ts", why: "smart switch and customer-supplied devices" },
  { file: "prisma/seed-dedicated-circuit.ts", why: "dedicated circuit tree and amperage tiers" },
  { file: "prisma/seed-tv-installation.ts", why: "TV size tiers" },

  { file: "prisma/seed-access-normalization.ts", why: "classify access answers — AFTER the trees" },
  { file: "prisma/seed-fixture-finish-ack.ts", why: "finish acknowledgement — AFTER classification" },
  { file: "prisma/seed-conditional-disclaimers.ts", why: "conditional text and exterior-wall contingency" },

  { file: "prisma/seed-content-fixes.ts", why: "copy, ceiling components, troubleshooting" },
  { file: "prisma/seed-labor-hours.ts", why: "crew-hours across the catalog" },
  { file: "prisma/seed-dedicated-circuit-labor.ts", why: "dedicated circuit crew-hours" },
];

/** Not a seed — a check. Run last, and its findings matter. */
const VERIFY = "prisma/repair-trees.ts";

function run(file: string) {
  execSync(`npx tsx ${file}`, { stdio: "inherit" });
}

function main() {
  const skipBootstrap = process.argv.includes("--no-bootstrap");
  const steps = skipBootstrap ? STEPS.filter((s) => s.file !== "prisma/seed.ts") : STEPS;

  console.log(`\nRunning ${steps.length} seeds in order.\n`);
  if (skipBootstrap) console.log(`  (skipping the bootstrap seed)\n`);

  for (const [i, step] of steps.entries()) {
    console.log(`${"─".repeat(74)}`);
    console.log(`[${i + 1}/${steps.length}] ${step.file}`);
    console.log(`        ${step.why}\n`);
    try {
      run(step.file);
    } catch {
      // Stop rather than continue. A failed seed usually leaves a tree
      // half-wired, and everything after it assumes this one worked.
      console.error(`\n${"─".repeat(74)}`);
      console.error(`FAILED at ${step.file}. Nothing after this has run.`);
      console.error(`Fix it and re-run — every seed here is idempotent, so`);
      console.error(`starting again from the top is safe.\n`);
      process.exit(1);
    }
  }

  console.log(`${"─".repeat(74)}`);
  console.log(`\nVerifying tree integrity...\n`);
  run(VERIFY);

  console.log(`\n${"─".repeat(74)}`);
  console.log(`\nDone. No published customer price was changed by any of this —`);
  console.log(`seeds establish inputs and routing; prices change in the admin.`);
  console.log(`\nWorth running afterwards:`);
  console.log(`  npx tsx scripts/reconcile-prices.ts     published vs model`);
  console.log(`  npx tsx scripts/audit-price-writers.ts  who can move a price\n`);
}

main();
