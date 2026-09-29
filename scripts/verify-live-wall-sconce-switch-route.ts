/** Read-only production verification for source-first new-light routing. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { resolveRouteWithDerivedPricing } from "../lib/electrical/resolveWithDerivedPricing";
import { loadPricingSettings, loadServiceForResolution } from "../lib/routeResolver";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";

const CONTRACTOR = "electrical-onboarding-test";
const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required");
  const identity = await probe(url);
  assert.equal(identity.endpoint, EXPECTED_ENDPOINT);
  assert.equal(identity.lineage, PRODUCTION_LINEAGE);
  assert.equal(identity.markerEndpoint, EXPECTED_ENDPOINT);
  const raw = new PrismaClient({ datasources: { db: { url } } });
  const guarded = withTenantGuard(new PrismaClient({ datasources: { db: { url } } })) as unknown as PrismaClient;
  try {
    const contractor = await raw.contractor.findUniqueOrThrow({ where: { slug: CONTRACTOR }, select: { id: true } });
    await withTenant({ contractorId: contractor.id, source: "test" }, async () => {
      const settings = await loadPricingSettings(guarded, contractor.id);
      const services = [
        ["new-ceiling-light", { extension_existing_location: "no", work_area_below: "level_floor" }],
        ["new-wall-sconce", { extension_existing_location: "no" }],
        ["recessed-lighting", { recessed_light_count: "4", work_area_below: "level_floor" }],
        ["new-exterior-lighting-locations", {
          extension_existing_location: "no",
          extension_fixture_supply: "customer",
          extension_wall_finish: "ordinary",
        }],
      ] as const;
      for (const [slug, serviceAnswers] of services) {
        const service = await raw.service.findUniqueOrThrow({
          where: { contractorId_slug: { contractorId: contractor.id, slug } },
          select: { id: true },
        });
        const loaded = await loadServiceForResolution(guarded, service.id);
        assert.ok(loaded);
        const base = {
          ...serviceAnswers,
          fixture_height: "under_10",
          extension_route_access: "accessible",
        };
        for (const [label, sourceAnswers] of [
          ["existing switch", { extension_control: "existing_switch", extension_existing_switch_feet: "20" }],
          ["existing fixture", { extension_control: "existing_fixture", extension_existing_fixture_feet: "20" }],
          ["new switch with two measured legs", { extension_control: "new_switch", extension_power_to_switch_feet: "12", extension_switch_to_fixture_feet: "18" }],
        ] as const) {
          for (const primary of [true, false]) {
            const verdict = await resolveRouteWithDerivedPricing(guarded, loaded, { ...base, ...sourceAnswers }, primary, settings);
            if (verdict.status !== "PRICED") {
              console.error(JSON.stringify({ slug, label, primary, verdict }, null, 2));
            }
            assert.equal(verdict.status, "PRICED", `${slug} ${label} ${primary ? "primary" : "add-on"} must be priced`);
            console.log(`${slug} ${label} ${primary ? "primary" : "add-on"}: $${(verdict.priceCents / 100).toFixed(2)}`);
          }
        }
      }
    });
  } finally {
    await raw.$disconnect();
    await guarded.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
