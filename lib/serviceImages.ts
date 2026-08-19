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
};

export function getServiceImage(slug: string): { src: string; alt: string; aspectRatio: string } | null {
  return SERVICE_IMAGES[slug] ?? null;
}
