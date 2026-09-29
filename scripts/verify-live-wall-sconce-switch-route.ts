/** Read-only production verification for the wall-sconce new-switch routes. */
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
      const service = await raw.service.findUniqueOrThrow({
        where: { contractorId_slug: { contractorId: contractor.id, slug: "new-wall-sconce" } },
        select: { id: true },
      });
      const loaded = await loadServiceForResolution(guarded, service.id);
      assert.ok(loaded);
      const settings = await loadPricingSettings(guarded, contractor.id);
      const base = {
        extension_existing_location: "no",
        fixture_height: "under_10",
        extension_route_access: "finished",
        extension_route_surface: "drywall",
        extension_route_clear: "clear",
        extension_route_feet: "20",
        extension_control: "new_switch",
      };
      for (const [label, switchAnswers] of [
        ["along route", { extension_switch_location: "along_route" }],
        ["14-foot detour", { extension_switch_location: "different_location", extension_switch_extra_feet: "14" }],
      ] as const) {
        for (const primary of [true, false]) {
          const verdict = await resolveRouteWithDerivedPricing(guarded, loaded, { ...base, ...switchAnswers }, primary, settings);
          if (verdict.status !== "PRICED") {
            console.error(JSON.stringify({ label, primary, verdict }, null, 2));
          }
          assert.equal(verdict.status, "PRICED", `${label} ${primary ? "primary" : "add-on"} must be priced`);
          console.log(`${label} ${primary ? "primary" : "add-on"}: $${(verdict.priceCents / 100).toFixed(2)}`);
        }
      }
    });
  } finally {
    await raw.$disconnect();
    await guarded.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
