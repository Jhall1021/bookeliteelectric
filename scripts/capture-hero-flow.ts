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
/**
 * Services captured for their PRICE PAIR only, not their tree.
 *
 * The While We're There™ section needs a service that carries both prices so
 * it can show what "a second price you set" means. It used to show a captured
 * same-visit figure beside a standalone one that was written by hand, and the
 * invented number made the real one look wrong — the owner caught that the
 * same-visit price read as too high against it. Now both come from the
 * contractor's catalog, and the drift check covers them like everything else.
 */
const ALSO = (arg("also") ??
  // A ladder, not a list: the same-visit price is defended as "not a discount",
  // and the only way to prove that is to show services whose gap DIFFERS. These
  // span the labor range, shortest first, so the ratio can be read rising with
  // the hours. The first entry stays replace-gfci-outlet because the homepage's
  // While We're There™ section reads sameVisitExamples[0].
  "replace-gfci-outlet,replace-standard-outlet,usb-outlet-upgrade,dryer-receptacle-replacement,smart-outlet-upgrade,replace-ceiling-fan,bathroom-fan-light-combo"
).split(",").filter(Boolean);
const OUT = "components/marketing/heroFlow.ts";

type Chosen = { questionKey: string; prompt: string; helpText: string | null; optionValue: string; optionLabel: string };

async function main() {
  assertReadOnly();
  const checking = process.argv.includes("--check");
  /**
   * Read-only lookup, so choosing a marketing example is a question asked of
   * the catalog rather than guessed from a seed file. Prints both prices and
   * the ratio between them, because the ratio is what a reader judges.
   */
  const finding = arg("find");
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

  /**
   * The rates the captured prices were built from — read, never written.
   *
   * The marketing page has twice now run into a price whose RATIO looked
   * wrong, and the ratio is a consequence of these two numbers plus how much
   * of a job is trip versus labor. Printing them turns "the prices look off"
   * into a question that can be answered with the contractor's own inputs.
   */
  if (process.argv.includes("--rates")) {
    const ps = await prisma.pricingSettings.findUnique({ where: { contractorId: contractor.id } });
    console.log(`  ${FROM} pricing settings:\n`);
    for (const [k, v] of Object.entries(ps ?? {})) {
      if (typeof v === "number" && /Cents$/.test(k)) console.log(`  ${k.padEnd(34)} $${v / 100}`);
      else if (typeof v === "number" || typeof v === "boolean") console.log(`  ${k.padEnd(34)} ${v}`);
    }
    console.log();
    await prisma.$disconnect();
    return;
  }

  if (finding) {
    const rows = await prisma.service.findMany({
      where: { contractorId: contractor.id, active: true,
               name: { contains: finding, mode: "insensitive" } },
      select: { slug: true, name: true, basePrice: true, whileWeThereBasePrice: true,
                fieldLaborHours: true, estimatedMinutes: true },
      orderBy: { name: "asc" },
    });
    console.log(`  ${rows.length} active service(s) matching "${finding}" on ${FROM}\n`);
    for (const r of rows) {
      const pair = r.basePrice !== null && r.whileWeThereBasePrice !== null
        ? `$${r.basePrice / 100} alone · $${r.whileWeThereBasePrice / 100} same-visit ` +
          `(${Math.round((r.whileWeThereBasePrice / r.basePrice) * 100)}%)`
        : r.whileWeThereBasePrice === null ? "no same-visit price — cannot be offered alongside" : "no standalone price";
      const hrs = r.fieldLaborHours !== null && r.fieldLaborHours !== undefined ? `${r.fieldLaborHours}h crew` : `${r.estimatedMinutes}min`;
      console.log(`  ${r.slug.padEnd(30)} ${hrs.padEnd(10)} ${pair}`);
    }
    console.log();
    await prisma.$disconnect();
    return;
  }

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
    where: { contractorId: contractor.id, slug: { in: [PRIMARY, ADD_ON, ...ALSO] } },
    select: { id: true, slug: true, name: true, shortDescription: true, basePrice: true,
              whileWeThereBasePrice: true, active: true, estimatedMinutes: true,
              fieldLaborHours: true },
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
  const sameVisitExamples = ALSO.map((slug) => {
    const row = bySlug.get(slug);
    if (!row) throw new Error(`${FROM} has no service "${slug}"`);
    if (row.whileWeThereBasePrice === null || row.basePrice === null) {
      throw new Error(`${slug} does not carry both prices, so it cannot illustrate the pair`);
    }
    return {
      slug: row.slug, name: row.name,
      standaloneCents: row.basePrice, sameVisitCents: row.whileWeThereBasePrice,
      /** Why the gap differs. A short job is mostly trip; a long one is mostly work. */
      crewHours: row.fieldLaborHours,
    };
  });
  for (const e of sameVisitExamples) {
    const pct = Math.round((e.sameVisitCents / e.standaloneCents) * 100);
    console.log(`  ${e.slug}: $${e.standaloneCents / 100} alone, $${e.sameVisitCents / 100} same-visit (${pct}%)`);
  }

  /**
   * How much of the catalog can be offered this way at all.
   *
   * lib/sameVisit's first rule: a contractor may make the promise only if some
   * live service carries an add-on price, and a service without one can never
   * be demoted — it can only ever be the main job. So the page can say which
   * services qualify without claiming that all of them do.
   */
  const live = await prisma.service.findMany({
    where: { contractorId: contractor.id, active: true },
    select: { whileWeThereBasePrice: true },
  });
  const eligibility = {
    live: live.length,
    withSameVisitPrice: live.filter((s) => s.whileWeThereBasePrice !== null).length,
  };
  console.log(`  same-visit eligible: ${eligibility.withSameVisitPrice} of ${eligibility.live} live services`);

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
      /** What this job asks of the calendar, before anything is added to it. */
      estimatedMinutes: primaryRow.estimatedMinutes,
      path: primaryWalk.shortest.path,
      priceCents: primaryWalk.shortest.priceCents,
      mayNotQualify: primaryWalk.mayNotQualify,
    },
    addOn: {
      slug: addOnRow.slug,
      name: addOnRow.name,
      description: addOnRow.shortDescription,
      dto: await flowDto(ADD_ON),
      estimatedMinutes: addOnRow.estimatedMinutes,
      path: addOnWalk.shortest.path,
      /** What it costs as its own visit, and added to one already happening. */
      standaloneCents: addOnRow.basePrice,
      sameVisitCents: addOnRow.whileWeThereBasePrice,
      mayNotQualify: addOnWalk.mayNotQualify,
    },
    totalCents: primaryWalk.shortest.priceCents + (addOnRow.whileWeThereBasePrice ?? 0),
    /** Price pairs the marketing page uses to explain the mechanic. */
    sameVisitExamples,
    /** How much of a real catalog carries a same-visit price at all. */
    sameVisitEligibility: eligibility,
    schedule: {
      hours, windows,
      /**
       * The visit's total, summed the way app/[site]/checkout/schedule does:
       * every line item on the visit, primary and same-visit alike. Carried
       * here so the Online Booking page can show the arithmetic rather than
       * assert that it happens.
       */
      visitMinutes: (primaryRow.estimatedMinutes ?? 0) + (addOnRow.estimatedMinutes ?? 0),
    },
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
