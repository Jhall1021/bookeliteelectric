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
// Every image should be a real file in /public/images/ before being
// listed here — a missing file would 404 the image, not fall back
// gracefully, since Next.js's <Image> doesn't know the difference
// between "no image for this service" and "image path is wrong."
export const SERVICE_IMAGES: Record<string, { src: string; alt: string; aspectRatio: "16/9" | "4/3" }> = {
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
    alt: "A modern ceiling fan with integrated light installed in a styled bedroom",
    aspectRatio: "16/9",
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
    alt: "A weatherproof exterior GFCI outlet installed on a home's siding near the front porch",
    aspectRatio: "4/3",
  },
};

export function getServiceImage(slug: string): { src: string; alt: string; aspectRatio: "16/9" | "4/3" } | null {
  return SERVICE_IMAGES[slug] ?? null;
}
