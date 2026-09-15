/**
 * The onboarding lifecycle through the REAL route layer, session and all.
 *
 * Every admin call below is an HTTP request carrying the session cookie a real
 * sign-up produced — account created at /sign-up, email confirmed from the
 * mail sink, exactly the committed browser-flow pattern. No minted session,
 * no bypassed guard, no handler imported directly. If a call below passes, it
 * crossed authentication, tenant resolution and the handler.
 *
 * The homeowner price is requested from /api/visit with the storefront's own
 * site header — the route a homeowner's browser actually hits.
 *
 *   PLATFORM_MAIL_SINK=<file> BETTER_AUTH_URL=http://localhost:3431 \
 *     npx tsx scripts/verify-onboarding-http-smoke.ts
 *   (needs the dev server on the SAME port with the SAME sink)
 *
 * NOT PART OF `npm run verify`. Needs a running server.
 */
import { chromium, type APIRequestContext } from "playwright";
import { PrismaClient } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { templateVersionSource, preflight, installCatalog } from "../lib/templateProvisioning";
import { teardownOnboardingFixture } from "./_onboardingFixtureTeardown";
import { SURFACE_RACEWAY_SYSTEM_KEY, POLICY_KEYS } from "../lib/electrical/surfaceSystemConfiguration";
import { SURFACE_ROLES } from "../lib/electrical/surfaceRacewayTakeoff";
import { PILOT_ANSWERS } from "../lib/electrical/onboardingPilotReadiness";

const prisma = new PrismaClient();
const BASE = process.env.BETTER_AUTH_URL ?? "http://localhost:3431";
const SINK = process.env.PLATFORM_MAIL_SINK ?? "";
const RUN = `${process.pid.toString(36)}${Date.now().toString(36).slice(-4)}`;
const SLUG = `rv2-http-smoke-${RUN}`;
const OTHER_SLUG = `rv2-http-smoke-other-${RUN}`;
const EMAIL = `p2b-rv2-http-smoke-${RUN}@resend.dev`;
const PASSWORD = `Smoke-${randomBytes(9).toString("base64url")}`;

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

async function verificationLinkFor(email: string): Promise<string | null> {
  let raw = "";
  try { raw = await readFile(SINK, "utf8"); } catch { return null; }
  const mine = raw.split("\n").filter(Boolean)
    .map((l) => { try { return JSON.parse(l) as { to: string; subject: string; text: string }; } catch { return null; } })
    .filter((m): m is { to: string; subject: string; text: string } => m !== null && m.to === email && /confirm/i.test(m.subject));
  return mine.at(-1)?.text.match(/https?:\/\/\S+/)?.[0] ?? null;
}

async function teardown() {
  // Reports failure. The earlier `.catch(() => {})` hid a RESTRICT-FK failure
  // and left contractors with labor behind.
  await teardownOnboardingFixture(prisma, SLUG);
  await teardownOnboardingFixture(prisma, OTHER_SLUG);
  const user = await prisma.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
  if (user) {
    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.account.deleteMany({ where: { userId: user.id } }).catch(() => {});
    await prisma.verification.deleteMany({ where: { identifier: { contains: EMAIL } } }).catch(() => {});
    await prisma.user.delete({ where: { id: user.id } }).catch(() => {});
  }
}

/** A contractor, installed through the real installer — the sanctioned fixture shape. */
async function provision(slug: string, name: string) {
  const c = await prisma.contractor.create({
    data: { slug, name, active: true, countryCode: "US", trade: "residential electrician" },
    select: { id: true } });
  const site = await prisma.contractorSite.create({
    data: { contractorId: c.id, hostedSlug: slug, publicId: `site_${randomBytes(16).toString("hex")}`, active: true },
    select: { publicId: true } });
  await prisma.contractorTrade.create({ data: { contractorId: c.id, tradeKey: "electrical" } });
  const pf = await preflight(prisma, c.id, templateVersionSource(prisma, "electrical"));
  if (!pf.ok) throw new Error(`preflight: ${pf.code} ${pf.message}`);
  await installCatalog(prisma, c.id, pf.catalog);
  return { id: c.id, sitePublicId: site.publicId };
}

async function main() {
  console.log(`\nONBOARDING — AUTHENTICATED HTTP SMOKE\n  ${BASE}  ·  sink ${SINK || "(unset)"}\n`);
  if (!SINK) throw new Error("PLATFORM_MAIL_SINK must match the running server");

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    const api: APIRequestContext = ctx.request;   // shares the browser's cookies

    console.log("  0  A REAL ACCOUNT, THROUGH THE REAL AUTH PIPELINE\n");
    await page.goto(`${BASE}/sign-up`);
    await page.locator("#name").fill("RV2 HTTP Smoke Owner");
    await page.locator("#email").fill(EMAIL);
    await page.locator("#password").fill(PASSWORD);
    await page.getByRole("button", { name: "Create account" }).click();
    await page.waitForSelector("h1:has-text('Confirm your email')", { timeout: 60000 });
    let link: string | null = null;
    for (let i = 0; i < 20 && !link; i++) { link = await verificationLinkFor(EMAIL); if (!link) await page.waitForTimeout(500); }
    ok(link !== null, "0  a confirmation email was really sent", `nothing for ${EMAIL} in ${SINK}`);
    if (!link) throw new Error("no verification link");
    await page.goto(link);
    const user = await prisma.user.findFirstOrThrow({ where: { email: EMAIL }, select: { id: true, emailVerified: true } });
    ok(user.emailVerified === true, "0  the account is verified by the real flow, not asserted");
    const cookies = await ctx.cookies(BASE);
    ok(cookies.some((c) => /session/i.test(c.name)), "0  the browser holds a real session cookie",
      cookies.map((c) => c.name).join(","));

    console.log("\n  1  A GENUINELY FRESH CONTRACTOR\n");
    const me = await provision(SLUG, "RV2 HTTP Smoke Electric (TEST)");
    const other = await provision(OTHER_SLUG, "RV2 HTTP Smoke Other Tenant (TEST)");
    await prisma.contractorMembership.create({ data: { userId: user.id, contractorId: me.id, role: "OWNER", active: true } });
    ok(await prisma.pricingSettings.count({ where: { contractorId: me.id } }) === 0, "1  no pricing settings");
    ok(await prisma.contractorComponent.count({ where: { contractorId: me.id } }) === 0, "1  no labor");
    ok(await prisma.contractorMaterial.count({ where: { contractorId: me.id } }) === 0, "1  no material rows");

    const get = async (path: string) => { const r = await api.get(`${BASE}${path}`); return { status: r.status(), json: await r.json().catch(() => null) }; };
    const send = async (method: "post" | "patch", path: string, data: unknown) => {
      const r = await api[method](`${BASE}${path}`, { data }); return { status: r.status(), json: await r.json().catch(() => null) }; };

    console.log("\n  2  READINESS OVER HTTP — RESUME FROM STATE\n");
    const r0 = await get("/api/admin/first-service");
    ok(r0.status === 200, "2  GET /api/admin/first-service -> 200 with a real session", `${r0.status} ${JSON.stringify(r0.json)}`);
    ok(r0.json?.resumeAt === "MATERIALS", "2  resume = MATERIALS", String(r0.json?.resumeAt));
    const serviceId = r0.json?.serviceId as string;

    console.log("\n  3  MATERIALS — READ, COST WRITE, SYSTEM WRITE\n");
    const mo = await get("/api/admin/materials-overview?usedBy=1");
    ok(mo.status === 200, "3  GET /api/admin/materials-overview -> 200", String(mo.status));
    const costs: [string, number, number, string][] = [
      [SURFACE_ROLES.channel, 1457, 5, "ft"], [SURFACE_ROLES.joint, 187, 1, "each"],
      [SURFACE_ROLES.insideElbow, 327, 1, "each"], [SURFACE_ROLES.outsideElbow, 327, 1, "each"],
      [SURFACE_ROLES.flatElbow, 317, 1, "each"], [SURFACE_ROLES.supportClip, 57, 1, "each"],
      [SURFACE_ROLES.transition, 447, 1, "each"], [SURFACE_ROLES.end, 207, 1, "each"],
      [SURFACE_ROLES.deviceBox, 647, 1, "each"],
      ["CONDUCTOR_THHN_12_UNGROUNDED", 8917, 500, "ft"], ["CONDUCTOR_THHN_12_GROUNDED", 8917, 500, "ft"],
      ["CONDUCTOR_THHN_12_EQUIPMENT_GROUND", 7417, 500, "ft"],
    ];
    let costOk = 0;
    for (const [roleKey, packagePriceCents, packageQuantity, packageUnit] of costs) {
      const r = await send("post", "/api/admin/materials", { action: "set-cost-by-role", roleKey, packagePriceCents, packageQuantity, packageUnit });
      if (r.status === 200) costOk++; else ok(false, `3  cost ${roleKey}`, `${r.status} ${JSON.stringify(r.json)}`);
    }
    ok(costOk === costs.length, `3  POST /api/admin/materials set-cost-by-role x${costs.length} -> 200`);
    const badCost = await send("post", "/api/admin/materials", { action: "set-cost-by-role", roleKey: SURFACE_ROLES.channel, packagePriceCents: 1457 });
    ok(badCost.status === 400, "3  a cost with no package basis is refused (400)", `${badCost.status}`);

    const sys = await send("post", "/api/admin/material-system", {
      systemKey: SURFACE_RACEWAY_SYSTEM_KEY, declaredSystemLabel: "Nonmetallic surface raceway",
      groundingStrategy: "SEPARATE_EQUIPMENT_GROUNDING_CONDUCTOR", supportSpacingFt: 5, supportAtEachTerminus: true,
      sourceTermination: "FITTING_REQUIRED", sourceTerminationRole: SURFACE_ROLES.transition, destinationTermination: "DIRECT_ENTRY" });
    ok(sys.status === 200, "3  POST /api/admin/material-system -> 200", `${sys.status} ${JSON.stringify(sys.json)}`);
    const badSys = await send("post", "/api/admin/material-system", { systemKey: SURFACE_RACEWAY_SYSTEM_KEY, supportSpacingFt: 0 });
    ok(badSys.status === 400, "3  a zero support interval is refused (400)", `${badSys.status}`);

    const spec = await send("patch", "/api/admin/policies", { key: POLICY_KEYS.conductorSpec, choice: "12" });
    ok(spec.status === 200, "3  PATCH /api/admin/policies conductor spec -> 200", `${spec.status} ${JSON.stringify(spec.json)}`);
    const badSpec = await send("patch", "/api/admin/policies", { key: POLICY_KEYS.conductorSpec, choice: "banana" });
    // A refusal is a 4xx with a reason. The first version accepted `>= 400`,
    // which let a 500 crash pass as "correctly refused".
    ok(badSpec.status >= 400 && badSpec.status < 500 && typeof badSpec.json?.error === "string",
      "3  a gauge not offered is refused with a reason (4xx, not a crash)", `${badSpec.status} ${JSON.stringify(badSpec.json)}`);
    const slack = await send("patch", "/api/admin/policies", { key: POLICY_KEYS.terminationSlack, measurement: 0.5 });
    ok(slack.status === 200, "3  PATCH /api/admin/policies slack measurement -> 200", `${slack.status} ${JSON.stringify(slack.json)}`);
    const slackRow = await prisma.contractorPolicyValue.findUniqueOrThrow({
      where: { contractorId_key: { contractorId: me.id, key: POLICY_KEYS.terminationSlack } },
      select: { measurement: true, choice: true } });
    ok(slackRow.measurement === 0.5 && slackRow.choice === null,
      "3  …stored as a MEASUREMENT, not as free text", JSON.stringify(slackRow));

    console.log("\n  4  PRODUCT SELECTION — AND A CROSS-TENANT REFUSAL\n");
    const myChannel = await prisma.contractorMaterial.findFirstOrThrow({
      where: { contractorId: me.id, canonicalMaterial: { key: SURFACE_ROLES.channel } }, select: { id: true } });
    // The product catalogue itself is not built (no supplier automation) —
    // so one linked product is a fixture. SELECTING it is the lifecycle under test.
    const myLink = await prisma.materialSupplierLink.create({ data: {
      contractorMaterialId: myChannel.id, supplier: "LOWES", supplierProductId: `smoke-${RUN}`,
      productName: "5 ft surface raceway channel (fixture)", categoryPath: [],
      packagePriceCents: 1457, packageQuantity: 5, packageUnit: "ft", canonicalUnit: "ft",
      derivedUnitCostMilliCents: 291400 }, select: { id: true } });
    const sel = await send("post", "/api/admin/material-product", { contractorMaterialId: myChannel.id, supplierLinkId: myLink.id });
    ok(sel.status === 200, "4  POST /api/admin/material-product (own link) -> 200", `${sel.status} ${JSON.stringify(sel.json)}`);

    await prisma.contractorMaterial.create({ data: {
      contractorId: other.id, canonicalMaterialId: (await prisma.canonicalMaterial.findUniqueOrThrow({ where: { key: SURFACE_ROLES.channel }, select: { id: true } })).id,
      unitCostCents: 1, packagePriceCents: 1, packageQuantity: 5, packageUnit: "ft" } });
    const theirChannel = await prisma.contractorMaterial.findFirstOrThrow({
      where: { contractorId: other.id, canonicalMaterial: { key: SURFACE_ROLES.channel } }, select: { id: true } });
    const theirLink = await prisma.materialSupplierLink.create({ data: {
      contractorMaterialId: theirChannel.id, supplier: "LOWES", supplierProductId: `smoke-other-${RUN}`,
      productName: "ANOTHER TENANT'S product", categoryPath: [],
      packagePriceCents: 1, packageQuantity: 5, packageUnit: "ft", canonicalUnit: "ft", derivedUnitCostMilliCents: 200 },
      select: { id: true } });
    const crossLink = await send("post", "/api/admin/material-product", { contractorMaterialId: myChannel.id, supplierLinkId: theirLink.id });
    ok(crossLink.status === 403, "4  selecting ANOTHER tenant's product for my material -> 403", `${crossLink.status} ${JSON.stringify(crossLink.json)}`);
    const crossMat = await send("post", "/api/admin/material-product", { contractorMaterialId: theirChannel.id, supplierLinkId: theirLink.id });
    ok(crossMat.status === 404, "4  touching ANOTHER tenant's material at all -> 404", `${crossMat.status} ${JSON.stringify(crossMat.json)}`);
    const stillMine = await prisma.contractorMaterial.findUniqueOrThrow({ where: { id: myChannel.id }, select: { activeSupplierLinkId: true } });
    ok(stillMine.activeSupplierLinkId === myLink.id, "4  …and my selection was not changed by either attempt");
    const theirs = await prisma.contractorMaterial.findUniqueOrThrow({ where: { id: theirChannel.id }, select: { activeSupplierLinkId: true } });
    ok(theirs.activeSupplierLinkId === null, "4  …nor was theirs");

    const r1 = await get("/api/admin/first-service");
    ok(r1.json?.resumeAt === "LABOR", "4  resume moved to LABOR over HTTP", String(r1.json?.resumeAt));

    console.log("\n  5  LABOR — THE CONTRACTOR'S OWN\n");
    const lab = await get("/api/admin/component-labor?keys=ELEC_ROUTE_SURFACE_MOUNTED,SURFACE_ROUTE_FT,OUTLET_EXTENSION_CORE,SURFACE_DEVICE_BOX_OUTLET");
    ok(lab.status === 200 && lab.json?.components?.every((c: { contractorLaborHours: unknown }) => c.contractorLaborHours === null),
      "5  GET /api/admin/component-labor -> 200, every value unset", `${lab.status}`);
    const labor: [string, number][] = [["ELEC_ROUTE_SURFACE_MOUNTED", 0], ["SURFACE_ROUTE_FT", 0.02], ["OUTLET_EXTENSION_CORE", 0.6], ["SURFACE_DEVICE_BOX_OUTLET", 0.2]];
    let labOk = 0;
    for (const [componentKey, hours] of labor) {
      const r = await send("post", "/api/admin/component-labor", { action: "set", componentKey, hours });
      if (r.status === 200) labOk++; else ok(false, `5  labor ${componentKey}`, `${r.status} ${JSON.stringify(r.json)}`);
    }
    ok(labOk === labor.length, `5  POST /api/admin/component-labor x${labor.length} -> 200`);
    const badLab = await send("post", "/api/admin/component-labor", { action: "set", componentKey: "SURFACE_ROUTE_FT", hours: -1 });
    ok(badLab.status === 400, "5  negative labor is refused (400)", `${badLab.status}`);

    console.log("\n  6  PRICING SETTINGS — ONE DECISION AT A TIME\n");
    for (const [field, value] of [["crewHourRateCents", 18500], ["primaryMinimumCents", 19500], ["roundingIncrementCents", 500], ["defaultPermitAdminCents", 0]] as const) {
      const r = await send("post", "/api/admin/pricing-settings-fields", { action: "set", field, value });
      ok(r.status === 200, `6  POST pricing-settings-fields ${field}=${value} -> 200`, `${r.status} ${JSON.stringify(r.json)}`);
    }
    const ps = await get("/api/admin/pricing-settings-fields");
    ok(ps.json?.complete === true, "6  GET pricing-settings-fields reports complete", JSON.stringify(ps.json));
    const permit = await prisma.pricingSettings.findUniqueOrThrow({ where: { contractorId: me.id }, select: { defaultPermitAdminCents: true } });
    ok(permit.defaultPermitAdminCents === 0, "6  the explicit zero persisted as 0");

    console.log("\n  7  PROPOSED PRICE AND APPROVAL OVER HTTP\n");
    const r2 = await get("/api/admin/first-service");
    ok(r2.json?.resumeAt === "APPROVE", "7  resume = APPROVE", `${r2.json?.resumeAt} ${JSON.stringify(r2.json?.proposed)}`);
    ok(JSON.stringify(r2.json).includes("basisToken") && !JSON.stringify(r2.json?.steps).includes("ingerprint"),
      "7  the approval token travels, but no step text mentions fingerprints");
    const appr = await send("post", "/api/admin/derived-pricing-approval", {
      action: "approve", serviceId,
      componentKeys: r2.json?.approvalRequest?.componentKeys, expectedFingerprint: r2.json?.approvalRequest?.basisToken });
    ok(appr.status === 200, "7  POST /api/admin/derived-pricing-approval -> 200", `${appr.status} ${JSON.stringify(appr.json)}`);
    const r3 = await get("/api/admin/first-service");
    const proposedCents = r3.json?.proposed?.totalCents as number | null;
    ok(typeof proposedCents === "number" && proposedCents > 0, `7  proposed price over HTTP = ${proposedCents}c`, JSON.stringify(r3.json?.proposed));
    ok(r3.json?.resumeAt === "ACTIVATE", "7  resume = ACTIVATE", String(r3.json?.resumeAt));
    const staleScreen = await send("post", "/api/admin/derived-pricing-approval", {
      action: "approve", serviceId, componentKeys: r2.json?.approvalRequest?.componentKeys, expectedFingerprint: "a-screen-left-open" });
    ok(staleScreen.status === 409, "7  approving from a stale screen -> 409", `${staleScreen.status}`);

    console.log("\n  8  ACTIVATION OVER HTTP — AND A CROSS-TENANT REFUSAL\n");
    const svcRow = await prisma.service.findUniqueOrThrow({ where: { id: serviceId }, select: { name: true } });
    const otherSvc = await prisma.service.findFirstOrThrow({ where: { contractorId: other.id, slug: "new-120v-outlet" }, select: { id: true, name: true } });
    const crossAct = await send("patch", `/api/admin/services/${otherSvc.id}`, { name: otherSvc.name, active: true });
    ok(crossAct.status === 404, "8  activating ANOTHER tenant's service -> 404", `${crossAct.status} ${JSON.stringify(crossAct.json)}`);
    const otherStill = await prisma.service.findUniqueOrThrow({ where: { id: otherSvc.id }, select: { active: true } });
    ok(otherStill.active === false, "8  …and it stayed inactive");
    const act = await send("patch", `/api/admin/services/${serviceId}`, { name: svcRow.name, active: true });
    ok(act.status === 200, "8  PATCH /api/admin/services/:id active -> 200", `${act.status} ${JSON.stringify(act.json)}`);
    const r4 = await get("/api/admin/first-service");
    ok(r4.json?.live === true && r4.json?.resumeAt === null, "8  readiness reports live, nothing outstanding", JSON.stringify({ live: r4.json?.live, resumeAt: r4.json?.resumeAt }));

    console.log("\n  9  THE HOMEOWNER ROUTE RETURNS THE PRICE\n");
    const homeowner = await browser.newContext();   // no admin cookie — a stranger
    const visit = await homeowner.request.post(`${BASE}/api/visit`, {
      headers: { "x-price2book-site": me.sitePublicId }, data: { serviceId, answersSnapshot: PILOT_ANSWERS } });
    const vj = await visit.json().catch(() => null);
    ok(visit.status() === 200, "9  POST /api/visit as a homeowner -> 200", `${visit.status()} ${JSON.stringify(vj)}`);
    const line = await prisma.lineItem.findFirst({ where: { serviceId }, orderBy: { id: "desc" },
      select: { computedPriceCents: true, resolvedEconomicBasis: true, resolvedMaterialCostCents: true } });
    ok(line?.computedPriceCents === proposedCents,
      `9  the booked line carries the approved price ${proposedCents}c`, JSON.stringify(line));
    ok(!!line?.resolvedEconomicBasis && line.resolvedMaterialCostCents === 38122,
      "9  …and records which economics produced it (basis + 38122c takeoff)", JSON.stringify(line));
    const bookedBefore = line?.computedPriceCents;

    console.log("\n  10 A COST CHANGES — FIXED PRICE WITHDRAWN, SERVICE STAYS LIVE\n");
    const raise = await send("post", "/api/admin/materials", { action: "set-cost-by-role", roleKey: SURFACE_ROLES.channel, packagePriceCents: 1699, packageQuantity: 5, packageUnit: "ft" });
    ok(raise.status === 200, "10 contractor raises the channel cost over HTTP", String(raise.status));
    const r5 = await get("/api/admin/first-service");
    ok(r5.json?.proposed?.refusal === "DERIVED_PRICING_APPROVAL_STALE", "10 readiness: price needs review", JSON.stringify(r5.json?.proposed));
    ok(r5.json?.active === true, "10 the service is still active");
    ok(typeof r5.json?.previouslyApprovedCents === "number", `10 previously approved price is available: ${r5.json?.previouslyApprovedCents}c`);
    const visit2 = await homeowner.request.post(`${BASE}/api/visit`, {
      headers: { "x-price2book-site": me.sitePublicId }, data: { serviceId, answersSnapshot: PILOT_ANSWERS } });
    const v2 = await visit2.json().catch(() => null);
    ok(visit2.status() === 409 && v2?.error === "REVIEW_REQUIRED", "10 homeowner route now returns REVIEW_REQUIRED, no fixed price",
      `${visit2.status()} ${JSON.stringify(v2)}`);
    const booked = await prisma.lineItem.findFirst({ where: { serviceId, computedPriceCents: { not: null } }, orderBy: { id: "asc" }, select: { computedPriceCents: true } });
    ok(booked?.computedPriceCents === bookedBefore, "10 the already-booked line keeps its price");

    console.log("\n  11 RE-APPROVE OVER HTTP, AND IT PRICES AGAIN\n");
    const again = await send("post", "/api/admin/derived-pricing-approval", {
      action: "approve", serviceId, componentKeys: r5.json?.approvalRequest?.componentKeys, expectedFingerprint: r5.json?.approvalRequest?.basisToken });
    ok(again.status === 200, "11 re-approval -> 200", String(again.status));
    const visit3 = await homeowner.request.post(`${BASE}/api/visit`, {
      headers: { "x-price2book-site": me.sitePublicId }, data: { serviceId, answersSnapshot: PILOT_ANSWERS } });
    ok(visit3.status() === 200, "11 homeowner route prices again", `${visit3.status()} ${JSON.stringify(await visit3.json().catch(() => null))}`);
    await homeowner.close();
  } finally {
    await browser.close();
    await teardown();
  }
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch(async (e) => { console.error(e); await teardown().catch((t) => console.error("TEARDOWN FAILED:", t)); await prisma.$disconnect(); process.exit(1); });
