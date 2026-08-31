# Guided Setup — Slice Three proposal

**Status:** proposal for review. Nothing implemented. 31 Aug 2026.

Scope: resumable entry, business basics, Electrical trade/template state,
service selection, and live readiness. **Pricing, scheduling and payment stages
are deliberately out** — they are visible as locked stages so the shape is
honest, and they do nothing yet.

## What already exists, and what does not

I checked every admin surface before proposing screens. Three of the five
areas have a real destination to reuse; two do not, and that changes the
design.

| Area | Existing surface | Slice Three |
|---|---|---|
| Service selection | `PATCH /api/admin/setup/selection` (slice two) | reuse |
| Service detail | `/dashboard/services`, `/dashboard/services/[id]` | link out |
| Pricing foundation | `/dashboard/pricing-settings` | link out |
| Scheduling | `/dashboard/business-hours`, `/dashboard/service-area`, `/dashboard/jobber/crews` | link out |
| **Business basics** | **none** | Slice Three owns the form |
| **Trade / template** | **none — CLI only** | show state, do not install |
| Payments | **none** | locked stage, no link |

### Business basics has no admin surface at all

Nothing in `/dashboard` edits `name`, `legalName`, `phone`, `supportEmail`,
`licenseNumber`, `city/state/postalCode` or `countryCode`.
`/api/portal/contractor` is contractor *switching*, not editing.

So Slice Three has to own this form — and that is not a duplicate system,
because there is nothing to duplicate. It should write through a general
`PATCH /api/admin/business-profile`, **not** a setup-only route, so a later
Settings page reuses it rather than growing a second writer. Same reasoning
that put `Service.offered` on Service rather than in the wizard.

### The trade stage shows state; it does not install

`provision-from-template` is a CLI script that creates a whole catalog. Slice
Three should report what it finds — installed / not installed / how many
services / template version — and link to nothing, because a UI button that
writes forty services deserves its own confirmation design and belongs with
the pricing stage that follows it.

**Recommendation:** read-only in Slice Three. Installing from the UI is Slice
Four's opening move, next to the pricing foundation the catalog immediately
needs.

## Screens

One route, `/dashboard/setup`, with a stage rail and one panel at a time.
Resumable because `ContractorOnboarding.currentStage` already exists.

```
┌─ Set up your storefront ───────────────────────────────┐
│  ● Business          ready                             │
│  ● Trade & services  ready                             │
│  ○ Pricing           2 things to sort out    (locked)  │
│  ○ Scheduling        1 thing to sort out     (locked)  │
│  ○ Payments          ready                   (locked)  │
│  ○ Review & launch                           (locked)  │
└────────────────────────────────────────────────────────┘
```

**1. Entry.** Lands on `currentStage`. A returning contractor resumes where
they were with every choice intact — proven in slice two. Above the rail, one
sentence of live readiness: *"3 things to sort out before a homeowner can
book"* or *"You're ready to take bookings."*

**2. Business basics.** The form described above. On save, the
`BUSINESS_NAME_MISSING`, `COUNTRY_MISSING`, `CONTACT_MISSING` and
`LICENSE_MISSING` findings resolve on the next render — no client-side
readiness mirror, because readiness derives fresh on every call and a mirror
is a second source of truth waiting to disagree.

**3. Trade & template.** Read-only: which trade, whether the canonical
Electrical template is installed, how many services it brought, and whether
any template updates are unadopted (`TEMPLATE_UPDATE_PENDING`).

**4. Service selection.** The slice-two control, grouped by category, with the
count in view: *"12 of 41 selected."* Each row shows what selecting it will
require — *"needs a price"*, *"quote only, nothing to price"* — read from the
same `pricePromiseOf` the readiness engine uses, so the preview cannot
disagree with the verdict. Live services show **Live** and cannot be
deselected here (`SERVICE_IS_LIVE`); the row links to the service page for the
sanctioned deactivation path.

**5. Readiness feedback.** Each stage shows its own findings, blockers first,
each with the destination that fixes it.

## Fix / Continue actions and their destinations

| Finding | Action | Goes to |
|---|---|---|
| `BUSINESS_NAME_MISSING`, `COUNTRY_MISSING`, `CONTACT_MISSING`, `LICENSE_MISSING` | Fix | the business form, in place |
| `SITE_MISSING` | Fix | **no surface** — flagged below |
| `NO_SERVICES`, `TEMPLATE_NOT_INSTALLED` | — | read-only in this slice |
| `TEMPLATE_UPDATE_PENDING` | Review | `/dashboard/services` |
| `NOTHING_ACTIVATABLE` | Fix | the selection panel, in place |
| `PRICING_SETTINGS_MISSING`, `LABOR_RATE_UNSET` | Fix | `/dashboard/pricing-settings` |
| `MATERIAL_COSTS_UNRESOLVED`, `MATERIAL_COST_ON_HOLD` | Fix | `/dashboard/services/[id]` |
| `PRICE_NOT_APPROVED`, `PRICE_DRIFTED`, `SUGGESTED_NOT_APPROVED` | Review | `/dashboard/services/[id]` → Pricing panel |
| `SERVICE_AREA_EMPTY` | Fix | `/dashboard/service-area` |
| `BUSINESS_HOURS_DEFAULTED` | Review | `/dashboard/business-hours` |
| `NO_ELIGIBLE_CREW` | Fix | `/dashboard/jobber/crews` |
| `SCHEDULING_AUTHORITY_UNDECLARED` | Fix | the scheduling control (slice two) |
| `STRIPE_NOT_CONNECTED`, `STRIPE_NOT_READY` | Fix | **no surface** — flagged below |

**Every price-related action links out to the pricing panel.** Guided Setup
shows the derived figure and never approves it: the price-writer audit treats
a script stamping its own approval as a governance failure, and a wizard is a
script with buttons.

## Two dead ends to fix before they mislead anyone

1. **`/dashboard/payments` does not exist.** The readiness engine already
   points a stage href at it, so that link 404s today. Either build the Stripe
   connect surface or drop the href — a "Fix" button leading nowhere is worse
   than no button. Small, and worth doing in this slice.
2. **`SITE_MISSING` has no destination.** Storefront identity is created by
   provisioning, so a contractor cannot fix it themselves. Needs either a
   surface or a clearer message saying who can.

## Out of scope, explicitly

No pricing stage, no scheduling stage beyond the existing authority control,
no payment stage, no launch action, no template installation from the UI, and
no activation. Activation stays where it is — the sanctioned publication
lifecycle — and Guided Setup will link to it, never perform it.
