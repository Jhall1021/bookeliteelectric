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
  // BROADENED 2 September 2026. It read "...see your approved price when the
  // work qualifies, and book from your availability", which left a visitor on
  // the first screen believing Price2Book means publishing flat-rate prices.
  // Guided Estimates ships, so the hero now names both endings — and the
  // walkthrough beside it is untouched, because it captures a real Instant
  // Price flow and demonstrating the other one would need its own capture.
  body:
    "Add Price2Book to the website you already have. Homeowners answer the questions that decide the job — then either see a price you approved, or send you the details and photographs so you can price it yourself.",
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
    href: "/product/guided-pricing",
    lead: "Homeowners answer the questions that actually affect the job.",
    body: "Qualifying work gets a price you approved. The rest comes to you, scoped, with the photographs you asked for.",
  },
  {
    title: "Book Online",
    tone: "accent",
    href: "/product/online-booking",
    lead: "Only offer appointments you are prepared to honor.",
    body: "Availability reflects your hours, your crews and how long the job really takes.",
  },
  {
    href: "/product/while-were-there",
    // "One trip. More done." is the approved While We're There™ brand line and
    // survives the merge of that section into this strip.
    title: "While We’re There™",
    tone: "green",
    lead: "One trip. More done.",
    body: "Where you have set a same-visit price, eligible extra work can be added to a visit already coming.",
  },
] as const;

/**
 * The homeowner journey, as four words rather than four numbered cards.
 *
 * The third step used to read "See your price", which is only true for a
 * flat-rate contractor — a time-and-materials one shows an estimate range, and
 * a route that ends in review shows neither yet. "Get an answer" is true of
 * every configuration and every outcome, and it carries the contrast that
 * actually matters to a homeowner: an answer now, rather than a callback.
 */
export const JOURNEY = [
  "Choose the work",
  "Answer a few questions",
  "Get an answer",
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
 * "No trade terminology required" — the shipped half of it.
 *
 * The eventual version of this idea is Visual Assist: a homeowner photographs
 * what they cannot name. That is not customer-reachable yet, and
 * POSITIONING.md holds the claim boundary until it is.
 *
 * What IS true today is most of the same promise, and all three points below
 * are behaviors a homeowner meets right now rather than intentions:
 *
 *   own words     the real matcher takes a sentence and finds the service —
 *                 demoFlow.ts records its verdict on the phrase it was given
 *   not sure      an escape hatch ships on the trees and never resolves to a
 *                 price, so nobody has to guess to get past a question
 *   photos        collected where a route needs them, for preparation or for
 *                 the office to look before pricing
 *
 * The third is worded carefully. Photos are COLLECTED today; nothing reads
 * them. Any wording implying identification is the claim that has to wait.
 */
export const NO_JARGON = [
  {
    t: "In their own words",
    b: "A homeowner describes the job the way they would say it out loud, and Price2Book matches that to the service it belongs to.",
  },
  {
    t: "“I’m not sure” is an answer",
    b: "Every tree carries it, and it never buys a price. Not knowing routes the job onward instead of forcing a guess.",
  },
  {
    t: "Photos where the job needs them",
    b: "Some routes ask for a picture — so the technician arrives prepared, or so you can look before the price is released.",
  },
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
    "Put those services online and customers answer the qualifying questions themselves \u2014 then either see your approved price and book a time, or send you the details and photographs so you can price it.",
  split: [
    {
      tag: "Put these online first",
      tone: "accent",
      body: "The predictable, repetitive work — the jobs you quote the same way every time, and the ones that fill your day with scheduling back-and-forth.",
    },
    {
      tag: "Leave these exactly as they are",
      tone: "neutral",
      body: "Renovations, custom work, anything you\u2019d rather handle yourself. They keep running the way they run today.",
    },
  ],
  scale: "Ten services or a hundred. You decide which services go online, and whether each one shows a price or comes to you for an estimate.",
  /**
   * THE LINE THAT SEPARATES THE TWO IDEAS PEOPLE CONFLATE.
   *
   * "Putting pricing online" has been heard as "advertising flat-rate prices"
   * for as long as this site has existed, and that reading loses every
   * contractor who will not publish a number — which is a lot of them. It is
   * also wrong: the intake, the questions, the photographs and the handoff are
   * the product, and the published price is one optional ending.
   *
   * Deliberately says "publish", not "have". A Guided Estimate still ends in a
   * price; the contractor sets it and sends it.
   */
  publishing: "You don\u2019t have to publish your prices to put your pricing process online.",
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

/**
 * The boundary as roles, which is the Integrations page's opening argument.
 *
 * The homepage carries BOUNDARY_LINE — one sentence, because a homepage should
 * not spend a table on it. The Integrations page is where the inventory
 * belongs, and it comes back deliberately rather than by accident: this is the
 * page a contractor arrives at asking whether they have to replace what they
 * run, and the answer is a division of responsibility, not a feature list.
 *
 * ARCHITECTURE FIRST, INTEGRATION STATUS SECOND. Nothing in the right-hand
 * column implies a live connection to the system that owns it. What it says is
 * that Price2Book does not want that job.
 */
export const BOUNDARY_ROLES = {
  ours: [
    "Homeowner qualification",
    "Approved pricing",
    "Guided Pricing outcomes",
    "Guided Estimate intake and review",
    "Building the visit",
    "Presenting appropriate booking options",
    "Customer self-booking",
  ],
  theirs: [
    "CRM and customer records",
    "Dispatch and work orders",
    "Invoicing",
    "Payments, where applicable",
    "Payroll",
    "Job costing",
    "The rest of how you run the business",
  ],
} as const;


/**
 * The second adoption axis — SITEMAP.md.
 *
 * A contractor makes TWO independent decisions, and the site used to teach
 * only the first: how much of the catalog goes into Price2Book. The second is
 * how those services hand a customer a number, and it is not a progression.
 * Instant Price is not the finished version of Guided Estimate, and Guided
 * Estimate is not what happens when Instant Price fails.
 *
 * A contractor who publishes no prices at all and reviews every job is using
 * the product as designed, not half of it. `withoutPublishedPrice` in
 * `guidedEstimates.ts` is the measurement that keeps that honest: every one
 * of the quote-only services in production carries no published price.
 *
 * NOT A CLAIM ABOUT AI. A human contractor sets every estimate. Nothing here
 * may imply the software decides the number — see POSITIONING.md.
 */
export const PRICING_MODES: ReadonlyArray<{
  name: string;
  href: string | null;
  forWhat: string;
  body: string;
  note?: string;
}> = [
  {
    name: "Instant Price",
    href: "/product/guided-pricing",
    forWhat: "For predictable work that can be scoped from the customer\u2019s answers.",
    body:
      "You approve the pricing. When the answers establish enough of the job, the customer gets that answer immediately and can carry on to booking.",
  },
  {
    name: "Guided Estimate",
    href: "/product/guided-estimates",
    forWhat: "For work you want to look at before you give anyone a number.",
    body:
      "The customer answers the same guided questions and supplies the details and photographs you asked for. You review the scope and set the estimate.",
    note: "You can use Price2Book this way without displaying instant prices at all.",
  },
  {
    name: "Onsite Visit",
    href: null,
    forWhat: "For work that genuinely has to be seen, diagnosed or measured in person.",
    body:
      "Some jobs need somebody there, and pretending otherwise is how a customer ends up with a number nobody can stand behind. Price2Book routes those to a visit instead.",
  },
];

/**
 * The estimate trip that only existed because information was missing.
 *
 * THE TARGET IS NARROW, ON PURPOSE. This is not an argument against site
 * visits — a contractor who reads it that way stops trusting the rest of the
 * page, and rightly. It is an argument against driving somewhere to collect
 * what the homeowner could have handed over beforehand.
 *
 * NO PERCENTAGES. There is no measured claim about how many trips this
 * removes, so the page makes none. What it can show is the real thing the
 * product asks a homeowner for, which is why the sequences below stay
 * qualitative and the evidence comes from the capture.
 */
export const ESTIMATE_TRIPS = {
  headline: "Go on estimates because the job needs you there \u2014 not because you needed more information.",
  lead:
    "If the customer can give you what you need to quote the work, Price2Book collects it. Review the answers and the photographs, set the estimate, and keep the truck parked. When a job genuinely needs to be seen, send someone.",
  before: {
    label: "The trip that was really a fact-finding mission",
    steps: [
      "Customer calls",
      "You ask what you can over the phone",
      "You schedule an estimate",
      "You drive there",
      "You gather the information",
      "You drive back",
      "You work out the price",
    ],
  },
  after: {
    label: "The same job, quoted from what they sent",
    steps: [
      "Customer answers the guided questions",
      "They supply the details and photographs you asked for",
      "You review the scope",
      "You set the estimate",
    ],
  },
  caveat:
    "And when the work does have to be seen \u2014 a diagnosis, a condition nobody can photograph, a measurement that has to be right \u2014 that is what the visit is for.",
} as const;

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
export const PRODUCT_PAGES: ReadonlyArray<{ name: string; href: string | null; status?: string }> = [
  { name: "Guided Pricing", href: "/product/guided-pricing" },
  // A SIBLING, NOT A FALLBACK. Guided Estimates crossed the same threshold
  // every other row here is held to: REMOTE_QUOTE routes, gating photo
  // requests, a contractor review queue and a customer approval, all shipped
  // and all in production use. It gets a link for the same reason Guided
  // Pricing does — the capability is real — and captured evidence backs the
  // page rather than a description of an intended workflow.
  { name: "Guided Estimates", href: "/product/guided-estimates" },
  { name: "While We\u2019re There\u2122", href: "/product/while-were-there" },
  { name: "Online Booking", href: "/product/online-booking" },
  { name: "What You Control", href: "/product/what-you-control" },
  // No page, on purpose. A dedicated Product page is itself a capability
  // claim, and embedding has not crossed the shipped threshold the rest of
  // this site is held to — EMBED_STATUS still reads "In build for V1". The
  // row says so instead of linking to a polished explanation of something a
  // contractor cannot install.
  { name: "Website Embed", href: null, status: "In build" },
];

export const TRADES: ReadonlyArray<{ name: string; status: TradeStatus; href: string | null }> = [
  { name: "Electrical", status: "Available now", href: "/trades/electrical" },
  { name: "Plumbing", status: "In build", href: null },
  // In the list because the homepage must show the breadth, and not a link
  // because there is no canonical HVAC product behind the claim. The menu
  // renders it the same way it renders Plumbing: text with a status.
  { name: "HVAC", status: "Next", href: null },
];

/** The homepage's one-line breadth signal, read from the same statuses. */
export const TRADE_SIGNAL = "Built for the trades that live on service calls.";

/**
 * The navigation, moving to the shape SITEMAP.md sets.
 *
 * Every item goes somewhere real: Product, How It Fits and Trades are pages,
 * Integrations and Demo are homepage sections until steps 6 and 7 of the build
 * order give them their own. What is NOT here is anything pointing at a page
 * that does not exist — the menus carry status rows for that instead.
 */
/**
 * A photograph for each category in the captured electrical template.
 *
 * KEYED BY THE TEMPLATE'S OWN SLUG, so the homepage grid is the catalog a
 * contractor is actually provisioned from rather than a list typed here. The
 * template decides which categories exist and in what order; this only says
 * what each one looks like.
 *
 * These are the product's own generic service photographs from public/images
 * — the same ones a storefront uses before a contractor supplies their own.
 * None of them belongs to a real contractor, which is the whole reason this
 * grid can be published while a screenshot of a real storefront cannot.
 *
 * A category with no entry renders as a plain tile rather than a broken one,
 * and verify-marketing-homepage fails if the template gains a category this
 * map has not been told about.
 */
export const CATEGORY_IMAGES: Record<string, string> = {
  "outlets-switches": "/images/service-standard-switch.jpg",
  "new-outlets": "/images/service-new-outlet.jpg",
  lighting: "/images/service-light-fixture.jpg",
  fans: "/images/service-ceiling-fan.jpg",
  "tv-media": "/images/service-tv-mounting.jpg",
  "dedicated-circuits": "/images/category-dedicated-circuits.jpg",
  "appliance-install": "/images/service-appliance-microwave.jpg",
  "safety-protection": "/images/service-smoke-and-co.jpg",
  "smart-home-security": "/images/service-video-doorbell.jpg",
  "panels-troubleshooting": "/images/service-panel-replacement.jpg",
  "ev-garage": "/images/service-ev-charger.jpg",
  "generator-backup-power": "/images/service-generator-inlet-interlock.jpg",
  "pool-spa": "/images/service-pool-and-spa.jpg",
};

/** The catalog grid's own words. The numbers are read from the capture. */
export const CATALOG = {
  eyebrow: "What your customer browses",
  headline: "Before you change a thing.",
  lead:
    "Every electrical contractor on Price2Book is provisioned from the same canonical catalog. Each category below carries the services in it, and each service carries the questions that change its scope. You rename it, reprice it, hide what you don\u2019t do and add what you do \u2014 and your customer browses the result.",
} as const;

export const NAV = [
  { label: "Product", href: "/product/guided-pricing" },
  { label: "How It Fits", href: "/how-it-fits" },
  { label: "Trades", href: "/trades/electrical" },
  { label: "Integrations", href: "/integrations" },
  { label: "Demo", href: "/demo" },
] as const;
