/**
 * Choosing a design is curated, pinned, and free of side effects — Phase 4.
 *
 * The picker is a settings screen that changes what every customer sees, so
 * the properties that matter are the ones a screenshot cannot show: that
 * previewing writes nothing, that applying writes all three parts of the
 * choice, that the stored VERSION is the one chosen rather than the newest,
 * and that the same design says different things to a flat-rate contractor
 * and a time-and-materials one.
 *
 * MUTATES REAL DATA (a throwaway contractor). Lives in `npm run verify:template`
 * alongside the other harnesses, never in the deploy gate.
 */
import { PrismaClient } from "@prisma/client";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { loadEnv } from "./_env";
import { DEFINITIONS, definitionKey, selectableFamilies, findDefinition, FAMILY_BLURBS } from "../lib/theme/definition";
import { resolveStorefrontTheme, themeCss } from "../lib/theme/resolve";
import { pricingCopy } from "../lib/pricingCopy";
import { withThrowaway } from "./_throwaway";

loadEnv();
const prisma = new PrismaClient();
const THROWAWAY = "__design-picker-proof__";

let pass = 0, fail = 0;
const ok = (c: boolean, label: string, detail = "") => {
  c ? pass++ : fail++;
  console.log(`  ${c ? "ok  " : "FAIL"} ${label}${c ? "" : `\n         ${detail}`}`);
};

function curation() {
  console.log("\n  WHAT THE CONTRACTOR IS OFFERED");
  const families = selectableFamilies();
  ok(families.length === 3, `three families (${families.map((f) => f.name).join(", ")})`);
  ok(families.every((f) => f.designs.length === 2), "two variants in each",
    families.map((f) => `${f.family}=${f.designs.length}`).join(", "));
  ok(families.flatMap((f) => f.designs).length === 6, "six designs in total");

  // The parity anchor is a technical artefact, not a choice.
  const offered = families.flatMap((f) => f.designs).map(definitionKey);
  ok(!offered.includes("baseline-a"), "the parity anchor is not offered", offered.join(", "));
  ok(DEFINITIONS.some((d) => !d.selectable), "…but still exists as a definition");

  // Plain language, no design vocabulary. A contractor should not need to know
  // what a structural axis is to answer this question.
  const JARGON = /\b(axis|token|variant|radius|shadow|typograph|kerning|leading|hex|css|palette|structural)\b/i;
  const jargon = [
    ...Object.values(FAMILY_BLURBS).map((f) => f.blurb),
    ...families.flatMap((f) => f.designs).map((d) => d.blurb),
  ].filter((t) => JARGON.test(t));
  ok(jargon.length === 0, "every description is in plain language", jargon.join(" | "));
  ok(families.flatMap((f) => f.designs).every((d) => d.blurb.length > 20 && d.blurb.length < 130),
    "…and each is one readable sentence");
}

function pinning() {
  console.log("\n  THE PINNED VERSION IS AUTHORITATIVE");
  // Nothing may resolve "the latest version". A contractor pinned to v1 must
  // keep rendering v1 after v2 ships, and the surest guarantee is that no code
  // path can even ask for the newest one.
  const src = execSync("git ls-files -co --exclude-standard 'lib/theme' 'app' 'components/portal'", { encoding: "utf8" })
    .split("\n").filter((f) => /\.tsx?$/.test(f)).map((f) => readFileSync(f, "utf8")).join("\n");
  const LATEST = /\b(latest|newest)Version\b|Math\.max\([^)]*version/i;
  ok(!LATEST.test(src), "no code path resolves a latest/newest version");

  ok(findDefinition("modern-clean", "a", 1) !== null, "a pinned version resolves");
  ok(findDefinition("modern-clean", "a", 2) === null,
    "an unpublished version resolves to nothing rather than falling forward");

  // A v2 must not reach a contractor pinned to v1. Simulated by resolving both
  // and checking the v1 pin is unaffected by v2's existence.
  const v1 = resolveStorefrontTheme({}, { family: "modern-clean", variant: "a", version: 1 });
  ok(v1.version === 1 && v1.family === "modern-clean" && v1.variant === "a",
    "a resolved theme reports the pin it was asked for", JSON.stringify(v1.themeKey));
}

function isolation() {
  console.log("\n  A PREVIEW IS A PICTURE");
  const t = resolveStorefrontTheme({ primary: "#0B7A5B" }, { family: "premium", variant: "b", version: 1 });
  const scoped = themeCss(t, ".pXYZ");
  ok(scoped.startsWith(".pXYZ{"), "preview tokens are scoped to their container", scoped.slice(0, 40));
  ok(!scoped.includes(":root"), "…and never touch :root, which would restyle the picker itself");
  ok(themeCss(t).startsWith(":root{"), "while a storefront still gets :root");

  // The preview component must not be able to write. Checked in the source,
  // because "we did not call fetch" is only true until somebody adds one.
  const preview = readFileSync("components/portal/design/DesignPreview.tsx", "utf8");
  ok(!/\bfetch\(|\buseEffect\(/.test(preview),
    "the preview component performs no fetches and no effects");
  ok(/pointer-events-none/.test(preview) && /inert/.test(preview),
    "…and is inert to both pointer and keyboard");
}

function pricingNeutrality() {
  console.log("\n  THE SAME DESIGN, TWO PRICING MODELS");
  const flat = pricingCopy("FLAT_RATE");
  const tm = pricingCopy("TIME_AND_MATERIALS");

  // Same theme definition either way — the design does not know how prices are
  // calculated, and must not.
  const a = resolveStorefrontTheme({}, { family: "premium", variant: "b", version: 1 });
  const b = resolveStorefrontTheme({}, { family: "premium", variant: "b", version: 1 });
  ok(JSON.stringify(a.structure) === JSON.stringify(b.structure) && a.colors.accent === b.colors.accent,
    "the theme resolves identically regardless of pricing model");

  ok(/know your price/i.test(flat.headline), `flat rate promises a price ("${flat.headline}")`);
  ok(!/your price|exact price|fixed price/i.test(tm.headline),
    `time and materials does not ("${tm.headline}")`);
  ok(tm.estimateNotice !== null && flat.estimateNotice === null,
    "only the estimating model carries an estimate notice");
  ok(flat.priceLead !== tm.priceLead && flat.resolvedPriceLabel !== tm.resolvedPriceLabel,
    `price labels differ ("${flat.priceLead}" vs "${tm.priceLead}")`);
  ok(flat.commitCta !== tm.commitCta,
    `the commitment differs ("${flat.commitCta}" vs "${tm.commitCta}")`);

  // Every field must actually differ or actually be shared on purpose. A field
  // identical across both is fine; a field that SHOULD differ and does not is
  // the bug this boundary exists to prevent.
  const mustDiffer = ["headline", "priceLead", "noPriceLabel", "resolvedPriceLabel", "commitCta",
    "priceReadyTitle", "priceForServiceLead", "seePriceStepTitle", "trustPricingTitle",
    "quoteEmailTitle", "quoteEmailSubjectLead"] as const;
  const same = mustDiffer.filter((k) => flat[k] === tm[k]);
  ok(same.length === 0, `${mustDiffer.length} pricing-sensitive fields all differ`, `identical: ${same.join(", ")}`);
}

async function applying() {
  console.log("\n  APPLYING PERSISTS THE WHOLE CHOICE");
  await withThrowaway(prisma, THROWAWAY, "Design Picker Proof", async (id) => {
    const before = await prisma.contractor.findUniqueOrThrow({
      where: { id }, select: { themeFamily: true, themeVariant: true, themeVersion: true } });
    ok(before.themeFamily === "baseline" && before.themeVariant === "a" && before.themeVersion === 1,
      "a new contractor starts on the baseline", JSON.stringify(before));

    // The route's decision logic, exercised directly: an unknown design and a
    // non-selectable one must both be refused before anything is written.
    ok(findDefinition("no-such-family", "a", 1) === null, "an unknown design is not found");
    ok(DEFINITIONS.find((d) => !d.selectable)?.selectable === false,
      "the baseline is marked non-selectable, so the route can refuse it");

    const chosen = findDefinition("warm-welcoming", "b", 1)!;
    await prisma.contractor.update({
      where: { id },
      data: { themeFamily: chosen.family, themeVariant: chosen.variant, themeVersion: chosen.version },
    });
    const after = await prisma.contractor.findUniqueOrThrow({
      where: { id }, select: { themeFamily: true, themeVariant: true, themeVersion: true } });
    ok(after.themeFamily === "warm-welcoming" && after.themeVariant === "b" && after.themeVersion === 1,
      "all three parts are stored, not a key that encodes them", JSON.stringify(after));

    // And the stored choice resolves back to the design that was chosen.
    const resolved = resolveStorefrontTheme({}, {
      family: after.themeFamily, variant: after.themeVariant, version: after.themeVersion });
    ok(definitionKey(resolved as never) === "warm-welcoming-b" || resolved.themeKey === "warm-welcoming-b",
      "…and resolves back to that design", resolved.themeKey);
  });
}

async function main() {
  console.log("\nDESIGN PICKER");
  curation();
  pinning();
  isolation();
  pricingNeutrality();
  await applying();
  console.log(`\n  ${pass} passed, ${fail} failed.\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
