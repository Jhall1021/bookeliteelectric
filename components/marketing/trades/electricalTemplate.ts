/**
 * GENERATED — do not edit by hand.
 *
 * Written by scripts/capture-trade-electrical.ts from the canonical
 * electrical template. Categories, services, routing behavior and the
 * Guided Pricing example are the product's, not a marketer's.
 *
 * Regenerate:  npx tsx scripts/capture-trade-electrical.ts
 * Check drift: npx tsx scripts/capture-trade-electrical.ts --check
 */
export const ELECTRICAL_TEMPLATE = {
  "generatedBy": "scripts/capture-trade-electrical.ts",
  "trade": "electrical",
  "templateVersion": 1,
  "note": "Captured read-only from the canonical electrical template — the catalog a new electrical contractor is provisioned from. It carries trade structure and no economics, which is why it is safe to publish.",
  "categoryCount": 13,
  "serviceCount": 75,
  "counts": {
    "priced": 48,
    "priced_with_photos": 9,
    "reviewed": 0,
    "quoted": 18
  },
  "categories": [
    {
      "slug": "outlets-switches",
      "name": "Outlets & Switches",
      "services": [
        {
          "key": "customer-supplied-non-smart-outlet",
          "name": "Customer-Supplied Non-Smart Outlet",
          "description": null,
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "swap-out-customer-supplied-non-smart-switch",
          "name": "Customer-Supplied Non-Smart Switch",
          "description": "Remove and replace customer supplied switch. ",
          "questions": 3,
          "resolution": "priced"
        },
        {
          "key": "customer-supplied-smart-switch",
          "name": "Customer-Supplied Smart Switch",
          "description": "Installing a smart switch you've already purchased (Lutron, Kasa, etc.) in place of an existing switch.  ",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "occupancy-motion-switch",
          "name": "Occupancy / Motion Sensor Switch",
          "description": "Replacing an existing switch with one that turns the light on/off automatically based on motion in the room.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "replace-3-way-switch",
          "name": "Replace 3-Way Switch",
          "description": "Swapping one switch in a pair that controls the same light from two locations (like a hallway or stairwell).",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "replace-gfci-outlet",
          "name": "Replace GFCI Outlet",
          "description": "Swapping an existing GFCI (the outlet with the TEST/RESET buttons, usually in kitchens, bathrooms, or garages) for a new one in the same location.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "replace-led-dimmer",
          "name": "Replace LED Dimmer",
          "description": "Swapping an existing dimmer switch for a new LED-compatible dimmer in the same location.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "replace-standard-outlet",
          "name": "Replace Standard Outlet",
          "description": "Swapping out an existing outlet that's already there — cracked, discolored, loose, or just old — for a brand-new one in the same spot. This does NOT add a new outlet anywhere new; see \"New 120V Outlet\" for that.",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "replace-standard-switch",
          "name": "Replace Standard Switch",
          "description": "Swapping an existing single light switch for a new one in the same location.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "smart-outlet-upgrade",
          "name": "Smart Outlet Upgrade",
          "description": "Replacing an existing outlet with a Wi-Fi smart outlet you can control from your phone.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "smart-switch-upgrade",
          "name": "Smart Switch Upgrade",
          "description": "Installing a smart switch (Lutron, Kasa, etc.) in place of an existing switch.  ",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "timer-switch-install",
          "name": "Timer Switch Installation",
          "description": "Replacing an existing switch with a timer switch that turns the light off automatically after a set time.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "usb-outlet-upgrade",
          "name": "USB / USB-C Outlet Upgrade",
          "description": "Replacing an existing outlet with a combo outlet that includes built-in USB / USB-C charging ports.",
          "questions": 1,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "lighting",
      "name": "Lighting",
      "services": [
        {
          "key": "new-wall-sconce",
          "name": "Install a New Wall Sconce",
          "description": "A wall light where there isn't one now. You supply the fixture; we run the wiring and put it up.",
          "questions": 2,
          "resolution": "priced_with_photos"
        },
        {
          "key": "new-ceiling-light",
          "name": "Install New Ceiling Light",
          "description": "Adding a ceiling light fixture in a location that doesn't currently have one — different from replacing an existing fixture. Final price depends on attic access and whether there's an existing fixture or switch to work from.",
          "questions": 13,
          "resolution": "priced"
        },
        {
          "key": "new-exterior-lighting-locations",
          "name": "New Exterior Lighting Locations",
          "description": "Adding a light fixture to an outdoor location that doesn't currently have one or existing wiring.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "outdoor-landscape-lighting",
          "name": "Outdoor Landscape Lighting",
          "description": "Adding low-voltage lighting along walkways, garden beds, or architectural features in your yard.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "under-cabinet-led-lighting",
          "name": "Professional LED Under-Cabinet Lighting",
          "description": "Adding LED strip or puck lighting underneath your kitchen (or other) cabinets, wired in rather than battery-powered.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "recessed-lighting",
          "name": "Recessed Lighting Installation",
          "description": "New recessed lights in an existing ceiling. The first covers the setup, and each one after that costs less because we're already up there.",
          "questions": 12,
          "resolution": "priced"
        },
        {
          "key": "remove-and-replace-existing-chandelier",
          "name": "Replace an Existing Chandelier",
          "description": "Swapping a chandelier for a new one in the same spot. Standard sizes on a normal ceiling get a price straight away; larger or more elaborate fixtures we'll look at first.",
          "questions": 3,
          "resolution": "priced_with_photos"
        },
        {
          "key": "replace-wall-sconce",
          "name": "Replace an Existing Wall Sconce",
          "description": "Taking down a wall light and putting up the new one you've bought, in the same spot.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "replace-exterior-light-fixture",
          "name": "Replace Exterior Light Fixture",
          "description": "Removing your existing outdoor light fixture and installing a new one you provide, in the same location.",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "replace-interior-light-fixture",
          "name": "Replace Interior Light Fixture",
          "description": "Taking down your existing ceiling light and putting up a new one you've bought, in the same spot. Flush mounts, semi-flush, and pendants all belong here. For something larger or more decorative — multiple tiers, a lot of crystals — use Replace an Existing Chandelier instead.",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "replace-motion-flood-light",
          "name": "Replace Motion / Flood Light",
          "description": "Swapping an existing motion-activated or flood light fixture for a new one in the same location.",
          "questions": 2,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "appliance-install",
      "name": "Appliance Installation",
      "services": [
        {
          "key": "dishwasher-electrical",
          "name": "Dishwasher Electrical Connection / Reconnection",
          "description": "Having a dishwasher swapped out? We'll disconnect the old one electrically and connect the new one. Electrical work only — no water lines, drain hose, or fitting the appliance itself.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "garbage-disposal-install",
          "name": "Garbage Disposal Electrical Disconnect / Reconnect",
          "description": "Having a disposal replaced? We'll handle the electrical disconnect and reconnect. Electrical work only — no sink flange, drain piping, or plumbing.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "install-new-microwave",
          "name": "Install New Microwave",
          "description": "Installing an over-the-range microwave in a spot that doesn't already have one — for example, above a cooktop with no hood or existing microwave. Price depends on what's currently there.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "dryer-receptacle-replacement",
          "name": "Remove and Replace Existing 220V Dryer Outlet",
          "description": "Replacing the existing high-voltage outlet behind your dryer, in the same location.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "otr-microwave-install",
          "name": "Remove and Replace Existing Microwave",
          "description": "Removing your existing over-the-range microwave and installing a new one in the same spot, using the electrical connection that's already there.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "range-receptacle-replacement",
          "name": "Replace 220V Electric Range/Stove Outlet",
          "description": "Replacing the existing high-voltage outlet behind your electric range/stove, in the same location.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "replace-range-hood",
          "name": "Replace Existing Range Hood",
          "description": "We remove your old range hood, mount the replacement you've bought, reconnect the power and the existing ducting, and test it. For an existing hood in the same spot using the same venting.",
          "questions": 5,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "tv-media",
      "name": "TV & Media",
      "services": [
        {
          "key": "soundbar-installation",
          "name": "Customer-Supplied Soundbar Installation",
          "description": "Mounting a soundbar below your TV or on a shelf, with cable concealment.",
          "questions": 6,
          "resolution": "priced"
        },
        {
          "key": "articulating-tv-mount",
          "name": "Full-Motion Articulating Mount",
          "description": "A full-motion (swivel/extend) wall mount supplied by your electrician, added to a TV installation if you don't already have a compatible mount.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "new-coax-line",
          "name": "Install New Coax / Cable TV Line",
          "description": "A coax line run to a new outlet where you need one — for a TV, a cable box, or an internet modem in a different room.",
          "questions": 2,
          "resolution": "priced_with_photos"
        },
        {
          "key": "new-ethernet-line",
          "name": "Install New Ethernet / Network Line",
          "description": "A network cable run from your router or modem to a new jack in another room, ending in a proper wall plate rather than a cable under the door.",
          "questions": 2,
          "resolution": "priced_with_photos"
        },
        {
          "key": "tv-install-existing-location",
          "name": "Install TV in Existing Location",
          "description": "Mounting your TV where power and cable routing are already in place — no new outlet or cable concealment needed, so it's faster and less expensive than a full installation.",
          "questions": 3,
          "resolution": "priced"
        },
        {
          "key": "tv-installation",
          "name": "Professional TV Installation In New Location (Includes Outlet)",
          "description": "Mounting your TV on the wall, with cable concealment. Price adjusts based on TV size and what's needed for power. Does not include the mount itself unless you add one. Does not include running the low voltage cabling anywhere other than directly below the tv. ",
          "questions": 8,
          "resolution": "priced"
        },
        {
          "key": "tilt-tv-mount",
          "name": "Tilt TV Mount",
          "description": "A tilting wall mount supplied by your electrician, added to a TV installation if you don't already have a compatible mount.",
          "questions": 0,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "smart-home-security",
      "name": "Smart Home & Security",
      "services": [
        {
          "key": "doorbell-transformer-replacement",
          "name": "Doorbell Transformer Replacement",
          "description": "Replacing the low-voltage transformer that powers your doorbell system.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "floodlight-camera-existing",
          "name": "Floodlight Camera at Existing Fixture",
          "description": "Installing a floodlight security camera in place of an existing exterior light fixture.",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "new-exterior-flood-camera",
          "name": "New Exterior Flood or Camera Location",
          "description": "Power and a mount for a camera or floodlight where there isn't one today. You supply the camera; we put a receptacle where it needs one and get it up.",
          "questions": 3,
          "resolution": "priced_with_photos"
        },
        {
          "key": "new-video-doorbell-wiring",
          "name": "New Video Doorbell Wiring",
          "description": "Installing a video doorbell in a location that doesn't have existing doorbell wiring or a transformer.",
          "questions": 1,
          "resolution": "quoted"
        },
        {
          "key": "smart-thermostat-install",
          "name": "Smart Thermostat Installation",
          "description": "Installing a smart thermostat you provide, in place of your existing thermostat.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "video-doorbell-existing-wiring",
          "name": "Video Doorbell — Existing Wiring",
          "description": "Installing a video doorbell (Ring, Nest, etc.) you provide, using your existing doorbell wiring.",
          "questions": 0,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "dedicated-circuits",
      "name": "Dedicated Circuits",
      "services": [
        {
          "key": "dedicated-120v-circuit-outlet",
          "name": "Dedicated Circuit & Outlet",
          "description": "An outlet with its own circuit run from the panel, so nothing else can trip it. Needed for a fridge, freezer, window air conditioner, microwave, space heater or shop equipment — and worth choosing anyway if the outlets nearby already give you trouble.",
          "questions": 6,
          "resolution": "priced"
        },
        {
          "key": "electric-fireplace-circuit",
          "name": "Electric Fireplace Circuit / Outlet",
          "description": "A new dedicated circuit and outlet for an electric fireplace insert or unit.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "freezer-fridge-dedicated-circuit",
          "name": "Freezer / Refrigerator Dedicated Circuit",
          "description": "A new circuit and outlet run specifically for a standalone freezer or refrigerator, on its own breaker.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "new-240v-appliance-circuit",
          "name": "New 240V Appliance Circuit",
          "description": "A new 240V dedicated circuit for an appliance not covered elsewhere in our catalog.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "sump-pump-dedicated-circuit",
          "name": "Sump Pump Dedicated Circuit",
          "description": "A new circuit and outlet run specifically for a sump pump, on its own breaker.",
          "questions": 0,
          "resolution": "quoted"
        }
      ]
    },
    {
      "slug": "fans",
      "name": "Fans",
      "services": [
        {
          "key": "new-ceiling-fan",
          "name": "Install New Ceiling Fan In New Location",
          "description": "Adding a ceiling fan in a location that doesn't currently have one — needs a fan-rated electrical box, different from replacing an existing fan. Final price depends on attic access and whether there's an existing fixture or switch to work from.",
          "questions": 13,
          "resolution": "priced"
        },
        {
          "key": "bathroom-fan-light-combo",
          "name": "Remove and Replace Owner-Supplied Bathroom Exhaust Fan",
          "description": "You buy the fan — or fan and light combo — and we swap it out. Same job either way, so it's one price.",
          "questions": 1,
          "resolution": "priced"
        },
        {
          "key": "replace-bathroom-exhaust-fan",
          "name": "Replace Bathroom Exhaust Fan",
          "description": "Don't want to pick one out? Send us a photo and the size of your existing housing and we'll quote the fan and the work together.",
          "questions": 2,
          "resolution": "quoted"
        },
        {
          "key": "replace-ceiling-fan",
          "name": "Replace Existing Ceiling Fan With New Fan",
          "description": "Removing your existing ceiling fan and installing a new one you provide, in the same location, using the existing electrical box.",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "fan-replacing-light",
          "name": "Replacing Existing Light With New Fan",
          "description": "Removing a ceiling light fixture (not a fan) and installing a ceiling fan in its place — this requires confirming the existing box can support a fan's weight.",
          "questions": 11,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "new-outlets",
      "name": "New Outlets",
      "services": [
        {
          "key": "bidet-smart-toilet-outlet",
          "name": "Bidet / Smart Toilet Outlet",
          "description": "A new outlet installed near the toilet to power a bidet attachment or smart toilet seat.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "exterior-gfci-standard",
          "name": "Exterior GFCI — Back-to-Back Power",
          "description": "A new outdoor weatherproof GFCI outlet, in a location with power already available directly on the other side of that exterior wall.",
          "questions": 2,
          "resolution": "priced_with_photos"
        },
        {
          "key": "exterior-gfci-other-routing",
          "name": "Exterior GFCI — New Outlet Location",
          "description": "A weatherproof outdoor outlet where there's nothing directly behind the wall to tap into. We run new wiring to it.",
          "questions": 4,
          "resolution": "priced_with_photos"
        },
        {
          "key": "garage-door-opener-outlet",
          "name": "Garage Door Opener Outlet",
          "description": "A new outlet installed near your garage door opener motor on the ceiling, so it's no longer running on an extension cord.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "new-120v-outlet",
          "name": "New 120V Outlet",
          "description": "A new outlet where you need one, powered from the nearest circuit. Right for everyday things — lamps, a TV, chargers, a computer. If it's for a fridge, freezer, air conditioner or anything that heats, that needs its own circuit: see Dedicated Circuit & Outlet.",
          "questions": 7,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "panels-troubleshooting",
      "name": "Panels & Troubleshooting",
      "services": [
        {
          "key": "200a-service-upgrade",
          "name": "200-Amp Service Upgrade",
          "description": "Upgrading your home's main electrical service to 200 amps, typically needed for additions, EV chargers, or older homes with insufficient capacity.",
          "questions": 1,
          "resolution": "quoted"
        },
        {
          "key": "double-pole-breaker-replacement",
          "name": "Double-Pole Breaker Replacement",
          "description": "Replacing a double-pole (240V) breaker in your electrical panel.",
          "questions": 1,
          "resolution": "priced_with_photos"
        },
        {
          "key": "electrical-panel-replacement",
          "name": "Electrical Panel Replacement",
          "description": "Replacing your entire main electrical panel — for an outdated, damaged, or unsafe panel.",
          "questions": 1,
          "resolution": "quoted"
        },
        {
          "key": "electrical-troubleshooting",
          "name": "Electrical Troubleshooting",
          "description": "Something not working and you're not sure why? We'll find out. The visit covers up to an hour of diagnostic and repair time — if we can fix it in that hour, that's the price.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "single-pole-breaker-replacement",
          "name": "Single-Pole Breaker Replacement",
          "description": "Replacing a single standard breaker in your electrical panel.",
          "questions": 1,
          "resolution": "priced_with_photos"
        }
      ]
    },
    {
      "slug": "safety-protection",
      "name": "Safety & Protection",
      "services": [
        {
          "key": "home-electrical-safety-inspection",
          "name": "Home Electrical Safety Inspection",
          "description": "A general visual and functional inspection of your home's electrical system, with a written summary of anything that needs attention.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "smoke-co-detector",
          "name": "Replace Existing Smoke/CO Detector Combo",
          "description": "Replacing an existing hardwired combination smoke/carbon monoxide detector in the same location.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "hardwired-smoke-detector",
          "name": "Replace hardwired Smoke Detector",
          "description": "Replacing an existing hardwired smoke detector in the same location.",
          "questions": 0,
          "resolution": "priced"
        },
        {
          "key": "whole-house-surge-protection",
          "name": "Whole-House Surge Protection",
          "description": "Installing a surge protector directly at your electrical panel to protect everything in your home from power surges.",
          "questions": 1,
          "resolution": "priced"
        }
      ]
    },
    {
      "slug": "ev-garage",
      "name": "EV & Garage",
      "services": [
        {
          "key": "240v-garage-outlet",
          "name": "240V Garage Outlet",
          "description": "Adding a new 240V outlet in your garage for equipment other than an EV charger (welder, air compressor, etc.).",
          "questions": 1,
          "resolution": "quoted"
        },
        {
          "key": "garage-door-opener-outlet-ev",
          "name": "Garage Door Opener Outlet",
          "description": "A new outlet installed near your garage door opener motor on the ceiling, so it's no longer running on an extension cord.",
          "questions": 2,
          "resolution": "priced"
        },
        {
          "key": "level-2-ev-charger",
          "name": "Level 2 EV Charger Installation",
          "description": "Installing a Level 2 (240V) electric vehicle charger in your garage or driveway.",
          "questions": 3,
          "resolution": "quoted"
        }
      ]
    },
    {
      "slug": "generator-backup-power",
      "name": "Generator / Backup Power",
      "services": [
        {
          "key": "generator-inlet-interlock",
          "name": "Generator Inlet + Interlock",
          "description": "Installing a power inlet box and interlock kit at your panel so a portable generator can safely power your home during an outage.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "transfer-switch",
          "name": "Transfer Switch",
          "description": "Installing a manual or automatic transfer switch for whole-home or partial-home backup power.",
          "questions": 0,
          "resolution": "quoted"
        }
      ]
    },
    {
      "slug": "pool-spa",
      "name": "Pool / Spa",
      "services": [
        {
          "key": "hot-tub-spa-electrical",
          "name": "Hot Tub / Spa Electrical",
          "description": "The dedicated electrical circuit and disconnect required for a hot tub or spa.",
          "questions": 0,
          "resolution": "quoted"
        },
        {
          "key": "pool-equipment-electrical",
          "name": "Pool Equipment Electrical",
          "description": "Electrical for pool pumps, heaters, and other pool equipment.",
          "questions": 0,
          "resolution": "quoted"
        }
      ]
    }
  ],
  "example": {
    "service": "Dishwasher Electrical Connection / Reconnection",
    "questionKey": "appliance_power_present",
    "prompt": "Is there already suitable power at the dishwasher?",
    "helpText": null,
    "options": [
      {
        "label": "Yes, the old one is plugged in or wired in",
        "routeAction": "RESOLVE_INSTANT"
      },
      {
        "label": "No, there's no power there",
        "routeAction": "REROUTE_SERVICE"
      },
      {
        "label": "I'm not sure",
        "routeAction": "PHOTO_REVIEW"
      }
    ]
  }
} as const;
