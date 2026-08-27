# Pass two — narrowing the grep to the real set

The handoff put the pass-two model grep at **42 files** and estimated the real
set at "likely under ten". This is the narrowing.

Models in scope (the pass-two half of `PENDING_TENANT_SCOPE`):
`ServiceCategory`, `Question`, `AnswerOption`, `ServiceMaterial`, `PhotoGroup`,
`AnswerOptionPhotoGroup`, `ConditionalDisclaimer`, `QuestionDisclaimer`,
`AnswerOptionDisclaimer`, `PricingRule`.

## Method

Three sweeps, not one. The model-name sweep alone is the mistake the handoff
warns about first, and it missed five files here.

1. **Model name** — `ServiceCategory|serviceCategory|...` across `*.ts`/`*.tsx`.
   68 files.
2. **Relation access** — every relation field in `schema.prisma` whose type is
   one of the ten models, then grep for `<field>: {` / `<field>: true`.
   Field list derived from the schema rather than guessed:
   `category, materials, questions, pricingRules, options, conditionalHelp,`
   `conditionalDisclaimers, photoGroups, referencedByAnswerOptions,`
   `disclaimer, answerOption, photoGroup, question`.
3. **Foreign-key reference** — `categoryId|questionId|answerOptionId|`
   `photoGroupId|disclaimerId|canonicalMaterialId`.

A note on sweep 2: anchoring the pattern to line start (`^\s*category:`) misses
`include: { category: { select: ... } }` written on one line. It cost two files
before the anchor came off. Grep unanchored.

## The real set — 23 runtime files

`prisma/` and `scripts/` are excluded: 45 of the 68 are seeds and cleanup
scripts, they construct their own `PrismaClient`, and they bypass the guard by
design. They are **not** free of work — see "Seeds still change" below — but
they are not tenant-scoping sites.

### Queries the model directly — 12

| File | Models | Ops |
|---|---|---|
| [app/admin/(protected)/categories/page.tsx](<app/admin/(protected)/categories/page.tsx>) | ServiceCategory | findMany |
| [app/admin/(protected)/services/new/page.tsx](<app/admin/(protected)/services/new/page.tsx>) | ServiceCategory | findMany |
| [app/admin/(protected)/services/page.tsx](<app/admin/(protected)/services/page.tsx>) | ServiceCategory | findMany |
| [app/api/admin/materials/route.ts](app/api/admin/materials/route.ts) | ServiceMaterial | findMany, count, upsert, findUniqueOrThrow, update, delete — 7 sites |
| [app/api/admin/reorder/route.ts](app/api/admin/reorder/route.ts) | ServiceCategory | update |
| [app/api/admin/services/[serviceId]/tree/route.ts](<app/api/admin/services/[serviceId]/tree/route.ts>) | Question, AnswerOption | full CRUD in a transaction — 9 sites |
| [app/api/visit/while-we-there/route.ts](app/api/visit/while-we-there/route.ts) | ServiceCategory | findMany |
| [app/services/[category]/page.tsx](<app/services/[category]/page.tsx>) | ServiceCategory | findUnique |
| [app/services/page.tsx](app/services/page.tsx) | ServiceCategory | findMany |
| [app/troubleshooting/page.tsx](app/troubleshooting/page.tsx) | Question | count |
| [lib/materialCost.ts](lib/materialCost.ts) | ServiceMaterial | findMany ×2, count |
| [lib/materialResolution.ts](lib/materialResolution.ts) | ServiceMaterial | findMany |

### Reaches the model only through a relation — 9

These never name the model. Sweep 1 found four of them for unrelated reasons
and missed five outright, marked ★.

| File | Traversal |
|---|---|
| [lib/routeResolver.ts](lib/routeResolver.ts) | `service → questions → options → {photoGroups → photoGroup, conditionalDisclaimers → disclaimer}` — the deep tree |
| [app/api/services/[slug]/route.ts](<app/api/services/[slug]/route.ts>) | `service → category`, `questions → options → …` — 9 traversals |
| [app/admin/(protected)/services/[serviceId]/page.tsx](<app/admin/(protected)/services/[serviceId]/page.tsx>) ★ | `category`, `questions → options` |
| [app/api/visit/route.ts](app/api/visit/route.ts) ★ | `service → category` |
| [app/api/service-match/route.ts](app/api/service-match/route.ts) ★ | `service → category` |
| [app/api/services/by-id/[id]/route.ts](<app/api/services/by-id/[id]/route.ts>) ★ | `service → category` |
| [app/api/quotes/[quoteId]/route.ts](<app/api/quotes/[quoteId]/route.ts>) ★ | `quote → service → category` |
| [app/(marketing)/page.tsx](<app/(marketing)/page.tsx>) | `service → category` |
| [lib/flow-types.ts](lib/flow-types.ts) | DTO shapes only — no query. Changes only if a DTO shape changes. |

### Writes a foreign key into one of these models — 2

| File | Concern |
|---|---|
| [app/api/admin/services/route.ts](app/api/admin/services/route.ts) | Creates a `Service` from a client-supplied `categoryId`. Nothing validates that the category belongs to the caller's contractor. Harmless with one contractor; a cross-tenant FK the moment there are two. |
| [components/admin/NewServiceForm.tsx](components/admin/NewServiceForm.tsx) | Client component, passes the id through. No change unless the category list it renders becomes scoped. |

## Where the guard executes — proven, 27 August

Run: `npx tsx scripts/verify-tenant-isolation-live.ts`, extended with a
`NESTED READS` section. Real extension, real client, real database, throwaway
contractor. 26 of 27 checks passed; the one failure is the finding.

Observed, against Elite's 150 questions and 31 contractor components:

| Query shape | Guard fires? | Result |
|---|---|---|
| `guarded.question.findMany()` — direct | **yes** | throws `NotYetTenantScopedError` (the control) |
| `service.findUnique({ include: { questions: true } })` | **no** | returned the dummy's 1 question |
| `service.findUnique({ select: { questions: {...} } })` | **no** | same |
| `service → questions → options`, plus `category` | **no** | returned all three pending models |
| `canonicalComponent.findMany({ include: { contractorComponents: true } })` | **no** | **returned 5 of Elite's contractor components** |
| `service.update({ data: { questions: { create: ... } } })` | **no** | wrote the row, no throw |

**Prisma query extensions fire on the top-level operation only.** Nested
`include`/`select` reads and nested writes are part of the parent query and are
never intercepted. Confirmed rather than assumed.

### What follows for the file count

The nine relation-traversal files inherit isolation from their parent. Each
roots at `Service` or `Quote`, both tenant-owned, and the foreign key does the
rest — the harness showed the dummy's traversal returning only the dummy's own
rows. **They are not scoping sites and should not be mechanically rewritten.**

The scoping work is the 12 direct-query files plus the FK validation in
`app/api/admin/services/route.ts`.

That settles where the guard runs. It settles nothing about who owns the data —
see "This does not decide ownership" below.

### The hole this opened — closed 27 August

`PENDING_TENANT_SCOPE` is a weaker backstop than it reads as. It throws on a
direct query and stays silent on a nested one, so a pending model can be both
read and **written** through a relation with no objection. The nested create in
the harness landed a `Question` row without the guard seeing it. See
[the tenant guard's real contract](../decisions/PRICE2BOOK-ARCHITECTURE-DECISIONS.md)
— that is now written down as an architecture rule rather than left implicit.

Worse, the parent did not have to be tenant-owned. `CanonicalComponent` is a
PLATFORM model, so the guard waved it through, and its `contractorComponents`
relation returned every contractor's economics. From the dummy's context the
harness read 5 of Elite's rows.

Two operational files used exactly that shape. Both carried the correct
hand-written `where: { contractorId }`, so nothing was leaking — but that filter
was load-bearing with nothing behind it, which is the failure the guard exists
to eliminate.

**Both are now rooted at the tenant-owned model instead:**

- [lib/contractorComponents.ts](../../lib/contractorComponents.ts) — new. Roots
  at `ContractorComponent`, includes the canonical role from there. The
  component twin of `resolveContractorCosts`, which had followed this rule for
  materials all along; only the component path had diverged.
- [lib/routeResolver.ts](../../lib/routeResolver.ts) — two queries became three.
- [app/api/services/[slug]/route.ts](<../../app/api/services/[slug]/route.ts>) — same.

No `include` of a tenant model beneath a platform root remains in `app/`,
`lib/` or `components/`.

**A full schema audit found 17 platform→tenant relation shapes.** Only two were
reachable from operational code, and both were the component path. A third
candidate — `activeSupplierLink` in `app/api/admin/materials/route.ts` — turned
out to root at `ContractorMaterial`, which is tenant-owned, and was already
correct. The remaining 14 exist in the schema but nothing queries them that way.

The regression is executable, in the harness's `NESTED READS` section:

- the blind spot is asserted as **present**, so the rule stops being folklore
  if Prisma ever changes; a failure there means re-read the ADR, not panic
- the tenant-rooted loader, asked for all 31 of Elite's priced roles from the
  dummy's context, returns only the dummy's own 1
- the shared role resolves to the dummy's 777777c, never Elite's 22000c

31 of 31 checks pass, Elite's rows unchanged.

### This does not decide ownership

A nested read through a scoped parent being safe today does not mean `Question`,
`AnswerOption` and the rest can stay globally unowned. They still need
`contractorId` for direct administration, independent writes, the
template/tenant separation, and data-integrity constraints. The harness answers
where the guard executes; the schema answers who owns the data.

## Seeds still change

45 seed and cleanup files are out of scope for *scoping*, but once a
`contractorId` column exists and is required, every seed that **creates** a row
in one of these models must supply it. Seeds that only read a category by slug
or reference an answer option by id need no change.

The handoff's second recorded mistake applies directly: two seeds wrote
materials as well as components, and were checked only for components. Several
files below write **both** questions/answer options **and** service materials —
`seed-bathroom-fans.ts`, `seed-exterior-gfci-routing.ts`,
`seed-low-voltage-and-sconces.ts`. Grep each seed for every pass-two model, not
the one in focus.

## Open decision, unchanged

Whether `ServiceCategory` is tenant-scoped or split canonical/contractor. See
the separate note; it is a product decision and blocks the schema.
