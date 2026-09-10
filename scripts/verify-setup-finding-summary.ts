/**
 * Dashboard finding copy — "live" and "before it can go live" must never
 * describe the same service at once.
 *
 * `activationRefusal` (lib/serviceActivation.ts) only ever gates the
 * transition INTO active; it never re-checks a service already live, so a
 * live service can genuinely pick up a blocker afterward (a labor input
 * cleared, a catalog edit breaks a route). The dashboard's "Your next
 * steps" card used to say "has N issues to resolve before it can go live"
 * for every multi-finding group, which was simply false for an active
 * service — the exact contradiction a screenshot caught: services and the
 * storefront badged "Live" while the same services were told they had
 * never launched. `Finding.serviceActive` exists so the copy can tell the
 * two states apart; this proves `groupHeadline` actually does.
 *
 *   npx tsx scripts/verify-setup-finding-summary.ts
 */
import { pathToFileURL } from "node:url";
import { groupHeadline, findingSummary } from "../lib/setupFindingSummary";
import type { Finding } from "../lib/onboardingReadiness";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

const finding = (over: Partial<Finding>): Finding => ({
  code: "TREE_HAS_DEAD_ROUTE", severity: "blocker", message: "replace-standard-outlet has 9 answer path(s) that reach nothing.",
  serviceSlug: "replace-standard-outlet", serviceName: "Replace Standard Outlet", serviceActive: false,
  href: "/dashboard/services", ...over,
});

function main() {
  console.log("\nDASHBOARD FINDING COPY — live and unlaunched are never the same sentence\n");

  const notYetLive = [
    finding({ serviceActive: false }),
    finding({ code: "LABOR_INPUTS_MISSING", serviceActive: false }),
  ];
  const notYetLiveText = groupHeadline(notYetLive);
  ok(/before it can go live/.test(notYetLiveText), "a service that has never activated is told it can't go live yet",
    `got "${notYetLiveText}"`);
  ok(!/is live/.test(notYetLiveText), "…and is not also called live", `got "${notYetLiveText}"`);

  const alreadyLive = [
    finding({ serviceActive: true }),
    finding({ code: "LABOR_INPUTS_MISSING", serviceActive: true }),
  ];
  const alreadyLiveText = groupHeadline(alreadyLive);
  ok(!/before it can go live/.test(alreadyLiveText), "an active service is never told it can't go live",
    `got "${alreadyLiveText}"`);
  ok(/is live/.test(alreadyLiveText) && /needs? attention/.test(alreadyLiveText),
    "…it is told it's live and needs attention instead", `got "${alreadyLiveText}"`);

  ok(alreadyLiveText.includes("Replace Standard Outlet"), "the headline names the real service, not its slug",
    `got "${alreadyLiveText}"`);

  console.log("\n  SINGLE-FINDING SUMMARIES NEVER NAME A RAW SLUG");
  const codes = [
    "TREE_HAS_DEAD_ROUTE", "HANDOFF_NOT_LIVE_YET", "PRICE_NOT_APPROVED", "LABOR_INPUTS_MISSING",
    "PRICE_DRIFTED", "SUGGESTED_NOT_APPROVED", "ESTIMATE_BOUNDS_MISSING", "ESTIMATE_BOUNDS_INVALID",
    "ESTIMATE_NOT_APPROVED", "TREE_UNBOUNDED", "MATERIAL_COST_ON_HOLD",
  ];
  for (const code of codes) {
    const summary = findingSummary(finding({ code, serviceActive: true }));
    ok(!summary.includes("replace-standard-outlet"), `${code} never shows the raw slug`, `got "${summary}"`);
    ok(summary.includes("Replace Standard Outlet"), `${code} names the real service`, `got "${summary}"`);
  }

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
