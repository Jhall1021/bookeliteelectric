/**
 * BookEliteElectric.com — seed script
 * Populates the full 13-category structure and Section 4 master price book.
 *
 * Prices are stored in cents. Run with: npx prisma db seed
 *
 * Every service has a shortDescription (shown wherever a customer selects
 * a service) and an icon — a simple line-art icon key rendered via
 * components/shared/Icons.tsx. Most services fall back to their category's
 * icon; a service only sets its own `icon` when the category mixes visually
 * distinct job types (e.g. "Outlets & Switches" needs both an outlet icon
 * and a switch icon, not one icon for the whole category).
 *
 * NOTE: this seeds Services and Categories only. Question/AnswerOption trees
 * (Section 6 of the master doc) are entered per-service as Phase 2/4 work.
 */

import { PrismaClient, BookingType } from "@prisma/client";

const prisma = new PrismaClient();

// cents helper
const c = (dollars: number) => Math.round(dollars * 100);

type SeedService = {
  slug: string;
  name: string;
  bookingType: BookingType;
  description: string;
  basePrice?: number; // dollars
  startingPriceLabel?: string;
  whileWeThereBasePrice?: number; // dollars
  requiresTechCount?: number;
  icon?: string; // override; falls back to category icon when omitted
  // INTERNAL ONLY — minutes of technician time on-site. Never exposed to
  // the customer. These are placeholder estimates; refine with real field
  // data once jobs start completing.
  estimatedMinutes?: number;
  // false = exists in the catalog and is fully priced/usable inside a
  // guided-flow tree (e.g. as an add-on question), but doesn't show up as
  // its own browsable tile on category/services pages. Used for things
  // like TV mounts that are only ever selected as a question within
  // another service's flow, never booked directly on their own.
  active?: boolean;
  // Shown alongside a flat price with no question tree — for the range
  // and dryer outlet caveats about built-in appliances and stackable units.
  disclaimer?: string;
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
      { slug: "replace-standard-outlet", name: "Replace Standard Outlet", bookingType: "INSTANT", estimatedMinutes: 20, basePrice: 245, whileWeThereBasePrice: 95, icon: "outlet", description: "Swapping out an existing outlet that's already there — cracked, discolored, loose, or just old — for a brand-new one in the same spot. This does NOT add a new outlet anywhere new; see \"New 120V Outlet\" for that." },
      { slug: "replace-gfci-outlet", name: "Replace GFCI Outlet", bookingType: "INSTANT", estimatedMinutes: 25, basePrice: 340, whileWeThereBasePrice: 190, icon: "outlet", description: "Swapping an existing GFCI (the outlet with the TEST/RESET buttons, usually in kitchens, bathrooms, or garages) for a new one in the same location." },
      { slug: "replace-standard-switch", name: "Replace Standard Switch", bookingType: "INSTANT", estimatedMinutes: 20, basePrice: 240, whileWeThereBasePrice: 90, icon: "switch", description: "Swapping an existing single light switch for a new one in the same location." },
      { slug: "replace-3-way-switch", name: "Replace 3-Way Switch", bookingType: "INSTANT", estimatedMinutes: 25, basePrice: 285, whileWeThereBasePrice: 135, icon: "switch", description: "Swapping one switch in a pair that controls the same light from two locations (like a hallway or stairwell)." },
      { slug: "replace-led-dimmer", name: "Replace LED Dimmer", bookingType: "INSTANT", estimatedMinutes: 25, basePrice: 350, whileWeThereBasePrice: 200, icon: "switch", description: "Swapping an existing dimmer switch for a new LED-compatible dimmer in the same location." },
      { slug: "customer-supplied-smart-switch", name: "Customer-Supplied Smart Switch", bookingType: "ADJUSTED", estimatedMinutes: 30, basePrice: 300, whileWeThereBasePrice: 150, icon: "switch", description: "Installing a smart switch you've already purchased (Lutron, Kasa, etc.) in place of an existing switch. We'll confirm your wiring has a neutral wire before booking." },
      { slug: "usb-outlet-upgrade", name: "USB / USB-C Outlet Upgrade", bookingType: "INSTANT", estimatedMinutes: 25, basePrice: 365, whileWeThereBasePrice: 215, icon: "outlet", description: "Replacing an existing outlet with a combo outlet that includes built-in USB / USB-C charging ports." },
      { slug: "smart-outlet-upgrade", name: "Smart Outlet Upgrade", bookingType: "ADJUSTED", estimatedMinutes: 30, basePrice: 455, whileWeThereBasePrice: 305, icon: "outlet", description: "Replacing an existing outlet with a Wi-Fi smart outlet you can control from your phone." },
      { slug: "occupancy-motion-switch", name: "Occupancy / Motion Sensor Switch", bookingType: "INSTANT", estimatedMinutes: 30, basePrice: 405, whileWeThereBasePrice: 255, icon: "switch", description: "Replacing an existing switch with one that turns the light on/off automatically based on motion in the room." },
      { slug: "timer-switch-install", name: "Timer Switch Installation", bookingType: "INSTANT", estimatedMinutes: 30, basePrice: 455, whileWeThereBasePrice: 305, icon: "switch", description: "Replacing an existing switch with a timer switch that turns the light off automatically after a set time." },
    ],
  },
  {
    slug: "new-outlets",
    name: "New Outlets",
    icon: "new-outlet",
    navGroup: "outlets-switches",
    services: [
      { slug: "new-120v-outlet", name: "New 120V Outlet", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 520, whileWeThereBasePrice: 370, icon: "new-outlet", description: "Adding a brand-new outlet somewhere that doesn't currently have one — a new location on your wall, not a replacement of an existing outlet. Price depends on whether we have attic/basement access or need to open the wall." },
      { slug: "dedicated-120v-circuit-outlet", name: "Dedicated 120V Circuit & Outlet", bookingType: "REMOTE_QUOTE", estimatedMinutes: 120, basePrice: 795, icon: "circuit", description: "A new outlet run on its own dedicated circuit back to the panel, for a specific large appliance (window AC, freezer, sump pump, etc.) that needs power to itself." },
      { slug: "exterior-gfci-standard", name: "Exterior GFCI — Back-to-Back Power", bookingType: "INSTANT", estimatedMinutes: 60, basePrice: 575, whileWeThereBasePrice: 425, icon: "exterior-outlet", description: "A new outdoor weatherproof GFCI outlet, in a location with power already available directly on the other side of that exterior wall." },
      { slug: "exterior-gfci-other-routing", name: "Exterior GFCI — Other Routing", bookingType: "REMOTE_QUOTE", estimatedMinutes: 90, icon: "exterior-outlet", description: "A new outdoor weatherproof GFCI outlet where power isn't directly available on the other side of the wall, requiring a longer wire run." },
      { slug: "garage-door-opener-outlet", name: "Garage Door Opener Outlet", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 520, whileWeThereBasePrice: 370, icon: "new-outlet", description: "A new outlet installed near your garage door opener motor on the ceiling, so it's no longer running on an extension cord." },
      { slug: "bidet-smart-toilet-outlet", name: "Bidet / Smart Toilet Outlet", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 520, whileWeThereBasePrice: 370, icon: "new-outlet", description: "A new outlet installed near the toilet to power a bidet attachment or smart toilet seat." },
    ],
  },
  {
    slug: "lighting",
    name: "Lighting",
    icon: "light",
    services: [
      { slug: "replace-interior-light-fixture", name: "Replace Interior Light Fixture", bookingType: "INSTANT", estimatedMinutes: 30, basePrice: 300, whileWeThereBasePrice: 180, icon: "light", description: "Removing your existing interior light fixture and installing a new one you provide, in the same location." },
      { slug: "replace-exterior-light-fixture", name: "Replace Exterior Light Fixture", bookingType: "INSTANT", estimatedMinutes: 35, basePrice: 330, whileWeThereBasePrice: 195, icon: "light", description: "Removing your existing outdoor light fixture and installing a new one you provide, in the same location." },
      { slug: "replace-motion-flood-light", name: "Replace Motion / Flood Light", bookingType: "INSTANT", estimatedMinutes: 35, basePrice: 345, whileWeThereBasePrice: 195, icon: "light", description: "Swapping an existing motion-activated or flood light fixture for a new one in the same location." },
      { slug: "recessed-lighting", name: "Recessed Lighting Installation", bookingType: "ADJUSTED", estimatedMinutes: 45, basePrice: 450, whileWeThereBasePrice: 225, icon: "recessed", description: "Adding a new recessed \"can\" light into an existing ceiling. Add more lights in the same visit for a lower per-light rate. Final price depends on attic access and whether there's an existing fixture or switch to work from." },
      { slug: "new-ceiling-light", name: "Install New Ceiling Light", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 450, whileWeThereBasePrice: 300, icon: "light", description: "Adding a ceiling light fixture in a location that doesn't currently have one — different from replacing an existing fixture. Final price depends on attic access and whether there's an existing fixture or switch to work from." },
      { slug: "under-cabinet-led-lighting", name: "Professional LED Under-Cabinet Lighting", bookingType: "REMOTE_QUOTE", estimatedMinutes: 120, startingPriceLabel: "Custom Quote", icon: "under-cabinet", description: "Adding LED strip or puck lighting underneath your kitchen (or other) cabinets, wired in rather than battery-powered." },
      { slug: "outdoor-landscape-lighting", name: "Outdoor Landscape Lighting", bookingType: "REMOTE_QUOTE", estimatedMinutes: 150, icon: "landscape", description: "Adding low-voltage lighting along walkways, garden beds, or architectural features in your yard." },
      { slug: "new-exterior-lighting-locations", name: "New Exterior Lighting Locations", bookingType: "REMOTE_QUOTE", estimatedMinutes: 120, icon: "landscape", description: "Adding a light fixture to an outdoor location that doesn't currently have one or existing wiring." },
    ],
  },
  {
    slug: "fans",
    name: "Fans",
    icon: "fan",
    services: [
      { slug: "replace-ceiling-fan", name: "Replace Existing Ceiling Fan", bookingType: "INSTANT", estimatedMinutes: 45, basePrice: 450, whileWeThereBasePrice: 300, icon: "fan", description: "Removing your existing ceiling fan and installing a new one you provide, in the same location, using the existing electrical box." },
      { slug: "new-ceiling-fan", name: "Install New Ceiling Fan", bookingType: "ADJUSTED", estimatedMinutes: 75, basePrice: 525, whileWeThereBasePrice: 375, icon: "fan", description: "Adding a ceiling fan in a location that doesn't currently have one — needs a fan-rated electrical box, different from replacing an existing fan. Final price depends on attic access and whether there's an existing fixture or switch to work from." },
      { slug: "fan-replacing-light", name: "Fan Replacing Existing Light", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 525, whileWeThereBasePrice: 375, icon: "fan", description: "Removing a ceiling light fixture (not a fan) and installing a ceiling fan in its place — this requires confirming the existing box can support a fan's weight." },
      { slug: "replace-bathroom-exhaust-fan", name: "Replace Bathroom Exhaust Fan", bookingType: "REMOTE_QUOTE", estimatedMinutes: 60, basePrice: 525, icon: "exhaust-fan", description: "Removing your existing bathroom exhaust fan and installing a new one in the same location, including ducting checks." },
      { slug: "bathroom-fan-light-combo", name: "Bathroom Exhaust Fan + Light Combo", bookingType: "ADJUSTED", estimatedMinutes: 75, basePrice: 675, whileWeThereBasePrice: 525, icon: "exhaust-fan", description: "Replacing a bathroom exhaust fan with a combination fan/light unit in the same location." },
    ],
  },
  {
    slug: "tv-media",
    name: "TV & Media",
    icon: "tv",
    services: [
      { slug: "tv-installation", name: "Professional TV Installation", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 600, whileWeThereBasePrice: 450, requiresTechCount: 1, icon: "tv", description: "Mounting your TV on the wall, with cable concealment. Price adjusts based on TV size and what's needed for power. Does not include the mount itself unless you add one." },
      { slug: "tv-install-existing-location", name: "Install TV in Existing Location", bookingType: "ADJUSTED", estimatedMinutes: 30, basePrice: 375, whileWeThereBasePrice: 270, icon: "tv", description: "Mounting your TV where power and cable routing are already in place — no new outlet or cable concealment needed, so it's faster and less expensive than a full installation." },
      { slug: "soundbar-installation", name: "Soundbar Installation", bookingType: "REMOTE_QUOTE", icon: "tv", description: "Mounting a soundbar below your TV or on a shelf, with cable concealment." },
      { slug: "elite-tilt-mount", name: "Elite Tilt TV Mount", bookingType: "ADJUSTED", estimatedMinutes: 15, basePrice: 125, whileWeThereBasePrice: 125, icon: "mount", active: false, description: "An Elite-supplied tilting wall mount, added to a TV installation if you don't already have a compatible mount." },
      { slug: "elite-articulating-mount", name: "Elite Full-Motion Articulating Mount", bookingType: "ADJUSTED", estimatedMinutes: 20, basePrice: 200, whileWeThereBasePrice: 200, icon: "mount", active: false, description: "An Elite-supplied full-motion (swivel/extend) wall mount, added to a TV installation if you don't already have a compatible mount." },
    ],
  },
  {
    slug: "appliance-install",
    name: "Appliance Installation",
    icon: "appliance",
    services: [
      { slug: "otr-microwave-install", name: "Remove and Replace Existing Microwave", bookingType: "INSTANT", estimatedMinutes: 45, basePrice: 450, whileWeThereBasePrice: 300, icon: "kitchen-appliance", description: "Removing your existing over-the-range microwave and installing a new one in the same spot, using the electrical connection that's already there." },
      { slug: "install-new-microwave", name: "Install New Microwave", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 600, whileWeThereBasePrice: 450, icon: "kitchen-appliance", description: "Installing an over-the-range microwave in a spot that doesn't already have one — for example, above a cooktop with no hood or existing microwave. Price depends on what's currently there." },
      { slug: "dishwasher-electrical", name: "Dishwasher Electrical Connection / Replacement", bookingType: "INSTANT", estimatedMinutes: 30, basePrice: 330, whileWeThereBasePrice: 225, icon: "kitchen-appliance", description: "The electrical connection for a new or replacement dishwasher, using wiring that's already there." },
      { slug: "garbage-disposal-install", name: "Disconnect / Reconnect Garbage Disposal", bookingType: "INSTANT", estimatedMinutes: 20, basePrice: 300, whileWeThereBasePrice: 210, icon: "kitchen-appliance", description: "Disconnecting and reconnecting your existing garbage disposal — for example, while a sink or countertop is being replaced. We do not install a new disposal unit." },
      { slug: "range-receptacle-replacement", name: "Replace 220V Electric Range/Stove Outlet", bookingType: "INSTANT", estimatedMinutes: 45, basePrice: 375, whileWeThereBasePrice: 255, icon: "kitchen-appliance", disclaimer: "We do not move built-in ovens or stoves — this replaces the outlet in its current location only.", description: "Replacing the existing high-voltage outlet behind your electric range/stove, in the same location." },
      { slug: "dryer-receptacle-replacement", name: "Remove and Replace Existing 220V Dryer Outlet", bookingType: "INSTANT", estimatedMinutes: 45, basePrice: 375, whileWeThereBasePrice: 255, icon: "laundry", disclaimer: "If this is a stackable washer/dryer unit, we do not move it — the outlet will be serviced in its current location.", description: "Replacing the existing high-voltage outlet behind your dryer, in the same location." },
    ],
  },
  {
    slug: "safety-protection",
    name: "Safety & Protection",
    icon: "shield",
    services: [
      { slug: "hardwired-smoke-detector", name: "Hardwired Smoke Detector", bookingType: "INSTANT", estimatedMinutes: 20, basePrice: 300, whileWeThereBasePrice: 165, icon: "smoke-detector", description: "Replacing an existing hardwired smoke detector in the same location." },
      { slug: "smoke-co-detector", name: "Smoke / CO Detector", bookingType: "INSTANT", estimatedMinutes: 25, basePrice: 405, whileWeThereBasePrice: 255, icon: "smoke-detector", description: "Replacing an existing hardwired combination smoke/carbon monoxide detector in the same location." },
      { slug: "whole-house-surge-protection", name: "Whole-House Surge Protection", bookingType: "ADJUSTED", estimatedMinutes: 45, basePrice: 760, whileWeThereBasePrice: 610, icon: "surge", description: "Installing a surge protector directly at your electrical panel to protect everything in your home from power surges." },
      { slug: "home-electrical-safety-inspection", name: "Home Electrical Safety Inspection", bookingType: "INSTANT", estimatedMinutes: 60, basePrice: 450, whileWeThereBasePrice: 375, icon: "inspection", description: "A general visual and functional inspection of your home's electrical system, with a written summary of anything that needs attention." },
    ],
  },
  {
    slug: "smart-home-security",
    name: "Smart Home & Security",
    icon: "smart-home",
    services: [
      { slug: "video-doorbell-existing-wiring", name: "Video Doorbell — Existing Wiring", bookingType: "INSTANT", estimatedMinutes: 30, basePrice: 300, whileWeThereBasePrice: 180, icon: "doorbell", description: "Installing a video doorbell (Ring, Nest, etc.) you provide, using your existing doorbell wiring." },
      { slug: "new-video-doorbell-wiring", name: "New Video Doorbell Wiring", bookingType: "REMOTE_QUOTE", estimatedMinutes: 60, icon: "doorbell", description: "Installing a video doorbell in a location that doesn't have existing doorbell wiring or a transformer." },
      { slug: "floodlight-camera-existing", name: "Floodlight Camera at Existing Fixture", bookingType: "INSTANT", estimatedMinutes: 35, basePrice: 345, whileWeThereBasePrice: 210, icon: "camera", description: "Installing a floodlight security camera in place of an existing exterior light fixture." },
      { slug: "new-exterior-flood-camera", name: "New Exterior Flood / Camera Location", bookingType: "REMOTE_QUOTE", estimatedMinutes: 90, basePrice: 495, icon: "camera", description: "Installing a floodlight security camera in a new location that doesn't currently have a fixture or wiring." },
      { slug: "smart-thermostat-install", name: "Smart Thermostat Installation", bookingType: "INSTANT", estimatedMinutes: 30, basePrice: 300, whileWeThereBasePrice: 180, icon: "thermostat", description: "Installing a smart thermostat you provide, in place of your existing thermostat." },
      { slug: "doorbell-transformer-replacement", name: "Doorbell Transformer Replacement", bookingType: "INSTANT", estimatedMinutes: 30, basePrice: 375, whileWeThereBasePrice: 255, icon: "doorbell", description: "Replacing the low-voltage transformer that powers your doorbell system." },
    ],
  },
  {
    slug: "panels-troubleshooting",
    name: "Panels & Troubleshooting",
    icon: "panel",
    services: [
      { slug: "single-pole-breaker-replacement", name: "Single-Pole Breaker Replacement", bookingType: "INSTANT", estimatedMinutes: 20, basePrice: 330, whileWeThereBasePrice: 165, icon: "breaker", description: "Replacing a single standard breaker in your electrical panel." },
      { slug: "double-pole-breaker-replacement", name: "Double-Pole Breaker Replacement", bookingType: "INSTANT", estimatedMinutes: 25, basePrice: 420, whileWeThereBasePrice: 240, icon: "breaker", description: "Replacing a double-pole (240V) breaker in your electrical panel." },
      { slug: "electrical-troubleshooting", name: "Electrical Troubleshooting", bookingType: "TROUBLESHOOT_ONLY", estimatedMinutes: 60, basePrice: 300, icon: "troubleshooting", description: "For when something's wrong but you're not sure what — a dead outlet, flickering lights, a tripping breaker. Covers the visit and the first 60 minutes of diagnostic time; the repair itself is quoted separately once we know what's wrong." },
      { slug: "electrical-panel-replacement", name: "Electrical Panel Replacement", bookingType: "REMOTE_QUOTE", estimatedMinutes: 360, basePrice: 3995, icon: "panel", description: "Replacing your entire main electrical panel — for an outdated, damaged, or unsafe panel." },
      { slug: "200a-service-upgrade", name: "200-Amp Service Upgrade", bookingType: "REMOTE_QUOTE", estimatedMinutes: 480, basePrice: 4995, icon: "panel", description: "Upgrading your home's main electrical service to 200 amps, typically needed for additions, EV chargers, or older homes with insufficient capacity." },
    ],
  },
  {
    slug: "ev-garage",
    name: "EV & Garage",
    icon: "ev",
    services: [
      { slug: "level-2-ev-charger", name: "Level 2 EV Charger Installation", bookingType: "REMOTE_QUOTE", estimatedMinutes: 150, basePrice: 1295, icon: "ev", description: "Installing a Level 2 (240V) electric vehicle charger in your garage or driveway." },
      { slug: "garage-door-opener-outlet-ev", name: "Garage Door Opener Outlet", bookingType: "ADJUSTED", estimatedMinutes: 60, basePrice: 520, whileWeThereBasePrice: 370, icon: "new-outlet", description: "A new outlet installed near your garage door opener motor on the ceiling, so it's no longer running on an extension cord." },
      { slug: "240v-garage-outlet", name: "240V Garage Outlet", bookingType: "REMOTE_QUOTE", estimatedMinutes: 90, icon: "new-outlet", description: "Adding a new 240V outlet in your garage for equipment other than an EV charger (welder, air compressor, etc.)." },
    ],
  },
  {
    slug: "dedicated-circuits",
    name: "Dedicated Circuits",
    icon: "circuit",
    services: [
      { slug: "sump-pump-dedicated-circuit", name: "Sump Pump Dedicated Circuit", bookingType: "REMOTE_QUOTE", estimatedMinutes: 90, icon: "circuit", description: "A new circuit and outlet run specifically for a sump pump, on its own breaker." },
      { slug: "freezer-fridge-dedicated-circuit", name: "Freezer / Refrigerator Dedicated Circuit", bookingType: "REMOTE_QUOTE", estimatedMinutes: 90, icon: "circuit", description: "A new circuit and outlet run specifically for a standalone freezer or refrigerator, on its own breaker." },
      { slug: "electric-fireplace-circuit", name: "Electric Fireplace Circuit / Outlet", bookingType: "REMOTE_QUOTE", estimatedMinutes: 90, icon: "circuit", description: "A new dedicated circuit and outlet for an electric fireplace insert or unit." },
      { slug: "new-240v-appliance-circuit", name: "New 240V Appliance Circuit", bookingType: "REMOTE_QUOTE", estimatedMinutes: 120, icon: "circuit", description: "A new 240V dedicated circuit for an appliance not covered elsewhere in our catalog." },
    ],
  },
  {
    slug: "generator-backup-power",
    name: "Generator / Backup Power",
    icon: "generator",
    services: [
      { slug: "generator-inlet-interlock", name: "Generator Inlet + Interlock", bookingType: "REMOTE_QUOTE", estimatedMinutes: 180, icon: "generator", description: "Installing a power inlet box and interlock kit at your panel so a portable generator can safely power your home during an outage." },
      { slug: "transfer-switch", name: "Transfer Switch", bookingType: "REMOTE_QUOTE", estimatedMinutes: 240, icon: "transfer-switch", description: "Installing a manual or automatic transfer switch for whole-home or partial-home backup power." },
    ],
  },
  {
    slug: "pool-spa",
    name: "Pool / Spa",
    icon: "pool",
    services: [
      { slug: "hot-tub-spa-electrical", name: "Hot Tub / Spa Electrical", bookingType: "REMOTE_QUOTE", estimatedMinutes: 120, icon: "pool", description: "The dedicated electrical circuit and disconnect required for a hot tub or spa." },
      { slug: "pool-equipment-electrical", name: "Pool Equipment Electrical", bookingType: "REMOTE_QUOTE", estimatedMinutes: 120, icon: "pool", description: "Electrical for pool pumps, heaters, and other pool equipment." },
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
          estimatedMinutes: svc.estimatedMinutes ?? null,
          active: svc.active ?? true,
          disclaimer: svc.disclaimer ?? null,
          shortDescription: svc.description,
          icon: svc.icon ?? null,
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
          estimatedMinutes: svc.estimatedMinutes ?? null,
          active: svc.active ?? true,
          disclaimer: svc.disclaimer ?? null,
          shortDescription: svc.description,
          icon: svc.icon ?? null,
        },
      });
    }
    console.log(`  ✓ ${cat.name} (${cat.services.length} services)`);
  }

  const existingArea = await prisma.serviceArea.findFirst({ where: { active: true } });
  if (!existingArea) {
    await prisma.serviceArea.create({
      data: { name: "Monmouth & Ocean Counties, NJ", zipCodes: [], active: true },
    });
  }

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
