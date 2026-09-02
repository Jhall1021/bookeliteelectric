/**
 * Trade enrolment, exercised through the writer the product actually uses.
 *
 *   npx tsx scripts/verify-trade-enrolment.ts
 *
 * THE DEFECT THIS GUARDS. The trade picker in Guided Setup posts
 * `{ "tradeKey": "electrical" }` to /api/admin/business-profile. The route
 * answered "Nothing to change" whenever no profile FIELD was sent, and only
 * then looked at `tradeKey` — so a new contractor could never enrol through
 * the real route. Every existing verifier missed it because each one wrote
 * ContractorTrade directly in the database instead of exercising the writer.
 *
 * So this file exercises the writer, at three levels:
 *
 *   1. the request reader — what a body MEANS, with no session needed
 *   2. the real route handler — does it stop before authorization, or not
 *   3. setTradeEnrolment against a throwaway contractor — enrol, re-enrol,
 *      refuse a typo, withdraw, and refuse to move once a catalog is installed
 *
 * and then holds the structure that keeps them the only path: the route
 * delegates to the shared writer, and the panel still posts to the route.
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";
import { readBusinessProfileRequest } from "../lib/businessProfileRequest";
import { setTradeEnrolment } from "../lib/tradeEnrolment";
import { availableTrades, preflight, templateVersionSource, installCatalog } from "../lib/templateProvisioning";
import { destroyContractor } from "./_throwaway";

const raw = new PrismaClient();

/**
 * RUN-UNIQUE, because the worktree and the database are shared. Same shape as
 * verify-launch-behavior, deliberately — copied, not reinvented. The prefix
 * stays fixed so a fixture from a crashed run is still sweepable.
 */
const PREFIX = "test-trade-enrolment";
const SLUG = `${PREFIX}-${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const STALE_AFTER_MS = 60 * 60 * 1000;

let fail = 0;
const ok = (l: string, c: boolean, d?: string) => { if (!c) fail++; console.log(`  ${c ? "✓" : "✗"} ${l}${c || !d ? "" : `  (${d})`}`); };
const strip = (f: string) =>
  readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

async function removeContractor(slug: string) {
  await raw.contractorPolicyValue.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorCategory.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await raw.contractorTrade.deleteMany({ where: { contractor: { slug } } }).catch(() => {});
  await destroyContractor(raw, slug).catch(() => {});
}

async function sweepStale() {
  const stale = await raw.contractor.findMany({
    where: { slug: { startsWith: PREFIX }, NOT: { slug: SLUG }, createdAt: { lt: new Date(Date.now() - STALE_AFTER_MS) } },
    select: { slug: true },
  });
  for (const c of stale) await removeContractor(c.slug);
  if (stale.length) console.log(`  (swept ${stale.length} abandoned fixture(s))`);
}

/**
 * Call the real handler with a body. Anything past the request reader runs
 * `withAdminRoute`, which needs a request scope this script does not have —
 * so the observable outcomes are exactly two: the route REFUSED THE BODY
 * before authorization (a 400 with the reader's message), or it went on to
 * authorize. The second is what "accepted as a change" looks like from here.
 */
async function handlerOutcome(body: unknown): Promise<{ status: number; error?: string } | "reached-authorization"> {
  const { PATCH } = await import("../app/api/admin/business-profile/route");
  try {
    const res = await PATCH(new Request("https://verify.local/api/admin/business-profile", {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    }));
    if (res.status === 400) return { status: 400, error: ((await res.json()) as { error?: string }).error };
    return "reached-authorization";
  } catch {
    return "reached-authorization";
  }
}

async function main() {
  console.log(`\nTRADE ENROLMENT — through the writer, not around it\n`);
  await removeContractor(SLUG);
  await sweepStale();

  // ── 1. what the body means ────────────────────────────────────────────
  const tradeOnly = readBusinessProfileRequest({ tradeKey: "electrical" });
  ok(`1. a trade-only body is a change, not "nothing to change"`,
    tradeOnly.ok && tradeOnly.tradeKey === "electrical" && Object.keys(tradeOnly.data).length === 0,
    tradeOnly.ok ? "" : tradeOnly.error);
  const empty = readBusinessProfileRequest({});
  ok(`   an empty body still is nothing to change`, !empty.ok && empty.error === "NOTHING_TO_CHANGE");
  const withdraw = readBusinessProfileRequest({ tradeKey: "" });
  ok(`   an empty trade withdraws the enrolment`, withdraw.ok && withdraw.tradeKey === null);
  const unsaid = readBusinessProfileRequest({ name: "Fresh" });
  ok(`   and a trade that is not mentioned is not touched`, unsaid.ok && unsaid.tradeKey === undefined && unsaid.data.name === "Fresh");
  const both = readBusinessProfileRequest({ name: "Fresh", tradeKey: "electrical" });
  ok(`   a profile field and a trade arrive together`, both.ok && both.tradeKey === "electrical" && both.data.name === "Fresh");
  const blankName = readBusinessProfileRequest({ name: "  ", tradeKey: "electrical" });
  ok(`   a blank name is still refused, trade or not`, !blankName.ok && blankName.error === "NAME_REQUIRED");

  // ── 2. the real route ─────────────────────────────────────────────────
  const routeTrade = await handlerOutcome({ tradeKey: "electrical" });
  ok(`2. the live handler carries a trade-only body to authorization`,
    routeTrade === "reached-authorization",
    routeTrade === "reached-authorization" ? "" : `${routeTrade.status} ${routeTrade.error}`);
  const routeEmpty = await handlerOutcome({});
  ok(`   and still turns an empty body away before it`,
    routeEmpty !== "reached-authorization" && routeEmpty.status === 400 && /nothing to change/i.test(routeEmpty.error ?? ""));

  // ── 3. the writer, against a contractor that exists ──────────────────
  const c = await raw.contractor.create({
    data: { slug: SLUG, name: "Trade enrolment probe", active: false },
    select: { id: true },
  });
  const trades = await availableTrades(raw);
  const rows = () => raw.contractorTrade.findMany({ where: { contractorId: c.id }, select: { tradeKey: true } });

  const enrol = await setTradeEnrolment(raw, c.id, "electrical");
  ok(`3. a new contractor enrols in a published trade`,
    enrol.ok && (await rows()).map((r) => r.tradeKey).join() === "electrical");
  const again = await setTradeEnrolment(raw, c.id, "electrical");
  ok(`   enrolling again is a no-op, not a duplicate`, again.ok && (await rows()).length === 1);

  const typo = await setTradeEnrolment(raw, c.id, "carpentry-typo");
  ok(`   a trade with no published catalog is refused`,
    !typo.ok && typo.code === "TRADE_NOT_AVAILABLE" && !trades.includes("carpentry-typo"));
  ok(`   and the refusal leaves the enrolment as it was`,
    (await rows()).map((r) => r.tradeKey).join() === "electrical");

  const other = trades.find((t) => t !== "electrical");
  if (other) {
    const swap = await setTradeEnrolment(raw, c.id, other);
    ok(`   before anything is installed, a swap to ${other} is free`,
      swap.ok && (await rows()).map((r) => r.tradeKey).join() === other);
    ok(`   and it is one enrolment, not two`, (await rows()).length === 1);
    await setTradeEnrolment(raw, c.id, "electrical");
  } else {
    console.log(`  (only one published trade — swap-before-install not exercised)`);
  }

  const withdrawn = await setTradeEnrolment(raw, c.id, null);
  ok(`   before anything is installed, withdrawing is free`, withdrawn.ok && (await rows()).length === 0);

  // Install the catalog the way Guided Setup does, then the enrolment is load-bearing.
  const reenrol = await setTradeEnrolment(raw, c.id, "electrical");
  if (!reenrol.ok) throw new Error(reenrol.code);
  const pre = await preflight(raw, c.id, templateVersionSource(raw, "electrical"));
  if (!pre.ok) throw new Error(pre.code);
  await installCatalog(raw, c.id, pre.catalog);

  const afterInstall = await setTradeEnrolment(raw, c.id, null);
  ok(`4. once the catalog is installed, withdrawing is refused`,
    !afterInstall.ok && afterInstall.code === "TRADE_HAS_PROVISIONED_SERVICES");
  if (other) {
    const swapAfter = await setTradeEnrolment(raw, c.id, other);
    ok(`   and so is a swap to ${other}`, !swapAfter.ok && swapAfter.code === "TRADE_HAS_PROVISIONED_SERVICES");
  }
  ok(`   the enrolment stands, untouched`, (await rows()).map((r) => r.tradeKey).join() === "electrical");
  const same = await setTradeEnrolment(raw, c.id, "electrical");
  ok(`   while re-stating the same trade stays a no-op`, same.ok);

  // ── 5. one writer, one route ──────────────────────────────────────────
  const route = strip("app/api/admin/business-profile/route.ts");
  ok(`5. the route reads the body through the shared reader`,
    /readBusinessProfileRequest\(/.test(route) && !/Nothing to change/.test(route));
  ok(`   and enrols through the shared writer, never its own`,
    /setTradeEnrolment\(/.test(route) && !/contractorTrade\.(create|upsert|delete|update)/.test(route));
  const others = ["app/api/admin/setup/progress/route.ts", "app/api/admin/setup/storefront/route.ts",
    "app/api/admin/setup/scheduling-authority/route.ts", "app/api/admin/setup/install-catalog/route.ts",
    "app/api/contractors/route.ts", "app/dashboard/setup/page.tsx"];
  const rogue = others.filter((f) => /contractorTrade\.(create|upsert|delete|update)/.test(strip(f)));
  ok(`   no other admin surface writes ContractorTrade`, rogue.length === 0, rogue.join(", "));
  const panel = strip("app/dashboard/setup/TradePanel.tsx");
  ok(`   the trade picker still posts { tradeKey } to that route`,
    /\/api\/admin\/business-profile/.test(panel) && /JSON\.stringify\(\{ tradeKey \}\)/.test(panel));

  await removeContractor(SLUG);
  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  Enrolment goes through the door the picker actually uses.\n`);
  await raw.$disconnect();
  if (fail) process.exit(1);
}
main().catch(async (e) => {
  console.error(e);
  await removeContractor(SLUG);
  await raw.$disconnect();
  process.exit(1);
});
