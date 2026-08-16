# BookEliteElectric.com — Phase 1 Scaffold

This is the Phase 1 deliverable from the approved architecture: project
scaffold, database schema, seed data, brand tokens, and the Home page.

It was built in a sandbox with no internet access, so `npm install` hasn't
been run and nothing has been deployed. Everything here is source code ready
to drop into your own environment.

## What's included

- **`prisma/schema.prisma`** — the full data model (categories, services,
  question/answer decision trees, pricing rules, visits, bookings, quotes,
  photos, arrival windows, troubleshooting sessions) matching the approved
  architecture doc.
- **`prisma/seed.ts`** — all 13 service categories and the complete Section 4
  price book (~65 services) from the master operating doc, ready to load into
  a fresh database. Question/answer decision trees (Section 6) are **not**
  seeded yet — that's Phase 2/4 work, entered per-service once the guided-flow
  engine is built.
- **`tailwind.config.ts`** + **`styles/globals.css`** — brand tokens (navy /
  electric blue / warm white palette from your storyboard) plus one signature
  motif: a thin radiating-line accent pulled from the bulb mark in your logo,
  used sparingly behind the primary CTA.
- **`app/(marketing)/page.tsx`** — the Home page, structured to match your
  approved storyboard (hero, trust bar, popular services, service area,
  footer with your actual logo).

## Running it locally

```bash
npm install
cp .env.example .env      # fill in your Neon connection string
npx prisma db push        # creates tables from schema.prisma
npm run db:seed           # loads the 13 categories + price book
npm run db:seed-questions # loads Phase 2 decision trees (pilot categories)
npm run dev                # http://localhost:3000
```

You'll need:
- A Neon Postgres project (`DATABASE_URL` in `.env`)
- Node.js 20+

Cloudflare R2, Stripe, and SMS/email credentials aren't needed until photo
upload and checkout are built (Phase 3 / Phase 6) — the `.env.example`
placeholders are there for when you get to them.

## Phase 2 — what's new

The guided-flow engine is live: one generic React component
(`GuidedFlowEngine`) interprets any service's Question/AnswerOption tree at
runtime — no per-service pages. Wired end-to-end for two pilot categories:

- **Outlets & Switches** — Replace Standard Outlet (simple instant flow),
  New 120V Outlet (demonstrates the accessible-vs-finished-wall adjusted
  pricing branch and the reroute-to-a-different-service mechanic)
- **TV & Media** — TV Install, matching the full branching example from the
  brief: size → mount → wall construction → fireplace, with masonry/fireplace
  answers triggering the photo-review branch instead of an instant price

The full path works: **pick a service → answer questions → see price → add
to My Visit → While We're There add-ons → pick an arrival window → enter
details → confirmation page**, with real rows written to your Neon database
at each step (Visit, LineItem, Customer, ArrivalWindow, Booking).

**What's intentionally stubbed for now:**
- Photo upload — the branch-specific required-photo list displays correctly,
  but the actual upload-to-R2 and Quote-record creation is Phase 3
  (`PhotoReviewNotice.tsx` has the button disabled with a note)
- Real appointment capacity — arrival windows are generated client-side for
  the next 5 weekdays and created in the database on first booking, but
  there's no admin-configured capacity limit yet (Phase 6)
- Card capture — the payment model (card-on-file, captured after
  completion) is reflected in the `Booking.paymentModel` field, but there's
  no actual Stripe integration wiring a card yet (Phase 6)
- Only 2 of the 13 categories have decision trees. The other ~11 use the
  same engine automatically once their trees are seeded — that's Phase 4.

## What's next (per the phased plan)

- **Phase 3** — remote-quote pilot (photo upload, Quote status page) on one
  variable category.
- **Phase 4** — remaining ~11 category trees, using the proven engine.

See the architecture document for full details on each phase.
