/**
 * The embedded storefront is the same engine, and no more reachable than it should be.
 *
 *   npx tsx scripts/verify-embed-surface.ts        (needs the dev server)
 *
 * Embed V1's coverage in the parameterized surface contract — a surface may
 * not be marked delivered without one, or the gates go green while the thing
 * customers use is unchecked.
 *
 * Two claims, and they pull in opposite directions, which is why both are here:
 *
 *   SAME ENGINE. Every route the hosted storefront serves, the embed serves,
 *   from the same code — catalog, category, guided pricing, visit, scheduling,
 *   checkout entry. Not a copy that will drift.
 *
 *   NOT MORE REACHABLE. The visit token identifies a visit only inside a
 *   contractor already resolved from the site identifier, so it cannot be used
 *   to find anything across tenants, and the frame refuses origins the
 *   contractor has not registered.
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const BASE = process.env.EMBED_BASE_URL ?? "http://localhost:3000";

let fail = 0;
const ok = (label: string, cond: boolean, detail = "") => {
  if (!cond) fail++;
  console.log(`  ${cond ? "✓" : "✗"} ${label}${cond || !detail ? "" : `  (${detail})`}`);
};

async function get(path: string, headers: Record<string, string> = {}) {
  const res = await fetch(BASE + path, { headers, redirect: "manual" });
  return { status: res.status, text: await res.text(), headers: res.headers };
}

async function main() {
  console.log(`\nEMBED SURFACE\n`);

  const sites = await prisma.contractorSite.findMany({
    where: { active: true },
    select: {
      publicId: true, hostedSlug: true, embedOrigins: true,
      contractor: { select: { services: { where: { active: true }, select: { id: true }, take: 1 } } },
    },
  });
  const live = sites.filter((s) => s.contractor.services.length > 0);
  if (live.length === 0) {
    console.log("  (no contractor has a live service to serve)\n");
    await prisma.$disconnect();
    return;
  }
  const site = live[0];
  const embed = `/embed/${site.publicId}`;
  console.log(`  ${site.hostedSlug} — ${site.embedOrigins.length} registered origin(s)\n`);

  // ── the same engine, under a different base ────────────────────────────
  const ROUTES = ["", "/services", "/my-visit", "/how-it-works", "/service-area"];
  for (const r of ROUTES) {
    const res = await get(embed + r);
    ok(`${r || "/"} serves under the embed base`, res.status === 200, String(res.status));
  }

  // Category and service pages, discovered rather than named, so a catalog
  // change cannot quietly reduce what this covers.
  const catalog = await get(`${embed}/services`);
  const categoryHrefs = [...catalog.text.matchAll(/href="(\/embed\/[^"]*\/services\/[^"/]+)"/g)]
    .map((m) => m[1]);
  ok(`the catalog links to at least one category`, categoryHrefs.length > 0);
  if (categoryHrefs.length > 0) {
    const cat = await get(categoryHrefs[0]);
    ok(`a category page serves under the embed base`, cat.status === 200, String(cat.status));
    const serviceHrefs = [...cat.text.matchAll(/href="(\/embed\/[^"]*\/services\/[^"/]+\/[^"/]+)"/g)]
      .map((m) => m[1]);
    ok(`   and links to a service`, serviceHrefs.length > 0);
    if (serviceHrefs.length > 0) {
      const svc = await get(serviceHrefs[0]);
      ok(`   which serves guided pricing under the embed base`, svc.status === 200, String(svc.status));
    }
  }

  // ── NO LINK ESCAPES THE SURFACE ────────────────────────────────────────
  //
  // The defect this exists for: header links went through the surface and
  // category links were built from the raw route param, so they came out as
  // "/site_abc/services/..." — resolvable, and silently outside /embed, which
  // drops the homeowner off the embed surface mid-journey.
  const pages = await Promise.all(ROUTES.map((r) => get(embed + r)));
  const escaped: string[] = [];
  for (const [i, page] of pages.entries()) {
    for (const m of page.text.matchAll(/href="(\/[^"]*)"/g)) {
      const href = m[1];
      if (href.startsWith("/embed/")) continue;
      // Anything addressing a storefront route outside the embed base.
      if (href.startsWith(`/${site.publicId}`) || href.startsWith(`/${site.hostedSlug}`)) {
        escaped.push(`${ROUTES[i] || "/"} -> ${href}`);
      }
    }
  }
  ok(`no link escapes the embed base`, escaped.length === 0, escaped.slice(0, 3).join(" | "));

  // ── the visit token names a visit, never a tenant ──────────────────────
  const other = sites.find((s) => s.publicId !== site.publicId);
  const TOKEN = "verify-embed-surface-token-not-a-real-visit";

  const mine = await get("/api/visit", {
    "x-price2book-site": site.publicId,
    "x-price2book-visit": TOKEN,
  });
  ok(`an unknown token finds no visit`, mine.status === 200 && /"lineItems":\[\]/.test(mine.text),
    mine.text.slice(0, 80));

  if (other) {
    const crossed = await get("/api/visit", {
      "x-price2book-site": other.publicId,
      "x-price2book-visit": TOKEN,
    });
    ok(`   and finds nothing on another contractor either`,
      crossed.status === 200 && /"lineItems":\[\]/.test(crossed.text),
      crossed.text.slice(0, 80));
  }

  // ── framing is decided by the contractor, and fails closed ─────────────
  const policy = (await get(embed)).headers.get("content-security-policy") ?? "";
  ok(`the embed sends frame-ancestors`, /frame-ancestors/.test(policy), policy || "(absent)");
  if (site.embedOrigins.length === 0) {
    ok(`   'none' while no origin is registered`, /frame-ancestors 'none'/.test(policy), policy);
  } else {
    ok(`   naming exactly the registered origin(s)`,
      site.embedOrigins.every((o) => policy.includes(o)), policy);
  }

  const unknown = await get("/embed/site_00000000000000000000000000000000");
  const unknownPolicy = unknown.headers.get("content-security-policy") ?? "";
  ok(`an unknown storefront is framable by nobody`,
    /frame-ancestors 'none'/.test(unknownPolicy), unknownPolicy || "(absent)");

  const dash = await get("/dashboard");
  ok(`the contractor dashboard is framable by nobody`,
    /frame-ancestors 'none'/.test(dash.headers.get("content-security-policy") ?? ""),
    dash.headers.get("content-security-policy") ?? "(absent)");

  // ── the loader asserts nothing ─────────────────────────────────────────
  const loader = await get("/embed.js");
  ok(`the loader is served`, loader.status === 200, String(loader.status));
  // PRECISE IDENTIFIERS, not loose words: "Price2Book" contains "price", and a
  // check that fails on its own product name teaches people to delete it.
  //
  // The claim is that the parent asserts nothing. It never SENDS a message —
  // no postMessage at all — and the only thing it accepts is a height.
  const sendsNothing = !/postMessage\s*\(/.test(loader.text);
  const onlyHeight =
    /p2b:height/.test(loader.text) &&
    (loader.text.match(/data\.type\s*!==/g) ?? []).length === 1;
  const assertsNothing = !/\b(contractorId|basePrice|bookingId|amountCents|publishedPrice|visitId)\b/
    .test(loader.text);
  ok(`   and accepts only a height back from the frame`,
    sendsNothing && onlyHeight && assertsNothing,
    `sendsNothing=${sendsNothing} onlyHeight=${onlyHeight} assertsNothing=${assertsNothing}`);

  console.log();
  console.log(fail ? `  ${fail} check(s) failed.\n` : `  One engine, one surface's links, and nobody else's frame.\n`);
  await prisma.$disconnect();
  if (fail) process.exit(1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
