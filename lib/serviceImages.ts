// Maps a service's slug to a bespoke lifestyle/finished-result image, per
// the Visual Design Handoff (Section 3.1 — ServiceIntro is the highest-
// priority target for real photography instead of icon-only screens).
//
// Deliberately a plain code-level lookup, NOT a new Prisma field — no
// schema change, no migration, nothing for the seed scripts to know
// about. A service with no entry here just falls back to the existing
// icon-only ServiceIntro layout, so this scales naturally as more images
// arrive from the ChatGPT art-direction pass: add one line here, nothing
// else changes.
//
// aspectRatio accepts any valid CSS aspect-ratio value ("W/H") — not
// restricted to 16:9 or 4:3. Incoming source images vary in their native
// crop (a second batch came in closer to square/portrait), and forcing
// every image into one of two preset shapes would mean cropping into the
// actual composition provided rather than preserving it.
//
// Every image should be a real file in /public/images/ before being
// listed here — a missing file would 404 the image, not fall back
// gracefully, since Next.js's <Image> doesn't know the difference
// between "no image for this service" and "image path is wrong."
//
// NOTE (batch-2 audit): six of these files were originally exported as
// *design comps* rather than raw photos — each carried ~40-50px of
// off-white page background plus the comp's rounded card corners baked
// into the pixels, which rendered as a card-inside-a-card on
// ServiceIntro. Those six have been re-cropped to the photo itself and
// their aspectRatio values updated to the new true dimensions. They are
// still crops of comps (~980px on the long edge, vs 1672px for
// service-recessed-lighting.jpg) and remain on the list to be re-exported
// from source at full resolution.
export const SERVICE_IMAGES: Record<string, { src: string; alt: string; aspectRatio: string }> = {
  "tv-installation": {
    src: "/images/service-tv-mounting.jpg",
    alt: "A wall-mounted TV with concealed wiring above a media console in a styled living room",
    aspectRatio: "16/9",
  },
  "recessed-lighting": {
    src: "/images/service-recessed-lighting.jpg",
    alt: "A living room ceiling with warm recessed can lighting installed throughout",
    aspectRatio: "16/9",
  },
  "replace-ceiling-fan": {
    src: "/images/service-ceiling-fan.jpg",
    alt: "A five-blade ceiling fan with integrated light installed above a bed",
    aspectRatio: "4/3",
  },
  "replace-interior-light-fixture": {
    src: "/images/service-light-fixture.jpg",
    alt: "An elegant drum-shade pendant light fixture hanging above a dining room table",
    aspectRatio: "16/9",
  },
  "under-cabinet-led-lighting": {
    src: "/images/service-under-cabinet-lighting.jpg",
    alt: "Warm LED under-cabinet lighting illuminating a kitchen countertop and backsplash",
    aspectRatio: "16/9",
  },
  "new-120v-outlet": {
    src: "/images/service-new-outlet.jpg",
    alt: "A clean white duplex outlet freshly installed on a bedroom wall next to a nightstand",
    aspectRatio: "4/3",
  },
  // Shares service-new-outlet.jpg with new-120v-outlet above. The two stay
  // separate services in the catalog (a swap vs. a newly run circuit), but
  // the finished result is identical from the customer's side — the
  // difference is inside the wall. Reusing the photo is accurate, and it
  // fills the last icon-only card in the homepage Popular Services grid.
  "replace-standard-outlet": {
    src: "/images/service-new-outlet.jpg",
    alt: "A clean white duplex outlet on a bedroom wall next to a nightstand",
    aspectRatio: "4/3",
  },
  "exterior-gfci-standard": {
    src: "/images/service-exterior-outlet.jpg",
    alt: "A weatherproof exterior GFCI outlet, cover open, installed on a home's siding",
    aspectRatio: "948/1254",
  },
  // Re-cropped 2026-08-19: was 1122/949 (comp canvas incl. chrome).
  "otr-microwave-install": {
    src: "/images/service-appliance-microwave.jpg",
    alt: "A stainless steel over-the-range microwave and range installed in a dark kitchen",
    aspectRatio: "976/844",
  },
  // Re-cropped 2026-08-19: was 1085/1046 (comp canvas incl. chrome).
  "single-pole-breaker-replacement": {
    src: "/images/service-breaker.jpg",
    alt: "An open electrical panel showing neatly organized breakers",
    aspectRatio: "989/972",
  },
  // Re-cropped 2026-08-19: was 1086/1009 (comp canvas incl. chrome).
  "level-2-ev-charger": {
    src: "/images/service-ev-charger.jpg",
    alt: "A Level 2 EV charger mounted on a garage exterior wall next to a parked electric vehicle",
    aspectRatio: "977/911",
  },
  // RE-ENABLED with real art. The previous file showed a whole-home standby
  // generator, a different product from this service (an inlet box plus a
  // panel interlock, for connecting a *portable* generator).
  // service-generator.jpg is now unreferenced and can be deleted.
  "generator-inlet-interlock": {
    src: "/images/service-generator-inlet-interlock.jpg",
    alt: "A weatherproof generator inlet box beside an open panel fitted with a breaker interlock",
    aspectRatio: "1600/1238",
  },
  // Re-cropped 2026-08-19: was 1122/926 (comp canvas incl. chrome).
  "whole-house-surge-protection": {
    src: "/images/service-surge-protection.jpg",
    alt: "A whole-home surge protection device installed next to an electrical panel",
    aspectRatio: "1069/878",
  },
  // Re-cropped 2026-08-19: was 1086/1076 (comp canvas incl. chrome).
  "transfer-switch": {
    src: "/images/service-transfer-switch.jpg",
    alt: "A transfer switch installed next to an electrical panel in a garage",
    aspectRatio: "983/1004",
  },

  // --- Batch 3 (2026-08-19) --------------------------------------------
  // Photo layer extracted from the comps: card chrome, rounded corners and
  // the baked-in caption panel removed. Same ~1000px-long-edge caveat as
  // the batch-2 crops above — still pending a full-resolution re-export.
  "replace-led-dimmer": {
    src: "/images/service-dimmer-install.jpg",
    alt: "A wall dimmer switch beside a warmly lit pendant fixture over a dining table",
    aspectRatio: "963/982",
  },
  "electrical-troubleshooting": {
    src: "/images/service-electrical-troubleshooting.jpg",
    alt: "A digital multimeter with test leads resting beside an opened wall switch box",
    aspectRatio: "981/920",
  },
  "outdoor-landscape-lighting": {
    src: "/images/service-landscape-lighting.jpg",
    alt: "Path lights and uplighting illuminating a stone walkway and front entry at dusk",
    aspectRatio: "1033/877",
  },
  "smart-thermostat-install": {
    src: "/images/service-smart-thermostat.jpg",
    alt: "A round smart thermostat mounted on a wall with an open living room beyond",
    aspectRatio: "991/957",
  },
  "usb-outlet-upgrade": {
    src: "/images/service-usb-and-smart.jpg",
    alt: "A combination USB-A and USB-C wall outlet charging a phone on a bedside table",
    aspectRatio: "1000/928",
  },
  "smoke-co-detector": {
    src: "/images/service-smoke-and-co.jpg",
    alt: "A combination smoke and carbon monoxide detector mounted on a hallway ceiling",
    aspectRatio: "1005/824",
  },
  "hot-tub-spa-electrical": {
    src: "/images/service-pool-and-spa.jpg",
    alt: "An exterior safety disconnect and conduit runs serving a hot tub and pool at dusk",
    aspectRatio: "1028/971",
  },
  // Same file intentionally serves both bathroom fan services — the unit
  // shown is a fan/light combo, which reads correctly for the combo install
  // and is still a plain exhaust fan replacement from the customer's view.
  // Alt text differs per entry to match what each page is actually selling.
  "replace-bathroom-exhaust-fan": {
    src: "/images/service-bathroom-exhaust.jpg",
    alt: "A ceiling-mounted bathroom exhaust fan above a tiled walk-in shower",
    aspectRatio: "1013/804",
  },
  "bathroom-fan-light-combo": {
    src: "/images/service-bathroom-exhaust.jpg",
    alt: "A ceiling-mounted bathroom exhaust fan with an integrated light above a tiled walk-in shower",
    aspectRatio: "1013/804",
  },

  "floodlight-camera-existing": {
    src: "/images/service-floodlight-camera.jpg",
    alt: "A floodlight security camera mounted beside a garage door, both lamps lit at dusk",
    aspectRatio: "997/878",
  },
  "new-exterior-flood-camera": {
    src: "/images/service-security-camera.jpg",
    alt: "A bullet security camera mounted on lap siding beside a home's front entry",
    aspectRatio: "1011/867",
  },
  "soundbar-installation": {
    src: "/images/service-soundbar.jpg",
    alt: "A wall-mounted soundbar installed below a flat-screen TV on a wood-panelled wall",
    aspectRatio: "1000/935",
  },
  // --- Batch A1-A9 (2026-08-19) ----------------------------------------
  // First set delivered to the export spec: full-bleed 1600x1200 photos,
  // no card chrome, no caption text. All 4/3 natively, so no crop needed
  // in either grid. Several are shared across services whose finished
  // result is visually identical — the pattern already used for the outlet
  // and bathroom-fan photos.

  // A1 ceiling fan — also replaces the old 287x331 file, which was too
  // soft to use anywhere.
  "new-ceiling-fan": {
    src: "/images/service-ceiling-fan.jpg",
    alt: "A five-blade ceiling fan with integrated light installed above a bed",
    aspectRatio: "4/3",
  },
  "fan-replacing-light": {
    src: "/images/service-ceiling-fan.jpg",
    alt: "A ceiling fan with integrated light where a light fixture used to be",
    aspectRatio: "4/3",
  },

  // A2 specialty / sensor switch
  "customer-supplied-smart-switch": {
    src: "/images/service-smart-switch.jpg",
    alt: "A smart wall switch installed in a hallway with lit rooms beyond",
    aspectRatio: "4/3",
  },
  "occupancy-motion-switch": {
    src: "/images/service-smart-switch.jpg",
    alt: "An occupancy sensor switch on a hallway wall detecting someone walking past",
    aspectRatio: "4/3",
  },
  "timer-switch-install": {
    src: "/images/service-smart-switch.jpg",
    alt: "A programmable timer switch installed on a hallway wall",
    aspectRatio: "4/3",
  },

  // A3 video doorbell
  "video-doorbell-existing-wiring": {
    src: "/images/service-video-doorbell.jpg",
    alt: "A video doorbell mounted beside a wood front door",
    aspectRatio: "4/3",
  },
  "new-video-doorbell-wiring": {
    src: "/images/service-video-doorbell.jpg",
    alt: "A video doorbell newly wired and mounted beside a wood front door",
    aspectRatio: "4/3",
  },
  "doorbell-transformer-replacement": {
    src: "/images/service-video-doorbell.jpg",
    alt: "A video doorbell lit and working beside a wood front door",
    aspectRatio: "4/3",
  },

  // A4 utility dedicated circuit
  "sump-pump-dedicated-circuit": {
    src: "/images/service-dedicated-circuit.jpg",
    alt: "A dedicated outlet on a basement wall serving a sump pump",
    aspectRatio: "4/3",
  },
  "freezer-fridge-dedicated-circuit": {
    src: "/images/service-freezer-circuit.jpg",
    alt: "A chest freezer plugged into a dedicated wall outlet in a finished basement",
    aspectRatio: "4/3",
  },
  "dedicated-120v-circuit-outlet": {
    src: "/images/service-dedicated-circuit.jpg",
    alt: "A dedicated 120V circuit and outlet serving equipment on a basement wall",
    aspectRatio: "4/3",
  },

  // A5 standard wall switch
  "replace-standard-switch": {
    src: "/images/service-standard-switch.jpg",
    alt: "A clean white rocker light switch on a wall beside a living room",
    aspectRatio: "4/3",
  },
  "replace-3-way-switch": {
    src: "/images/service-standard-switch.jpg",
    alt: "A white rocker switch controlling a light from one of two locations",
    aspectRatio: "4/3",
  },

  // A6 exterior light fixture
  "replace-exterior-light-fixture": {
    src: "/images/service-exterior-light.jpg",
    alt: "A lantern-style exterior wall light beside a garage door at dusk",
    aspectRatio: "4/3",
  },
  "new-exterior-lighting-locations": {
    src: "/images/service-exterior-light.jpg",
    alt: "A newly added exterior wall light illuminating a home entry at dusk",
    aspectRatio: "4/3",
  },

  // A7 panel replacement
  "electrical-panel-replacement": {
    src: "/images/service-panel-replacement.jpg",
    alt: "A newly installed electrical panel with its door open, breakers labeled",
    aspectRatio: "4/3",
  },
  "200a-service-upgrade": {
    src: "/images/service-panel-replacement.jpg",
    alt: "An upgraded electrical service panel mounted on a utility-room wall",
    aspectRatio: "4/3",
  },

  // A8 garage ceiling outlet
  "garage-door-opener-outlet": {
    src: "/images/service-garage-opener-outlet.jpg",
    alt: "A ceiling-mounted outlet powering a garage door opener",
    aspectRatio: "4/3",
  },
  "garage-door-opener-outlet-ev": {
    src: "/images/service-garage-opener-outlet.jpg",
    alt: "A ceiling outlet installed above a garage door opener",
    aspectRatio: "4/3",
  },

  // A9 240V appliance circuit. The photo is specifically a dryer
  // receptacle, so it covers the dryer service too. It does NOT cover
  // 240v-garage-outlet (laundry room, not a garage) or
  // range-receptacle-replacement (different receptacle).
  "new-240v-appliance-circuit": {
    src: "/images/service-240v-appliance-circuit.jpg",
    alt: "A 240V appliance receptacle installed on a laundry-room wall",
    aspectRatio: "4/3",
  },
  "dryer-receptacle-replacement": {
    src: "/images/service-dryer-outlet.jpg",
    alt: "A four-prong 240V dryer receptacle on a laundry-room wall beside a dryer",
    aspectRatio: "1371/1600",
  },

  // --- Reuse of existing photography, no new art -------------------------
  "install-new-microwave": {
    src: "/images/service-appliance-microwave.jpg",
    alt: "A stainless steel over-the-range microwave installed above a range",
    aspectRatio: "976/844",
  },
  "tv-install-existing-location": {
    src: "/images/service-tv-mounting.jpg",
    alt: "A wall-mounted TV above a media console in a styled living room",
    aspectRatio: "16/9",
  },
  "hardwired-smoke-detector": {
    src: "/images/service-smoke-and-co.jpg",
    alt: "A hardwired smoke detector mounted on a hallway ceiling",
    aspectRatio: "1005/824",
  },
  "double-pole-breaker-replacement": {
    src: "/images/service-breaker.jpg",
    alt: "An open electrical panel showing neatly organized breakers",
    aspectRatio: "989/972",
  },
  "exterior-gfci-other-routing": {
    src: "/images/service-exterior-outlet.jpg",
    alt: "A weatherproof exterior GFCI outlet installed on a home's siding",
    aspectRatio: "948/1254",
  },
  "pool-equipment-electrical": {
    src: "/images/service-pool-and-spa.jpg",
    alt: "An exterior disconnect and conduit serving pool equipment",
    aspectRatio: "1028/971",
  },
  // --- Batch A10-A22 (2026-08-19) --------------------------------------
  // Delivered to spec: full-bleed, no chrome, 1600px long edge. Ten are
  // ~1.29 landscape; the range, dryer and fireplace shots are portrait and
  // crop roughly a third off top and bottom in the 4/3 grids.
  "replace-gfci-outlet": {
    src: "/images/service-gfci-outlet.jpg",
    alt: "A white GFCI outlet with test and reset buttons installed on a wall",
    aspectRatio: "1600/1243",
  },
  "smart-outlet-upgrade": {
    src: "/images/service-smart-outlet.jpg",
    alt: "A smart wall outlet with a status indicator installed on a wall",
    aspectRatio: "1600/1246",
  },
  "bidet-smart-toilet-outlet": {
    src: "/images/service-bidet-smart-toilet-outlet.jpg",
    alt: "A wall outlet installed beside a smart toilet in a bathroom",
    aspectRatio: "1600/1240",
  },
  "new-ceiling-light": {
    src: "/images/service-new-ceiling-light.jpg",
    alt: "A round flush-mount ceiling light fixture lit against a ceiling",
    aspectRatio: "1600/1246",
  },
  "replace-motion-flood-light": {
    src: "/images/service-motion-flood-light.jpg",
    alt: "A twin-head exterior flood light lit against a home's siding at dusk",
    aspectRatio: "1600/1239",
  },
  "elite-tilt-mount": {
    src: "/images/service-tilt-tv-mount.jpg",
    alt: "A flat-screen TV angled on a wall mount in a living room",
    aspectRatio: "1600/1242",
  },
  "elite-articulating-mount": {
    src: "/images/service-articulating-tv-mount.jpg",
    alt: "A full-motion articulating TV wall mount with its arm extended",
    aspectRatio: "1600/1232",
  },
  "dishwasher-electrical": {
    src: "/images/service-dishwasher-connection.jpg",
    alt: "An outlet and flexible conduit connecting a dishwasher inside a cabinet",
    aspectRatio: "1600/1239",
  },
  "garbage-disposal-install": {
    src: "/images/service-garbage-disposal.jpg",
    alt: "A garbage disposal unit plugged into an outlet under a kitchen sink",
    aspectRatio: "1600/1235",
  },
  "range-receptacle-replacement": {
    src: "/images/service-range-outlet.jpg",
    alt: "A 240V range receptacle on a tiled wall above a stove",
    aspectRatio: "1431/1600",
  },
  "electric-fireplace-circuit": {
    src: "/images/service-electric-fireplace.jpg",
    alt: "An outlet installed on the wall below a wall-mounted electric fireplace",
    aspectRatio: "1328/1600",
  },
};

// Category-level art, kept in a SEPARATE keyed export from SERVICE_IMAGES on
// purpose. Category slugs and service slugs live in the same namespace shape
// but are not the same set — "new-outlets" is a category while
// "new-120v-outlet" is a service under it, and "dedicated-circuits" is a
// category with no single service that represents it. One merged map would
// let a category slug silently resolve to a service image (or the reverse)
// with no type error to catch it. Two maps make that collision impossible.
//
// Files use a category- filename prefix to match, so /public/images/ stays
// readable at a glance.
export const CATEGORY_IMAGES: Record<string, { src: string; alt: string; aspectRatio: string }> = {
  "outlets-switches": {
    src: "/images/service-dimmer-install.jpg",
    alt: "A wall dimmer switch beside a warmly lit pendant fixture",
    aspectRatio: "963/982",
  },
  "new-outlets": {
    src: "/images/service-new-outlet.jpg",
    alt: "A clean white duplex outlet installed on a bedroom wall",
    aspectRatio: "4/3",
  },
  "lighting": {
    src: "/images/service-recessed-lighting.jpg",
    alt: "A living room ceiling with warm recessed lighting installed throughout",
    aspectRatio: "16/9",
  },
  "fans": {
    src: "/images/service-ceiling-fan.jpg",
    alt: "A five-blade ceiling fan with integrated light installed above a bed",
    aspectRatio: "4/3",
  },
  "tv-media": {
    src: "/images/service-tv-mounting.jpg",
    alt: "A wall-mounted TV above a media console in a styled living room",
    aspectRatio: "16/9",
  },
  "appliance-install": {
    src: "/images/service-appliance-microwave.jpg",
    alt: "A stainless steel over-the-range microwave installed above a range",
    aspectRatio: "976/844",
  },
  "safety-protection": {
    src: "/images/service-smoke-and-co.jpg",
    alt: "A combination smoke and carbon monoxide detector on a hallway ceiling",
    aspectRatio: "1005/824",
  },
  "smart-home-security": {
    src: "/images/service-floodlight-camera.jpg",
    alt: "A floodlight security camera mounted on a home exterior at dusk",
    aspectRatio: "997/878",
  },
  "panels-troubleshooting": {
    src: "/images/service-panel-replacement.jpg",
    alt: "A newly installed electrical panel with its door open, breakers labeled",
    aspectRatio: "4/3",
  },
  "ev-garage": {
    src: "/images/service-ev-charger.jpg",
    alt: "A Level 2 EV charger mounted on a garage wall",
    aspectRatio: "977/911",
  },
  "dedicated-circuits": {
    src: "/images/category-dedicated-circuits.jpg",
    alt: "A wall-mounted disconnect box feeding a vertical air compressor in a finished garage",
    aspectRatio: "983/941",
  },
  "generator-backup-power": {
    src: "/images/service-transfer-switch.jpg",
    alt: "A transfer switch installed next to an electrical panel in a garage",
    aspectRatio: "983/1004",
  },
  "pool-spa": {
    src: "/images/service-pool-and-spa.jpg",
    alt: "An exterior safety disconnect serving a hot tub and pool at dusk",
    aspectRatio: "1028/971",
  },
};

export function getServiceImage(slug: string): { src: string; alt: string; aspectRatio: string } | null {
  return SERVICE_IMAGES[slug] ?? null;
}

export function getCategoryImage(slug: string): { src: string; alt: string; aspectRatio: string } | null {
  return CATEGORY_IMAGES[slug] ?? null;
}
