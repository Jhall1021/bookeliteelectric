# Price2Book — Architecture Decisions

Status: **restored 27 August 2026.** The original artifact (referenced variously
as *Price2Book Architecture Decisions & Next Phase Authorization* and as the
product-boundary and embed architecture document) is not present in this repo,
in its git history, or in the working machine's Downloads. It appears to have
existed only as a chat attachment.

This is a reconstruction, not a recovery. Every decision below is restated from
evidence that survives in the repository — schema comments, guard classifications,
seed and audit scripts, the 27 August handoff, and the live harness — and each
one names that evidence. Where the original may have said more, this says less
rather than inventing it. **Anything not traceable to surviving evidence is
marked `[UNVERIFIED]` and needs the owner's confirmation.**

Two decisions are new today and were never in the original: ADR-006
(`ServiceCategory` split) and ADR-007 (tenant guard contract).

---

## Standing principle — monitoring is not enforcement

> **A check that reports failure but doesn't stop anything is monitoring, not
> enforcement.**

Adopted 27 August, from a live example: ADR-003 described
`scripts/audit-price-writers.ts` as enforcing the price-writer rule. It printed
its finding and exited 0 regardless, so an unsanctioned price writer would have
logged a warning and shipped. The same day, the ADR-002 pricing guard was found
to have been deleted a day earlier and its test red the whole time, because
nothing ran that test on the way to a deploy.

Every ADR below therefore states which of three things a rule actually is, and
the words are not interchangeable:

| Term | Means |
|---|---|
| **Enforced** | A violation fails something. Non-zero exit, thrown error, or refused write. Code cannot ship in violation. |
| **Operationally verified** | A human runs a check and reads the result. Nothing stops a violation automatically. |
| **Monitored** | Something reports, and nothing acts on the report. Treat as unverified until someone reads it. |

If a rule is described as enforced, name the thing that fails. If nothing
fails, it is not enforced — say so plainly rather than aspirationally.

This applies retroactively. The tenant guard was monitoring until the live
harness proved it, and `PENDING_TENANT_SCOPE` is *still* monitoring for nested
access — see ADR-007.

## ADR-001 — Canonical role vs contractor economics

**Decided. Implemented for materials and components.**

A *role* is trade knowledge. A *cost* is a fact about one contractor. They are
separate models.

| Platform | Tenant |
|---|---|
| `CanonicalMaterial` — key, name, unit | `ContractorMaterial` — cost, package basis, confidence, supplier links |
| `CanonicalComponent` — key, name, customer label | `ContractorComponent` — approved price, material, labor hours, schedule minutes, crew count |

39 material roles / 123 recipe lines; 31 component roles / 71 attachments.

`ServiceMaterial` points at the **role**, never at a costed material — which is
what lets a recipe become a platform template: "a dedicated circuit needs 25 ft
of `WIRE_12_2`" is true regardless of who does the work or what they pay for
cable.

*Evidence: `prisma/schema.prisma`; `PLATFORM_MODELS` / `TENANT_SCOPED_MODELS` in
`lib/tenantGuard.ts`; `prisma/_componentHelpers.ts`; commits d4c3211, c4d0d83.*

## ADR-002 — Fail closed, everywhere

**Decided. Enforced** — `npm run verify` fails the build on a violation, proven
by deliberately deleting the guard and watching it exit 1.

A missing cost is never zero, never another contractor's figure, never a
default. It is an error or a review.

`loadPricingSettings(prisma, contractorId)` throws rather than falling back. A
component role a contractor has never priced yields `approvedPriceCents: null`,
and the route goes to review via `config.awaitingComponentApproval`. A service
whose recipe needs an uncosted role cannot produce a price and says so.

The handoff records this catching real defects three times.

*Evidence: `lib/materialResolution.ts`; `lib/contractorComponents.ts`;
`lib/routeResolver.ts`; `scripts/verify-unresolved-guards.ts`.*

## ADR-003 — Nothing publishes a price silently

**Decided. Partly enforced, partly operationally verified — and the line
between them is deliberate.**

Only the admin and named, dated migrations may write `basePrice` or
`whileWeThereBasePrice`. A new price-writing script must join the allow-list in
`scripts/audit-price-writers.ts` **in the same commit**, with its reason
written down.

### Enforced automatically

A violation fails the build. Nothing here depends on anyone remembering.

- The approved price-writer allow-list.
- `scripts/audit-price-writers.ts` **exits non-zero on violation** (since
  27 August; it previously only reported).
- `prisma/_priceGuard.ts` — a seed may ESTABLISH a price that does not exist
  yet, and may never OVERWRITE one that does. Refused at write time.
- TypeScript, `next build`, and the offline checks in `npm run verify`.
- Tenant and security verification that is **safe and non-mutating** —
  `scripts/audit-platform-tenant-relations.ts` (ADR-007) and the offline
  guard verifiers.

Current: 17 writes across 8 files, **0** that can move a price outside the admin.

### Operationally verified, not automatically enforced

- Published-price reconciliation against current database state.
- Approved exceptions and unexplained differences.
- The **live** tenant isolation harness,
  `scripts/verify-tenant-isolation-live.ts`. It creates a throwaway contractor
  and writes real rows, so it is operationally verified for the same reason
  reconciliation is: it touches mutable production data. **Do not gate a
  deployment on it.** Its offline counterparts belong in `npm run verify` and
  are listed above; only the live one is excluded.

> Published-price reconciliation is an operational verification performed after
> pricing/catalog changes and before releases that affect pricing. It is
> intentionally not a deployment gate because it evaluates mutable production
> data rather than code correctness.

Reconciliation is **not** described as enforced, gated, or CI-protected
anywhere. If you find such wording, it is wrong and predates this decision.

Its output semantics are unchanged and should stay that way:

- unexplained differences — currently **0**, and that number must stay 0
- approved exceptions — currently **2**
- unknown / unpriced rows — currently **2** (both Chandelier)

Record the result in migration and release handoffs whenever pricing-related
work occurs.

### The discipline rule — when to run reconcile

"Run it after every change" was the previous instruction. It is both too broad
to follow and too vague to audit, which in practice means "whenever someone
remembers". The trigger is now named.

**Run `npm run db:reconcile` before declaring a change complete if that change
touches any of:**

- pricing inputs
- pricing logic
- materials
- service recipes
- components
- publication migrations
- price-writing code

An unrelated CSS, auth, or docs deployment does not need production price data
to approve it, and should not pretend to.

`npm run verify` contains the things where failure means **the code itself is
unsafe to ship**. Reconciliation stays its own explicit command.

*Evidence: `scripts/audit-price-writers.ts`; `prisma/_priceGuard.ts`;
`scripts/reconcile-prices.ts`; `package.json` scripts `verify` and `build`.*

## ADR-004 — Expand–contract, always

**Decided. Run six times.**

Add alongside → backfill → verify → switch reads → only then remove. Never
replace a model in one step: `db push` will drop the table.

There is **no migrations folder**. Schema changes go through `npx prisma db push`.
**Never `prisma migrate dev`** — it offers to reset the live database.

Completed runs: materials, service owner, configuration, components, the
component read switch, and (in progress) categories.

*Evidence: `RUN-ORDER.md`; the dated migration scripts under `prisma/`.*

## ADR-005 — Identity is Better Auth's; authorization is ours

**Decided. Implemented.**

Better Auth 1.7.1 owns `User`, `Session`, `Account`, `Verification`. Price2Book
owns `ContractorMembership`, `ContractorInvitation`, `PlatformAccess`,
`SupportAccessEvent`.

Magic link, 15-minute expiry. Platform mail sends from `admin@price2book.com`,
verified end to end — **platform mail is distinct from contractor mail**, which
is why the platform domain sends it rather than Elite's. Elite has one OWNER:
`josh@econscvs.com`.

*Evidence: `prisma/schema.prisma`; commits 176e94b, e338882, 167ccce.*

## ADR-006 — `ServiceCategory` splits into canonical and contractor — NEW, 27 August

**Decided 27 August. Expand phase pushed; backfill not yet run.**

Status against the expand–contract sequence below: steps 1–8 are the plan;
the schema now carries both models and `Service.contractorCategoryId`
(nullable), and both are classified in `lib/tenantGuard.ts` —
`CanonicalCategory` platform, `ContractorCategory` tenant-scoped. Nothing reads
them yet. **Step 1 (backfill) is the next action.**

Category *identity* is platform/template knowledge. Category *presentation* is
contractor policy.

```
CanonicalCategory (platform)     ContractorCategory (tenant)
  id                               id
  slug          <- stable          contractorId
  name          <- default         canonicalCategoryId
  defaultIcon                      nameOverride?
  active?                          iconOverride?
                                   sortOrder
                                   navGroup?
                                   active
                                   @@unique([contractorId, canonicalCategoryId])
```

**Relationship rule.** Contractor services point at `ContractorCategory`, never
directly at `CanonicalCategory` — visibility, order and naming belong to the
contractor experience. `ContractorCategory → CanonicalCategory`. Eventually
`CanonicalService → CanonicalCategory` on the template side.

**Slug rule.** The stable semantic slug lives on `CanonicalCategory` and is not
duplicated per contractor. Do not create contractor category slugs merely
because the old model had `ServiceCategory.slug`. If contractor-specific
customer-facing URL aliases are genuinely needed later, add that as an explicit
override rather than making every contractor copy the canonical slug today.

**Why now rather than tenant-scoping.** Tenant-scoping would deliberately
create duplicate taxonomy rows immediately before building a template library
whose purpose is to eliminate them. Contractor #2 is also electrical, so
"Lighting" is genuinely one shared row with two presentations — the distinction
has a second real consumer and is no longer speculative.

**`navGroup` is contractor-side, explicitly.** Elite uses it so New Outlets
cluster near Outlets & Switches. That is storefront organisation, not electrical
truth; another contractor may want *New Installations* / *Repairs &
Replacements*. Same for `sortOrder`, `active`, and display-name overrides.

The clean line: canonical answers *what is this category?*; contractor answers
*do I offer it, what do I call it, what icon, order and grouping do I use?*

Supporting evidence that the seam already exists: `prisma/seed.ts:222`
deliberately does not sync `sortOrder`, with the comment that it is set in the
admin now.

**Migration** — expand–contract, per ADR-004:

1. Create canonical rows from the distinct existing Elite categories.
2. Create one Elite `ContractorCategory` for each.
3. Preserve Elite's current sort order, nav group and icon behaviour.
4. Switch service/category reads to the contractor category.
5. Prove the catalog renders identically.
6. Create a Demo contractor category set with deliberately different ordering
   and visibility.
7. Prove the two presentations differ while both point at the same canonical
   "Lighting" row.
8. Only then retire the old `ServiceCategory`.

**Do not change service pricing, routing or published-price governance during
this pass.**

## ADR-007 — The tenant guard's real contract — NEW, 27 August

**Decided 27 August, from measured behaviour. Enforced** by
`scripts/audit-platform-tenant-relations.ts`, which exits non-zero on an
unreviewed platform-rooted read of tenant data and runs inside `npm run verify`.
The *live* harness that proved the underlying behaviour is operationally
verified, not gated — it writes a throwaway contractor. See ADR-003.

> **The guard secures top-level tenant queries. Relations inherit isolation only
> from the ownership of that top-level query.**
>
> **Rule: tenant-owned data must never be operationally loaded through a
> platform-owned top-level Prisma query. Root those queries at the tenant-owned
> model so the guard executes.**

Prisma query extensions fire on the **top-level operation only**. Nested
`include`/`select` reads — and nested writes — are part of the parent query and
are never intercepted. Measured against the live database on 27 August, not
assumed.

```
SAFE     Service (tenant) → Question (tenant) → AnswerOption (tenant)
         the tenant-owned root determines which graph is reachable

UNSAFE   CanonicalComponent (platform) → ContractorComponent (tenant)
         the root has deliberately unrestricted visibility

FIXED    ContractorComponent (tenant) → CanonicalComponent (platform)
         guard back in control
```

This is preferable to decorating every nested `include` with a manual
contractor filter forever. Manual filters are correct exactly as long as
someone remembers them, and nothing fails when they don't.

**Three consequences, all live:**

1. The nine `Service`/`Quote`-rooted traversals in pass two need **no**
   artificial extra scoping. Their parent already establishes tenant ownership
   through the foreign key.
2. `PENDING_TENANT_SCOPE` is **monitoring, not enforcement** — see the standing
   principle. It throws on a direct query and stays silent on nested reads
   *and nested writes*, so a clean run is not proof that no pending model was
   touched. It reports on one access path and is blind to the others. This does
   not require building a new generic Prisma mechanism now: once `Question`,
   `AnswerOption` and the rest carry real contractor ownership and admin writes
   are rooted and scoped correctly, the immediate migration risk closes.
3. Raw SQL (`$queryRaw`, `$executeRaw`) was already outside the extension's
   reach. Nested relation traversal now joins it. If raw queries are ever needed
   on tenant data, that is the moment to consider Postgres row-level security,
   which enforces at the database and cannot be sidestepped.

The guard remains a factory (`withTenantGuard`), **not attached to
`lib/prisma.ts`**. Adoption is per-route once tenant context exists.

*Evidence: `scripts/verify-tenant-isolation-live.ts`, section `NESTED READS`;
`lib/contractorComponents.ts`; `docs/migration/pass-two-scope-narrowing.md`.*

---

## Decisions referenced but NOT recoverable from the repo

The handoff cites the ADR for two things this reconstruction cannot restore.
**These need the owner to restate them.**

- **`[UNVERIFIED]` §4 — `intakeSource`.** Cited as the reason `Visit`,
  `LineItem`, `Booking` etc. must carry `intakeSource` in the pass-three
  migration. The field does not exist in the schema yet and nothing in the repo
  defines its values or semantics.
- **`[UNVERIFIED]` §2.2 — storefront routing.** Cited as the home for the
  `Service.slug` global-uniqueness problem: two contractors cannot both have
  `new-120v-outlet`, and `app/api/services/[slug]/route.ts` resolves by slug
  alone. `ServiceCategory.slug` has the identical constraint. ADR-006's slug
  rule addresses categories; services remain open.
- **`[UNVERIFIED]` hosted page vs embed.** Named in the original title and
  central to the product boundary. Nothing in the repo implements or describes
  it.
- **`[UNVERIFIED]` §12a of the migration audit**, described in the handoff as
  "partly reinstated by the ADR". Both documents are missing, so neither the
  original claim nor the reinstatement can be recovered.

## Known open items

- **Recessed Lighting** publishes $375 against a $385 model figure — a
  deliberate launch decision, recorded in `APPROVED_EXCEPTIONS`.
- **Chandelier** is the only unpriced service; the last two `unknown` rows.
- **Four ASSUMED material costs** (Cat6, RG6, RJ45, coax jack) are estimates.
  Sensitivity analysis showed they do not move published prices.
- **Prep photos never reach the field.** `lib/jobber.ts` sends none; they are
  visible in quote review only. An FSM adapter requirement.
- **Primary reconciliation on quote approval is untested** — approval prices an
  existing line, and reconciliation runs only on add and delete.
- **`addMaterialCostCents` flat cents on `AnswerOption`** are still Elite's
  figures with no contractor scope. Not addressed by the component split.
- ~~`scripts/verify-unresolved-guards.ts` has 6 failing checks on `main`~~ —
  **resolved 27 August.** It was a real regression, not a stale fixture: the
  ADR-002 unresolved-material guard was deleted as collateral in commit
  3ae9349, whose subject was scoping pricing settings to the contractor and
  which never mentioned it. Restored verbatim in `lib/routeResolver.ts`; 13 of
  13 checks pass.

  The guard had been absent from the pricing path for a day. Nothing caught it
  because nothing ran the verify scripts: `npm run build` type-checks the seeds
  but executed none of them, and the test's fixture is cast `as any`, so
  deleting the guard was not even a type error.

  `npm run verify` now runs the six offline checks and `build` runs it before
  `next build`, so the Vercel deploy fails on a recurrence. Proven by deleting
  the guard again and watching the gate exit 1. `audit-price-writers.ts` was
  changed to exit non-zero at the same time — it had only ever reported, which
  made ADR-003's "enforced" a statement of intent rather than of behaviour.
