/**
 * The hero must not advertise a routing model the product has retired.
 *
 * components/marketing/heroFlow.ts is a CAPTURE of real catalog data, not a
 * drawing — that is the whole point of scripts/capture-hero-flow.ts, and of
 * the rule that marketing claims about product state come from the product.
 * A capture is only worth that if it is re-taken when the product changes.
 *
 * New 120V Outlet is the hero's primary service and it has moved to Routing
 * V2. The V1 access-x-distance-band model is retired: `outlet_run_distance`
 * and its three supporting questions carry no options, and the four
 * `OUTLET_RUN_*` components are unreachable. A fixture still showing them is
 * showing a homeowner a decision the product no longer asks.
 *
 * This checks the SHIPPED fixture, not a freshly captured one. A verifier that
 * re-captured and then checked its own output would pass on a stale file.
 *
 * EXPECTED RED AS OF 11 SEP 2026, AND DELIBERATELY NOT IN `npm run verify`.
 *
 * The fixture cannot be re-captured yet. capture-hero-flow.ts requires a path
 * that reaches a PRICE -- the hero's claim is a homeowner walking a real
 * service to a real fixed number -- and every V2 outlet route ends in REVIEW
 * while the route components are unpriced. It fails closed and says so:
 * "new-120v-outlet has no path that reaches a price".
 *
 * The capture mechanism itself is healthy; pointed at a still-V1 primary it
 * produces a $260 walk in three priced paths. It is the OUTLET that cannot
 * price, on purpose, until component economics are approved in the Atomic
 * Labor Calibration phase.
 *
 * The fix is that re-capture, not an edit here and not approving a price to
 * make a marketing fixture regenerate. Until then this verifier names what the
 * homepage is still showing -- four retired questions and four retired
 * components -- so the staleness is recorded rather than forgotten.
 */
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import { eliteService } from "../prisma/_serviceTargets";
import { RETIRED_OUTLET_QUESTIONS, OUTLET_SLUG } from "../prisma/seed-new-outlet-v2";

const prisma = new PrismaClient();
const FIXTURE = "components/marketing/heroFlow.ts";
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const LEGACY_COMPONENT_PREFIX = "OUTLET_RUN_";

async function main() {
  console.log("\nHERO FIXTURE — NO RETIRED V1 OUTLET ROUTING\n");
  const src = readFileSync(FIXTURE, "utf8");

  console.log("  A  THE FIXTURE IS THE OUTLET FLOW\n");
  ok(new RegExp(`"slug":\\s*"${OUTLET_SLUG}"`).test(src),
    `A  the shipped hero still captures ${OUTLET_SLUG}`);

  console.log("\n  B  NO RETIRED QUESTION APPEARS\n");
  for (const key of RETIRED_OUTLET_QUESTIONS) {
    const n = (src.match(new RegExp(`"${key}"`, "g")) ?? []).length;
    ok(n === 0, `B  no "${key}" in the shipped hero`, `${n} occurrence(s)`);
  }

  console.log("\n  C  NO RETIRED COMPONENT APPEARS\n");
  const legacy = [...new Set(
    (src.match(new RegExp(`${LEGACY_COMPONENT_PREFIX}[A-Z0-9_]*`, "g")) ?? [])
  )];
  ok(legacy.length === 0,
    `C  no ${LEGACY_COMPONENT_PREFIX}* component in the shipped hero`, legacy.join(", "));

  console.log("\n  D  …AND THOSE REALLY ARE RETIRED IN THE LIVE CATALOG\n");
  // Source checks alone would pass against a fixture for a service that never
  // had these questions. Cross-checked so the assertion means what it says.
  const svc = await eliteService(prisma, OUTLET_SLUG);
  const retired = await prisma.question.findMany({
    where: { serviceId: svc.id, key: { in: [...RETIRED_OUTLET_QUESTIONS] } },
    select: { key: true, _count: { select: { options: true } } },
  });
  ok(retired.length === RETIRED_OUTLET_QUESTIONS.length,
    `D  all ${RETIRED_OUTLET_QUESTIONS.length} retired questions still EXIST on the live service`,
    retired.map((r) => r.key).join(", "));
  ok(retired.every((r) => r._count.options === 0),
    "D  and every one carries no options, so the hero cannot legitimately show them",
    retired.map((r) => `${r.key}=${r._count.options}`).join(", "));

  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
