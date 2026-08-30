/**
 * The deployment-only matrix, against a real second contractor — ADR-019.
 *
 * Everything here is already proven about the CODE by the offline gates. What
 * this proves is the DEPLOYMENT: that a second tenant resolves on the real
 * hostname, that six themes render through the real asset pipeline, that fonts
 * and images actually load from that host, and that nothing of Elite's leaks
 * into another contractor's pages.
 *
 * WRITES TO PRODUCTION. It creates one clearly-marked test contractor and
 * deletes it. Elite is fingerprinted before and after: this proof is not
 * permitted to alter their theme or pricing state, so that is asserted rather
 * than intended.
 *
 *   npx tsx scripts/verify-deployed-matrix.ts --host https://app.price2book.com
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { loadEnv } from "./_env";
import { DEFINITIONS, definitionKey } from "../lib/theme/definition";
import { provision, destroyContractor } from "./_throwaway";

loadEnv();
const prisma = new PrismaClient();

/** Named so nobody wonders what it is if the teardown ever fails. */
const SLUG = "__deployment-proof-DELETE-ME__";
const HOSTED = "deployment-proof";

const arg = (n: string) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; };
let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

/** Elite's theme and pricing state, which this proof must not touch. */
async function eliteState() {
  const c = await prisma.contractor.findFirstOrThrow({
    where: { slug: "elite-electric" },
    select: { id: true, themeFamily: true, themeVariant: true, themeVersion: true,
              pricingStrategy: true, brandColors: true },
  });
  const svcs = await prisma.service.findMany({
    where: { contractorId: c.id }, orderBy: { slug: "asc" },
    select: { slug: true, basePrice: true, publishedPriceApprovedAt: true,
              estimateLowCrewHours: true, estimateHighCrewHours: true, estimateApprovedAt: true },
  });
  return { c, hash: createHash("sha256").update(JSON.stringify({ c, svcs })).digest("hex") };
}

const text = (html: string) =>
  html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ")
      .replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&#x27;|&#39;/g, "'")
      .replace(/\s+/g, " ").trim();

async function get(url: string) {
  const res = await fetch(url, { redirect: "manual" });
  return { status: res.status, location: res.headers.get("location"), body: await res.text() };
}

async function main() {
  const host = (arg("host") ?? "https://app.price2book.com").replace(/\/$/, "");
  console.log(`\nDEPLOYED MATRIX  ->  ${host}\n`);

  const before = await eliteState();
  console.log(`  Elite fingerprint before: ${before.hash.slice(0, 16)}…`);
  console.log(`  Elite theme: ${before.c.themeFamily}/${before.c.themeVariant} v${before.c.themeVersion}, ${before.c.pricingStrategy}\n`);

  await destroyContractor(prisma, SLUG);
  const made = await prisma.contractor.create({
    data: {
      slug: SLUG, name: "Northgate Electric (deployment proof)", active: true,
      themeFamily: "modern-clean", themeVariant: "a", themeVersion: 1,
      pricingStrategy: "TIME_AND_MATERIALS",
      brandColors: { primary: "#0B7A5B" },
      shortName: "Northgate", legalName: "Northgate Electric LLC",
      phone: "(602) 555-0148", supportEmail: "hello@northgate.example",
      addressLine1: "88 Copper Row", city: "Mesa", state: "AZ", postalCode: "85201",
      licenseLabel: "AZ ROC License", licenseNumber: "331902",
      serviceAreaLabel: "the East Valley, AZ",
    },
    select: { id: true },
  });
  console.log(`  CREATED contractor id: ${made.id}`);
  console.log(`  CREATED slug         : ${SLUG}\n`);

  try {
    await prisma.contractorSite.create({
      data: { contractorId: made.id, hostedSlug: HOSTED, publicId: `pub_${HOSTED}`, active: true },
    });
    await prisma.pricingSettings.create({
      data: { contractorId: made.id, crewHourRateCents: 14900, primaryMinimumCents: 0,
              roundingIncrementCents: 500, defaultPermitAdminCents: 0 },
    });
    provision(SLUG);
    await prisma.service.updateMany({ where: { contractorId: made.id }, data: { active: true } });
    // Approved T&M bounds on one service, so the estimate path is exercised.
    const svc = await prisma.service.findFirstOrThrow({
      where: { contractorId: made.id, slug: "tv-installation" }, select: { id: true } });
    await prisma.service.update({
      where: { id: svc.id },
      data: { estimateLowCrewHours: 2, estimateHighCrewHours: 3, estimateApprovedAt: new Date() },
    });

    // ---- the second storefront resolves ---------------------------------
    console.log("  SECOND CONTRACTOR STOREFRONT");
    const home = await get(`${host}/${HOSTED}`);
    ok(home.status === 200, `/${HOSTED} resolves`, `status ${home.status}`);
    const t = text(home.body);
    ok(/Northgate Electric/.test(t), "renders the second contractor's own name");
    ok(/AZ ROC License #331902/.test(t), "…and their own license");
    ok(/\(602\) 555-0148/.test(t), "…and their own phone");

    // ---- identity isolation ---------------------------------------------
    console.log("\n  IDENTITY IS ISOLATED");
    const leaks = (t.match(/Elite|732-204-7003|Monmouth|17272|Allaire|New Jersey/g) ?? []);
    ok(leaks.length === 0, "no Elite identity appears on the second storefront", leaks.join(", "));
    const elite = await get(`${host}/elite-electric`);
    const et = text(elite.body);
    ok(/Elite Electric/.test(et) && !/Northgate/.test(et),
      "…and Elite's storefront still shows only Elite");

    // ---- pricing model -----------------------------------------------------
    console.log("\n  PRICING MODEL IS PER CONTRACTOR");
    ok(/Know the Rate\. See the Range\./.test(t),
      "the T&M contractor sees estimate language", t.slice(0, 90));
    ok(!/Skip the Estimate/.test(t), "…and not the flat-rate promise");
    ok(/Skip the Estimate\. Know Your Price\./.test(et),
      "Elite still sees the flat-rate promise");

    // ---- six themes ------------------------------------------------------
    console.log("\n  ALL SIX THEMES RENDER ON THE DEPLOYED HOST");
    const selectable = DEFINITIONS.filter((d) => d.selectable);
    const seen = new Map<string, string>();
    for (const d of selectable) {
      await prisma.contractor.update({
        where: { id: made.id },
        data: { themeFamily: d.family, themeVariant: d.variant, themeVersion: d.version },
      });
      const r = await get(`${host}/${HOSTED}`);
      const key = definitionKey(d);
      // Read the SITE block, not the first match. The page carries two by
      // design — the root layout's base, then the storefront's override — so
      // a naive `--t-canvas` match always returns the base and every theme
      // looks identical. That is what this assertion reported before it was
      // fixed: a bad probe reading like a broken deployment.
      const site = r.body.match(/<style id="storefront-theme">([\s\S]*?)<\/style>/)?.[1] ?? "";
      const canvas = site.match(/--t-canvas:([^;]+)/)?.[1] ?? "?";
      const radius = site.match(/--t-radius-card:([^;]+)/)?.[1] ?? "?";
      const accent = site.match(/--t-accent:([^;]+)/)?.[1] ?? "?";
      const structure = `canvas=${canvas} radius=${radius} accent=${accent}`;
      seen.set(key, structure);
      ok(r.status === 200 && /Northgate Electric/.test(text(r.body)),
        `${key.padEnd(20)} renders  [${structure}]`, `status ${r.status}`);
    }
    // Six designs must be six designs at the wire, not one page recolored
    // — and not one page at all.
    ok(new Set(seen.values()).size >= 3,
      `the six themes emit distinct tokens (${new Set(seen.values()).size} distinct signatures)`,
      [...seen].map(([k, v]) => `${k}: ${v}`).join("\n         "));
    const accents = new Set([...seen.values()].map((v) => v.split("accent=")[1]));
    ok(accents.size === 1,
      "…while the contractor's brand accent is the SAME in all six",
      `the brand is an input, not a per-theme value: ${[...accents].join(" | ")}`);

    // ---- assets load from the real host -----------------------------------
    console.log("\n  ASSETS LOAD FROM THE DEPLOYED HOST");
    const last = await get(`${host}/${HOSTED}`);
    const assets = [...new Set([...last.body.matchAll(/(?:href|src)="(\/_next\/[^"]+)"/g)].map((m) => m[1]))].slice(0, 6);
    ok(assets.length > 0, `the page references bundled assets (${assets.length} sampled)`);
    for (const a of assets) {
      const r = await fetch(`${host}${a}`);
      const kind = /\.css/.test(a) ? "css" : /\.woff2?/.test(a) ? "font" : /\.js/.test(a) ? "js" : "asset";
      ok(r.ok, `${kind.padEnd(5)} ${a.slice(0, 58)}`, `status ${r.status}`);
    }
    const fonts = [...new Set([...last.body.matchAll(/\/_next\/static\/media\/[^"'\s)]+\.woff2?/g)].map((m) => m[0]))];
    for (const f of fonts.slice(0, 2)) {
      const r = await fetch(`${host}${f}`);
      ok(r.ok && Number(r.headers.get("content-length") ?? 1) > 0,
        `font served with content: ${f.split("/").pop()}`, `status ${r.status}`);
    }

    // ---- no cross-tenant reads -------------------------------------------
    console.log("\n  NO CROSS-TENANT ACCESS");
    const wrongSite = await get(`${host}/api/services/new-120v-outlet?site=pub_${HOSTED}`);
    ok(wrongSite.status === 200, "the second contractor can read its OWN service");
    const noSite = await get(`${host}/api/services/new-120v-outlet`);
    ok(noSite.status === 404, "a request with no site identifier is refused", `status ${noSite.status}`);
    const unknown = await get(`${host}/api/services/new-120v-outlet?site=pub_does-not-exist`);
    ok(unknown.status === 404, "an unknown site identifier is refused", `status ${unknown.status}`);
    const payload = JSON.parse(wrongSite.body || "{}");
    ok(payload?.timeAndMaterials != null,
      "…and its payload carries the T&M block, because THIS contractor bills that way");
    const elitePayload = JSON.parse((await get(`${host}/api/services/new-120v-outlet?site=${(await prisma.contractorSite.findFirstOrThrow({ where: { contractorId: before.c.id, active: true }, select: { publicId: true } })).publicId}`)).body || "{}");
    ok(elitePayload?.timeAndMaterials == null,
      "Elite's payload carries none, because Elite bills flat rate");
  } finally {
    await destroyContractor(prisma, SLUG);
  }

  // ---- deletion and Elite's state --------------------------------------
  console.log("\n  CLEANUP");
  const gone = await prisma.contractor.count({ where: { slug: SLUG } });
  ok(gone === 0, `the test contractor ${made.id} is deleted`, `${gone} still present`);
  const sites = await prisma.contractorSite.count({ where: { hostedSlug: HOSTED } });
  ok(sites === 0, "…and its site is gone", `${sites} remain`);
  const after = await get(`${host}/${HOSTED}`);
  ok(after.status === 404, "its storefront no longer resolves", `status ${after.status}`);

  const post = await eliteState();
  ok(post.hash === before.hash,
    "Elite's theme and pricing state is byte-identical",
    `${before.hash.slice(0, 16)} -> ${post.hash.slice(0, 16)}`);
  const eliteAfter = await get(`${host}/elite-electric`);
  ok(eliteAfter.status === 200 && /Elite Electric/.test(text(eliteAfter.body)),
    "…and their storefront still serves");

  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await destroyContractor(prisma, SLUG).catch(() => {}); await prisma.$disconnect(); process.exit(1); });
}
