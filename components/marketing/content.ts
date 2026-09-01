/**
 * The approved Price2Book homepage copy — ADR-020.
 *
 * This is content, not presentation, and it lives apart from the components
 * for one reason: several lines here are correctness constraints rather than
 * style choices, and a constraint that is scattered across a dozen JSX files
 * cannot be checked. `scripts/verify-marketing-homepage.ts` asserts against
 * this module directly.
 *
 * Source of truth: docs/marketing/homepage-handoff-2026-08-28.docx (copy),
 * docs/marketing/homepage-design/ (the design it was approved in), and the
 * 31 August 2026 shortening pass recorded in docs/marketing/POSITIONING.md.
 * Where they disagree the most recent owner direction wins.
 *
 * THE SHORTENING PASS CHANGED WHAT THIS PAGE ARGUES, NOT ONLY HOW LONG IT IS.
 *
 * The page used to prove contractor control six separate times — what can be
 * priced, what can be booked, labor and materials, Guided Pricing, the
 * boundary, the operating modes — and each proof was true. Said once, the
 * claim lands; said six times it reads as a page that does not trust itself.
 * Everything about control now lives in ONE section, and the room that bought
 * went to the thing the page never said at all: the contractor keeps their
 * own website, and the pricing page they get can be used everywhere they
 * already market.
 */

import { formatCents } from "@/lib/flow-types";
import { HERO_FLOW } from "./heroFlow";

/** Where the "Sign In" affordance points. Deliberately not a marketing link. */
export const SIGN_IN_PATH = "/sign-in";

export const HERO = {
  eyebrow: "For residential service contractors",
  headline: ["Your pricing.", "Your schedule."],
  // Was "Turn homeowner requests into safely priced, bookable work." That
  // described the product without saying where it lives, which is the first
  // question a contractor with a website actually has.
  body:
    "Add Price2Book to the website you already have. Homeowners answer a few questions, see your approved price when the work qualifies, and book from your availability — without replacing the software you already use.",
  primaryCta: "Request Early Access",
  secondaryCta: "Try the Homeowner Demo",
  support: "Works alongside your existing business software.",
  supportEmphasis: "No new CRM required.",
  footnote: "Built for residential service contractors. Built first with a working residential electrical contractor.",
} as const;

/**
 * The website line, and the one piece of it that has not shipped.
 *
 * The whole page now points at contractor.com/pricing, and the embed that
 * puts Price2Book inside that page is a core release item being built — not
 * something a contractor can install today. docs/design/embed-v1.md carries
 * status "proposed". So the page shows the destination and says plainly which
 * half of it is not there yet, rather than letting a mock-up imply a working
 * snippet.
 */
export const EMBED_STATUS = {
  label: "In build for V1",
  line:
    "Embedding Price2Book into your own page is a V1 release item and is being built now. Every contractor also gets a hosted Price2Book page, which is what a contractor without a website uses.",
} as const;

/** The URL the hero, and the whole page, holds up as the normal one. */
export const CUSTOMER_URL = "yourcompany.com/pricing";

/** The service the hero prices, and the one the demonstration actually runs. */
export const HERO_SERVICE = "New 120V Outlet";

/**
 * While We're There™ — the section, not the slogan.
 *
 * The hero used to carry a "Contractor · what you set" card with a bare
 * "While We're There™ +$95" row on it, which named a price for an addition
 * nobody had named. That card has moved here, where the mechanic it is an
 * example OF is actually explained, and it now shows both halves: the job the
 * homeowner booked, and the separate same-visit price the contractor set on
 * the work being offered alongside it.
 *
 * EVERY CLAIM BELOW IS THE CODE'S, NOT A COPYWRITER'S. See lib/sameVisit.ts
 * and lib/visitPrimary.ts:
 *
 *   two prices        a service carries basePrice and whileWeThereBasePrice,
 *                     and the second one is nullable
 *   never unconditional   a service with no same-visit price cannot be
 *                     demoted, so it can only ever be the main job
 *   checked first     canPlaceAlongside asks selectPrimary whether the
 *                     addition fits BEFORE the offer is shown, so the 0.7% of
 *                     pairs Elite cannot place never reach a homeowner as a
 *                     refusal
 *
 * That last one is the part a competitor cannot fake, and the page had been
 * spending its While We're There™ words on "one trip, more done" instead.
 */
/** The captured price pair this section explains. */
const SAME_VISIT = HERO_FLOW.sameVisitExamples[0];

export const WWT = {
  eyebrow: "While We’re There™",
  headline: ["One trip.", "More done."],
  // Was "...at the price that applies when a technician is already coming",
  // which described the mechanism and left the reader to work out that the
  // price is lower. The saving is the reason a homeowner says yes, so the
  // sentence says it — and ties it to the trip being covered rather than to a
  // discount, which is the distinction the next bullet defends.
  lead:
    "Once a homeowner has booked their main job, Price2Book can offer more work at your same-visit price — less than the same job costs as a visit of its own, because the trip and the setup are already covered.",
  mechanic: [
    {
      t: "It is a second price you set",
      b:
        "A service carries two: what it costs as its own visit, and what it costs added to one already happening. " +
        `${SAME_VISIT.name} is ${formatCents(SAME_VISIT.standaloneCents)} on its own and ` +
        `${formatCents(SAME_VISIT.sameVisitCents)} while a technician is there — both are numbers you set.`,
    },
    {
      t: "It is not a discount",
      b: "The same-visit price reflects the incremental labor and materials once the trip and the setup are already covered — not a percentage off.",
    },
    {
      t: "Nothing is offered unless you set one",
      b: "A service with no same-visit price is only ever the main job on a visit. You choose which work is worth offering this way, and which is not.",
    },
    {
      t: "And only when it actually fits",
      b: "Price2Book checks the addition against the visit before offering it, so a homeowner is never shown something that cannot be done on the same trip.",
    },
  ],
  forHomeowner: "Get more done in one trip, at a price that reflects the trip already being covered.",
  forContractor: "Make a visit you are already sending a technician to worth more.",
} as const;

/**
 * The example, and why every number in it is captured.
 *
 * THE TWO PRICES ARE THE WHOLE POINT. A same-visit price shown on its own is
 * just an add-on price; the mechanic only becomes visible beside what the same
 * service costs as its own visit. That pair is the product's data model
 * exactly — `basePrice` and `whileWeThereBasePrice` on a service.
 *
 * ONE OF THEM USED TO BE INVENTED, AND IT BROKE THE OTHER. The standalone
 * figure was written by hand at $185 against a captured $115, and the owner
 * read the result as a same-visit price that was too high for a job whose own
 * visit includes the trip. They were right, and the fault was the invented
 * number: the real standalone is $280, which makes the same-visit price 41% of
 * it rather than 62%. Both halves now come from the contractor's catalog
 * through scripts/capture-hero-flow.ts, so the section cannot be made to lie
 * by a plausible-looking guess again.
 *
 * IT MIRRORS THE REAL STOREFRONT, it does not invent a presentation. A
 * category page already renders the same-visit figure in the positive color
 * with the standalone price struck through beneath it and the words "while
 * we're there" — see app/[site]/services/[category]/page.tsx.
 */
const example = SAME_VISIT;
const money = (cents: number) => formatCents(cents);

export const WWT_EXAMPLE = {
  primary: { name: HERO_FLOW.primary.name, price: money(HERO_FLOW.primary.priceCents) },
  addOn: {
    name: example.name,
    price: `+${money(example.sameVisitCents)}`,
    alone: money(example.standaloneCents),
  },
  total: money(HERO_FLOW.primary.priceCents + example.sameVisitCents),
  /** What the contractor set, service by service. */
  set: [
    {
      service: HERO_FLOW.primary.name,
      note: "The job they came for",
      rows: [
        { k: "Its own visit", v: money(HERO_FLOW.primary.priceCents), tone: "ink" },
        { k: "Same-visit price", v: "Not set", tone: "muted" },
        { k: "Booking", v: "Enabled", tone: "green" },
      ],
    },
    {
      service: example.name,
      note: "Two prices — one service",
      rows: [
        { k: "Its own visit", v: money(example.standaloneCents), tone: "ink" },
        { k: "Same-visit price", v: money(example.sameVisitCents), tone: "green" },
        // Not a second "Booking: Enabled" row. Repeating the first card's
        // control teaches nothing; this one names the switch that decides
        // whether the service is offered alongside another at all.
        { k: "Offered alongside", v: "On", tone: "green" },
      ],
    },
  ],
  /**
   * Read the card above across, not down: a service with no same-visit price
   * can only ever be the job a visit is built around. That is the actual rule
   * in lib/visitPrimary, and it is why the outlet's row says "Not set".
   */
  readAcross:
    "A service with no same-visit price can only ever be the main job on a visit. The outlet is what the visit is for; the GFCI swap is what fits alongside it.",
} as const;

export const PILLARS = [
  {
    title: "Price Online",
    tone: "accent",
    lead: "Homeowners answer the questions that actually affect the job.",
    body: "They see a price you approved when the work qualifies for one.",
  },
  {
    title: "Book Online",
    tone: "accent",
    lead: "Only offer appointments you are prepared to honor.",
    body: "Availability reflects your hours, your crews and how long the job really takes.",
  },
  {
    // "One trip. More done." is the approved While We're There™ brand line and
    // survives the merge of that section into this strip.
    title: "While We’re There™",
    tone: "green",
    lead: "One trip. More done.",
    body: "Where you have set a same-visit price, eligible extra work can be added to a visit already coming.",
  },
] as const;

/** The homeowner journey, as four words rather than four numbered cards. */
export const JOURNEY = [
  "Choose the work",
  "Answer a few questions",
  "See your price",
  "Book",
] as const;

/**
 * What happens when a price cannot responsibly be produced.
 *
 * One sentence, where the page used to spend a section on routing. The four
 * outcomes below are the same idea compressed to their labels: the point is
 * that the contractor picks, not how the router works.
 */
export const JOURNEY_NOTE =
  "If Price2Book can’t responsibly produce a price from the information available, it routes the job to the appropriate next step instead of guessing.";

export const OUTCOMES = [
  { tag: "Instant Price", tone: "go", body: "Clear scope — price it and book it." },
  { tag: "Prep Photos", tone: "accent", body: "Price now, with the photos you asked for." },
  { tag: "Photo Review", tone: "review", body: "You see it before the price is released." },
  { tag: "Custom Quote", tone: "neutral", body: "Some work never gets an automatic price." },
] as const;

/**
 * "One pricing engine. Everywhere customers find you."
 *
 * The new section, and the reason the page could afford one: Price2Book is
 * not another website for the contractor to maintain. It is a pricing and
 * booking capability that attaches to a page they already own, and that page
 * is a link they can put anywhere.
 */
export const EVERYWHERE = {
  headline: "One pricing engine. Everywhere customers find you.",
  body:
    "Add Price2Book to your website, then use that same pricing page everywhere you market your business. One link, one QR code — not a second website to keep up to date.",
  channels: [
    "Your website",
    "Instagram bio",
    "Google Business Profile",
    "Facebook",
    "Text messages",
    "Email signature",
    "QR codes",
    "Truck & yard signs",
    "Invoices & postcards",
  ],
  /**
   * Stated as direction, not availability. Service deep links exist inside
   * the storefront today (queuedServiceHref), but nothing a contractor can
   * paste into an Instagram ad ships yet, and the embed they would paste it
   * into is itself unbuilt.
   */
  directionLabel: "Where this goes",
  direction:
    "Service-specific links are the next step: an EV charger ad or a QR code that opens straight into that service’s questions, its price and its booking.",
} as const;

/**
 * Guided Pricing, shown rather than described.
 *
 * SOURCED FROM THE REAL TREE. Both questions below are the prompts the
 * demonstration contractor's New 120V Outlet service actually asks — see
 * demoFlow.ts, which is generated by walking that service and resolving every
 * path through the engine. The page used to show an invented three-question
 * tree that ended with "Normal ladder access?", which asks a homeowner to
 * judge what normal is; these ask what they can see.
 *
 * Two questions, not the whole tree. The homepage has to prove the idea, not
 * reproduce the service.
 */
export const GUIDED_PRICING_TREE = [
  {
    q: "What will you be plugging in?",
    answers: [
      { label: "Lamps, a TV, chargers", action: "Continue", tone: "go" },
      { label: "A fridge or window AC", action: "Route to its own circuit", tone: "neutral" },
      { label: "An electric vehicle", action: "Route to EV charger", tone: "neutral" },
    ],
  },
  {
    q: "Is there a basement or attic directly above or below?",
    answers: [
      { label: "Yes", action: "Price it", tone: "go" },
      { label: "No", action: "Explain wall openings first", tone: "review" },
    ],
  },
] as const;

/** How a published price is arrived at, read left to right. */
export const PRICE_CHAIN = [
  "The services you turn on",
  "Guided Pricing questions",
  "Your labor, materials and policies",
  "A suggested price",
  "Your approval",
  "The price a homeowner sees",
] as const;

/**
 * The service the suggested/published card is worked through, and its price.
 *
 * Captured, for the same reason every other figure on this page is: a
 * hand-typed $280 goes on saying $280 after the contractor moves the price,
 * and the hero two sections above it would already be showing the new one.
 */
export const PRICE_EXAMPLE = {
  service: HERO_FLOW.primary.name,
  price: formatCents(HERO_FLOW.primary.priceCents),
} as const;

export const PRICE_BREAKDOWN = [
  { k: "Labor", v: "Your rate × resolved crew hours" },
  { k: "Materials", v: "Your costs, itemized" },
  { k: "Direct Costs", v: "Permits, disposal, admin" },
  { k: "Minimum", v: "Your service-call floor" },
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

/**
 * "You don't have to flat-rate your whole business."
 *
 * The objection that stops a contractor before any feature matters, and the
 * page had no answer to it. Everything else here argues about what Price2Book
 * does; this argues about how much of their business they have to hand it,
 * and the answer is as little as ten jobs.
 *
 * It is also the product's origin, in the owner's words: a way to stop wasting
 * time on calls for simple jobs. The three quoted calls are the ones that
 * actually repeat — two price questions and the scheduling back-and-forth,
 * which is the one people forget is a cost.
 *
 * NOTHING HERE IS A NEW CAPABILITY CLAIM. Service-by-service activation is
 * already how the product works and is already asserted further up the page;
 * this section is about what a contractor should DO with that control on day
 * one. "Ten services or a hundred" is a choice, not a catalog size — the rule
 * against advertising service counts is about what ships in the template.
 */
export const START_SMALL = {
  eyebrow: "Start where it hurts",
  headline: "You don’t have to flat-rate your whole business.",
  lead:
    "Price2Book can run as much — or as little — of your service work as you want. Start with the jobs that generate the same phone call over and over.",
  calls: [
    "How much to replace a ceiling fan?",
    "What do you charge to install an outlet?",
    "When can you come? Does Tuesday work? What about Thursday?",
  ],
  after:
    "Put those services online and customers get the price, answer the qualifying questions and choose an appointment themselves.",
  split: [
    {
      tag: "Put these online first",
      tone: "accent",
      body: "The predictable, repetitive work — the jobs you quote the same way every time, and the ones that fill your day with scheduling back-and-forth.",
    },
    {
      tag: "Leave these exactly as they are",
      tone: "neutral",
      body: "Bigger jobs, troubleshooting calls, estimates and custom work. They keep running the way they run today.",
    },
  ],
  scale: "Ten services or a hundred. You decide what customers can price and book online, and you can add more whenever it makes sense.",
  close: "Price2Book fits your business — your business doesn’t have to fit Price2Book.",
} as const;

/**
 * The boundary, in one sentence.
 *
 * This was a six-row table of "Price2Book handles" against "your existing
 * systems keep handling", plus two operating-mode cards underneath. The
 * distinction is the sharpest thing the product has and it does not need a
 * table to land — POSITIONING.md asks for the line, not the inventory.
 */
export const BOUNDARY_LINE =
  "Price2Book handles pricing, qualification, availability and booking. Your CRM, invoicing, dispatch, payroll and job costing stay exactly where they are.";

/** Setup, as a progression rather than a four-screen essay. */
export const SETUP_PROGRESSION = [
  "Start from the trade template",
  "Add your numbers",
  "Set your policies",
  "Review your prices",
  "Turn on what you want",
] as const;

/**
 * Trades, with their status — SITEMAP.md.
 *
 * A CAPABILITY CLAIM, checked like the integration statuses beside it. Only
 * electrical has a committed canonical template, so only electrical has a
 * page: plumbing is a status line in the menu rather than a link, and HVAC has
 * no entry at all here because a nav item is a stronger claim than a sentence.
 *
 * A qualifier comes off when that trade's template is committed and frozen —
 * never when it merely works.
 */
export type TradeStatus = "Available now" | "In build" | "Next";

/**
 * Product pages, and the ones that do not exist yet — SITEMAP.md.
 *
 * Same rule as TRADES: a menu item implies a destination, so only a page that
 * is a real file may be listed. The others are built in order and appear as
 * they land; PriceSight stays out entirely until it ships, because a nav item
 * is a stronger claim than a paragraph.
 */
export const PRODUCT_PAGES: ReadonlyArray<{ name: string; href: string | null }> = [
  { name: "Guided Pricing", href: "/product/guided-pricing" },
  { name: "While We\u2019re There\u2122", href: "/product/while-were-there" },
];

export const TRADES: ReadonlyArray<{ name: string; status: TradeStatus; href: string | null }> = [
  { name: "Electrical", status: "Available now", href: "/trades/electrical" },
  { name: "Plumbing", status: "In build", href: null },
];

export const NAV = [
  { label: "How It Works", href: "/#demo" },
  { label: "While We’re There™", href: "#wwt" },
  { label: "Your Pricing Link", href: "/#everywhere" },
  { label: "Your Rules", href: "/#rules" },
  // "Early Access" was here and pointed at the same place as the filled
  // button beside it. Two affordances for one action is not a nav.
  { label: "Product", href: "/product/guided-pricing" },
  { label: "Trades", href: "/trades/electrical" },
  { label: "Integrations", href: "/#integrations" },
] as const;
