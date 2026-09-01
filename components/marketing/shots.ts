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
};
