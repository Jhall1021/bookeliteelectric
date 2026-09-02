/**
 * The troubleshooting route contract.
 *
 *   npx tsx scripts/verify-troubleshooting-route.ts
 *
 * `REROUTE_TROUBLESHOOTING` is TERMINAL and names a ROLE, not a service id.
 * `REROUTE_SERVICE` names a specific service and is invalid without one.
 * Those are different rules, and the resolver used to apply the second to
 * both — which marked 47 of the commonest answers a homeowner gives INVALID
 * on the server while the storefront happily showed them the hand-off.
 *
 * The storefront looking correct was not evidence the route contract was
 * correct. This file is that evidence, and it is permanent: it runs in the
 * deploy gate so the two implementations cannot drift apart again.
 */

import { PrismaClient } from "@prisma/client";
import {
  loadServiceForResolution,
  loadPricingSettings,
  resolveRoute,
} from "../lib/routeResolver";
import { findTroubleshootingService } from "../lib/troubleshooting";

const prisma = new PrismaClient();

let fail = 0;
function ok(label: string, condition: boolean, detail?: string) {
  if (!condition) fail++;
  console.log(`  ${condition ? "✓" : "✗"} ${label}${condition || !detail ? "" : `  (${detail})`}`);
}

/** Walk a tree to the first path that uses the given answer option. */
function answersReaching(
  svc: any,
  predicate: (o: any) => boolean
): Record<string, string>[] {
  const byId = new Map(svc.questions.map((q: any) => [q.id, q]));
  const nk = (o: any): string | null =>
    o.routeAction === "CONTINUE" && o.nextQuestionId
      ? (byId.get(o.nextQuestionId) as any)?.key ?? null
      : null;
  const found: Record<string, string>[] = [];
  const walk = (k: string | null, ans: Record<string, string>) => {
    if (found.length > 400 || !k) return;
    const q: any = svc.questions.find((x: any) => x.key === k);
    if (!q) return;
    for (const o of q.options) {
      const next = { ...ans, [q.key]: o.value };
      if (predicate(o)) found.push(next);
      else walk(nk(o), next);
    }
  };
  walk(svc.questions[0]?.key ?? null, {});
  return found;
}

async function main() {
  console.log(`\nTROUBLESHOOTING ROUTE CONTRACT\n`);

  const elite = await prisma.contractor.findUniqueOrThrow({
    where: { slug: "elite-electric" },
    select: { id: true },
  });
  const settings = await loadPricingSettings(prisma as any, elite.id);
  const diagnostic = await findTroubleshootingService(prisma as any, elite.id, "electrical");
  if (!diagnostic.ok) {
    console.error(`  Elite has no resolvable diagnostic service: ${diagnostic.problem}\n`);
    process.exit(1);
  }

  // ── 1. every live REROUTE_TROUBLESHOOTING answer resolves ────────────────
  const rows = await prisma.answerOption.findMany({
    where: {
      routeAction: "REROUTE_TROUBLESHOOTING",
      question: { service: { contractorId: elite.id, active: true } },
    },
    select: { id: true, question: { select: { service: { select: { id: true, slug: true } } } } },
  });
  const serviceIds = [...new Set(rows.map((r) => r.question.service.id))];

  let resolvedCount = 0;
  let badTarget = 0;
  const unreachable: string[] = [];
  for (const sid of serviceIds) {
    const svc = await loadServiceForResolution(prisma as any, sid);
    if (!svc) continue;
    const paths = answersReaching(svc, (o) => o.routeAction === "REROUTE_TROUBLESHOOTING");
    if (paths.length === 0) unreachable.push(svc.slug);
    for (const ans of paths) {
      const r: any = resolveRoute(svc as any, ans, true, settings!);
      if (r.status === "REROUTE" && r.via === "TROUBLESHOOTING") {
        resolvedCount++;
        if (r.targetServiceId !== diagnostic.service.id) badTarget++;
      }
    }
  }
  console.log(`  1. every live troubleshooting answer resolves`);
  ok(
    `all ${rows.length} REROUTE_TROUBLESHOOTING options resolve (${resolvedCount} routes over ${serviceIds.length} services)`,
    resolvedCount >= rows.length && unreachable.length === 0,
    unreachable.length ? `unreachable in ${unreachable.join(", ")}` : `${resolvedCount} < ${rows.length}`
  );
  ok(`every one lands on Elite's own diagnostic`, badTarget === 0, `${badTarget} wrong target`);

  // ── 2/3. the two positive controls, on a synthetic tree ──────────────────
  //
  // Built in memory rather than in the database: the point is the RULE, and a
  // rule proved against a row somebody can delete is proved against nothing.
  console.log(`\n  2/3. the two actions have different rules`);
  const base = await loadServiceForResolution(
    prisma as any,
    (await prisma.service.findFirstOrThrow({
      where: { contractorId: elite.id, slug: "replace-standard-outlet" },
      select: { id: true },
    })).id
  );

  function treeWith(action: string, rerouteServiceId: string | null, troubleshootingId: string | null) {
    return {
      ...(base as any),
      troubleshootingServiceId: troubleshootingId,
      troubleshootingProblem: troubleshootingId ? null : "no active TROUBLESHOOT_ONLY service for this contractor",
      questions: [
        {
          id: "q1", key: "only", inputType: "SELECT", order: 0,
          options: [
            {
              id: "o1", value: "go", label: "Go", order: 0,
              routeAction: action, rerouteServiceId,
              nextQuestionId: null, priceModifierCents: null, priceModifierPercent: null,
              addedCrewHours: null, techCountOverride: null, accessClass: null,
              components: [], photoGroups: [], conditionalDisclaimers: [],
              requiredPhotoLabels: [], photoSafetyNotes: [], photosBlockBooking: true,
              disclaimer: null, settles: false,
            },
          ],
        },
      ],
    };
  }

  const plainNoTarget: any = resolveRoute(treeWith("REROUTE_SERVICE", null, diagnostic.service.id) as any, { only: "go" }, true, settings!);
  ok(
    `REROUTE_SERVICE without a target is INVALID`,
    plainNoTarget.status === "INVALID",
    `got ${plainNoTarget.status}`
  );

  const tsNoTarget: any = resolveRoute(treeWith("REROUTE_TROUBLESHOOTING", null, diagnostic.service.id) as any, { only: "go" }, true, settings!);
  ok(
    `REROUTE_TROUBLESHOOTING without a target SUCCEEDS`,
    tsNoTarget.status === "REROUTE" && tsNoTarget.via === "TROUBLESHOOTING",
    `got ${tsNoTarget.status}${tsNoTarget.reason ? ": " + tsNoTarget.reason : ""}`
  );
  ok(
    `  ...and lands on the contractor's diagnostic`,
    tsNoTarget.targetServiceId === diagnostic.service.id
  );

  // ── 4. missing diagnostic fails closed ──────────────────────────────────
  console.log(`\n  4. a contractor with no diagnostic fails closed`);
  const missing: any = resolveRoute(treeWith("REROUTE_TROUBLESHOOTING", null, null) as any, { only: "go" }, true, settings!);
  ok(`no diagnostic service -> INVALID, not a guess`, missing.status === "INVALID", `got ${missing.status}`);
  ok(`  ...and says why`, /TROUBLESHOOT_ONLY|diagnostic/.test(String(missing.reason ?? "")), String(missing.reason));

  // A REAL contractor with no diagnostic, through the real lookup.
  const throwaway = await prisma.contractor.create({
    data: { slug: `ts-probe-${Date.now()}`, name: "Troubleshooting Probe" },
    select: { id: true, slug: true },
  });
  try {
    const none = await findTroubleshootingService(prisma as any, throwaway.id, "electrical");
    ok(`a real contractor with no diagnostic resolves to a refusal`, none.ok === false, JSON.stringify(none));

    // ── 5. cross-tenant ──────────────────────────────────────────────────
    console.log(`\n  5. cross-tenant`);
    ok(
      `contractor B does NOT inherit Elite's diagnostic`,
      none.ok === false || (none as any).service?.id !== diagnostic.service.id,
      `probe resolved to ${JSON.stringify(none)}`
    );
    const eliteAgain = await findTroubleshootingService(prisma as any, elite.id, "electrical");
    ok(
      `Elite still resolves to its own`,
      eliteAgain.ok === true && eliteAgain.service.id === diagnostic.service.id
    );
  } finally {
    if (!throwaway.slug.startsWith("ts-probe-")) {
      throw new Error("refusing to delete a contractor this probe did not create");
    }
    await prisma.contractor.delete({ where: { id: throwaway.id } });
  }

  // ── 6. storefront and /api/visit agree ──────────────────────────────────
  //
  // Both sides answer "where does this go?" — the storefront through
  // /api/troubleshooting, the server through loadServiceForResolution. Both
  // call findTroubleshootingService, and this asserts they return the same id
  // rather than trusting that they share a function.
  console.log(`\n  6. storefront and /api/visit produce the same destination`);
  const storefrontAnswer = await findTroubleshootingService(prisma as any, elite.id, "electrical");
  const oneService = await loadServiceForResolution(prisma as any, serviceIds[0]);
  const serverPaths = answersReaching(oneService as any, (o) => o.routeAction === "REROUTE_TROUBLESHOOTING");
  const serverAnswer: any = resolveRoute(oneService as any, serverPaths[0], true, settings!);
  ok(
    `same destination service id from the same answers`,
    storefrontAnswer.ok && serverAnswer.status === "REROUTE" &&
      serverAnswer.targetServiceId === storefrontAnswer.service.id,
    `storefront ${storefrontAnswer.ok ? storefrontAnswer.service.id : "refused"} vs server ${serverAnswer.targetServiceId}`
  );
  ok(
    `the destination is bookable (it has a published price)`,
    storefrontAnswer.ok && storefrontAnswer.service.basePrice !== null,
    `basePrice ${storefrontAnswer.ok ? storefrontAnswer.service.basePrice : "n/a"}`
  );

  console.log();
  if (fail) {
    console.log(`  ${fail} check(s) failed.\n`);
    process.exit(1);
  }
  console.log(`  The two implementations agree, and disagreeing is now a failing build.\n`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
