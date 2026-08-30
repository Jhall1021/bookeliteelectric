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

## Standing principle — what "complete" requires

> **A migration is complete only when the source of truth, the enforcement
> mechanism, the independent sweep, the adversarial runtime proof, and the real
> user flow all agree.**

Adopted 27 August, from a session in which each of those layers caught
something none of the others could:

| Layer | What it alone caught |
|---|---|
| Source of truth — the schema | five configuration models listed as pending that had carried `contractorId` for days |
| Enforcement — the guard | a legitimate query throwing, which is how those five were found |
| Independent sweep | 28 sites the working list said were done, then 18 more, then 22 root-path navigations |
| Adversarial runtime — the live harness | a platform-parent read returning another contractor's economics; a lazy-promise context escape |
| Real user flow — a browser | six missing redirects, a production 500 for cookieless visitors, an error message that turned a business rejection into "something went wrong" |

None substitutes for another, and a green build is the weakest of them. Every
one of the defects above passed `tsc` and `next build` without complaint.

The corollary, learned three separate times in one session: **a list maintained
by hand beside the truth will go stale.** `PENDING_TENANT_SCOPE` claimed
finished work was outstanding; two ad-hoc sweeps hardcoded model inventories
that were wrong within the hour. Verification must DERIVE its inventory from
the thing it verifies — which is why
`scripts/audit-unguarded-tenant-access.ts` reads its models from
`lib/tenantGuard.ts` at runtime rather than listing them.

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

**And after any migration or maintenance script that writes rows in a
price-bearing table such as `Service` — even when the fields it intends to
write are non-pricing fields.** The trigger is the table it touches, not the
column it meant to touch. Added 27 August after the ADR-006 category backfill,
which writes only `Service.contractorCategoryId` and would not otherwise have
qualified under any of the conditions above.

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

**Decided 27 August. Expand pushed, backfill applied. Steps 1–3 done.**

Schema carries both models and a nullable `Service.contractorCategoryId`, both
classified in `lib/tenantGuard.ts` — `CanonicalCategory` platform,
`ContractorCategory` tenant-scoped.

`prisma/backfill-category-split-2026-08-27.ts` has run: **13 canonical
categories, 13 Elite contractor categories, 75 of 75 services pointed.**
Idempotent — a re-run reports 0 to point and creates no duplicates.

It verifies three things rather than asserting them, and exits non-zero on any:
75 of 75 services resolve to an identical slug, name and icon; 13 of 13
categories keep their exact `sortOrder` and `navGroup`; no service is left
unpointed. Elite's current values became the canonical defaults, so
`nameOverride` and `iconOverride` are null everywhere and every fallback
resolves to the string it resolved to before.

`ServiceCategory` is untouched and still holds every row. **Nothing reads the
new tables yet** — that is step 4.

**Step 4 done, 27 August: reads switched.** 14 operational readers, not the
nine first estimated — 7 querying `ServiceCategory` directly and 7 reaching it
through `Service.category`.

The 7 direct readers now root at `ContractorCategory`. The 7 `Service`-rooted
traversals stay `Service`-rooted and were repointed to
`contractorCategory → canonicalCategory`; per ADR-007 a tenant-owned root
already establishes ownership, so they were not re-rooted for style.

Presentation resolution lives in `lib/categories.ts` rather than at each call
site — `nameOverride ?? canonical.name` written 14 times is 14 chances to write
it differently. Each resolver takes only the fields it reads, which is how the
harness caught a too-thin select. `sortOrder`, `navGroup` and `active` come
from `ContractorCategory`; `slug` stays canonical and is never overridden.

A null `contractorCategory` throws rather than defaulting: `?? ""` puts the
string "undefined" into a customer-facing URL, which looks like working
software. The one exception is the marketing page, which carries its own
category constant and degrades to that instead of taking the homepage down.

**Divergence proven** in the live harness, `CATEGORY PRESENTATION` section:
the dummy and Elite point at the *same* `CanonicalCategory` row for `lighting`
while the dummy renames it, re-icons it, sorts it 99th against Elite's 2nd, and
switches a second category off. Neither sees the other's configuration —
Elite's row returns null from the dummy's context even by primary key — and
Elite's presentation is field-for-field unchanged. 45 of 45 checks pass.

**`ServiceCategory` is now classified as a deprecated pre-split model**, not as
pending tenant scope: the split superseded that plan. Every remaining reference
is migration compatibility, and the only remaining write derives
`Service.categoryId`, which is NOT NULL until the contract phase.

**Step 5 done, 27 August: the seed path writes the split structure.**
`prisma/_categoryHelpers.ts` — same principle as `_componentHelpers.ts`. One
call writes the canonical row, the contractor's presentation of it, and the
pre-split scaffolding; every seeded service attaches both pointers. All three
seeds that create categories or services use it.

The idempotency rule is explicit and proven: a reseed never resets
`sortOrder`, `navGroup`, `nameOverride`, `iconOverride` or `active` — the
contractor's `update` branch is deliberately empty. Platform defaults on
`CanonicalCategory` ARE maintained, because those belong to the seed. The live
harness re-runs the helper against the dummy with deliberately different
defaults and asserts the contractor's values survive; running that proof on
Elite would mean renaming and deactivating a live category to watch it survive.

`scripts/verify-category-integrity.ts` is the backstop, in `npm run verify` and
therefore in the build gate. Read-only — it counts and reads, writes nothing,
creates no fixture. It checks four things: no service without a contractor
category, no dangling pointer, no contractor category without a canonical row,
and no service pointing at *another contractor's* category. That last one no
foreign key can express, since both columns are individually valid while
pointing at different tenants.

**On putting a database-reading check in the build gate:** `next build`
already requires a live connection — `/services` and `/troubleshooting` are
statically prerendered and both query. This adds no infrastructure dependency;
it moves the failure earlier and gives it an actionable message instead of a
prerender stack trace. That is what distinguishes it from reconciliation, which
stays out: this is a structural invariant production reads require, not a
judgment about mutable pricing data.

The backfill is now a recovery tool — migration replay, older environments,
rollback — not a routine step. `RUN-ORDER.md` says so.

The rule worth carrying: **if correct execution depends on a human remembering
an ordering rule, encode the order into the write path and use verification as
the backstop.** Stronger than either documentation or a gate alone.

**Next: leave the old model in place and let this run.** The contract phase
should be deletion rather than discovery — old structure still present as
rollback scaffolding, no production read path depending on it.

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
cluster near Outlets & Switches. That is storefront organization, not electrical
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
3. Preserve Elite's current sort order, nav group and icon behavior.
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

**Decided 27 August, from measured behavior. Enforced** by
`scripts/audit-platform-tenant-relations.ts`, which exits non-zero on an
unreviewed platform-rooted read of tenant data and runs inside `npm run verify`.
The *live* harness that proved the underlying behavior is operationally
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

## ADR-007a — Empty list ≠ finished — AMENDMENT, 27 August

**Decided 27 August, from an actual isolation failure rather than caution.**

> **`PENDING_TENANT_SCOPE` is a migration inventory and a tripwire. It is not
> proof of tenant isolation. An empty list does not mean the tenant migration
> is complete.**

The original working assumption was that the pending list reaching zero would
mean tenancy was done. The live harness disproved it. You can have zero flagged
direct models and still have a cross-tenant path, because:

- nested reads bypass model-level query extensions
- nested writes bypass them too
- a platform-parent → tenant-child traversal crosses the boundary without ever
  triggering the guard

That is not theoretical. From a throwaway contractor's context the harness read
5 of Elite's contractor components through a platform root, with the model in
question correctly classified the whole time.

**The list is not authoritative in EITHER direction.** It can miss unsafe work,
and it can also claim finished work is outstanding. On 27 August five
configuration models — `PricingSettings`, `BusinessHours`,
`ContractorMaterialSettings`, `JobberConnection`, `ServiceArea` — sat in
`PENDING_TENANT_SCOPE` having carried `contractorId` since an earlier pass. The
guard threw on a legitimate query and add-to-visit returned 500. The schema,
the current access paths, and verification are the truth; the list is a
reminder.

There is a second reason the list overstates itself, worth stating plainly:
`withTenantGuard` is called in exactly one place in this repository — the test
harness. No application code uses a guarded client. So today
`PENDING_TENANT_SCOPE` does not monitor the application at all; it monitors a
test. Under the standing principle, that is monitoring at best.

### Completion is established by evidence, not by exhausting a list

The tenant migration may be called complete only when **all nine** hold:

1. No genuinely tenant-owned model remains unowned.
2. Direct query sites have been swept and converted.
3. Platform-parent → tenant-child relation directions have been audited.
4. Operational tenant data is rooted at tenant-owned models.
5. Cross-tenant foreign-key combinations have integrity checks wherever the
   database cannot express the ownership invariant itself.
6. Seed and migration write paths preserve tenant ownership.
7. The gated offline tenant checks pass.
8. The live two-contractor isolation harness passes.
9. Remaining legacy models and fields are explicitly classified as deprecated
   rollback scaffolding rather than accidentally left "pending".

**The list tells us what we know remains. The verification tells us whether we
are actually finished.**

Point 5 is the one with no automatic backstop and the easiest to skip: a
service and its category are each individually valid while pointing at
different tenants, and no foreign key can say otherwise. That check exists for
categories in `scripts/verify-category-integrity.ts`; every future tenant pair
needs its own.

Point 9 is what stopped `ServiceCategory` being left in the pending list after
ADR-006 superseded the plan to tenant-scope it. A model sitting in that list
for the wrong reason makes the list lie in both directions.

### Guard adoption — COMPLETE for every route that can know its tenant

Criterion 4 **met**, established by a sweep recomputed from the repository
rather than from any accumulated work list.

| Bucket | Count |
|---|---|
| Guarded / adopted | **25 files**, 0 drift |
| Platform-owned | passed through by the guard |
| Deprecated / migration / seed | `prisma/`, `scripts/` — own client by design |
| **Blocked on storefront tenant resolution** | **0** |
| Explicitly justified exception | 2 sites — `recordQuery` writes `ServiceQuery`, still `PENDING_TENANT_SCOPE` until ADR-008 |
| **Unexplained / unreviewed** | **0** |

`soleContractorId` no longer appears anywhere under `app/[site]/`. It survives
only on admin surfaces, which await per-contractor auth rather than storefront
resolution.

### §2.2 status, stated precisely

- **Architecture: complete.**
- **Exercised storefront paths: operationally proven** — see
  `docs/migration/storefront-smoke-test-2026-08-27.md`.
- **Full customer checkout / quote regression: pending preview verification.**

Kept as three lines rather than one so neither half is overstated: the
tenant-routing architecture is not unfinished merely because no job has been
sent to Jobber, and the storefront is not fully regression-tested merely
because the architecture is done.

### §2.2 implemented — the hosted storefront is tenant-addressed

`ContractorSite` maps a public identity to exactly one contractor.
`hostedSlug` is the URL segment; `publicId` is the opaque identifier an API
request carries. They are separate so rotating one does not rename the other.

```
/elite-electric/services            page resolves hostedSlug -> site
                                    -> withSite() -> guarded query
x-price2book-site: <publicId>       API resolves publicId -> site
                                    -> withSite() -> guarded query
```

The whole customer-facing storefront moved under `app/[site]/` — services,
category and service pages, troubleshooting, checkout, my-visit, quote,
service-area, and the marketing pages. Old root paths **redirect** (307,
temporary) rather than continuing to serve Elite implicitly; a permanent
redirect would burn the root namespace into one contractor, and Price2Book
wants `/services` and `/pricing` for itself.

`RESERVED_HOSTED_SLUGS` stops a contractor taking `api`, `admin`, `login` and
the rest. Configuration validation, not tenant security — it prevents a routing
collision, not a leak.

Client calls carry the identifier through `useSiteFetch()` from one provider in
the `[site]` layout, rather than twenty call sites each remembering a header —
which would be the "correct as long as someone remembers" shape moved to the
browser. `useSiteFetchOptional()` exists because the shared header sits in the
ROOT layout and also renders where there is no storefront.

**The forbidden shape is gone.** `app/api/services/[slug]/route.ts` used to
look up the service, read its `contractorId`, then load the tree — using the
requested resource to decide whose resource it was. It now resolves the site
first. Same for the visit and quote routes, whose contractor came from
`contractorIdForService(service)`.

Proof, both directions: Elite site + Elite service works; Dummy site + Dummy
service works; Elite site + Dummy service id is not found; Dummy site + Elite
service id is not found; the dummy site sees 1 service where Elite has 75; an
unknown publicId resolves to null; a deactivated site stops resolving while its
contractor's data is untouched. 105 of 105.

### The defect §2.2 exposed, and its permanent test

The four cross-tenant cases failed on first run with `NoTenantContextError`,
and the fault was in `withContractor`, not the test.

**A Prisma promise is lazy.** `db.service.findUnique(...)` builds a query and
does nothing until awaited. Returning it unawaited let
`AsyncLocalStorage.run()` exit first, so the query executed OUTSIDE the tenant
context. The vulnerable shape was the natural one — `(db) => db.thing.find(...)`
— and every adopted route was written that way, through fifteen files, with the
build never noticing.

The invariant now: **tenant context stays active until the callback's returned
work has SETTLED, not merely until the callback has returned a Promise.**

`scripts/verify-tenant-context-retention.ts` holds it, in the gate. Offline —
it uses a deliberately lazy thenable and no database at all, which is why it
can run there rather than in the live harness. Reverting the fix fails it
immediately, verified.

*Evidence: `scripts/verify-tenant-isolation-live.ts`;
`scripts/audit-platform-tenant-relations.ts`;
`scripts/audit-guard-adoption.ts`;
`docs/migration/pass-two-scope-narrowing.md`.*

## ADR-008 — `ServiceQuery` is contractor-owned — NEW, 27 August

**Decided and IMPLEMENTED 27 August.**

`ServiceQuery` carries a required `contractorId`, keyed
`@@unique([contractorId, normalizedText])`, with the global unique on
`normalizedText` dropped. 23 rows backfilled to Elite carrying 24 asks and
36,213/1,368 tokens of attributed spend. All three access paths — the cache
read, the upsert, and the feedback counters — are tenant-rooted on the guarded
client.

Proven in the live harness: the same normalized phrase now holds a different
answer for each contractor, each lookup returns its own, Elite's row is null
from the dummy's context even by primary key, a feedback update touches exactly
one row, and the dummy's rejection leaves Elite's counters, answer and token
spend untouched. 120 of 120.

**This releases `Service.slug`.** The ordering guard now reports the
re-keying done and permits per-contractor slugs — which was the whole reason
the constraint was written down before the work started.

`ServiceQuery` is a contractor-owned cache, not a platform-global one. Today
`normalizedText` is `@unique` globally, which acts as a platform-wide cache
key. That cannot survive multi-tenancy.

### Intended identity

```
contractorId + normalizedText          @@unique([contractorId, normalizedText])
```

### Rationale

"install an outlet in my garage" is not guaranteed to resolve identically for
every contractor. They may differ in active service catalog, slugs and routes,
scope policy, supported work, trade vocabulary, and future template versions.

**A cache hit from Contractor A must never decide Contractor B's service
suggestion.** Accept the duplicated AI and cache cost: tenant-correct behavior
matters more than maximising cache reuse.

`ServiceQuery` analytics stay contractor-separated for the same reason —
`timesAccepted`, `timesRejected`, `outcome` and the token counters are all
per-contractor facts. The token counters in particular are cost attribution,
which for Price2Book is billing.

If a platform-level vocabulary or intelligence corpus is wanted later, build it
as a **separate sanitized platform model or process**. Do not turn the
operational contractor cache into shared state, and do not make it globally
shared merely because contractor #1 and contractor #2 both happen to be
electrical.

### Three ways the current model crosses the boundary

Not one, and the write ones are already latent today:

| Site | Today |
|---|---|
| `app/api/service-match/route.ts` read | `findUnique({ where: { normalizedText } })` — B gets A's cached match |
| `lib/serviceMatch.ts` write | `upsert` on the global key — B's write **updates A's row**: matched slug, confidence, outcome, source, `rawExamples`, token counters |
| `app/api/service-match/feedback/route.ts` | `updateMany({ where: { normalizedText } })` — B's customer rejecting a match moves A's counters |

### A sequencing constraint, and the reason it is written down

There is an accidental protection in place. The cache hit is only trusted if
the matched slug is found in the contractor's own catalog
(`flat.find(s => s.slug === cached.matchedServiceSlug)`). Because
`Service.slug` is globally unique today, contractor B cannot hold A's slug, the
lookup misses, and the cache degrades to asking the model instead of leaking.

Nobody put that there deliberately, and it dies the moment `Service.slug`
becomes per-contractor — which is the fix already logged for storefront
routing. **Two open items that are each harmless alone combine into a silent
wrong-answer defect, and the ORDER decides whether it ever exists.** Make slugs
per-contractor before making `ServiceQuery` tenant-aware and the hole opens;
do it the other way round and it never does.

So: **`ServiceQuery` tenant-awareness lands before, or in the same change as,
per-contractor service slugs.** Never after.

### Not an additive migration

This is the one pass-four model that cannot be done by adding a column. The
global `normalizedText @unique` must be **replaced**, and a drop is not
additive. Adding the compound unique alongside does not help in the meantime:
the global constraint is precisely what stops contractor #2 having their own
row, so the drop has to land with the backfill rather than being deferred to a
later contract phase. Otherwise contractor #2 cannot record a query at all.

### Pass four implementation target

- add required `contractorId`
- backfill existing rows to Elite
- replace the global `normalizedText @unique` with
  `@@unique([contractorId, normalizedText])`
- make lookup and write paths tenant-rooted
- make accepted / rejected / outcome / token statistics tenant-specific
- prove identical normalized text can exist once for Elite and once for the
  dummy **with different match results**
- prove neither context sees or increments the other's row

### The ordering constraint is enforced, not documented

`scripts/audit-tenant-migration-order.ts`, in `npm run verify` and therefore in
the build gate. Read-only, reads code state rather than production data, and
asserts exactly one invariant:

> If `Service.slug` stops being globally unique, `ServiceQuery` must already be
> re-keyed on `(contractorId, normalizedText)`.

This one earns a gate where a documented ordering rule normally would not.
Every other failure this week was loud once it happened — a build error, a
throw, a red check. This one is silent: wrong order, green build, plausible
answer, wrong contractor's suggestion.

Four things it deliberately gets right:

- **The trigger is loss of a global uniqueness guarantee**, not the appearance
  of a compound key. Dropping `@unique` from `Service.slug` entirely as an
  intermediate step removes the protection just as thoroughly and would sail
  past a check looking only for `@@unique([contractorId, slug])`.
- **"Re-keyed" means all three conditions**: a REQUIRED `contractorId`, the
  compound unique present, AND the global unique on `normalizedText` gone.
  Adding the compound key while the global one survives leaves the cache
  globally keyed — the dependency is not met, and a naive check would go quiet
  at exactly the wrong moment.
- **It parses the schema with comments stripped first.** A comment describing
  the intended shape is the same category as an audit that reports without
  failing, and must not be able to satisfy it.
- **It fails on unreadable input** — missing file, unparseable schema, absent
  model, absent field. A guard that passes silently when its input is
  unreadable is the monitoring problem one level down.
- **A missing `ServiceQuery` model is a failure, not a satisfied condition.**
  Confirmed 27 August. The model disappearing does not automatically satisfy
  ADR-008: if it is ever deliberately removed, the same change must explicitly
  update or retire this audit. That puts the architectural decision in the git
  history rather than letting the guard infer intent from absence — which is
  the same reason the audit cannot quietly become irrelevant.

**It proves the schema shape and nothing else,** and says so on success. A
correctly-keyed table read without a tenant filter still leaks; no schema check
can see that. The read, write and feedback paths are covered by
`scripts/audit-platform-tenant-relations.ts` and the live harness. A green run
here must never be read as "ADR-008 is done".

Verified against eight fixtures rather than assumed: slug unique dropped
entirely (fails), slug made compound (fails), compound key added with the
global one kept (fails), `contractorId` optional (fails), fully re-keyed
(passes), comments claiming the correct shape while the schema is unchanged
(fails), `ServiceQuery` model removed (fails), schema file missing (fails).

### Recorded where it will be read

The ADR is not the place someone reaching pass four will look first. Following
the same principle as the seed path — encode the decision where the work
happens — this decision is also written at each site that would otherwise
preserve the current behavior:

- `prisma/schema.prisma`, on the `ServiceQuery` model and on the
  `normalizedText @unique` field itself
- `app/api/service-match/route.ts`, at the cache read, including why the
  accidental protection exists and when it dies
- `lib/serviceMatch.ts`, at the upsert
- `app/api/service-match/feedback/route.ts`, at the counter update

`lib/tenantGuard.ts` carries ADR-007a the same way, on
`PENDING_TENANT_SCOPE` itself.

*Evidence: `prisma/schema.prisma` model `ServiceQuery`;
`lib/serviceMatch.ts`; `app/api/service-match/route.ts`;
`app/api/service-match/feedback/route.ts`.*

## ADR-009 — `PhotoGroup` is platform; `ConditionalDisclaimer` splits — NEW, 27 August

**Decided 27 August. PhotoGroup classified; disclaimer expand, backfill and
read-switch done. Legacy model retained.**

Two independent models, deliberately treated differently. Symmetry was not the
deciding factor; what the row commits a contractor to was.

### `PhotoGroup` → platform, not split

Six rows, keyed like `PANEL_PHOTOS`. Photo requirements describe the evidence
needed to understand the work, and the panel-photo safety guidance is trade and
safety knowledge. There is no contractor economics and no scope policy on the
row today.

**No `ContractorPhotoGroup` layer in this pass.** Unlike the category case,
classifying platform creates no duplicate rows, so an override layer later is
purely additive — no rework. "For this electrical condition these photos are
useful, and don't remove the panel dead front" is not a promise that varies by
contractor. Building the override now would be architecture for a requirement
that does not exist.

The existing joins keep pointing at the platform `PhotoGroup`.

### `ConditionalDisclaimer` → `CanonicalDisclaimer` + `ContractorDisclaimer`

```
CanonicalDisclaimer (platform)      ContractorDisclaimer (tenant)
  id                                  id
  key      <- stable concept          contractorId
  name                                canonicalDisclaimerId
  description                         text     <- the promise
  accessClass  <- WHEN it applies     active
  active   <- platform lifecycle      notes
                                      @@unique([contractorId, canonicalDisclaimerId])
```

**The homeowner-facing `text` is on the CONTRACTOR row, deliberately.** The
concept might be `FINISHED_ROUTE_SURFACE_REPAIR`; Elite's policy says
"Patching and painting are not included"; another contractor may include
patching, or word scope differently. Those cannot safely share one mutable
field.

**Why not platform, like PhotoGroup.** It would be simpler, and it would put a
subtle failure directly into the template library: editing a disclaimer for one
contractor would change what a *different* contractor promises their homeowner.
That is materially different from sharing `PANEL_PHOTOS`, and it is no longer
speculative — contractor #2 can legitimately answer "do you patch the holes you
make?" differently from Elite.

`accessClass` stays canonical: *when* a statement applies is part of the
condition. `active` exists on both, because the platform can retire a concept
and a contractor can switch off their own statement independently — a
disclaimer renders only when both agree.

`QuestionDisclaimer` and `AnswerOptionDisclaimer` belong to a contractor's
service tree, so their attachments resolve to that contractor's
`ContractorDisclaimer` rather than to a global policy-text row.

### State

Expand pushed (two tables, two nullable columns, no drops). Backfilled: **5
canonical concepts, 5 Elite policy rows, 2 attachments repointed**, idempotent
on re-run, with every attachment verified to resolve to identical text, active
state, key and `accessClass`.

Reads switched in `lib/routeResolver.ts` and
`app/api/services/[slug]/route.ts`. Both were already `Service`-rooted, so they
were repointed rather than re-rooted — per ADR-007, a tenant-owned root already
establishes ownership. Resolution lives in `lib/categories.ts`
(`disclaimerIsActive`, `disclaimerAccessClass`,
`requireContractorDisclaimer`), not at each call site.

`ConditionalDisclaimer` is untouched and keeps every row. **Not contracted in
this pass.**

### Proven, not asserted

Live harness, `DISCLAIMER POLICY` section: the dummy and Elite attach the
**same canonical condition** while the dummy carries different text and a
different active state. Each reads its own promise; Elite's row returns null
from the dummy's context even by primary key; Elite's wording is unchanged word
for word. 62 of 62 checks.

`scripts/verify-disclaimer-integrity.ts` is in the gate, and its second check
is the one **no foreign key can express**: an attachment's owning contractor,
derived through the service tree, must equal the contractor whose policy it
renders. Both columns are individually valid while naming different tenants.
The failure mode there is not a 500 — it is a homeowner shown a commitment that
belongs to someone else, which looks entirely correct. Proven by orphaning an
attachment and watching the gate exit 1.

### Also found

**`PricingRule` is dead.** Zero rows, and the only references anywhere are the
delete statements in the isolation test's own cleanup. It is a drop candidate
for the contract phase, not a tenant-scope target. Do not migrate it.

## ADR-010 — Ownership comes from the data model — SETTLED, 27 August

**Decided and proven. Derived tenant ownership is the architecture for the
service-tree models.** No `contractorId` column is added to any of them.

A `Question.contractorId` would merely duplicate
`Question.serviceId → Service.contractorId`, and a duplicate can disagree with
what it duplicates. The same holds recursively for `AnswerOption` and the
joins. **The parent relationship is the single source of truth for ownership**,
so the guard reads it rather than a copy of it — which also avoids
self-inflicting a cross-tenant pair that would need a hand-written integrity
check per model, forever.

Reading ownership from the schema rather than from `PENDING_TENANT_SCOPE` is
what surfaced this. The list implied ten models each needing a column; the data
model said two were independent and the rest already had an owner.

### The guard now has three classes

| Class | Meaning |
|---|---|
| direct tenant-owned | carries `contractorId`; guard injects a scalar filter |
| **derived tenant-owned** | owner reached through a required parent chain; guard generates a relation filter from a declaration |
| platform-owned | shared knowledge; passes through |

`DERIVED_TENANT_MODELS` declares the path, and `derivedOwnerFilter` generates
the filter — `["question","service"]` becomes
`{ question: { service: { contractorId } } }`:

```
Question, ServiceMaterial                          -> service
AnswerOption, QuestionDisclaimer                   -> question.service
AnswerOptionComponent, AnswerOptionPhotoGroup,
AnswerOptionDisclaimer                             -> answerOption.question.service
```

**Lacking a scalar `contractorId` is not the same as being shared knowledge.**
Classifying these platform would wave every query through unscoped.

### Proven against real Prisma before any conversion

The architecture depended on an unverified assumption: that Prisma accepts a
**relation filter inside a `WhereUniqueInput`**, which `findUnique`, `update`
and `delete` all take. If that failed, the guard implementation would need
revisiting — not the ownership model. It was tested before converting a single
query site.

Live harness, `DERIVED OWNERSHIP` section, one hop (`Question`) and two hops
(`AnswerOption`), against Elite's 150 questions and 539 answer options:

| Operation | One hop | Two hops |
|---|---|---|
| `findMany` / `count` | scoped | scoped |
| `findFirst` | scoped | scoped |
| **`findUnique`** | **relation filter accepted** | **accepted** |
| `findUniqueOrThrow` | not-found, not a validation error | — |
| `update` | refused | refused |
| `delete` | refused | refused |

With a positive control, because half of a scoping mechanism is returning
nothing and the other half is returning the right thing — a filter that
silently matched nothing would pass every negative check. The dummy still
reaches and updates its own rows.

84 of 84 checks pass.

### Writes

For derived models the guard **never invents an owner** — there is no column to
stamp. A direct `create`, `createMany` or `upsert` throws `DerivedCreateError`
naming the relation path. A create that invented an owner would be the
denormalization this class exists to avoid, arriving through the back door.

Direct creates must instead prove the owning parent belongs to the current
contractor, at the call site. Reparenting an ownership foreign key fails closed
unless explicitly validated.

Nested creates beneath an already tenant-scoped parent are unaffected:
ownership is structural, and per the ADR-007 finding the child guard does not
fire for them anyway.

### Secondary tenant references are separate from ownership

`AnswerOption.referencedServiceId` points at another service whose price the
option adopts at request time. Its ownership chain can be entirely valid while
the **referenced** service belongs to a different contractor — the derived
filter constrains the owner, not the reference. The failure is a customer
quoted another contractor's price for an add-on: a wrong number that looks
like a right one.

Checked in `scripts/verify-disclaimer-integrity.ts` alongside the other
same-tenant pairs. 4 references in use today, 0 crossed.

### `PricingRule` is excluded

Zero rows, no live reads or writes, referenced only by the isolation test's own
cleanup. Classified **deprecated / contract-phase removal**, not
`PENDING_TENANT_SCOPE`. No columns, no guard rules, no migration code and no
tests unless a live dependency reappears.

### Remaining

The mechanism is proven; the 21 top-level query sites across 5 files are **not
yet converted**. `PENDING_TENANT_SCOPE` is down to 18 — and per ADR-007a that
number is not itself evidence of anything.

## Decisions referenced but NOT recoverable from the repo

**SUPERSEDED 28 August 2026 by [ADR-017](ADR-017-contractor-portal.md).** The missing
`PRICE2BOOK-PRODUCT-BOUNDARY-AND-EMBED-ARCHITECTURE.md` is no longer an authoritative source.
The product boundary is established by the surviving Consolidated Handoff, POSITIONING.md, and
subsequent ADRs and owner decisions. If the document resurfaces it is historical evidence, not
a source of truth. The items below are kept as a record of what was lost, not as pending work.

The handoff cites the ADR for two things this reconstruction cannot restore.

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
- **The admin service routes are unscoped.** `app/api/admin/services/[serviceId]/pricing/route.ts`,
  `app/api/admin/services/[serviceId]/route.ts` and the admin service page take
  a service id from the URL with no contractor condition. The pricing one
  publishes a customer-facing price. Harmless at one contractor; a cross-tenant
  price write at two. Found by the ADR-007a completion sweep, 27 August.
- **`addMaterialCostCents` flat cents on `AnswerOption`** are still Elite's
  figures with no contractor scope. Not addressed by the component split.
- **`Service.slug` is globally unique**, so two contractors cannot both have
  `new-120v-outlet`. Belongs with storefront routing. **Now carries a
  sequencing constraint: it must not change before `ServiceQuery` is re-keyed**
  — see ADR-008.
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
  made ADR-003's "enforced" a statement of intent rather than of behavior.

---

## ADR-011 — The booking flow's owners — NEW, 27 August

**Status:** expand and backfill done. Read/write switch in progress. Contract pending.

Pass three covers `Visit`, `LineItem`, `Booking`, `Quote`, `Customer`, `Photo`, plus the
ownership edges that make their invariants enforceable: `ArrivalWindow` and
`JobberCrewMember`.

The audit that preceded it is [pass-three-ownership-audit.md](../migration/pass-three-ownership-audit.md).
Its first finding was that six names did not mean six identical migrations.

### The decisions

| Model | Ownership | Mechanism |
|---|---|---|
| `Visit` | direct | `contractorId` — ownership root |
| `Customer` | direct | `contractorId` — ownership root |
| `Photo` | direct | `contractorId` — no single derivable path |
| `JobberCrewMember` | direct | `contractorId` — ownership root |
| `LineItem` | derived | `["visit"]` |
| `Booking` | derived | `["visit"]` |
| `Quote` | derived | `["service"]` |
| `ArrivalWindow` | derived | `["serviceArea"]` |

Four of the eight carry no `contractorId`, per ADR-010. A derived model is tenant-owned;
it simply does not carry the column.

### Why `Visit` is a root and not derived from its line items

Because an OPEN visit legitimately has no line items yet — three such rows existed at
migration time. A model whose owner is unknowable for real live rows cannot derive.

Deriving from a *list* would also be ambiguous by construction: it presumes every line item
on a visit shares one contractor, which is exactly the invariant the guard has to enforce
rather than assume.

### Why `Quote` derives through `service` and not `visit`

The live data decided this, not the schema. `visitId` and `lineItemId` are both optional
*and actually absent*: of two rows, one had no `visitId`, both had no `lineItemId`, and one
had neither. `serviceId` is the only required owner-bearing parent.

Generalised: **when a model has several optional parents, the schema tells you which paths
are permitted and the data tells you which paths exist.** Only a required parent can carry
ownership, and "required" has to be read off the schema, not off the happy path in the
code.

### Why `LineItem` and `Booking` derive through `visit` and not `service`/`customer`

Both have more than one parent that resolves to a contractor. Those extra parents are
**secondary references, not competing owners**. Deriving from `visit` keeps "does this
service belong to my visit's contractor?" a real question. Deriving from `service` would
make it tautological and let a foreign service silently redefine whose visit it is.

### Why `Photo` carries a column despite having parents

Two independent reasons, either sufficient:

1. Its three parents are **alternatives**, all optional. `DERIVED_TENANT_MODELS` maps a
   model to exactly one relation path; "one of two, we don't know which" is not a path.
2. Both write sites are **nested writes inside transactions**, which query extensions never
   intercept. The guard cannot police Photo writes under any classification, so the owner
   is stamped structurally at write time and checked by sweep afterwards.

`Photo.bookingId` has zero reads and zero writes and zero rows. It is a **contract
candidate**, not something to design tenancy around, and it was not removed during expand.

### Deriving ownership does not make secondary references safe

Same principle as `AnswerOption.referencedServiceId` under ADR-007a. `Booking` is owned
through its `Visit` but also points at a `Customer` and an `ArrivalWindow`; `Quote` is owned
through its `Service` but also points at a `Customer` and possibly a `Visit`. Each is a
separate chance to cross a boundary while every model individually looks correctly owned.

`scripts/verify-booking-tenancy.ts` checks all of them, and is in the deploy gate.

`ArrivalWindow.serviceAreaId` was a bare scalar Prisma could not traverse. A `Booking`
could therefore be correctly owned through its `Visit` while pointing at another
contractor's window. The relation is now declared, which is what makes the check above
expressible at all — **an integrity rule you cannot write a query for is not a rule.**

### Ownership invariant — a session is not a tenant

> **A browser session identifies continuity within a storefront. It does not identify a
> tenant.**

`elite_session_id` is one cookie with no contractor dimension. Before this pass, six call
sites resolved an open visit as:

```
sessionId -> Visit -> contractor          WRONG
```

which meant a visitor who added a service on Elite's storefront and then opened another
contractor's storefront in the same browser reopened **Elite's visit**. The route rejected
a foreign *service*; the visit row itself was shared. Correct order is always:

```
site -> contractor -> sessionId -> Visit  RIGHT
```

The contractor must be established from `ContractorSite` first and then used as part of the
lookup key. This is why `Visit` needed a column rather than a derivation: **an owner you
have to filter by is an owner you have to store.**

Permanent regression case: two contractors, one session id. Elite gets Elite's open visit;
the other contractor gets its own or none — never Elite's.

### The `Visit` uniqueness question

`@@index([contractorId, sessionId, status])` is an index, deliberately **not** a unique
constraint. The full triple is genuinely not unique in live data: repeat customers
accumulate `CHECKED_OUT` visits under one cookie (sessions with 7, 15 and 2 were present).

The narrower invariant — **at most one OPEN visit per contractor + session** — held with
zero violations, and is what the application actually assumes. It is a contract-phase
partial-unique candidate (`WHERE status = 'OPEN'`), checked meanwhile by
`verify-booking-tenancy.ts`.

Constraints get added when the data has been shown to satisfy them, not when the invariant
sounds right.

### Migration provenance is not application behavior

Backfill derived ownership from existing relations wherever a relation existed: 30 of 33
visits, 26 of 27 customers, 6 of 6 photos, 21 of 21 crew members.

The remainder had nothing to derive from. For those, `backfill-pass-three-ownership.ts`
falls back to historical provenance — but only after **proving** it, against two conditions
evaluated at run time:

1. exactly one `Contractor` row exists, and
2. every row it *could* derive derived to that same contractor.

If either fails it leaves the rows null and exits non-zero rather than guessing.

> **Runtime never assumes the only contractor is Elite. A migration may use known
> historical provenance, but only if that provenance is proven for the dataset in front of
> it, at the moment it runs.**

The distinction matters because the two look identical in a one-contractor database and
diverge silently the moment a second appears.

### Making the sweep produce the work list

`audit-unguarded-tenant-access.ts` reported **0 unexplained** throughout pass two — not
because the booking flow was safe, but because these models sat in `PENDING_TENANT_SCOPE`
and the sweep did not consider them tenant-owned.

Reclassifying them is what makes the real conversion list appear: 18 unexplained sites, 24
more in already-adopted files, and 4 platform-rooted reads of tenant data. That list is
derived from the schema and the classification, so it cannot go stale the way a
hand-written migration checklist does — ADR-007a's rule applied to its own tooling.

**Deliberately turning the gate red is a legitimate migration step.** The red is the
inventory.

---

## ADR-012 — Contractor #2 is a release candidate, not a pilot — OWNER DECISION, 27 August

**Status:** settled by the owner. Supersedes the weaker "not until pass three completes"
phrasing in the pass-three audit.

Contractor #2 will **not** be onboarded as an early development pilot.

Price2Book reaches a **V1 release-candidate state first**, with **Elite as the internal
proving tenant**. Contractor #2 is then the **first external release-candidate
onboarding**, and validates the near-final:

- onboarding flow
- electrical template
- contractor admin
- integrations
- homeowner experience

### What this changes

**Nothing about how the architecture is built.** Multi-tenancy continues to be built
correctly and completely — guarded access, derived ownership, the sweeps, the two-contractor
harness. The dummy contractor stays as the adversarial fixture it already is.

**What it changes is what counts as urgent.** Do not optimize the current architecture for
getting Contractor #2 live early, and do not treat "Contractor #2 could sign up" as a
deadline that justifies a shortcut. Their onboarding is postponed until the V1
release-candidate checklist is satisfied.

### Why this is worth writing down

The earlier framing made Contractor #2 a near-term event, and a near-term event exerts
pressure on design: it invites the cheapest thing that would let a second tenant exist,
rather than the correct thing. Several pass-two and pass-three defects were exactly that
shape — a global unique, a singleton `id: "default"`, a session cookie treated as an
identity — each one adequate for one contractor and wrong for two.

Removing the deadline removes the pressure without removing the requirement. The work is
still the work; it simply gets finished before anyone external depends on it.

### The practical rule

> Build every tenant boundary as though Contractor #2 arrives tomorrow.
> Schedule as though they arrive after V1.

Elite being the only live tenant is a fact about the data, never a permission the code may
rely on — the migration-provenance rule in ADR-011 stays exactly as written.

---

## ADR-013 — BookElite Neon is the source; Price2Book Neon is the destination — OWNER DECISION, 27 August

**Status:** settled by the owner. The database-account migration is a separate, later project.

### Where production actually lives

| | |
|---|---|
| **Current production database** | Neon project `bookeliteelectric` / `purple-hat-40018035`, endpoint `ep-icy-hill-axkgrsjb` |
| **Intended destination** | the dedicated Price2Book Neon account/project (`bitter-bird-20565072`, org `admin@price2book.com`) |

This is written down because it was not obvious and cost real time. The Price2Book Neon
project exists and its `production` branch is **empty** — it has never held the application's
data. A rehearsal branch created there looked correct and contained zero tables, and a
branch created from a point in time before the schema existed looked equally correct. Both
would have produced a vacuously passing rehearsal.

The legacy `bookeliteelectric` project is temporary infrastructure, not the intended final
architecture. It is nonetheless **the source of truth for the live application today**, and
the pass-three contract is deliberately completed against it.

### The ordering, and why

1. **Now** — finish the pass-three contract in the database that actually serves production.
2. **Then** — prove production remains healthy.
3. **Then** — migrate the whole database to the Price2Book Neon account, as its own project.
4. **Then** — continue toward the V1 release candidate.

The separation is the point. These must not happen together:

- making ten ownership columns required
- removing old constraints and columns
- adding new uniqueness enforcement
- moving the entire database to another Neon account

Any one of them can fail in ways the others would mask. Combined, a failure has too many
candidate causes to diagnose under time pressure — and the diagnosis has to happen while
production is degraded. This is the same reasoning that separated expand from contract, and
that kept the deprecated-model drop out of the contract release.

> **One irreversible change per release. If two must ship together, they have to be one
> change that cannot be separated — not two that happen to be ready at the same time.**

### The later migration

Its own project, with the contracted BookElite database as the authoritative source:

1. Treat the contracted BookElite database as authoritative.
2. Create a complete production-equivalent database in the Price2Book Neon project.
3. **Prove source/destination parity before cutover** — tables, columns, constraints,
   indexes, row counts, critical integrity checks, pricing reconciliation.
4. Point a Price2Book **Preview** deployment at the new database and run the full
   verification and browser suite.
5. Switch Price2Book **Production**'s `DATABASE_URL` in a controlled cutover.
6. Run production smoke plus tenant and integrity verification again.
7. **Keep the old BookElite database untouched** as a rollback source for an agreed
   safety period.
8. Retire or archive the legacy database only after the new one is proven stable.

`scripts/db-structure.ts` and `scripts/verify-rehearsal-branch.ts` already do most of step 3
and generalise to any source/destination pair — the parity proof is the same shape as the
branch-fitness gate that caught the empty rehearsal branch.

### Hard constraints

> **Do not delete, reset, or repurpose the BookElite production database as part of the
> migration.** It is the rollback path, and a rollback path that has been modified is not a
> rollback path.

Contractor #2 is onboarded against the dedicated Price2Book infrastructure, never the legacy
BookElite project — see [ADR-012](#adr-012--contractor-2-is-a-release-candidate-not-a-pilot--owner-decision-27-august),
which already defers that onboarding until the V1 release candidate. The two decisions
compose: the destination infrastructure must exist and be proven before the first external
contractor touches it.


---

## Standing principle — a database's name is not its identity

> **Never identify a production database by project name, branch name, or environment
> label alone. Verify its expected endpoint and identity marker before any migration or
> destructive operation.**

An empty Neon branch named `production`, inside the project named Price2Book, fooled this
process **three separate times**. Every superficial signal said *this must be production*:
the right account, the right project, a branch literally called `production`. It had never
held a single row.

It cost two unusable rehearsal branches and one failed production deploy, and each time the
mistake was invisible until something downstream failed for a reason that named the wrong
problem — the last one surfaced as `public.services does not exist`, which was true and
useless.

Names are asserted. Endpoints and stamped identity are verified. The two are not
interchangeable, and only one of them can be wrong quietly.

Mechanised as `scripts/verify-database-identity.ts`, which runs **first** in the deploy gate
— before any check that assumes tables exist — and which reports an empty database as empty
rather than as a missing table. The marker records the endpoint it was stamped for, so a
copy inherits the row but not the match, and fails until a human deliberately re-stamps it.

Postgres cannot answer this question on Neon by itself: production and a branch of it report
the same `system_identifier`, the same `current_database()` and the same
`inet_server_addr()`. Measured, not assumed.
