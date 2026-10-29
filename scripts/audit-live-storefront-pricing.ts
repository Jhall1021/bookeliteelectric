/**
 * Read-only audit of every service linked from a live storefront catalog.
 *
 * LEGACY_PUBLISHED is still correct for services with a real published base
 * price. A legacy service with no published anchor must review before it
 * resolves a price, but reroutes are different: they sell nothing from the
 * origin service and the destination owns its own pricing. This audit finds
 * every unanchored legacy service that relies on one of those reroutes.
 *
 *   npx tsx scripts/audit-live-storefront-pricing.ts \
 *     --base https://app.price2book.com --site elite-electric
 */

export {};

type Flow = {
  slug: string;
  name: string;
  bookingType: string;
  pricingMethod: "LEGACY_PUBLISHED" | "DERIVED_RESOLVED_SCOPE";
  basePrice: number | null;
  questions: {
    key: string;
    options: { routeAction: string }[];
  }[];
};

const arg = (name: string, fallback: string) => {
  const at = process.argv.indexOf(`--${name}`);
  return at >= 0 ? process.argv[at + 1] ?? fallback : fallback;
};

const base = arg("base", "https://app.price2book.com").replace(/\/$/, "");
const site = arg("site", "elite-electric");

function paths(html: string, depth: number): string[] {
  const found = [...html.matchAll(new RegExp(`href=["'](/${site}/services/[^"']+)["']`, "g"))]
    .map((match) => match[1])
    .filter((path) => path.split("/").filter(Boolean).length === depth);
  return [...new Set(found)].sort();
}

function publicId(html: string): string {
  const plain = html.match(/"publicId":"([^"]+)"/)?.[1];
  const escaped = html.match(/publicId\\":\\"([^"\\]+)\\"/)?.[1];
  const value = plain ?? escaped;
  if (!value) throw new Error("could not find the storefront publicId in the services page");
  return value;
}

function actions(flow: Flow): string[] {
  return [...new Set(flow.questions.flatMap((question) => question.options.map((option) => option.routeAction)))].sort();
}

async function text(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return response.text();
}

async function main() {
  const catalogUrl = `${base}/${site}/services`;
  const catalog = await text(catalogUrl);
  const id = publicId(catalog);
  const categories = paths(catalog, 3);
  const categoryPages = await Promise.all(categories.map((path) => text(`${base}${path}`)));
  const servicePaths = [...new Set(categoryPages.flatMap((html) => paths(html, 4)))].sort();
  const flows = await Promise.all(servicePaths.map(async (path) => {
    const slug = path.split("/").at(-1)!;
    const response = await fetch(`${base}/api/services/${slug}`, {
      headers: { "x-price2book-site": id },
    });
    if (!response.ok) throw new Error(`${response.status} /api/services/${slug}`);
    return response.json() as Promise<Flow>;
  }));

  const legacy = flows.filter((flow) => flow.pricingMethod === "LEGACY_PUBLISHED");
  const published = legacy.filter((flow) => flow.basePrice !== null);
  const unanchored = legacy.filter((flow) => flow.basePrice === null);
  const rerouteDependent = unanchored.filter((flow) => actions(flow).some((action) =>
    action === "REROUTE_SERVICE"
      || action === "REROUTE_TROUBLESHOOTING"
  ));
  const noReroute = unanchored.filter((flow) => !rerouteDependent.includes(flow));

  console.log(`\nLIVE STOREFRONT PRICING AUDIT — ${base}/${site}\n`);
  console.log(`  catalog services: ${flows.length}`);
  console.log(`  server-priced derived: ${flows.length - legacy.length}`);
  console.log(`  legacy with a published price: ${published.length}`);
  console.log(`  legacy with no published price: ${unanchored.length}`);
  console.log(`  unanchored legacy flows that depend on rerouting: ${rerouteDependent.length}\n`);

  for (const flow of rerouteDependent) {
    console.log(`  REROUTE  ${flow.slug} — ${flow.name}`);
    console.log(`           booking=${flow.bookingType}; actions=${actions(flow).join(",") || "none"}`);
  }
  if (noReroute.length > 0) {
    console.log("\n  Legacy rows with no published price and no reroute dependency:");
    for (const flow of noReroute) {
      console.log(`    REVIEW   ${flow.slug} — actions=${actions(flow).join(",") || "none"}`);
    }
  }
  console.log("");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
