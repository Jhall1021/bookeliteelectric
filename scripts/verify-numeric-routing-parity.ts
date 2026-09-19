/**
 * THE CLIENT AND THE SERVER MUST SELECT THE SAME OPTION FOR THE SAME ANSWER.
 *
 * Routing V2's numeric rule was proven once, on one side of a seam.
 * selectNumericOption enforced "exactly one range contains the answer, and
 * option order never decides" — 34 assertions — while the homeowner's browser
 * ran `question.options[0]` for every NUMBER question and the DTO carried no
 * range fields at all. So concealed_route_feet authored `within` (1–20) ahead
 * of `beyond` (21–300), and a customer typing 45 continued into the
 * wall-surface question on screen while resolveRoute sent that same answer to
 * Guided Estimate. Order decided the route, which is the one thing the
 * primitive forbids.
 *
 * WHY THIS ISN'T A TAUTOLOGY
 *
 * Both sides now call the same function, so calling it twice would prove
 * nothing. The failure mode is not a divergent rule, it is DIVERGENT INPUT:
 * strip numberAtLeast from the DTO and the browser's question has no numeric
 * predicates, selectNumericOption takes its legacy branch, and options[0]
 * comes back — silently, with no error anywhere.
 *
 * So this runs the rule against the REAL DTO, fetched through the REAL route
 * handler in-process, and against the resolution-shaped row from the database,
 * and requires them to name the same option. A dropped DTO field turns it red.
 */
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { loadServiceForResolution, loadPricingSettings, resolveRoute } from "../lib/routeResolver";
import { selectNumericOption } from "../lib/numericRouteRanges";
import { eliteService } from "../prisma/_serviceTargets";
import { FINISHED_KEYS } from "../prisma/_finishedWallModule";
import { OUTLET_V2_KEYS, OUTLET_SLUG } from "../prisma/seed-new-outlet-v2";

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

type NumQ = {
  key: string; numberAllowsDecimal?: boolean; numberMin: number | null; numberMax: number | null;
  options: readonly { value: string; numberAtLeast: number | null; numberAtMost: number | null; numberAtLeastExclusive?: boolean; photosBlockBooking?: boolean; routeAction?: string }[];
};
const name = (q: NumQ, n: string) => {
  const c = selectNumericOption(q, n);
  return c.kind === "option" ? `option:${c.option.value}` : `${c.kind}`;
};

async function main() {
  console.log("\nNUMERIC ROUTING — CLIENT/SERVER PARITY\n");

  const svc = await eliteService(prisma, OUTLET_SLUG);
  const site = await prisma.contractorSite.findFirstOrThrow({
    where: { contractorId: svc.contractorId }, select: { publicId: true } });

  // The exact payload the storefront hands its own components.
  const { GET } = await import("../app/api/services/[slug]/route");
  const res = await GET(
    new Request(`https://parity.local/api/services/${OUTLET_SLUG}`, {
      headers: { "x-price2book-site": site.publicId } }),
    { params: { slug: OUTLET_SLUG } });
  if (res.status !== 200) throw new Error(`/api/services/${OUTLET_SLUG} answered ${res.status}`);
  const dto = (await res.json()) as { questions: (NumQ & { inputType: string })[] };

  const loaded = await loadServiceForResolution(prisma, svc.id);
  if (!loaded) throw new Error("service not loadable");

  const KEY = FINISHED_KEYS.feet;
  const dtoQ = dto.questions.find((q) => q.key === KEY);
  const dbQ = (loaded.questions as unknown as NumQ[]).find((q) => q.key === KEY);
  if (!dtoQ || !dbQ) throw new Error(`${KEY} missing (dto=${!!dtoQ} db=${!!dbQ})`);

  console.log("  A  THE DTO ACTUALLY CARRIES THE AUTHORED CONTRACT\n");
  ok(dtoQ.numberMin === dbQ.numberMin && dtoQ.numberMax === dbQ.numberMax,
    `A  question bounds survive the wire (${dtoQ.numberMin}–${dtoQ.numberMax})`,
    `dto ${dtoQ.numberMin}–${dtoQ.numberMax} vs db ${dbQ.numberMin}–${dbQ.numberMax}`);
  ok(dtoQ.options.length === dbQ.options.length,
    `A  every option survives (${dtoQ.options.length})`);
  // PRESENT, not merely non-null. `undefined !== null` is true, so a field the
  // DTO stopped serving would have counted as "carries a predicate" here and
  // this check would have passed while the browser got nothing.
  const present = dtoQ.options.every(
    (o) => "numberAtLeast" in o && "numberAtMost" in o);
  ok(present, "A  every option OBJECT actually carries both predicate keys",
    JSON.stringify(dtoQ.options.map((o) => Object.keys(o).filter((k) => k.startsWith("number")))));
  ok("numberMin" in dtoQ && "numberMax" in dtoQ,
    "A  …and the question object carries both bound keys",
    JSON.stringify(Object.keys(dtoQ).filter((k) => k.startsWith("number"))));
  const ranged = dtoQ.options.filter((o) => o.numberAtLeast !== null || o.numberAtMost !== null);
  ok(ranged.length === dbQ.options.filter((o) => o.numberAtLeast !== null).length && ranged.length > 1,
    `A  ${ranged.length} options carry numeric predicates over the wire — WITHOUT these the ` +
    `client silently reverts to options[0]`,
    JSON.stringify(dtoQ.options.map((o) => [o.value, o.numberAtLeast, o.numberAtMost])));

  console.log("\n  B  SAME ANSWER, SAME OPTION, BOTH SIDES\n");
  // lower bound, interior, upper bound, next-range boundary, second interior,
  // question min, question max, below min, above max, non-integer.
  const CASES = ["1", "10", "20", "21", "45", "300", "0", "301", "18.5", "20.5", "20.0001", "__unknown__", "-5"];
  for (const n of CASES) {
    const client = name(dtoQ, n);
    const server = name(dbQ, n);
    ok(client === server, `B  ${n.padStart(5)} -> ${client}`, `client ${client} vs server ${server}`);
  }

  console.log("\n  C  THE DEFECT ITSELF, NAMED\n");
  ok(dtoQ.options[0].value === "within",
    "C  options[0] really is `within` — order would have chosen it", dtoQ.options[0].value);
  for (const [n, expect] of [["19.625", "within"], ["20", "within"], ["20.5", "beyond"], ["21", "beyond"], ["45", "beyond"]] as const) {
    ok(name(dtoQ, n) === `option:${expect}`,
      `C  ${n} ft selects \`${expect}\` on the CLIENT`, name(dtoQ, n));
  }
  ok(name(dtoQ, "45") !== `option:${dtoQ.options[0].value}`,
    "C  …and 45 ft is NOT options[0] — the old behaviour is gone");

  console.log("\n  D  END TO END THROUGH THE REAL RESOLVER\n");
  // OWN THE FIXTURE. Whether 20 ft builds a recipe also depends on the
  // restoration capability being declared, and another suite leaves that state
  // behind. Set it here and put it back, so a green D means the numeric routing
  // worked rather than that a previous run happened to leave a row lying around.
  const CAPS = ["BASEBOARD_ACCESS_REINSTALL", "DRYWALL_ACCESS_CUTTING"];
  const before = await prisma.contractorCapability.findMany({
    where: { contractorId: svc.contractorId, key: { in: CAPS } },
    select: { key: true, revokedAt: true } });
  await prisma.contractorCapability.deleteMany({
    where: { contractorId: svc.contractorId, key: { in: CAPS } } });
  for (const k of CAPS) {
    await prisma.contractorCapability.create({ data: { contractorId: svc.contractorId, key: k } });
  }
  const restoreCaps = async () => {
    await prisma.contractorCapability.deleteMany({
      where: { contractorId: svc.contractorId, key: { in: CAPS } } });
    for (const b of before) {
      await prisma.contractorCapability.create({
        data: { contractorId: svc.contractorId, key: b.key, revokedAt: b.revokedAt } });
    }
  };

  const loadedForD = await loadServiceForResolution(prisma, svc.id);
  if (!loadedForD) throw new Error("service not loadable");
  const settings = await loadPricingSettings(prisma, loaded.contractorId ?? "");
  const wall = (ft: string) => ({
    outlet_load_type: "everyday", outlet_power_source: "tap_existing",
    below_above_access: "no_access", [OUTLET_V2_KEYS.method]: "concealed",
    [FINISHED_KEYS.backToBack]: "no", [FINISHED_KEYS.feet]: ft,
    [FINISHED_KEYS.surface]: "drywall", [FINISHED_KEYS.obstacles]: "clear",
    [FINISHED_KEYS.method]: "drywall_access",
  });
  for (const [ft, shouldBuild] of [["20", true], ["21", false], ["45", false]] as const) {
    const r = resolveRoute(loadedForD, wall(ft), true, settings);
    /* eslint-disable @typescript-eslint/no-explicit-any */
    const built = ((r as any)?.config?.components ?? []).length > 0;
    const clientPicked = name(dtoQ, ft);
    ok(built === shouldBuild,
      `D  ${ft} ft -> server ${shouldBuild ? "continues into the recipe" : "stops at review"} ` +
      `(client picked ${clientPicked})`, `${r.status} built=${built}`);
  }
  const r45 = resolveRoute(loadedForD, wall("45"), true, settings);
  ok(r45.status === "REVIEW",
    "D  45 ft is REVIEW on the server — and the client no longer walks past it", String(r45.status));

  await restoreCaps();
  const left = await prisma.contractorCapability.count({
    where: { contractorId: svc.contractorId, key: { in: CAPS } } });
  ok(left === before.length, "D  the capability fixture is put back exactly as found",
    `${left} rows vs ${before.length} before`);

  console.log("\n  E  ORDER STILL DOES NOT DECIDE\n");
  const reversed: NumQ = { ...dtoQ, options: [...dtoQ.options].reverse() };
  const drift = CASES.filter((n) => name(dtoQ, n) !== name(reversed, n));
  ok(drift.length === 0,
    "E  reversing the DTO's option order changes NOTHING for any case",
    drift.map((n) => `${n}: ${name(dtoQ, n)} vs ${name(reversed, n)}`).join(", "));

  console.log("\n  F  THE CLIENT COMPONENT USES THE RULE, NOT THE FIRST OPTION\n");
  const src = readFileSync("components/guided-flow/QuestionStep.tsx", "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
  ok(/selectNumericOption\(/.test(code), "F  QuestionStep calls selectNumericOption");
  ok(!/inputType === "NUMBER"[\s\S]{0,80}options\[0\]/.test(code),
    "F  …and no NUMBER path reaches for options[0]");
  const route = code.match(/const route =[\s\S]*?;/)?.[0] ?? "";
  ok(/NUMBER/.test(route) && /choice/.test(route),
    "F  the selected option is chosen by the rule", route.replace(/\s+/g, " ").slice(0, 120));
  const api = readFileSync("app/api/services/[slug]/route.ts", "utf8");
  ok(/numberMin: q\.numberMin/.test(api) && /numberAtLeast: o\.numberAtLeast/.test(api),
    "F  the API route serves the authored numeric contract");

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
