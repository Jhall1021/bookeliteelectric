/**
 * BookEliteElectric.com — seed script
 * Populates the full 13-category structure and Section 4 master price book.
 *
 * Prices are stored in cents. Run with: npx prisma db seed
 *
 * NOTE: this seeds Services and Categories only. Question/AnswerOption trees
 * (Section 6 of the master doc) should be entered per-service as Phase 2/4
 * work — encoding all ~30 full decision trees by hand here would bury the
 * category/pricing structure that Phase 1 is meant to establish first.
 */

import { PrismaClient, BookingType } from "@prisma/client";

const prisma = new PrismaClient();

// cents helper
const c = (dollars: number) => Math.round(dollars * 100);

type SeedService = {
  slug: string;
  name: string;
  bookingType: BookingType;
  basePrice?: number; // dollars
  startingPriceLabel?: string;
  whileWeThereBasePrice?: number; // dollars
  requiresTechCount?: number;
};

type SeedCategory = {
  slug: string;
  name: string;
  icon: string;
  navGroup?: string;
  services: SeedService[];
};

// Full 13-category structure (Section 4 of the master doc is authoritative;
// Section 3's 6-category nav list is outdated per client direction).
const CATALOG: SeedCategory[] = [
  {
    slug: "outlets-switches",
    name: "Outlets & Switches",
    icon: "outlet",
    services: [
      { slug: "replace-standard-outlet", name: "Replace Standard Outlet", bookingType: "INSTANT", basePrice: 225, whileWeThereBasePrice: 75 },
      { slug: "replace-gfci-outlet", name: "Replace GFCI Outlet", bookingType: "INSTANT", basePrice: 275, whileWeThereBasePrice: 125 },
      { slug: "replace-standard-switch", name: "Replace Standard Switch", bookingType: "INSTANT", basePrice: 225, whileWeThereBasePrice: 75 },
      { slug: "replace-3-way-switch", name: "Replace 3-Way Switch", bookingType: "INSTANT", basePrice: 265, whileWeThereBasePrice: 115 },
      { slug: "replace-led-dimmer", name: "Replace LED Dimmer", bookingType: "INSTANT", basePrice: 275, whileWeThereBasePrice: 125 },
      { slug: "customer-supplied-smart-switch", name: "Customer-Supplied Smart Switch", bookingType: "ADJUSTED", basePrice: 295, whileWeThereBasePrice: 145 },
      { slug: "usb-outlet-upgrade", name: "USB / USB-C Outlet Upgrade", bookingType: "INSTANT", basePrice: 275, whileWeThereBasePrice: 125 },
      { slug: "smart-outlet-upgrade", name: "Smart Outlet Upgrade", bookingType: "ADJUSTED", basePrice: 295, whileWeThereBasePrice: 145 },
      { slug: "occupancy-motion-switch", name: "Occupancy / Motion Sensor Switch", bookingType: "INSTANT", basePrice: 295, whileWeThereBasePrice: 145 },
      { slug: "timer-switch-install", name: "Timer Switch Installation", bookingType: "INSTANT", basePrice: 295, whileWeThereBasePrice: 145 },
    ],
  },
  {
    slug: "new-outlets",
    name: "New Outlets",
    icon: "new-outlet",
    // Visually clusters near Outlets & Switches in nav, but stays a fully
    // distinct category/service set in the data model per client direction.
    navGroup: "outlets-switches",
    services: [
      { slug: "new-120v-outlet-accessible", name: "New 120V Outlet — Attic/Basement Access", bookingType: "INSTANT", basePrice: 395, whileWeThereBasePrice: 275 },
      { slug: "new-120v-outlet-finished-wall", name: "New 120V Outlet — Finished-Wall Fishing", bookingType: "ADJUSTED", basePrice: 495, whileWeThereBasePrice: 375 },
      { slug: "dedicated-120v-circuit-outlet", name: "Dedicated 120V Circuit & Outlet", bookingType: "REMOTE_QUOTE", startingPriceLabel: "From $795" },
      { slug: "exterior-gfci-standard", name: "Exterior GFCI — Back-to-Back Power", bookingType: "INSTANT", basePrice: 395, whileWeThereBasePrice: 275 },
      { slug: "exterior-gfci-other-routing", name: "Exterior GFCI — Other Routing", bookingType: "REMOTE_QUOTE" },
      { slug: "garage-door-opener-outlet", name: "Garage Door Opener Outlet", bookingType: "ADJUSTED", startingPriceLabel: "$395–$495" }, // inherits new-outlet pricing via PricingRule
      { slug: "bidet-smart-toilet-outlet", name: "Bidet / Smart Toilet Outlet", bookingType: "ADJUSTED", startingPriceLabel: "$395–$495" }, // inherits new-outlet pricing via PricingRule
    ],
  },
  {
    slug: "lighting",
    name: "Lighting",
    icon: "lighting",
    services: [
      { slug: "replace-interior-light-fixture", name: "Replace Interior Light Fixture", bookingType: "INSTANT", basePrice: 295, whileWeThereBasePrice: 175 },
      { slug: "replace-exterior-light-fixture", name: "Replace Exterior Light Fixture", bookingType: "INSTANT", basePrice: 325, whileWeThereBasePrice: 195 },
      { slug: "replace-motion-flood-light", name: "Replace Motion / Flood Light", bookingType: "INSTANT", basePrice: 345, whileWeThereBasePrice: 195 },
      { slug: "recessed-lighting-4", name: "Install 4 LED Recessed Lights", bookingType: "ADJUSTED", basePrice: 995 },
      { slug: "recessed-lighting-6", name: "Install 6 LED Recessed Lights", bookingType: "ADJUSTED", basePrice: 1395 },
      { slug: "recessed-lighting-8", name: "Install 8 LED Recessed Lights", bookingType: "ADJUSTED", basePrice: 1795 },
      { slug: "under-cabinet-led-lighting", name: "Professional LED Under-Cabinet Lighting", bookingType: "REMOTE_QUOTE", startingPriceLabel: "Custom Quote" },
      { slug: "outdoor-landscape-lighting", name: "Outdoor Landscape Lighting", bookingType: "REMOTE_QUOTE" },
      { slug: "new-exterior-lighting-locations", name: "New Exterior Lighting Locations", bookingType: "REMOTE_QUOTE" },
    ],
  },
  {
    slug: "fans",
    name: "Fans",
    icon: "fan",
    services: [
      { slug: "replace-ceiling-fan", name: "Replace Existing Ceiling Fan", bookingType: "INSTANT", basePrice: 395, whileWeThereBasePrice: 275 },
      { slug: "fan-replacing-light", name: "Fan Replacing Existing Light", bookingType: "ADJUSTED", basePrice: 495 },
      { slug: "replace-bathroom-exhaust-fan", name: "Replace Bathroom Exhaust Fan", bookingType: "REMOTE_QUOTE", startingPriceLabel: "$525" },
      { slug: "bathroom-fan-light-combo", name: "Bathroom Exhaust Fan + Light Combo", bookingType: "ADJUSTED", basePrice: 595 }, // WWT price TBD — see open items
    ],
  },
  {
    slug: "tv-media",
    name: "TV & Media",
    icon: "tv",
    services: [
      { slug: "tv-install-up-to-55", name: "Professional TV Install — Up to 55 in", bookingType: "INSTANT", basePrice: 495, whileWeThereBasePrice: 395, requiresTechCount: 1 },
      { slug: "tv-install-56-85", name: "Professional TV Install — 56–85 in", bookingType: "INSTANT", basePrice: 695, whileWeThereBasePrice: 595, requiresTechCount: 2 },
      { slug: "tv-install-over-85", name: "TV Install — Over 85 in", bookingType: "REMOTE_QUOTE" },
      { slug: "elite-tilt-mount", name: "Elite Tilt TV Mount", bookingType: "ADJUSTED", basePrice: 99, whileWeThereBasePrice: 99 },
      { slug: "elite-articulating-mount", name: "Elite Full-Motion Articulating Mount", bookingType: "ADJUSTED", basePrice: 179, whileWeThereBasePrice: 179 },
    ],
  },
  {
    slug: "appliance-install",
    name: "Appliance Installation",
    icon: "appliance",
    services: [
      { slug: "otr-microwave-install", name: "Over-the-Range Microwave", bookingType: "INSTANT", basePrice: 395, whileWeThereBasePrice: 295 },
      { slug: "dishwasher-electrical", name: "Dishwasher Electrical Connection / Replacement", bookingType: "INSTANT", basePrice: 325, whileWeThereBasePrice: 225 },
      { slug: "garbage-disposal-install", name: "Garbage Disposal Install / Electrical Connection", bookingType: "INSTANT", basePrice: 325, whileWeThereBasePrice: 225 },
      { slug: "range-hood-replacement", name: "Range Hood Replacement", bookingType: "INSTANT", basePrice: 395, whileWeThereBasePrice: 295 },
      { slug: "range-receptacle-replacement", name: "Electric Range Receptacle Replacement", bookingType: "REMOTE_QUOTE", startingPriceLabel: "$395" },
      { slug: "dryer-receptacle-replacement", name: "Electric Dryer Receptacle Replacement", bookingType: "REMOTE_QUOTE", startingPriceLabel: "$395" },
      { slug: "new-range-circuit", name: "New Range Circuit / Receptacle", bookingType: "REMOTE_QUOTE" },
      { slug: "new-dryer-circuit", name: "New Dryer Circuit / Receptacle", bookingType: "REMOTE_QUOTE" },
    ],
  },
  {
    slug: "safety-protection",
    name: "Safety & Protection",
    icon: "shield",
    services: [
      { slug: "hardwired-smoke-detector", name: "Hardwired Smoke Detector", bookingType: "INSTANT", basePrice: 225, whileWeThereBasePrice: 85 },
      { slug: "smoke-co-detector", name: "Smoke / CO Detector", bookingType: "INSTANT", basePrice: 265, whileWeThereBasePrice: 125 },
      { slug: "whole-house-surge-protection", name: "Whole-House Surge Protection", bookingType: "ADJUSTED", basePrice: 695 },
      { slug: "home-electrical-safety-inspection", name: "Home Electrical Safety Inspection", bookingType: "INSTANT", basePrice: 295 },
    ],
  },
  {
    slug: "smart-home-security",
    name: "Smart Home & Security",
    icon: "smart-home",
    services: [
      { slug: "video-doorbell-existing-wiring", name: "Video Doorbell — Existing Wiring", bookingType: "INSTANT", basePrice: 295, whileWeThereBasePrice: 175 },
      { slug: "new-video-doorbell-wiring", name: "New Video Doorbell Wiring", bookingType: "REMOTE_QUOTE" },
      { slug: "floodlight-camera-existing", name: "Floodlight Camera at Existing Fixture", bookingType: "INSTANT", basePrice: 345, whileWeThereBasePrice: 195 },
      { slug: "new-exterior-flood-camera", name: "New Exterior Flood / Camera Location", bookingType: "REMOTE_QUOTE", startingPriceLabel: "From $495" },
      { slug: "smart-thermostat-install", name: "Smart Thermostat Installation", bookingType: "INSTANT", basePrice: 295, whileWeThereBasePrice: 175 },
      { slug: "doorbell-transformer-replacement", name: "Doorbell Transformer Replacement", bookingType: "INSTANT", basePrice: 325, whileWeThereBasePrice: 175 },
    ],
  },
  {
    slug: "panels-troubleshooting",
    name: "Panels & Troubleshooting",
    icon: "panel",
    services: [
      { slug: "single-pole-breaker-replacement", name: "Single-Pole Breaker Replacement", bookingType: "INSTANT", basePrice: 295, whileWeThereBasePrice: 125 },
      { slug: "double-pole-breaker-replacement", name: "Double-Pole Breaker Replacement", bookingType: "INSTANT", basePrice: 345, whileWeThereBasePrice: 175 },
      { slug: "electrical-troubleshooting", name: "Electrical Troubleshooting", bookingType: "TROUBLESHOOT_ONLY", basePrice: 249 },
      { slug: "electrical-panel-replacement", name: "Electrical Panel Replacement", bookingType: "REMOTE_QUOTE", startingPriceLabel: "From $3,995" },
      { slug: "200a-service-upgrade", name: "200-Amp Service Upgrade", bookingType: "REMOTE_QUOTE", startingPriceLabel: "From $4,995" },
    ],
  },
  {
    slug: "ev-garage",
    name: "EV & Garage",
    icon: "ev",
    services: [
      { slug: "level-2-ev-charger", name: "Level 2 EV Charger Installation", bookingType: "REMOTE_QUOTE", startingPriceLabel: "From $1,295" },
      { slug: "garage-door-opener-outlet-ev", name: "Garage Door Opener Outlet", bookingType: "ADJUSTED", startingPriceLabel: "$395–$495" },
      { slug: "240v-garage-outlet", name: "240V Garage Outlet", bookingType: "REMOTE_QUOTE" },
    ],
  },
  {
    slug: "dedicated-circuits",
    name: "Dedicated Circuits",
    icon: "circuit",
    services: [
      { slug: "sump-pump-dedicated-circuit", name: "Sump Pump Dedicated Circuit", bookingType: "REMOTE_QUOTE" },
      { slug: "freezer-fridge-dedicated-circuit", name: "Freezer / Refrigerator Dedicated Circuit", bookingType: "REMOTE_QUOTE" },
      { slug: "electric-fireplace-circuit", name: "Electric Fireplace Circuit / Outlet", bookingType: "REMOTE_QUOTE" },
      { slug: "new-240v-appliance-circuit", name: "New 240V Appliance Circuit", bookingType: "REMOTE_QUOTE" },
    ],
  },
  {
    slug: "generator-backup-power",
    name: "Generator / Backup Power",
    icon: "generator",
    services: [
      { slug: "generator-inlet-interlock", name: "Generator Inlet + Interlock", bookingType: "REMOTE_QUOTE" },
      { slug: "transfer-switch", name: "Transfer Switch", bookingType: "REMOTE_QUOTE" },
    ],
  },
  {
    slug: "pool-spa",
    name: "Pool / Spa",
    icon: "pool",
    services: [
      { slug: "hot-tub-spa-electrical", name: "Hot Tub / Spa Electrical", bookingType: "REMOTE_QUOTE" },
      { slug: "pool-equipment-electrical", name: "Pool Equipment Electrical", bookingType: "REMOTE_QUOTE" },
    ],
  },
];

async function main() {
  console.log("Seeding BookEliteElectric catalog...");

  for (const [i, cat] of CATALOG.entries()) {
    const category = await prisma.serviceCategory.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon, sortOrder: i, navGroup: cat.navGroup },
      create: {
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        sortOrder: i,
        navGroup: cat.navGroup,
      },
    });

    for (const svc of cat.services) {
      await prisma.service.upsert({
        where: { slug: svc.slug },
        update: {
          name: svc.name,
          categoryId: category.id,
          bookingType: svc.bookingType,
          basePrice: svc.basePrice ? c(svc.basePrice) : null,
          startingPriceLabel: svc.startingPriceLabel,
          whileWeThereBasePrice: svc.whileWeThereBasePrice ? c(svc.whileWeThereBasePrice) : null,
          requiresTechCount: svc.requiresTechCount ?? 1,
        },
        create: {
          slug: svc.slug,
          name: svc.name,
          categoryId: category.id,
          bookingType: svc.bookingType,
          basePrice: svc.basePrice ? c(svc.basePrice) : null,
          startingPriceLabel: svc.startingPriceLabel,
          whileWeThereBasePrice: svc.whileWeThereBasePrice ? c(svc.whileWeThereBasePrice) : null,
          requiresTechCount: svc.requiresTechCount ?? 1,
        },
      });
    }
    console.log(`  ✓ ${cat.name} (${cat.services.length} services)`);
  }

  // Launch service areas
  await prisma.serviceArea.upsert({
    where: { id: "monmouth-county" },
    update: {},
    create: { id: "monmouth-county", name: "Monmouth County, NJ", zipCodes: [], active: true },
  }).catch(() => {}); // id-as-slug upsert is illustrative; swap to a real unique slug field before Phase 6

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
