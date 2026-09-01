/**
 * What a contractor controls, in Price2Book's own words — the portal shell.
 *
 * Taken from §17 of the Final Consolidated Handoff, "Contractor control
 * panel", whose headline states the organising idea:
 *
 *   "Everything your customer sees traces back to something you control."
 *
 * and whose constraint is equally load-bearing:
 *
 *   "Do not turn this into a generic CRM dashboard. Every screenshot should
 *    reinforce the narrow Price2Book product boundary."
 *
 * So the modules are named for what the CONTRACTOR decides, not for database
 * tables and not for the `/admin` vocabulary that preceded the product. There
 * is no Customers module, no Invoices, no Dispatch, no Reports: those belong
 * to the FSM the contractor already runs, and Price2Book is the layer between
 * the homeowner and that operation, not a replacement for it.
 *
 * `Guided Pricing` and `While We're There™` are approved product names and are
 * spelled exactly as the handoff spells them.
 */

export type PortalModule = {
  href: string;
  /** The approved product name. */
  name: string;
  /** What the contractor decides here, in their terms. */
  blurb: string;
  /** Which pillar this serves, for grouping. */
  group: "pricing" | "availability" | "storefront" | "operations";
  /** Not yet built. Shown, grayed, rather than hidden — see below. */
  comingSoon?: boolean;
};

/**
 * Grouped rather than an undifferentiated grid, because the handoff's own
 * framing is a chain: what you sell and charge, when you can do it, what the
 * homeowner sees, and what happens after they book.
 */
export const PORTAL_GROUPS: { key: PortalModule["group"]; title: string; blurb: string }[] = [
  { key: "pricing", title: "What you sell, and what it costs",
    blurb: "Your services, your questions, your rates." },
  { key: "availability", title: "When and where you work",
    blurb: "The hours and the area a homeowner can book against." },
  { key: "storefront", title: "What the homeowner sees",
    blurb: "Your booking storefront, in your name and your design." },
  { key: "operations", title: "What happens after they book",
    blurb: "Where the work goes, and what still needs your eye." },
];

export const PORTAL_MODULES: PortalModule[] = [
  { href: "/dashboard/services", name: "Services & Pricing", group: "pricing",
    blurb: "The work you offer and what you charge for it." },
  { href: "/dashboard/services", name: "Guided Pricing", group: "pricing",
    blurb: "The questions a homeowner answers, and what each answer does to the scope, the price or the route." },
  { href: "/dashboard/categories", name: "Categories", group: "pricing",
    blurb: "How your services are grouped for a homeowner browsing them." },
  { href: "/dashboard/pricing-settings", name: "Your Rates", group: "pricing",
    blurb: "Labor rate, minimums and material markup. Price2Book can suggest; you approve." },
  { href: "/dashboard/policies", name: "Your Pricing Policies", group: "pricing",
    blurb: "The judgment calls that are yours — the heights and distances where the work changes, and who supplies what." },
  { href: "/dashboard/billing", name: "Tax & Deposits", group: "pricing",
    blurb: "Whether you charge sales tax and at what rate, and which jobs need a deposit before you book them." },
  { href: "/dashboard/estimates", name: "Estimated Hours", group: "pricing",
    blurb: "How long each job usually takes, and how much that varies. Only used if you bill time and materials." },

  { href: "/dashboard/business-hours", name: "Hours & Availability", group: "availability",
    blurb: "When you take work, and the arrival windows a homeowner can pick." },
  { href: "/dashboard/service-area", name: "Service Area", group: "availability",
    blurb: "The ZIP codes you serve, checked before anyone can book." },
  { href: "/dashboard/jobber/crews", name: "Crew Eligibility", group: "availability",
    blurb: "Which crews can take which work." },

  { href: "/dashboard/design", name: "Storefront Design", group: "storefront",
    blurb: "Choose from six designs and see each one with your own logo and colors." },

  { href: "/dashboard/quotes", name: "Photo Review", group: "operations",
    blurb: "Jobs waiting on your eye before a price goes out." },
  { href: "/dashboard/bookings", name: "Bookings", group: "operations",
    blurb: "What has been booked through your storefront." },
  { href: "/dashboard/jobber", name: "Integrations", group: "operations",
    blurb: "Where booked work goes. Keep running your business in the software you already use." },
];

/**
 * Deliberately NOT modules, and worth naming so nobody adds them by drift.
 *
 * The narrow product boundary is the sharpest thing Price2Book has, and a
 * dashboard is exactly where it erodes — one plausible tile at a time.
 */
export const OUT_OF_SCOPE = [
  "Customers / CRM", "Invoicing and payments", "Payroll", "Dispatch and routing",
  "Time tracking", "Marketing campaigns", "Business reporting",
] as const;
