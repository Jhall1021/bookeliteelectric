# Price2Book Platform Admin — architecture, permissions, storyboards

**29 August 2026.** Documentation only, per the handoff: *"Do not interrupt
Electrical Template v1.1 Phase F to implement it."* Nothing in here is built.

The handoff supplied the product decision, the boundaries and eleven
storyboards. What it could not supply is how far the codebase already is, so
that is what this adds: an inventory of what exists, a permissions model built
on the primitives already in the schema rather than beside them, and one
blocker that decides the sequencing.

---

## The headline: the success criterion is currently unreachable, for a reason
## that has nothing to do with Platform Admin

> *"Elite Electric can be deleted/re-created as a fresh contractor and
> completely onboarded through normal Platform Admin workflows without a
> database edit, seed-specific workaround, developer-only operation or
> Elite-specific code path."*

The obstacle is not the missing console. It is that **a contractor provisioned
from the template today cannot be made priceable by any user interface that
exists.**

Template v1 has 123 service-material rows. **71 carry a fixed quantity; 52 are
`quantityIsPolicy: true`** — the contractor supplies the figure, because 25 ft
of included run is Elite's commercial decision and not a physical fact.

`scripts/provision-from-template.ts` handles this exactly right, and says so:

> *"A policy-quantity material gets NO link at all; its key lands in
> `Service.unresolvedMaterialKeys` so the contractor supplies their own figure,
> because writing 25 ft would be shipping Elite's allowance and writing 0 ft
> would be inventing a decision."*

So the provisioned contractor is left holding a correct, explicit list of what
it needs. And then:

```
TemplatePolicyDefinition rows        10
Elite ContractorPolicyValue rows      0
Code in app/ or lib/ that writes ContractorPolicyValue    none
```

**No surface anywhere writes a policy value.** Not the contractor portal, not
the admin, not an API route. 52 of 123 template recipe rows are therefore
unresolvable by anyone who is not running a script.

Elite does not hit this because Elite's 142 service-material rows were written
directly by seeds with literal quantities. Elite never went through
provisioning. That is precisely the "seed-specific workaround" the success
criterion forbids — and re-onboarding Elite is the thing that would expose it.

**Consequence for sequencing:** a policy-resolution surface is not a Platform
Admin feature to schedule alongside the others. It is the precondition for
Storyboard 5 meaning anything, and it belongs in the Guided Setup contract that
the handoff already places before Platform Admin. Good news: the handoff's
ordering is already right. This says *why* it is right, and that the item is
load-bearing rather than a nicety.

---

## What already exists

Better than the handoff assumes, in the places that matter most.

### Platform identity — already modelled, never used

```prisma
model PlatformAccess {
  userId String @unique
  role   PlatformRole      // PLATFORM_ADMIN  (+ a comment reserving SUPPORT)
  grantedByUserId String?
  grantedAt DateTime
  revokedAt DateTime?      // revoked, not deleted, so the audit keeps its subject
}
```

`lib/auth.ts` already states the boundary the handoff asks for:

> *"Better Auth owns User, Session, Account and Verification. It does NOT own
> authorization: which contractors a person may reach is ContractorMembership,
> and whether they are Price2Book staff is PlatformAccess."*

**Status: schema and stated intent, zero enforcement.** Nothing reads
`PlatformAccess`. The separation the handoff insists on is designed and
undefended.

### Support access audit — already modelled, never used

```prisma
model SupportAccessEvent {
  platformUserId String            // deliberately NOT a relation:
  contractorId   String            // deleting staff must not delete the record
  kind       SupportEventKind      // ENTERED | EXITED | MUTATED
  action     String?
  sessionRef String?               // correlates one visit
}
```

This is the handoff's impersonation-audit requirement, already designed, down
to separating a read-only look from an intervention. **Not written by anything.**

### Contractor authorization — built and enforced

`withAdminRoute` resolves a contractor from session membership and throws
`NoMembershipError` otherwise. A platform staff member with no membership
**cannot reach a contractor's admin routes today**, which is the correct
starting position: the boundary is closed, and Platform Admin must open a
deliberate door rather than find one ajar.

`lib/tenantGuard.ts` classifies every model and fails closed on an unclassified
one. Cross-tenant access is not something a query can do by accident.

### Template library — built

`TemplateVersion` (2 rows: v1 with 75 services, v2 with 1),
`TemplateService`, `TemplateQuestion`, `TemplateAnswerOption`,
`TemplateServiceMaterial`, `TemplateServicePolicy`, `TemplatePolicyDefinition`,
plus `scripts/provision-from-template.ts` and `scripts/template-update.ts`, with
`verify-template-provisioning`, `verify-template-catalog` and
`verify-template-update` in the deploy gate.

The handoff's "editing a canonical template does not modify contractor live
catalogs" is already the implemented behavior.

### Storefront / sites — built

`ContractorSite` carries `publicId` and `hostedSlug`; `lib/siteRouting.ts`
resolves a tenant from the site identifier the *caller* carries, never from the
resource requested (ADR §2.2). The embed model in Storyboards 6 and 7 has its
foundation.

### Invitations — built

`ContractorInvitation` exists, and `lib/auth.ts` documents the rule the handoff
asks for: an invitation authorizes joining, a magic link proves identity, and
the invitation token is spent on acceptance. "Do not create passwords for
contractors" is already how it works.

### Billing — does not exist

No Stripe integration, no subscription model, no plan or billing-state field.
Storyboards 2, 3 and 8 all display billing state that has nowhere to come from.
This is the largest genuinely new build in V1.

### Elite-specific code — cleaner than expected

| location | files mentioning Elite |
|---|---|
| `app/` + `lib/` + `components/` | **3 — all comments, no logic** |
| `prisma/` | 24 |
| `scripts/` | 19 |

**The runtime does not know Elite exists.** Every Elite-specific path is a seed
or a one-shot migration. That is a much better position than the success
criterion implies — the work is not un-baking Elite from the product, it is
making provisioning able to do what 43 seeds currently do.

---

## Permissions

The handoff proposes four roles. The schema has one, with a comment reserving
the second. Recommendation: **extend what is there rather than replace it.**

```prisma
enum PlatformRole {
  PLATFORM_ADMIN     // exists
  PLATFORM_SUPPORT   // reserved in a comment already — read + support entry
  PLATFORM_BILLING   // add when billing exists, not before
  // PLATFORM_OWNER — add when someone needs to grant platform access to
  //                  someone else. Until then PLATFORM_ADMIN is the ceiling
  //                  and an unused role is an unenforced one.
}
```

The reason for holding two back is the same reason the schema held one back:
a role nobody holds is a permission nobody has tested. `PLATFORM_BILLING`
before there is billing is a name, not a boundary.

**The rule that must not bend**, stated as code rather than prose:

```ts
// Never:
if (session.user.email === OWNER_EMAIL) { /* ... */ }
if (membership.role === "OWNER") { /* platform privilege */ }

// Always:
const platform = await platformAccessFor(session.user.id);  // PlatformAccess, revokedAt: null
if (!platform) throw new NotPlatformStaffError();
```

A person may hold both a `ContractorMembership` and a `PlatformAccess` grant —
Josh will. Neither may be derived from the other, in either direction. Elite's
OWNER is not platform staff by virtue of being Elite's owner, and a
`PLATFORM_ADMIN` is not an Elite member by virtue of being staff.

### Crossing the tenant boundary

The handoff's rule — *"Platform authorization should occur before crossing
tenant boundaries"* — maps onto the existing guard cleanly. Today:

```
withSite(site, db => ...)          // tenant from the caller's site identifier
withAdminContractor(fn)            // tenant from session membership
```

Platform Admin needs a third, and it should be the only one that takes a
contractor id as an argument:

```ts
withPlatformContractor(platformCtx, contractorId, fn)
```

with three properties, in this order:

1. **Authorize first.** The `PlatformAccess` lookup happens before the
   contractor id is used for anything — not after, and never as a filter on a
   query that has already been built. This is the shape that let a cross-tenant
   read through once already (`loadServiceForResolution`'s comment records it:
   a hand-written contractor filter on a platform model, correct only by
   diligence).
2. **Scope after.** Once authorized, it delegates to the same
   `withContractor(contractorId, ...)` every other path uses. Platform Admin
   gets a *key* to the tenant boundary, never a hole through it. Tenancy stays
   one implementation.
3. **Record.** Every entry writes `SupportAccessEvent`, and every mutation
   writes another with `kind: MUTATED` — the model already distinguishes them.

What must not appear anywhere: a route that reads `contractorId` from a query
string and proceeds. The handoff names this and it is worth naming twice.

---

## Audit

`SupportAccessEvent` covers staff acting *inside* a contractor. The handoff's
examples are broader — provisioning a template, changing a plan, suspending an
account — and several are not "support access" at all.

Recommendation: **one platform audit model**, with `SupportAccessEvent` folded
into it or left as the narrower support-session record beside it. The minimum
record the handoff specifies (platform user, contractor, action, old value, new
value, timestamp) is already the shape of `PricingSettingsChange`, built today:

```
changedByUserId · changedByEmail · from<Field> · to<Field> · changedAt
plus the impact known at the time, and whether it was acknowledged
```

That is the pattern to copy, and it earned its place the hard way — a rate
change made in the admin went unrecorded and put 111 published price points out
of agreement with the model, found days later by an unrelated audit. Same
principle applies to every high-impact platform action.

Two properties worth carrying over: **append-only by convention** (an audit
trail that can be edited is not one), and **`platformUserId` deliberately not a
relation**, so deleting a staff account does not delete the record of what they
did. Both are already documented on `SupportAccessEvent`.

---

## Storyboards, annotated with build state

The eleven storyboards stand as written. What follows is only what each one
needs that does not exist.

| # | screen | foundation | needs |
|---|---|---|---|
| 1 | Platform Overview | — | Aggregations across tenants. Every number is a cross-tenant read and must go through the platform code path, not a raw query. |
| 2 | Contractors | `Contractor` | Status field. There is no `status`/lifecycle column — Trial/Active/Past Due/Suspended has nowhere to live. |
| 3 | Contractor Control Center | `verify-public-pricing`, `unresolvedMaterialKeys`, material-cost audits | The setup checklist is mostly **existing verifiers rendered as UI**. "Materials priced 65/68" is a query that already works. This screen is cheaper than it looks. |
| 4 | Create Contractor Wizard | `provision-from-template.ts` | A UI over the existing provisioner. Pricing step maps to `PricingSettings` — and should reuse the impact-confirmation path built today. |
| 5 | Material Pricing Setup | `ContractorMaterial` with package fields | **Blocked on the policy gap.** Prices roles fine; cannot resolve the 52 policy quantities. See the headline. |
| 6 | Website / Embed | `ContractorSite.publicId` | An embed generator. The identifier already exists; nothing renders a snippet. |
| 7 | Hosted Site | `ContractorSite.hostedSlug`, theme system | Content sections. The handoff's "controlled layout, not Wix" matches the existing theme model, which already refuses arbitrary composition. |
| 8 | Billing | **nothing** | Stripe integration, plan/state mirror, `stripeCustomerId`. Largest new build. |
| 9 | Contractor Health | `verify-*` suite, `JobberConnection` | Mostly rendering checks that already run in the deploy gate. |
| 10 | Templates | full template model + `template-update.ts` | A read UI plus the adopt/skip flow. The "never silently mutate" rule is already the implemented behavior. |
| 11 | Onboarding Queue | — | Workflow state. Needs the same lifecycle field as Storyboard 2, plus stage/assignee. |

**Two schema additions carry most of the storyboards**: a contractor lifecycle
status (2, 3, 11) and billing (2, 3, 8). Everything else is largely UI over
mechanisms that exist.

### Launch gate

The handoff wants `Run Launch Check` rather than `Active = true`, failing
closed. This is the cheapest high-value item in the whole console, because the
checks are already written and already run:

```
✓ Public pricing eligibility     scripts/verify-public-pricing.ts
✓ No unresolved active materials Service.materialCostResolved / unresolvedMaterialKeys
✓ Pricing settings               PricingSettings row present
✓ Template provisioned           TemplateService -> Service linkage
✓ Site configured                ContractorSite active
✓ Booking path test              _pathProof over the contractor's tree
```

Six of eleven launch conditions are existing scripts. `_pathProof` in particular
already walks every resolvable path of every active service and reports what
prices, what reviews and what fails — which is exactly "booking path test",
written months early and used all through Phase F.

---

## Sequencing

The handoff's revised order is right. One amendment, from the headline:

```
now      finish Electrical Template v1.1        (in progress)
         EV scope normalization
         Guided Setup contract
           ^^ MUST include the policy-resolution surface. Without it,
              provisioning produces a catalog nobody can price, and
              Platform Admin's material screen has nothing to write to.

then     Platform Admin foundation
           platform auth path + audit  (schema exists, enforcement does not)
           contractor directory, create, invite, provision
           onboarding checklist  (mostly existing verifiers as UI)

then     hosted site / embed
         billing            (largest genuinely new build)
         launch gate        (cheapest — six of eleven checks already exist)

then     re-onboard Elite through Platform Admin
```

The re-onboarding step is the real test and should be treated as a
**destructive rehearsal on a Neon branch first**, never against
`price2book-production`. `verify-database-identity.ts` exists precisely because
a rehearsal against a database *named* production, which was empty, cost this
migration two attempts. Deleting and rebuilding Elite is the highest-stakes
operation the platform will ever run on itself.

---

## Decided — 29 August 2026

The four open questions are closed. Recorded here rather than in a reply,
because the reasons matter more than the answers when this is picked up later.

### 1. Contractor lifecycle is its own field

An explicit enum on `Contractor`, **not** derived from billing:

```
SETUP · TRIAL · ACTIVE · PAST_DUE · SUSPENDED · Canceled · INTERNAL
```

Billing is an *input* to lifecycle, never lifecycle itself. A contractor can be
billing-active but manually suspended, comped with no Stripe subscription at
all, in setup before billing starts, or canceled and retained for history.
None of those are expressible as a projection of Stripe, and the console must
be able to say what state an account is in when Stripe is unreachable.

### 2. "Attention Needed" is strictly actionable

A contractor appears there only when a person at Price2Book should reasonably
do something today: payment failed · invitation expired · Jobber disconnected ·
unresolved material costs blocking launch · launch check failing · embed not
detected after setup · email delivery failing · stuck in onboarding · a
template update needing deliberate review.

Not every verifier warning. The section answers *"what needs somebody's
attention today?"* — not *"what technical conditions can the software
enumerate?"* Those are different lists and only one of them is a work queue.

### 3. `PLATFORM_SUPPORT` enters, but read-only by default

**May:** view the control center, pricing and configuration, health,
integrations, site and embed status; enter explicit Support Mode; reproduce
storefront behavior.

**May not, by default:** change pricing or material costs, provision templates,
touch billing, activate or suspend a contractor, change platform roles, publish
template updates.

Safe write actions — "resend invitation", "reconnect integration" — get granted
**individually and explicitly** if they are ever wanted. Never as general write
access. This is what `SupportEventKind`'s ENTERED / EXITED / **MUTATED** split
was designed for: a read-only look and an intervention are different events
because they are different permissions.

### 4. Elite must rebuild price-for-price

Not "a fresh contractor that happens to be Elite". The target:

> Provision Elite from the canonical Electrical template, complete every
> contractor-owned decision through normal Guided Setup / Platform Admin, and
> arrive at the same intended catalog economics as today's Elite.

**The 271 distinct price points are the regression target**, unless a
difference is explicitly approved during the migration. `scripts/_pathProof.ts`
is already the instrument — it has been the before/after proof for every
migration in this phase, and it walks every resolvable path of every active
service.

This is the harder proof, and it is the one worth having: if fresh provisioning
reproduces Elite, then the template holds the trade knowledge, Guided Setup
captures the contractor policy, contractor costs are sufficient, the engine
reproduces the economics, and Elite no longer depends on seeds. That is the
proof Contractor #2 works, obtained before there is a Contractor #2 to risk.

---

## Named milestone — Contractor Pricing Setup / Pricing Readiness

**Release-blocking.** Renamed from "Pricing Policy Resolution", which was
accurate about the smaller half and misleading about the shape of the work.

### What provisioning deliberately does not supply

A freshly provisioned contractor arrives with **no economics of any kind**:

```
fieldLaborHours          null
wwtLaborHours            null
contractor material cost none
contractor policy values none
```

**This is correct and stays.** Do not add labor hours to `TemplateService`.
How long a job takes belongs to the crew doing it; what a contractor pays for
6/3 belongs to their supplier; what length of run they include in a price is
their commercial decision. Shipping Elite's 6.0 hours to Contractor #2 would be
the same error as shipping Elite's 25 ft of included wire, and the whole
canonical/contractor split exists to prevent it.

> **The governing rule: the template owns scope and trade structure. The
> contractor owns economics.**

### What onboarding must not be

Seventy-five labor entries before anybody can sell anything. That is homework,
not onboarding, and a contractor who abandons it halfway has a catalog that
does nothing.

The goal is not "finish configuring the entire electrical trade". It is **get a
first useful catalog live, safely, and expand it.**

### Mechanism 1 — core-service-first activation

A contractor configures and activates a smaller high-value launch set.
Everything else stays inactive, shown as **Needs Pricing** rather than as
failure.

**Launch readiness asks that every ACTIVE public service resolves fully. It
does not ask that all 75 template services are active.**

That rule already exists and already runs: `scripts/verify-public-pricing.ts`
checks `active: true` services only, which is why Elite passes it today with
three services deliberately unconfigured and four deliberately withdrawn. The
core-first model composes with it for free — an unconfigured service is
invisible to the gate precisely because it is not for sale.

**One thing the console will need that the schema does not distinguish.**
`Service.active = false` is already carrying three different meanings, and that
is measured in Elite's live catalog today, not hypothesised:

| meaning | count | example |
|---|---|---|
| **Routing target** — configured, priced, deliberately not listed | 7 | the three garage siblings, the fan sibling, the two TV mounts |
| **Withdrawn** — no bounded scope exists, hidden on purpose | 4 | pool equipment, transfer switch, landscape lighting |
| **Deferred** — real service, not yet scoped, waiting its turn | 4 | the inactive dedicated-circuit family |

A fourth arrives with provisioning: **not configured yet**, which is the state
every one of a new contractor's 75 services starts in.

These are indistinguishable in the database and must not be indistinguishable
in Platform Admin. A routing target is finished and correct. A withdrawn
service is a decision somebody made. A deferred one is a backlog item. An
unconfigured one is this week's work queue. The setup checklist that reports
"12 of 75 configured" is worthless if it counts a deliberately hidden sibling
as an outstanding task — and worse than worthless if it counts a withdrawn
service as one, because it would send staff to configure something the owner
chose not to sell.

Whether that becomes a status enum or is derived from what a service holds is a
design decision. What is not optional is that the console can tell them apart.

### Mechanism 2 — explicit grouped labor setup

Guided Setup may group materially similar services and ask **one** labor
question for the group. Bounded by four rules:

1. **Show exactly which services the value will apply to.** A list, not a count.
2. **The contractor explicitly confirms the bulk application.** A confirmation
   step, not a side effect of answering.
3. **Outliers get their own value.** A group is a starting point, not a claim
   that every member is identical.
4. **Never silently infer category-wide labor.** An inferred number nobody saw
   is indistinguishable from a measured one the moment it is stored, and this
   codebase already carries the scar: 44 of 45 services once held a labor
   figure back-fitted to hit a target price, and §3.1 exists because of it.

`wwtLaborHours` is asked **only for services that support same-visit pricing**.
Asking a contractor how much shorter a panel replacement gets when the crew is
already on site is asking about a thing that does not happen.

### No borrowed defaults in V1

Elite's figures are **not** prefilled for anyone else. A pre-filled number
becomes fact the moment somebody clicks past it, and "another contractor's
calibration" is exactly the class of value this architecture spent four phases
separating out.

Later they may be useful as **clearly labeled aggregate benchmarks** — "most
electrical contractors book 2 to 3 hours for this" — which is a different
object from a default: it informs a decision instead of making one.

### Exit criterion

> A freshly provisioned contractor goes template → configures a manageable core
> catalog → passes launch readiness → sells services, with the long tail
> completed later, and reaches **zero unresolved economics on every active
> service** through normal UI, with no script and no database edit.

## Locked sequence

1. Finish Electrical Template v1.1
2. Complete EV charger scope normalisation
3. Build and lock Guided Setup
4. **Guided Setup must include Contractor Pricing Setup — labor hours,
   material costs and policy quantities — release-blocking prerequisite**
5. Prove a newly provisioned electrical contractor can configure a core
   catalog and pass launch readiness through normal UI, with the long tail
   left for later
6. Platform Admin foundation — enforce `PlatformAccess`,
   `withPlatformContractor`, platform audit, contractor lifecycle, directory,
   create/invite/provision, onboarding checklist
7. Hosted-site and embed workflows
8. Stripe billing
9. Launch-readiness gate
10. Re-onboard Elite end-to-end **on a verified Neon rehearsal branch**
11. Target price-for-price fidelity with current Elite unless a difference is
    explicitly approved
12. Fix anything requiring a seed, a script-only path, a direct database edit
    or an Elite-specific workaround
13. RC proof
14. Contractor #2

### Roles, in the order they earn their existence

| role | when |
|---|---|
| `PLATFORM_ADMIN` | exists |
| `PLATFORM_SUPPORT` | with the foundation, at step 6 — read-only by default |
| `PLATFORM_OWNER` | **when the staff-management screen ships.** Somebody must hold exclusive authority to grant and revoke platform access, and that role should not exist before the screen that needs it |
| `PLATFORM_BILLING` | step 8, when there is billing to authorise |

### The architecture rule, confirmed as hard

```ts
withPlatformContractor(platformCtx, contractorId, fn)
```

Platform authorization resolves **before** the contractor id is trusted; then
the call enters the same `withContractor` tenant guard every other path uses.
Platform Admin holds a controlled key into a tenant — never a bypass around
tenancy. `ContractorMembership` and `PlatformAccess` stay independent, and
neither is ever derived from the other.

### On the rehearsal

Step 10 runs against a Neon branch, verified by
`scripts/verify-database-identity.ts`, before it ever runs against
`price2book-production`. That verifier exists because a rehearsal against a
database *named* production — which was empty — cost this migration two
attempts. Deleting and rebuilding Elite is the highest-stakes operation the
platform will ever perform on itself.
