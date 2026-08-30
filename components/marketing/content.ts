/**
 * The approved Price2Book homepage copy — ADR-020.
 *
 * This is content, not presentation, and it lives apart from the components
 * for one reason: several lines here are correctness constraints rather than
 * style choices, and a constraint that is scattered across a dozen JSX files
 * cannot be checked. `scripts/verify-marketing-homepage.ts` asserts against
 * this module directly.
 *
 * Source of truth: docs/marketing/homepage-handoff-2026-08-28.docx (copy) and
 * docs/marketing/homepage-design/ (the design it was approved in). Where the
 * two disagree the handoff wins — that is stated in docs/marketing/POSITIONING.md.
 */

/** Where the "Sign In" affordance points. Deliberately not a marketing link. */
export const SIGN_IN_PATH = "/sign-in";

export const HERO = {
  eyebrow: "For residential service contractors",
  headline: ["Your pricing.", "Your schedule."],
  body:
    "Turn homeowner requests into safely priced, bookable work. Customers describe what they need, answer the questions that affect scope, and see your approved price and real availability — without replacing the software you already use.",
  primaryCta: "Request Early Access",
  // Was "See the Homeowner Experience", which scrolled to four written steps.
  // A description of an experience is not one. It now runs the real flow.
  secondaryCta: "Try the Homeowner Demo",
  support: "Works alongside your existing business software.",
  supportEmphasis: "No new CRM required.",
  // "Proven first in electrical" contradicted the proof section further down,
  // which says plainly that there are no pilot results yet. This says where
  // the product was built without implying results we do not have.
  footnote: "Built for residential service contractors. Built first with a working residential electrical contractor.",
} as const;

/**
 * The hero's contractor-side card: what you set, beside what they see.
 *
 * Labeled an EXAMPLE on the page. These are plausible figures for a
 * demonstration business, and an unlabeled price in a hero reads as a price
 * the platform sets — which is the opposite of what the section is claiming.
 */
export const HERO_CONTROL = [
  { k: "Published Price", v: "$375", tone: "ink" },
  { k: "While We’re There™", v: "+$250", tone: "green" },
  { k: "Prep Photos", v: "Required", tone: "ink" },
  { k: "Booking", v: "Enabled", tone: "green" },
] as const;

export const PILLARS = [
  {
    title: "Price Online",
    tone: "accent",
    lead: "Turn the services you choose into guided upfront pricing.",
    body: "Ask only the questions that affect scope, price, materials, access, safety or routing.",
  },
  {
    title: "Book Online",
    tone: "accent",
    lead: "Offer appointment windows your crews can actually cover.",
    body: "Availability can reflect hours, service area, eligible crews and job duration.",
  },
  {
    title: "While We’re There™",
    tone: "green",
    lead: "Make additional same-visit work an easy yes.",
    body: "Offer approved additional services at the price that applies once the technician is already there.",
  },
] as const;

export const STEPS = [
  { n: "01", title: "Picks the work", body: "Customers browse or search for what they need — in their words, not trade terminology." },
  { n: "02", title: "Answers a few questions", body: "Only the details that actually matter: ceiling height, existing power, access, quantity, materials, condition." },
  { n: "03", title: "Sees a real price", body: "When the service fits an approved pricing path, the customer gets an actual price." },
  { n: "04", title: "Books a window", body: "Only from availability you have opened." },
] as const;

export const WWT_ADDONS = [
  { name: "Replace GFCI Outlet", price: "+$115" },
  { name: "Install LED Dimmer", price: "+$130" },
  { name: "Replace Exterior Light", price: "+$165" },
] as const;

export const GUIDED_PRICING_BULLETS = [
  "Edit the questions.",
  "Change the answers.",
  "Choose what each answer does.",
  "Build new pricing paths without rebuilding your website.",
] as const;

export const GUIDED_PRICING_TREE = [
  {
    q: "Is there already a fixture here?",
    answers: [
      { label: "Yes", action: "Continue", tone: "go" },
      { label: "No", action: "Route to new-location pricing", tone: "neutral" },
    ],
  },
  {
    q: "How high is it?",
    answers: [
      { label: "12 ft or less", action: "Standard price", tone: "go" },
      { label: "Over 12 ft", action: "Require photos / review", tone: "review" },
    ],
  },
  {
    q: "Normal ladder access?",
    answers: [
      { label: "Yes", action: "Price + book", tone: "go" },
      { label: "No", action: "Review", tone: "review" },
    ],
  },
] as const;

export const OUTCOMES = [
  { tag: "Instant Price", tone: "go", title: "Clear scope. Price it and book it.", body: "Well-understood work goes straight through — price, window, done." },
  { tag: "Prep Photos", tone: "accent", title: "Known price. Photos you need.", body: "The homeowner sees the price immediately and sends the photos you selected. “Help us come prepared.”" },
  { tag: "Photo Review", tone: "review", title: "See it before releasing the price.", body: "Customer submits answers and photos. You review, issue the price, they approve and book." },
  { tag: "Custom Quote", tone: "neutral", title: "Some work stays yours.", body: "Highly variable or complex services never receive an automatic price." },
] as const;

export const PRICE_BREAKDOWN = [
  { k: "Labor", v: "Your rate × resolved crew hours" },
  { k: "Materials", v: "Your costs, itemized" },
  { k: "Direct Costs", v: "Permits, disposal, admin" },
  { k: "Minimum", v: "Your service-call floor" },
  { k: "Scope Policy", v: "What this price does and does not cover" },
] as const;

export const WINDOWS = [
  { time: "8:00 – 11:00", note: "2 crews available", open: true },
  { time: "11:00 – 2:00", note: "1 crew available", open: true },
  { time: "2:00 – 4:30", note: "Unavailable — job won’t fit", open: false },
] as const;

/**
 * Integration status is a CORRECTNESS constraint, not marketing copy.
 *
 * Every status here has to describe what the code actually does today. Jobber
 * has OAuth, booking push, crew sync and live availability, so it is Available.
 * The Price2Book scheduler ships with the product, so it is Built In. The other
 * three have no implementation at all, so they are Coming Soon.
 *
 * "Connected" is forbidden outright on the public site: it reads as a live link
 * to a contractor's own account, which is a per-contractor runtime fact and
 * cannot be true of a marketing page at all. The gate enforces the whole list.
 */
export type IntegrationStatus = "Available" | "Built In" | "Coming Soon";

export const INTEGRATIONS: ReadonlyArray<{
  name: string;
  body: string;
  status: IntegrationStatus;
}> = [
  { name: "Jobber", body: "Booked work lands as a client and a job; availability reads your real calendar", status: "Available" },
  { name: "Price2Book Scheduler", body: "No field-service platform? Use ours", status: "Built In" },
  { name: "ServiceTitan", body: "Planned", status: "Coming Soon" },
  { name: "Housecall Pro", body: "Planned", status: "Coming Soon" },
  { name: "Google Calendar", body: "Planned", status: "Coming Soon" },
  { name: "Outlook Calendar", body: "Planned", status: "Coming Soon" },
];

/** Labels that must never appear as an integration status on the public site. */
export const FORBIDDEN_INTEGRATION_LABELS = [
  "Connected",
  "Live",
  "Active",
  "Integrated",
  "Synced",
] as const;

export const SHIPS_WITH_SERVICE = [
  { t: "Common residential services", b: "The work homeowners actually call about" },
  { t: "Guided Pricing questions", b: "The ones that change scope or price" },
  { t: "Material roles", b: "What each job consumes, priced from your costs" },
  { t: "Routing rules", b: "Which answers send a job to review instead of a price" },
  { t: "The exceptions", b: "Situations that shouldn’t get an automatic price at all" },
] as const;

export const SETUP_STAGES = [
  { n: "01", title: "Tell us how you work", body: "Hours, service area, crew setup and scheduling preferences." },
  { n: "02", title: "Tell us how you price", body: "Labor rate, minimums, material costs and a few familiar service examples." },
  { n: "03", title: "Review what Price2Book built", body: "See your services, suggested prices and customer experience before anything goes live." },
] as const;

export const SETUP_PROGRESSION = [
  "Start from the template",
  "Add your numbers",
  "Set your policies",
  "Review your prices",
  "Turn on what you want",
] as const;

/**
 * What the pilot is measuring.
 *
 * This was "Proof, once there is proof", rendering six empty [ ] cards. The
 * honesty was right and the presentation was not: absent numbers in card
 * frames read as an unfinished page rather than as a deliberate refusal to
 * invent results.
 *
 * Same rule, different framing — these are stated as the objectives being
 * measured, which is true today, instead of as results that are missing.
 * POSITIONING.md still forbids inventing a number here, and the gate still
 * asserts none of these carries one.
 */
export const PROOF_METRICS = [
  "Fewer pricing calls",
  "After-hours bookings",
  "Office time saved",
  "While We’re There™ attach rate",
  "Average booked visit value",
  "Online-price conversion",
] as const;

export const NAV = [
  // Was "#how", the "Four steps" section. That section is gone because the
  // demo does its job live, so the nav points at the demo instead.
  { label: "How It Works", href: "#demo" },
  { label: "Guided Pricing", href: "#guided" },
  { label: "While We’re There™", href: "#wwt" },
  { label: "Integrations", href: "#integrations" },
  // Was "Pricing", which jumped to the early-access form with no price
  // anywhere on the page. That reads as evasion rather than as what it is —
  // pricing is not settled yet. It becomes "Pricing" again when there is a
  // pricing section to point at.
  { label: "Early Access", href: "#access" },
] as const;

/**
 * What Price2Book handles, and what your existing systems keep handling.
 *
 * The sharpest thing this page can say is what the product is NOT. ADR-012
 * and POSITIONING.md both turn on it: "anyone looking to replace Jobber" is
 * explicitly not the buyer, and the fastest way to become ServiceTitan by
 * accident is to let the boundary go unstated on the marketing site.
 *
 * Paired rows, read across.
 */
export const BOUNDARY: ReadonlyArray<{ ours: string; theirs: string }> = [
  { ours: "Homeowner intent and service matching", theirs: "CRM and client records" },
  { ours: "Trade-specific qualification", theirs: "Dispatch and technician management" },
  { ours: "Contractor-approved pricing paths", theirs: "Invoicing and payment collection" },
  { ours: "Bookable availability", theirs: "Payroll and accounting" },
  { ours: "While We’re There™ additions", theirs: "Inventory and job costing" },
  { ours: "Handoff of qualified booked work", theirs: "The rest of field-service operations" },
];

/** The two ways the product is meant to be run. */
export const OPERATING_MODES = [
  {
    tag: "Add-on",
    title: "In front of the platform you already run",
    body:
      "Price2Book handles pricing and booking; qualified work lands in Jobber or another field-service platform for dispatch and invoicing. Nothing about how you run the business changes.",
  },
  {
    tag: "Standalone-light",
    title: "For a contractor who doesn’t need a full CRM",
    body:
      "Use the branded storefront and the built-in Price2Book Scheduler on their own. No field-service platform to buy, and calendar integrations are on the way.",
  },
] as const;

/**
 * The objections a contractor actually raises, answered.
 *
 * Every answer here is a claim about what the software does today, which puts
 * this file in the same class as the integration statuses: checked, not
 * drafted. Anything not yet true is stated as not yet true rather than
 * softened into sounding available.
 */
export const FAQ = [
  {
    q: "Does this replace Jobber or ServiceTitan?",
    a: "No, and it is not meant to. Price2Book is the pricing and booking layer in front of your business. Work booked through it is handed to the system you already run — the Jobber integration is live today, and other platforms are planned.",
  },
  {
    q: "Can I use it without field-service software?",
    a: "Yes. The Price2Book Scheduler is built in, so a contractor with no platform can take online bookings without buying one.",
  },
  {
    q: "Do I have to publish every service?",
    a: "No. You choose which services customers can see, which can be priced online, and which can be booked. Anything you don’t turn on stays off your storefront.",
  },
  {
    q: "What happens when a job can’t safely be priced online?",
    a: "It doesn’t get a price. You decide service by service whether an answer routes to prep photos, to review before the price is released, or to a custom quote you write yourself.",
  },
  {
    q: "Can customers book outside my service area?",
    a: "No. Checkout turns away any booking whose ZIP code isn’t in the area you selected. It fails closed — an area you haven’t configured takes no bookings at all rather than taking every booking.",
  },
  {
    q: "Can someone book a job that won’t fit in the window?",
    a: "No. Availability reflects how long the work actually takes, so a four-hour job is not offered when two hours remain in the day.",
  },
  {
    q: "Whose prices and material costs does Price2Book use?",
    a: "Yours. The electrical template carries trade structure — questions, material roles, routing — and no economics at all. You supply the rates, costs and policies, and a suggested price is only ever published when you approve it.",
  },
  {
    q: "Can I use a hosted storefront if I don’t have a website?",
    a: "Yes. Every contractor gets a hosted storefront carrying their own name, colors and company details, whether or not they have a site to connect it to.",
  },
  {
    q: "Which trades are supported?",
    a: "Residential electrical. The structure underneath is trade-agnostic, but electrical is what ships with real service definitions, questions and routing today.",
  },
  {
    q: "What does setup involve?",
    a: "A conversation, not a stack of blank forms. You answer questions about how you work and what you charge, Price2Book builds a starting catalog from the trade template, and you review the services, suggested prices and customer experience before any of it goes live.",
  },
] as const;
