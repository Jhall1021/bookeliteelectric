# Guided Setup — Slice Four design

**Status:** design for review. No implementation until the global gate is
green. 31 Aug 2026.

Goal: a brand-new Electrical contractor moves from *trade selected* to
*canonical catalog installed and my economics being configured*.

## 1. Screens

Two stages become writable. Nothing else changes.

**Stage 2 — Trade & template** (read-only today)

```
Electrical                                    v1 · published 2026-08-14
75 services · 10 policies · 74 material roles referenced

[ Install the Electrical catalog ]

This adds 75 services to your catalog. Nothing is priced, nothing is
offered, and nothing goes live.
```

After install it returns to read-only: version, service count, provenance,
and any unadopted template updates.

**Stage 3 — Pricing foundation**, in three panels, in this order:

1. **What you charge for time** — crew-hour rate, service-call minimum,
   rounding, default permit handling. Global, and nothing can be priced
   without the rate.
2. **What your materials cost you** — the canonical roles the services you
   offer actually need, grouped by role. One role blocks many services.
3. **Your prices** — per offered service: the derived suggestion, its
   breakdown, what is still missing, and a link to that service's Pricing
   panel to approve it.

Panel 3 appears only when 1 and 2 are clear, because a suggested price built
on an unresolved material cost is a number nobody should look at.

## 2. Confirmation and rollback

**Preview before, confirmation during, atomicity underneath.**

The preview is generated from the same source the install reads, so it cannot
promise a different catalog than it delivers.

**Installation must become atomic, and is not today.**
`provision-from-template.ts` loops with individual awaits — a failure at
service 62 of 75 leaves 61 services, some policies and a half-built tree, and
the contractor has no way to tell. Slice Four wraps the whole install in one
`prisma.$transaction`: **75 services or none.** This is also the Plumbing
requirement (*no partial 62 of 63*), and it is the same fix.

Refusals, before anything is written:

| Condition | Behavior |
|---|---|
| catalog already installed for this trade | refuse, report what exists |
| no published `TemplateVersion` for the trade | refuse |
| the contractor has not chosen a canonical trade | refuse — see the amendment below |

Rollback is the transaction aborting. There is no compensating cleanup path,
because a partially-installed catalog is never allowed to exist.

## 3. Version and adoption state — already modeled

Nothing new is needed.

| Fact | Where |
|---|---|
| which catalog exists | `TemplateVersion.trade + version` (unique) |
| what a row came from | `Service.templateVersionId`, `Service.templateKey`; same on `Question` and `AnswerOption` |
| drift since install | `template-update.ts --status` |
| un-approval on adoption | already implemented — adopting clears the price *and* its approval |

Slice Four installs the **latest published version** for the trade. No version
picker: choosing an older catalog is not a decision a contractor benefits from
making.

## 4. Reused provisioning code

`scripts/provision-from-template.ts` is **refactored, not rewritten** —
extracted into `lib/templateProvisioning.ts` and called by both the CLI and
the new route, so the shipped path and the tested path stay the same one.

Also reused unchanged: `prisma/_categoryHelpers.upsertCategory`,
`prisma/_serviceKey`, `lib/materialHolds.servicesOnHold`,
`lib/pricing.suggestPrimaryPrice` / `formatBreakdown`,
`PATCH /api/admin/pricing-settings`, and
`PATCH /api/admin/services/[id]/pricing` for every approval.

### Not Electrical-only

The install orchestrator must not assume a catalog is a set of
`TemplateService` rows. Plumbing composes its 63 services through
`composeService()` / `composeAll()` and must provision from the **composed**
output, never from raw family definitions.

So provisioning takes a **catalog source** per trade:

```
CanonicalCatalogSource = {
  trade: string
  version: number
  services(): CanonicalService[]     // already composed, ready to persist
}
```

Electrical's source reads `TemplateVersion` rows. Plumbing's calls
`composeAll()`. The orchestrator — preview, refuse-if-installed, atomic write,
provenance stamping — is identical for both and knows nothing about either.

## 5. Pricing-foundation fields the contractor must configure

| Field | Owner | Missing → |
|---|---|---|
| `PricingSettings.crewHourRateCents` | contractor | **blocker** — every price is materials alone |
| `PricingSettings.primaryMinimumCents` | contractor | warning at 0 |
| `PricingSettings.roundingIncrementCents` | contractor | no finding; has a working default |
| `PricingSettings.defaultPermitAdminCents` | contractor | no finding |
| `ContractorMaterial` cost per canonical role | contractor | **blocker** for services needing that role |

## 6. Global economics vs service inputs vs platform rules

**Global (contractor, once):** crew-hour rate · service-call minimum ·
rounding increment · default permit admin · material cost sourcing
(`ContractorMaterialSettings`) · per-role material costs.

**Service-specific (contractor, per service):** `fieldLaborHours` ·
`wwtLaborHours` · `requiresTechCount` · `materialMultiplier` (override) ·
`permitAdminCents` (override) · `otherDirectCostCents`.

**Platform (neither — worth flagging):** the progressive material markup —
30% of the first $750, 20% above — is a Price2Book rule applied once to the
assembled total, not a contractor field. The portal copy currently says
*"Labor rate, minimums and material markup"* under Pricing Settings, which
implies a control that does not exist. Slice Four should either surface the
tiers read-only or correct that copy; it should not invent a markup field.

## 7. How unresolved costs surface

Grouped **by role, not by service** — one missing role blocks many services,
and a per-service list makes one decision look like nine.

| Source | Meaning |
|---|---|
| `Service.unresolvedMaterialKeys` | roles this service needs and the contractor has not costed |
| `Service.unresolvedPolicyKeys` | policy quantities not yet decided |
| `materialCostResolved: false` | the cached `materialCostCents` must not be used |
| `servicesOnHold()` | a role's cost is on hold; publication is blocked |

Zero is never accepted as "unknown" — that rule already holds throughout, and
the panel must not offer a "0" shortcut that quietly re-introduces it.

## 8. Suggested prices, shown but never approved

The panel shows `suggestPrimaryPrice`'s figure with `formatBreakdown`'s
components — labor, material at the effective markup, permit, whether the
minimum applied, rounding — so the contractor sees *why*, not just *how much*.

The action is **"Review and approve"**, and it links to that service's Pricing
panel. Guided Setup never calls the publish action. The price-writer audit
treats a script stamping its own approval as a governance failure, and a
wizard is a script with buttons.

Drifted prices (published ≠ derived) show both, and never auto-correct.

## 9. Foundation → per-service review

The handoff is a state, not a button. Once global economics are set and no
offered service has unresolved or held material costs, panel 3 lists each
offered service with its derived price and its remaining findings, each
linking to that service's Pricing panel. This is the existing Stage 4 in the
readiness engine, given a surface.

## 10. "Pricing stage complete" — and what it is not

Complete when, **for every offered service**:

- material costs resolve and no role is on hold, and
- either the tree promises a fixed price **and** an approved published price
  exists, or the tree promises no price (quote-only owes none).

It explicitly does **not** mean live. Completing this stage sets no `active`
flag and publishes nothing; the only thing that puts a service on a storefront
is the sanctioned activation lifecycle. A contractor can finish pricing
everything and still have an empty storefront — that is correct, and the
Review & Launch stage is where they choose to change it.

## Out of scope

Scheduling, payments and launch stages. No activation. No version picker. No
markup field. No Plumbing provisioning — only the seam that will let it plug
in unchanged.


---

# Amendment — trade selection, 31 Aug 2026

The design listed *"trade not set"* as a preflight refusal while Slice Three's
Trade stage is read-only. Inspecting that gap found something more important
than a missing writer.

## There is no trade writer, and `Contractor.trade` is not the trade

```prisma
/// Feeds the AI service finder's prompt, which currently says "a
/// residential electrician" as a literal.
trade  String  @default("residential electrician")
```

`Contractor.trade` is **display prose for a prompt**. Elite's value is
`"residential electrician"`. Meanwhile `TemplateVersion.trade` is a key:
`"electrical"`. Two different concepts wearing the same word.

Nothing writes `Contractor.trade` — the only `trade` writer in the codebase is
the marketing early-access form, which writes `EarlyAccessRequest.trade`, a
different model entirely. And `provision-from-template` never reads the
contractor's trade at all: it takes `--trade`, defaulting to `"electrical"`.

So the preflight as written could not work, and would have been wrong twice
over: `Contractor.trade` is never unset (it has a default), and it is not the
value that selects a catalog.

## The smallest durable fix — a relation, not a scalar

**Superseded below.** `Contractor.canonicalTrade String?` was the first
proposal; it encodes *one contractor, one trade* into the tenant model, and a
contractor who offers Electrical and Plumbing would require undoing it. The
enrollment relation below replaces it.

Do **not** overload `trade`. It is a phrase a contractor may want to word
their own way — *"licensed plumber"* reads differently from *"plumbing
contractor"* — and turning it into a key would either break the finder's
phrasing or force every contractor in a trade to describe themselves
identically. Two facts, two fields.

Null means not chosen, which is the honest preflight refusal the design wanted.

## The writer

`PATCH /api/admin/business-profile`, the general route Slice Three already
added. Trade is durable business configuration, so it belongs with the rest of
the contractor's own details rather than behind the wizard — the same
reasoning that kept selection out of `/api/admin/setup`.

Values come from the published `TemplateVersion.trade` set, not a hardcoded
list, so Plumbing appears the day its template is published and nothing about
the writer changes.

## The reverse transition, locked

| State | Trade may change? |
|---|---|
| no catalog provisioned | yes |
| any service carries a `templateVersionId` | **refused** |

Enforced in the writer: if any of this contractor's services carries template
provenance, changing `canonicalTrade` is refused with a named reason.

Changing trade after provisioning is a catalog migration — what happens to
priced services, live bookings, and a storefront advertising work the
contractor no longer does. That is a real problem and it is **out of scope for
Slice Four**. Refusing is not a limitation to apologise for; a wizard that
casually swapped a contractor's trade would be destroying a priced catalog by
accident.

## V1 scope

Electrical is the only published catalog, so it is the only selectable value.
The architecture is not Electrical-only: the option list is read from
published template versions, and the refusal, the writer and the preflight are
all trade-neutral.


---

# Amendment 2 — trade enrollment as a relation, 31 Aug 2026

## Recommendation: the relation. No schema reason argues against it.

Five existing models already have exactly this shape — a contractor's own row
for a platform concept, unique on the pair:

| Model | Pairs contractor with |
|---|---|
| `ContractorCategory` | `CanonicalCategory` |
| `ContractorMaterial` | `CanonicalMaterial` |
| `ContractorComponent` | `CanonicalComponent` |
| `ContractorDisclaimer` | `CanonicalDisclaimer` |
| `ContractorPolicyValue` | a policy definition |

`ContractorTrade` is the same idea and reads like the rest of the schema:

```prisma
model ContractorTrade {
  id           String     @id @default(cuid())
  contractorId String
  contractor   Contractor @relation(fields: [contractorId], references: [id], onDelete: Cascade)

  /// The canonical trade catalog this contractor is enrolled in. Matches
  /// TemplateVersion.trade — "electrical", "plumbing".
  ///
  /// Enrollment is VERSION-INDEPENDENT on purpose: a contractor is enrolled
  /// in Electrical, not in Electrical v1. Provisioning resolves the latest
  /// published version at install time, and a later version is an adoption
  /// decision rather than a different enrollment.
  tradeKey     String
  enrolledAt   DateTime   @default(now())

  @@unique([contractorId, tradeKey])
  @@index([contractorId])
  @@map("contractor_trades")
}
```

`Contractor` gains `trades ContractorTrade[]`, matching the existing
`contractorCategories` / `contractorMaterials` naming. Tenant-scoped in the
guard, like every other contractor-owned row.

## One honest deviation from its siblings

Every model in that table points at a **canonical row**. `ContractorTrade`
points at a **string key**, because there is no `CanonicalTrade` entity —
trade exists only as a `String` on `TemplateVersion`.

Two ways to close that, and the smaller one is right for now:

- **Introduce `CanonicalTrade` and make both a foreign key.** Correct
  eventually — a trade will want a display name, an icon, an ordering — but it
  reaches into the template system to change `TemplateVersion.trade`, which is
  scope this slice does not need.
- **Reference the key, validate at the writer.** Options come from distinct
  published `TemplateVersion.trade` values, so an unknown key cannot be
  enrolled. A typo is refused by the same list that populates the UI.

If `CanonicalTrade` ever arrives, `tradeKey` becomes a foreign key and nothing
about enrollment is undone — which is exactly the property the scalar lacked.

## The one real cost, stated

A scalar would sit on the `Contractor` row the readiness engine already loads;
the relation costs one more query in the engine and one on the setup page.
That is small, and it buys not having to migrate a tenant model the first time
someone sells two trades.

## Semantics, settled

| | |
|---|---|
| `Contractor.trade` | contractor-authored prose — *"residential electrician"* |
| `ContractorTrade.tradeKey` | which canonical catalog(s) they are enrolled in |
| `TemplateVersion.trade` | the canonical key for a versioned template |

Provisioning resolves: **enrollment → latest published version for that trade
→ atomic install.**

## Reverse transition

Enrollment may be created before provisioning. Once any service exists whose
`templateVersionId` belongs to a version of that trade, **removing or changing
that enrollment is refused** while those services remain. Catalog removal and
migration stay out of Slice Four.

## V1 UX is unchanged

*Select your trade → Electrical*, then *Install Electrical template*. One
enrollment row. No multi-trade UI, no removal workflow. The relation is what
makes the second trade a feature rather than a migration.
