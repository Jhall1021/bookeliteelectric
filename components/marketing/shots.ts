/**
 * Product screenshots used on the marketing site.
 *
 * Every one of these is captured from a FICTIONAL demonstration contractor —
 * never Elite, never any real contractor. Two reasons, and the second is the
 * one that makes it a rule rather than a preference:
 *
 * 1. Positioning. Price2Book's homepage has to read as a platform that works
 *    for contractors, not as one electrician's product demo.
 * 2. Privacy. Real tenants have real customers, real bookings and real
 *    addresses on these screens. A screenshot is a publication, and a
 *    published screenshot cannot be un-published.
 *
 * WHAT THE SHORTENING PASS REMOVED, AND WHY IT IS NOT A LOSS.
 *
 * The page carried a storefront hero shot and an eight-module screenshot
 * gallery. Both are gone. The gallery was proving "everything your customer
 * sees traces back to something you control" a third time, after the hero and
 * the live demonstration had already made it. The storefront shot had a
 * second problem the owner named: it showed the TV & Media category, where a
 * card reading "Full-Motion Articulating Mount — From $450" makes a visitor
 * stop and argue about one contractor's price instead of reading the page.
 *
 * Replacing that shot needs a demonstration tenant in the database, which
 * this marketing workstream does not create. It is listed as a follow-up
 * rather than faked from a real tenant's storefront.
 *
 * Other captured screens stay in public/marketing/ unreferenced, so a future
 * section can use one without a new capture run.
 *
 * ────────────────────────────────────────────────────────────────────────
 * THE RULE ABOVE WAS NARROWED BY THE OWNER ON 2 SEPTEMBER 2026.
 *
 * "Never a real contractor" cost more than it was worth: the demonstration
 * tenant no longer exists, capturing the admin side needs an authenticated
 * session, and the homepage was left explaining the product in prose while
 * the real screens sat unused. The owner's decision was explicit and narrow —
 * use the REAL storefront and change the contractor's NAME.
 *
 * The privacy half of the rule did NOT go away, and the first capture run
 * proved why it matters: renaming the company left the source tenant's street
 * address, telephone number and license number in the footer, attributed to a
 * company that does not exist. scripts/capture-storefront-shots.ts now scrubs
 * those too and REFUSES to write a file if any spelling of the source tenant
 * survives.
 *
 * One brand across every shot — Voltmark Electric — so the homeowner captures
 * and the admin captures show the same company rather than two.
 */
export type Shot = { src: string; alt: string; w: number; h: number };

export const SHOTS: Record<string, Shot | null> = {
  // Captured at 1440 CSS px with deviceScaleFactor 2 by
  // scripts/capture-marketing-shots.ts. Stating the intrinsic size here is
  // what lets next/image reserve the space, so the page does not reflow.
  guidedPricing: {
    src: "/marketing/guided-pricing.png",
    alt: "The Guided Pricing editor, showing a question, its answers and what each answer does",
    w: 2080,
    h: 1240,
  },

  // THE CONTRACTOR'S PANEL — /product/what-you-control.
  //
  // These four were captured in the same run as guidedPricing and sat here
  // unreferenced, which is exactly what the note above anticipated: a later
  // section can use one without a new capture run. All four are Voltmark
  // Electric, the demonstration contractor from scripts/demo-contractor.ts.
  servicesPricing: {
    src: "/marketing/services-pricing.png",
    alt: "The Services & Pricing catalog, listing each service with its price, labor hours, same-visit price and materials",
    w: 2080,
    h: 1240,
  },
  storefrontDesign: {
    src: "/marketing/storefront-design.png",
    alt: "The storefront design picker, showing selectable layouts previewed with the contractor's own branding",
    w: 2080,
    h: 1240,
  },
  hoursAvailability: {
    src: "/marketing/hours-availability.png",
    alt: "The Hours & Availability screen, where working hours and bookable windows are set",
    w: 2080,
    h: 1240,
  },
  // ── The homeowner's side, captured from the running storefront ────────
  homeServices: {
    src: "/marketing/home-services.png",
    alt: "A contractor's storefront, showing service categories with photographs and the number of services in each",
    w: 2560,
    h: 1400,
  },
  homeQuestion: {
    src: "/marketing/home-question.png",
    alt: "A Guided Pricing question asking why a homeowner is replacing an outlet, with plain-language answers",
    w: 2560,
    h: 1120,
  },
  homePrice: {
    src: "/marketing/home-price.png",
    alt: "A contractor-approved price shown to a homeowner, with an option to add it to their visit",
    w: 2560,
    h: 940,
  },

  serviceArea: {
    src: "/marketing/service-area.png",
    alt: "The Service Area screen, where the postcodes a contractor will travel to are set",
    w: 2080,
    h: 1240,
  },
};
