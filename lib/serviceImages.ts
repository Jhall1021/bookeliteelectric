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
    alt: "A ceiling fan with integrated light installed above a bed",
    aspectRatio: "287/331",
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
  // DISABLED 2026-08-19 — content mismatch, not an image-quality problem.
  // service-generator.jpg shows a permanently installed whole-home standby
  // generator (Generac unit on a pad). This service is an inlet box plus a
  // panel interlock kit, which is how a *portable* generator connects —
  // a different product at a very different price point. Leaving the photo
  // in place invites a homeowner to book expecting a standby install.
  // Falls back to icon-only until real inlet/interlock art exists.
  // The cropped file is still in /public/images/ and ready to re-enable
  // if that call is reversed; aspectRatio below is the corrected value
  // (was 1086/991).
  // "generator-inlet-interlock": {
  //   src: "/images/service-generator.jpg",
  //   alt: "A whole-home standby generator installed beside a house at dusk",
  //   aspectRatio: "980/917",
  // },
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
  "dedicated-circuits": {
    src: "/images/category-dedicated-circuits.jpg",
    alt: "A wall-mounted disconnect box feeding a vertical air compressor in a finished garage",
    aspectRatio: "983/941",
  },
};

export function getServiceImage(slug: string): { src: string; alt: string; aspectRatio: string } | null {
  return SERVICE_IMAGES[slug] ?? null;
}

export function getCategoryImage(slug: string): { src: string; alt: string; aspectRatio: string } | null {
  return CATEGORY_IMAGES[slug] ?? null;
}
