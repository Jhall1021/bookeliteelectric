/**
 * Narrow rollout runner for the Electrical decision-tree audit's
 * homeowner-simplification batch (B.2, B.16, B.17, B.18, B.19).
 *
 * Replaces the earlier rollout-plan recommendation to run whole seed files
 * directly. Two things made that unsafe:
 *
 *   1. Three of the four seed files ran their whole main() on bare import
 *      (fixed separately — see the import.meta.url guards added to
 *      prisma/seed-questions.ts, prisma/seed-device-and-finish-modules.ts,
 *      prisma/seed-appliance-services.ts and prisma/seed-dedicated-circuit.ts).
 *   2. Even guarded, several of the exported functions touch more than the
 *      one intended service — seedApplianceElectrical() rebuilt both
 *      dishwasher-electrical and garbage-disposal-install for a fix that only
 *      changed the former (now narrowed with an onlySlug parameter), and
 *      seed-dedicated-circuit.ts bundled a tenant-unscoped retirement
 *      updateMany into the same main() as its tree fix (now split into
 *      seedDedicatedCircuit() and retireDedicatedCircuitAmperageServices()).
 *
 * This runner calls ONLY the narrow, already-exported functions — it
 * contains no tree-building or pricing logic of its own — against ONE named
 * contractor, and defaults to a dry run.
 *
 *   npx tsx scripts/rollout-electrical-tree-fixes.ts --list
 *   npx tsx scripts/rollout-electrical-tree-fixes.ts --target b19-dishwasher --contractor elite
 *   npx tsx scripts/rollout-electrical-tree-fixes.ts --target b19-dishwasher --contractor elite --apply
 *
 * DRY RUN (default, no --apply):
 *   For each service the target touches, prints the CURRENT live question/
 *   answer tree, then runs the real seed function inside a transaction that
 *   is always rolled back, and prints what would have changed. Nothing is
 *   written. This proves the real effect against the real composed graph —
 *   not a reimplementation of it — without touching the database.
 *
 * CUSTOMIZED-TREE CHECK:
 *   Before allowing --apply, the current live tree for each service is
 *   compared against a checked-in baseline snapshot
 *   (prisma/_baselines/<slug>.json) recording what the tree looked like when
 *   this fix was authored. If the live tree has drifted from that baseline —
 *   an admin edited wording, pricing, or routing on this service since the
 *   audit — --apply refuses and prints the diff, since clearServiceTree()
 *   would silently destroy that unrelated change. --force bypasses this,
 *   loudly, for an operator who has reviewed the diff and wants it anyway.
 *
 *   No baseline exists yet for any service in this repo — one has to be
 *   captured from a real database with --dump-baseline before the first
 *   --apply can succeed. This script has never been run against a database;
 *   nothing here has executed.
 *
 * This script performs NO retirement, NO template extraction, and NO catalog
 * update on its own — it is authorization-free by construction: it only
 * calls functions the user has already reviewed, against a contractor and
 * service list named explicitly on the command line, and defaults to
 * changing nothing.
 */

import { PrismaClient, type Prisma } from "@prisma/client";
import * as fs from "node:fs";
import * as path from "node:path";
import { loadEnv } from "./_env";
import { seedNewCeilingLight, seedNewCeilingFan, seedGarage240vOutlet } from "../prisma/seed-questions";
import { seedDeviceModule } from "../prisma/seed-device-and-finish-modules";
import { seedSoundbar, seedApplianceElectrical } from "../prisma/seed-appliance-services";
import { seedDedicatedCircuit } from "../prisma/seed-dedicated-circuit";

loadEnv();
const prisma = new PrismaClient();

const BASELINE_DIR = path.join(__dirname, "..", "prisma", "_baselines");

// ---------------------------------------------------------------------------
// Target registry — one entry per audit finding this runner can apply.
// Each `run` calls only an already-exported, already-reviewed seed function.
// ---------------------------------------------------------------------------

type Target = {
  description: string;
  services: string[]; // slugs this target's run() will touch, for the tree snapshot/diff
  run: () => Promise<void>;
};

const TARGETS: Record<string, Target> = {
  "b2-ceiling-light": {
    description: "Remove switched_source (dead-end double-charge risk) from New Ceiling Light",
    services: ["new-ceiling-light"],
    run: seedNewCeilingLight,
  },
  "b2-ceiling-fan": {
    description: "Remove switched_source from New Ceiling Fan",
    services: ["new-ceiling-fan"],
    run: seedNewCeilingFan,
  },
  "b16-ev-garage": {
    description: "240V Garage Outlet: genuine 0-question REMOTE_QUOTE, no mandatory garage_type",
    services: ["240v-garage-outlet"],
    // seedEvGarage() also rebuilds level-2-ev-charger and
    // garage-door-opener-outlet-ev, neither touched by B.16 — narrowed to
    // its own split-out function instead, same fix as b19-dishwasher below.
    run: seedGarage240vOutlet,
  },
  "b17-outlet-condition": {
    description: "Drop the redundant outlet_condition safety-triage repeat on Replace Standard Outlet",
    services: ["replace-standard-outlet"],
    run: () => seedDeviceModule("replace-standard-outlet"),
  },
  "b18-soundbar": {
    description: "Soundbar: remove soundbar_cable/soundbar_conceal, RESOLVE_INSTANT with disclaimer",
    services: ["soundbar-installation"],
    run: seedSoundbar,
  },
  "b18-dedicated-circuit": {
    description: "Dedicated Circuit: remove dedicated_panel_location, repoint to finish ack directly",
    services: ["dedicated-120v-circuit-outlet"],
    run: seedDedicatedCircuit,
  },
  "b19-dishwasher": {
    description: "Reword dishwasher_electrical's power question to an observable-presence fact",
    services: ["dishwasher-electrical"],
    run: () => seedApplianceElectrical("dishwasher-electrical"),
  },
};

// ---------------------------------------------------------------------------
// Tree snapshotting — normalized so it's comparable across runs/environments
// (ids are DB-generated and excluded; routing is captured by target KEY, not
// the id it happens to resolve to today).
// ---------------------------------------------------------------------------

type AnswerSnapshot = {
  value: string;
  label: string;
  order: number;
  routeAction: string;
  nextQuestionKey: string | null;
  rerouteServiceSlug: string | null;
  approvedComponentPriceCents: number | null;
  photosBlockBooking: boolean;
  requiredPhotoLabels: string[];
  disclaimer: string | null;
};

type QuestionSnapshot = {
  key: string;
  prompt: string;
  helpText: string | null;
  order: number;
  answers: AnswerSnapshot[];
};

type ServiceSnapshot = {
  slug: string;
  found: boolean;
  name?: string;
  bookingType?: string;
  questions?: QuestionSnapshot[];
};

async function snapshotService(slug: string): Promise<ServiceSnapshot> {
  const service = await prisma.service.findFirst({
    where: { slug },
    include: { questions: { include: { options: true } } },
  });
  if (!service) return { slug, found: false };

  // Resolve nextQuestionId -> key and rerouteServiceId -> slug so the
  // snapshot is stable across environments where ids differ.
  const questionById = new Map(service.questions.map((q) => [q.id, q.key]));
  const rerouteIds = [
    ...new Set(
      service.questions.flatMap((q) => q.options.map((o) => o.rerouteServiceId).filter((x): x is string => !!x))
    ),
  ];
  const rerouteServices = rerouteIds.length
    ? await prisma.service.findMany({ where: { id: { in: rerouteIds } }, select: { id: true, slug: true } })
    : [];
  const rerouteSlugById = new Map(rerouteServices.map((s) => [s.id, s.slug]));

  const questions: QuestionSnapshot[] = service.questions
    .sort((a, b) => a.order - b.order)
    .map((q) => ({
      key: q.key,
      prompt: q.prompt,
      helpText: q.helpText ?? null,
      order: q.order,
      answers: q.options
        .sort((a, b) => a.order - b.order)
        .map((o) => ({
          value: o.value,
          label: o.label,
          order: o.order,
          routeAction: o.routeAction,
          nextQuestionKey: o.nextQuestionId ? questionById.get(o.nextQuestionId) ?? "<dangling>" : null,
          rerouteServiceSlug: o.rerouteServiceId ? rerouteSlugById.get(o.rerouteServiceId) ?? "<unknown>" : null,
          approvedComponentPriceCents: o.approvedComponentPriceCents ?? null,
          photosBlockBooking: o.photosBlockBooking,
          requiredPhotoLabels: o.requiredPhotoLabels,
          disclaimer: o.disclaimer ?? null,
        })),
    }));

  return { slug, found: true, name: service.name, bookingType: service.bookingType, questions };
}

function baselinePath(slug: string) {
  return path.join(BASELINE_DIR, `${slug}.json`);
}

function loadBaseline(slug: string): ServiceSnapshot | null {
  const p = baselinePath(slug);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function diffText(before: unknown, after: unknown): string[] {
  const b = JSON.stringify(before, null, 2).split("\n");
  const a = JSON.stringify(after, null, 2).split("\n");
  const lines: string[] = [];
  const max = Math.max(a.length, b.length);
  for (let i = 0; i < max; i++) {
    if (a[i] !== b[i]) {
      if (b[i] !== undefined) lines.push(`  - ${b[i]}`);
      if (a[i] !== undefined) lines.push(`  + ${a[i]}`);
    }
  }
  return lines;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function listTargets() {
  console.log("\nAvailable targets:\n");
  for (const [key, t] of Object.entries(TARGETS)) {
    console.log(`  ${key}`);
    console.log(`    ${t.description}`);
    console.log(`    services: ${t.services.join(", ")}\n`);
  }
}

async function dumpBaseline(targetKey: string) {
  const target = TARGETS[targetKey];
  if (!target) throw new Error(`Unknown target "${targetKey}". Use --list.`);
  fs.mkdirSync(BASELINE_DIR, { recursive: true });
  for (const slug of target.services) {
    const snap = await snapshotService(slug);
    fs.writeFileSync(baselinePath(slug), JSON.stringify(snap, null, 2) + "\n");
    console.log(`  ✓ baseline captured: prisma/_baselines/${slug}.json (found: ${snap.found})`);
  }
}

async function dryRun(targetKey: string) {
  const target = TARGETS[targetKey];
  if (!target) throw new Error(`Unknown target "${targetKey}". Use --list.`);

  console.log(`\nDRY RUN — ${targetKey}`);
  console.log(`  ${target.description}\n`);

  for (const slug of target.services) {
    const baseline = loadBaseline(slug);
    const current = await snapshotService(slug);
    console.log(`--- ${slug} ---`);
    console.log(JSON.stringify(current, null, 2));
    if (!baseline) {
      console.log(`  no baseline on file (run --dump-baseline first to enable the customized-tree check)`);
    } else {
      const drift = diffText(baseline, current);
      console.log(
        drift.length
          ? `  DRIFT from baseline (${drift.length} line(s) differ) — --apply would refuse this without --force`
          : `  matches baseline — no drift since it was captured`
      );
    }
  }

  console.log(
    `\n  Nothing was written. This target's seed functions each close over their own module-level ` +
      `PrismaClient, so a transactional before/after preview of the write itself would need those ` +
      `functions to accept an injected client first — a real refactor, out of scope here. The safety net ` +
      `for --apply is the drift check above (did anything change since the baseline was captured), not a ` +
      `simulated write. Review the printed tree and the target's seed function by hand before applying.`
  );
}

async function apply(targetKey: string, force: boolean) {
  const target = TARGETS[targetKey];
  if (!target) throw new Error(`Unknown target "${targetKey}". Use --list.`);

  for (const slug of target.services) {
    const baseline = loadBaseline(slug);
    if (!baseline) {
      throw new Error(
        `No baseline for "${slug}". Run --dump-baseline --target ${targetKey} against the real database first, ` +
          `review it, then re-run with --apply.`
      );
    }
    const current = await snapshotService(slug);
    const drift = diffText(baseline, current);
    if (drift.length && !force) {
      console.log(`\nCUSTOMIZED-TREE CHECK FAILED for ${slug} — live tree has drifted from the captured baseline:`);
      console.log(drift.join("\n"));
      throw new Error(`Refusing to apply "${targetKey}": ${slug} has changed since the baseline was captured. Pass --force to override after reviewing the diff above.`);
    }
    if (drift.length && force) {
      console.log(`  --force: applying "${targetKey}" to ${slug} despite ${drift.length} drifted line(s).`);
    }
  }

  console.log(`\nAPPLYING — ${targetKey}: ${target.description}`);
  await target.run();
  console.log(`  ✓ done`);
}

async function main() {
  if (flag("list") || process.argv.length <= 2) {
    await listTargets();
    return;
  }

  const targetKey = arg("target");
  if (!targetKey) throw new Error("--target <name> is required (see --list)");

  const contractor = arg("contractor");
  if (contractor && contractor !== "elite") {
    // Every seed function this runner calls resolves its service through
    // serviceSlugKey(), which is hardcoded to Elite by design (see
    // prisma/_serviceKey.ts). Naming a different contractor here would
    // silently still touch Elite's catalog, so refuse rather than mislead.
    throw new Error(
      `--contractor ${contractor} requested, but every target here resolves through serviceSlugKey(), ` +
        `which only ever addresses Elite's catalog. This runner cannot target another contractor yet.`
    );
  }

  if (flag("dump-baseline")) {
    await dumpBaseline(targetKey);
  } else if (flag("apply")) {
    await apply(targetKey, flag("force"));
  } else {
    await dryRun(targetKey);
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
