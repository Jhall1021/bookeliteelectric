/** Read-only production-test verification for the explicitly designated test contractor. */
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { resolveRouteWithDerivedPricing } from "../lib/electrical/resolveWithDerivedPricing";
import { routePricingReviewScenario } from "../lib/electrical/routePricingReviewScenario";
import { loadPricingSettings, loadServiceForResolution } from "../lib/routeResolver";
import { withTenantGuard } from "../lib/tenantGuard";
import { withTenant } from "../lib/tenantContext";
import { PRODUCTION_LINEAGE, probe } from "./_lineage";
import { SURFACE_KEYS } from "../prisma/_surfaceRouteModule";

const CONTRACTOR = "electrical-onboarding-test";
const EXPECTED_ENDPOINT = "ep-shy-butterfly-ay5t03di";
const SLUGS = ["new-120v-outlet", "surface-mounted-switch", "new-ethernet-line", "new-coax-line", "new-video-doorbell-wiring", "new-ceiling-fan", "new-ceiling-light", "new-wall-sconce", "recessed-lighting", "new-exterior-lighting-locations"] as const;

const FAN_ROUTE_VARIANTS = [
  {
    label: "accessible",
    answers: {
      fixture_height: "under_10", work_area_below: "level_floor", attic_access: "has_access",
      accessible_route_feet: "10", existing_light_source: "yes",
      lighting_control: "existing_switched_light", lighting_dimmer_upgrade: "standard",
    },
  },
  {
    label: "finished concealed",
    answers: routePricingReviewScenario("new-ceiling-fan")!.answers,
  },
  {
    label: "surface mounted",
    answers: {
      fixture_height: "under_10", work_area_below: "level_floor", attic_access: "no_access",
      fan_install_route_method: "surface", [SURFACE_KEYS.feet]: "10", [SURFACE_KEYS.inside]: "0",
      [SURFACE_KEYS.outside]: "0", [SURFACE_KEYS.flat]: "0", [SURFACE_KEYS.surface]: "drywall",
      [SURFACE_KEYS.obstacles]: "clear", existing_light_source: "yes",
      lighting_control: "existing_switched_light", lighting_dimmer_upgrade: "standard",
    },
  },
] as const;

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
      for (const slug of SLUGS) {
        const scenario = routePricingReviewScenario(slug)!;
        const routeVariants = slug === "new-ceiling-fan"
          ? FAN_ROUTE_VARIANTS
          : [{ label: "representative", answers: scenario.answers }];
        const service = await raw.service.findUniqueOrThrow({ where: { contractorId_slug: { contractorId: contractor.id, slug } }, select: { id: true } });
        const loaded = await loadServiceForResolution(guarded, service.id);
        assert.ok(loaded, `${slug} must load`);
        for (const variant of routeVariants) {
          for (const primary of [true, false]) {
            const verdict = await resolveRouteWithDerivedPricing(guarded, loaded, variant.answers, primary, settings);
            assert.equal(verdict.status, "PRICED", `${slug} ${variant.label} ${primary ? "primary" : "add-on"} expected PRICED, got ${verdict.status}${"reason" in verdict ? `: ${verdict.reason}` : ""}`);
            console.log(`${slug} ${variant.label} ${primary ? "primary" : "add-on"}: $${(verdict.priceCents / 100).toFixed(2)}`);
          }
        }
      }
      const bidet = await raw.service.findUniqueOrThrow({ where: { contractorId_slug: { contractorId: contractor.id, slug: "bidet-smart-toilet-outlet" } }, select: { id: true } });
      const outlet = await raw.service.findUniqueOrThrow({ where: { contractorId_slug: { contractorId: contractor.id, slug: "new-120v-outlet" } }, select: { id: true } });
      const loadedBidet = await loadServiceForResolution(guarded, bidet.id);
      assert.ok(loadedBidet);
      const bidetVerdict = await resolveRouteWithDerivedPricing(guarded, loadedBidet, { dedicated_equipment: "bidet" }, true, settings);
      assert.equal(bidetVerdict.status, "REROUTE");
      assert.equal(bidetVerdict.status === "REROUTE" ? bidetVerdict.targetServiceId : null, outlet.id);
      console.log("bidet-smart-toilet-outlet: reroutes to the measured new-120v-outlet flow");
    });
  } finally {
    await raw.$disconnect();
    await guarded.$disconnect();
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
