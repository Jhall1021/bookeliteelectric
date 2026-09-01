/**
 * Capture the homepage hero's guided-pricing walkthrough from LIVE data.
 *
 * READ ONLY. This script opens the production database and never writes to
 * it: no create, update, upsert, delete, no raw execute, no migration and no
 * seed. Everything below is findUnique/findFirst/findMany plus pure functions
 * from lib/. That is a rule, not an accident of the current implementation —
 * the owner approved database access for this capture on exactly that basis,
 * and `assertReadOnly` below fails the run if a mutating client method is
 * reachable from this file's prisma handle.
 *
 * WHY THIS EXISTS
 *
 * The hero shows a homeowner walking a real service to a real fixed price.
 * A hand-drawn version of that is a drawing of a claim, and drawings drift.
 * So the questions, their wording, their order, their answer labels, the
 * routing and every price come from the contractor's live catalog, resolved
 * through the SAME resolveRoute the storefront calls.
 *
 * TWO LAYERS, CAPTURED FROM TWO PLACES, ON PURPOSE:
 *
 *   what the browser renders   the real ServiceFlowDTO, taken by calling the
 *                              storefront's own /api/services/[slug] handler
 *                              in-process. The fixture is therefore the exact
 *                              payload the live storefront hands its own
 *                              components — so the hero can render those same
 *                              components without a network or a tenant.
 *   what the answers cost      resolveRoute + loadPricingSettings, because the
 *                              browser deliberately cannot price anything.
 *
 * THE SHORTEST PRICED PATH IS COMPUTED, NOT CHOSEN. Every path through the
 * tree is walked; the fewest-questions path that ends in a PRICED outcome
 * wins, ties broken by lowest price then lexically, so the result is
 * deterministic and cannot quietly become "the path that made the animation
 * easier".
 *
 * IDENTITY IS SUBSTITUTED, ECONOMICS ARE NOT. The source tenant is a real
 * contractor; the marketing site must not read as one electrician's product
 * demo, and POSITIONING.md has forbidden real-tenant branding on the homepage
 * since the screenshots pass. So the contractor's NAME is replaced with the
 * demonstration identity everywhere it appears — including inside question
 * copy, where "I'd rather <name> take a look first" is a real answer label.
 * Prices, prompts, order and routing are carried through untouched: those are
 * the things the hero is claiming to be true.
 *
 *   npx tsx scripts/capture-hero-flow.ts              # capture and write
 *   npx tsx scripts/capture-hero-flow.ts --check      # fail if live drifted
 *   npx tsx scripts/capture-hero-flow.ts --from <slug>
 */
import { PrismaClient } from "@prisma/client";
import { writeFileSync, existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { pricingCopy } from "../lib/pricingCopy";
import { loadBusinessHours, generateArrivalWindows } from "../lib/businessHours";
import { DEMO } from "./demo-contractor";

const prisma = new PrismaClient();

/**
 * The read-only guarantee, enforced rather than promised.
 *
 * A future edit that reaches for `prisma.service.update` in here would be a
 * change of kind, not of degree — this file is the one the owner approved
 * against a live database. Poisoning the mutating methods means such an edit
 * fails loudly on the first run instead of succeeding quietly.
 */
function assertReadOnly() {
  const forbidden = ["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"] as const;
  const models = ["contractor", "service", "question", "answerOption", "businessHours", "contractorSite"] as const;
  for (const m of models) {
    const model = (prisma as any)[m];
    if (!model) continue;
    for (const f of forbidden) {
      if (typeof model[f] === "function") {
        model[f] = () => {
          throw new Error(`capture-hero-flow is READ ONLY — ${m}.${f} is not available here`);
        };
      }
    }
  }
  (prisma as any).$executeRaw = () => { throw new Error("capture-hero-flow is READ ONLY"); };
  (prisma as any).$executeRawUnsafe = () => { throw new Error("capture-hero-flow is READ ONLY"); };
}

const arg = (n: string) => {
  const i = process.argv.indexOf(`--${n}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
};

/** The tenant whose catalog is the source of truth. */
const FROM = arg("from") ?? "elite-electric";
/** The job the hero walks, and the same-visit work it is offered alongside. */
const PRIMARY = arg("service") ?? "new-120v-outlet";
const ADD_ON = arg("add-on") ?? "replace-standard-outlet";
const OUT = "components/marketing/heroFlow.ts";

type Chosen = { questionKey: string; prompt: string; helpText: string | null; optionValue: string; optionLabel: string };

async function main() {
  assertReadOnly();
  const checking = process.argv.includes("--check");
  console.log(`\nHERO FLOW — ${checking ? "checking against" : "capturing from"} ${FROM}\n`);

  const contractor = await prisma.contractor.findUnique({
    where: { slug: FROM },
    select: { id: true, name: true, pricingStrategy: true },
  });
  if (!contractor) throw new Error(`no contractor with slug ${FROM}`);

  const site = await prisma.contractorSite.findFirst({
    where: { contractorId: contractor.id },
    select: { publicId: true, hostedSlug: true },
  });
  if (!site) throw new Error(`${FROM} has no site row, so the storefront API cannot be asked for its flow`);

  const settings = await loadPricingSettings(prisma as any, contractor.id);
  if (!settings) throw new Error(`${FROM} has no pricing settings`);

  /**
   * The contractor's own name, and every shortened form of it that shows up
   * in customer-facing copy. Longest first, so "Elite Electric & Lighting" is
   * replaced before the bare "Elite" inside it.
   */
  const names = [contractor.name, contractor.name.split(/\s+[&·|-]\s+/)[0], contractor.name.split(/\s+/)[0]]
    .filter((n, i, a) => n && a.indexOf(n) === i)
    .sort((a, b) => b.length - a.length);
  const anonymize = <T,>(value: T): T => {
    if (typeof value === "string") {
      let out: string = value;
      for (const n of names) {
        out = out.split(n).join(n === contractor.name ? DEMO.name : DEMO.shortName);
      }
      return out as unknown as T;
    }
    if (Array.isArray(value)) return value.map(anonymize) as unknown as T;
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, anonymize(v)]),
      ) as T;
    }
    return value;
  };

  /**
   * The exact payload the live storefront hands its own components.
   *
   * Called in-process rather than over HTTP so the capture needs no running
   * server, and through the real handler rather than a reimplementation of it
   * so the fixture cannot describe a DTO shape the product stopped serving.
   */
  async function flowDto(slug: string) {
    const { GET } = await import("../app/api/services/[slug]/route");
    const res = await GET(
      new Request(`https://capture.local/api/services/${slug}`, {
        headers: { "x-price2book-site": site!.publicId },
      }),
      { params: { slug } },
    );
    if (res.status !== 200) throw new Error(`/api/services/${slug} answered ${res.status}`);
    return (await res.json()) as any;
  }

  /**
   * Walk every path, and report the shortest one that ends in a price.
   *
   * The walk uses the resolution-shaped service (which knows routing and
   * economics), not the DTO (which deliberately does not).
   */
  async function walk(serviceId: string) {
    const svc = await loadServiceForResolution(prisma as any, serviceId);
    if (!svc) throw new Error("service vanished between queries");
    const byId = new Map(svc.questions.map((q: any) => [q.id, q]));
    const nextKey = (o: any) =>
      o.routeAction === "CONTINUE" && o.nextQuestionId ? byId.get(o.nextQuestionId)?.key ?? null : null;

    const priced: { path: Chosen[]; priceCents: number }[] = [];
    let paths = 0;
    const go = (key: string | null, answers: Record<string, string>, path: Chosen[]) => {
      if (!key) {
        paths++;
        const route = resolveRoute(svc as any, answers, true, settings!);
        if (route.status === "PRICED") priced.push({ path, priceCents: route.priceCents });
        return;
      }
      const q = svc.questions.find((x: any) => x.key === key);
      if (!q) return;
      for (const o of q.options) {
        go(nextKey(o), { ...answers, [q.key]: o.value }, [
          ...path,
          { questionKey: q.key, prompt: q.prompt, helpText: q.helpText, optionValue: o.value, optionLabel: o.label },
        ]);
      }
    };
    go(svc.questions[0]?.key ?? null, {}, []);

    priced.sort(
      (a, b) =>
        a.path.length - b.path.length ||
        a.priceCents - b.priceCents ||
        JSON.stringify(a.path).localeCompare(JSON.stringify(b.path)),
    );
    /**
     * Derived exactly as the storefront derives it: true when at least one
     * honest route through this service ends somewhere other than a price.
     * ServiceIntro shows a caveat when it holds, and the hero must not show a
     * confidence the real page would not.
     */
    const mayNotQualify = priced.length < paths;
    return { shortest: priced[0] ?? null, pricedCount: priced.length, paths, mayNotQualify };
  }

  const services = await prisma.service.findMany({
    where: { contractorId: contractor.id, slug: { in: [PRIMARY, ADD_ON] } },
    select: { id: true, slug: true, name: true, shortDescription: true, basePrice: true,
              whileWeThereBasePrice: true, active: true, estimatedMinutes: true },
  });
  const bySlug = new Map(services.map((s) => [s.slug, s]));
  for (const slug of [PRIMARY, ADD_ON]) {
    if (!bySlug.has(slug)) throw new Error(`${FROM} has no service "${slug}"`);
    if (!bySlug.get(slug)!.active) throw new Error(`${slug} is not active on ${FROM} — the hero must not show retired work`);
  }

  const primaryRow = bySlug.get(PRIMARY)!;
  const addOnRow = bySlug.get(ADD_ON)!;

  const primaryWalk = await walk(primaryRow.id);
  const addOnWalk = await walk(addOnRow.id);
  if (!primaryWalk.shortest) throw new Error(`${PRIMARY} has no path that reaches a price`);
  if (!addOnWalk.shortest) throw new Error(`${ADD_ON} has no path that reaches a price`);

  console.log(`  ${PRIMARY}: ${primaryWalk.paths} paths, ${primaryWalk.pricedCount} priced`);
  console.log(`    shortest priced path — ${primaryWalk.shortest.path.length} question(s), $${primaryWalk.shortest.priceCents / 100}`);
  for (const step of primaryWalk.shortest.path) console.log(`      ${step.questionKey.padEnd(28)} ${step.optionValue}`);
  console.log(`  ${ADD_ON}: ${addOnWalk.paths} paths, ${addOnWalk.pricedCount} priced`);
  console.log(`    standalone $${(addOnRow.basePrice ?? 0) / 100 || addOnRow.basePrice} · same-visit ${addOnRow.whileWeThereBasePrice}`);
  for (const step of addOnWalk.shortest.path) console.log(`      ${step.questionKey.padEnd(28)} ${step.optionValue}`);

  /**
   * The booking windows, generated the way the storefront generates them.
   *
   * Read through loadBusinessHours rather than off the row, because a
   * contractor with no BusinessHours row is not a contractor with no hours —
   * the loader falls back to DEFAULT_BUSINESS_HOURS, and that fallback is what
   * a homeowner would actually be offered today. Capturing the raw row instead
   * produced `null` here and would have left the hero inventing a calendar.
   */
  const hours = await loadBusinessHours(prisma as any, contractor.id);
  const windows = generateArrivalWindows(hours);
  console.log(`  windows: ${windows.map((w) => `${w.start}–${w.end}`).join(", ")}`);

  const snapshot = anonymize({
    generatedBy: "scripts/capture-hero-flow.ts",
    source: FROM,
    note:
      "Captured read-only from a live contractor catalog. Questions, order, answer labels, routing and prices are that contractor's; the identity shown is a demonstration one.",
    identity: {
      name: DEMO.name,
      shortName: DEMO.shortName,
      themeFamily: DEMO.themeFamily,
      themeVariant: DEMO.themeVariant,
      themeVersion: DEMO.themeVersion,
    },
    copy: { confirmAfterLook: pricingCopy(contractor.pricingStrategy).confirmAfterLookNotice },
    primary: {
      slug: primaryRow.slug,
      name: primaryRow.name,
      description: primaryRow.shortDescription,
      dto: await flowDto(PRIMARY),
      path: primaryWalk.shortest.path,
      priceCents: primaryWalk.shortest.priceCents,
      mayNotQualify: primaryWalk.mayNotQualify,
    },
    addOn: {
      slug: addOnRow.slug,
      name: addOnRow.name,
      description: addOnRow.shortDescription,
      dto: await flowDto(ADD_ON),
      path: addOnWalk.shortest.path,
      /** What it costs as its own visit, and added to one already happening. */
      standaloneCents: addOnRow.basePrice,
      sameVisitCents: addOnRow.whileWeThereBasePrice,
      mayNotQualify: addOnWalk.mayNotQualify,
    },
    totalCents: primaryWalk.shortest.priceCents + (addOnRow.whileWeThereBasePrice ?? 0),
    schedule: { hours, windows },
  });

  const body = `${JSON.stringify(snapshot, null, 2)} as const;\n`;
  const file =
    `/**\n * GENERATED — do not edit by hand.\n *\n` +
    ` * Written by scripts/capture-hero-flow.ts from a LIVE contractor catalog.\n` +
    ` * Every question, answer label, route and price below came out of the\n` +
    ` * pricing engine and the storefront's own flow API, not out of anyone's\n` +
    ` * head. The identity is a demonstration one; the economics are real.\n` +
    ` *\n * Regenerate:  npx tsx scripts/capture-hero-flow.ts\n` +
    ` * Check drift: npx tsx scripts/capture-hero-flow.ts --check\n */\n` +
    `export const HERO_FLOW = ${body}`;

  if (!checking) {
    writeFileSync(OUT, file);
    console.log(`\n  wrote ${OUT}\n`);
    await prisma.$disconnect();
    return;
  }

  /**
   * Drift check.
   *
   * Compares the live capture against the committed fixture and fails on any
   * difference in wording, order, routing or price — the homepage must never
   * become a polished animation of a Price2Book that no longer exists.
   */
  if (!existsSync(OUT)) {
    console.error(`  FAIL ${OUT} does not exist — run the capture\n`);
    process.exit(1);
  }
  const committed = (await import(pathToFileURL(`${process.cwd()}/${OUT}`).href)).HERO_FLOW;
  const differences = diff(committed, snapshot, "");
  if (!differences.length) {
    console.log(`\n  ok   the hero fixture still matches ${FROM}'s live route and pricing\n`);
    await prisma.$disconnect();
    return;
  }
  console.error(`\n  FAIL the hero fixture no longer matches ${FROM}:`);
  for (const d of differences.slice(0, 25)) console.error(`         ${d}`);
  if (differences.length > 25) console.error(`         …and ${differences.length - 25} more`);
  console.error(`\n       Re-capture with: npx tsx scripts/capture-hero-flow.ts`);
  console.error(`       Then LOOK at the hero — a changed question may change what the animation demonstrates.\n`);
  process.exit(1);
}

/** Every leaf that differs, named by path, so a failure says what moved. */
function diff(a: any, b: any, at: string): string[] {
  if (a === b) return [];
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") {
    return [`${at || "(root)"}: committed ${JSON.stringify(a)} — live ${JSON.stringify(b)}`];
  }
  const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])];
  return keys.flatMap((k) => diff(a[k], b[k], at ? `${at}.${k}` : k));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => {
    console.error(`\n  ${e.message}\n`);
    await prisma.$disconnect();
    process.exit(1);
  });
}
