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
    "Give homeowners upfront prices and let them book the work you choose — using your pricing, your availability, and the software you already use to run your business.",
  primaryCta: "Request Early Access",
  secondaryCta: "See the Homeowner Experience",
  support: "Works alongside your existing business software.",
  supportEmphasis: "No new CRM required.",
  footnote: "Built for residential service contractors. Proven first in electrical.",
} as const;

/** The hero's contractor-side card: what you set, beside what they see. */
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
  { k: "Labour", v: "Your rate × resolved crew hours" },
  { k: "Materials", v: "Your costs, itemised" },
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
  { n: "02", title: "Tell us how you price", body: "Labour rate, minimums, material costs and a few familiar service examples." },
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
 * Proof metrics, deliberately unfilled.
 *
 * POSITIONING.md forbids fabricated testimonials and invented numbers. These
 * render as empty placeholders on purpose: the section says what will be shown
 * once pilot contractors have numbers, and shows nothing until they do.
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
  { label: "How It Works", href: "#how" },
  { label: "Guided Pricing", href: "#guided" },
  { label: "While We’re There™", href: "#wwt" },
  { label: "Integrations", href: "#integrations" },
  { label: "Pricing", href: "#access" },
] as const;
