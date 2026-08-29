import type { ControlPanelShots } from "./ControlPanel";

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
 * An entry is added only once the file exists. A missing entry renders as an
 * honest "coming soon" frame rather than a mock-up of a screen that does not
 * look like that yet.
 */
const shot = (file: string, alt: string, h: number) => ({
  src: `/marketing/${file}.png`,
  alt,
  // Captured at 1440 CSS px with deviceScaleFactor 2 by
  // scripts/capture-marketing-shots.ts. Stating the intrinsic size here is
  // what lets next/image reserve the space, so the page does not reflow.
  w: 2080,
  h,
});

export const SHOTS: ControlPanelShots = {
  storefront: {
    src: "/marketing/storefront.png",
    alt: "A contractor’s storefront listing TV and media services with upfront prices",
    w: 2880,
    h: 1520,
  },
  modules: {
    "Services & Pricing": shot(
      "services-pricing",
      "The Services & Pricing screen, listing a contractor’s services and what is priced",
      1240,
    ),
    "Guided Pricing": shot(
      "guided-pricing",
      "The Guided Pricing editor, showing a question, its answers and what each answer does",
      1240,
    ),
    "Storefront Design": shot(
      "storefront-design",
      "The storefront design picker, previewing the contractor’s own storefront",
      1240,
    ),
    "Hours & Availability": shot(
      "hours-availability",
      "The working-hours screen, where a contractor sets the days and times customers can book",
      1240,
    ),
    "Service Area": shot(
      "service-area",
      "The service-area screen, showing the counties and ZIP codes a contractor travels to",
      1240,
    ),
    Integrations: shot(
      "integrations",
      "The integrations screen, showing the Jobber connection",
      1240,
    ),
    // Crew Eligibility and Photo Review are deliberately absent — see the
    // notReady entries in scripts/capture-marketing-shots.ts. Both surfaces
    // are empty without a connected Jobber account or real customer
    // submissions, and neither may be faked to fill a slot.
  },
};
