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
`verify-template-provisioning`, `verify-template-catalogue` and
`verify-template-update` in the deploy gate.

The handoff's "editing a canonical template does not modify contractor live
catalogues" is already the implemented behaviour.

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
| 10 | Templates | full template model + `template-update.ts` | A read UI plus the adopt/skip flow. The "never silently mutate" rule is already the implemented behaviour. |
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
              provisioning produces a catalogue nobody can price, and
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

## Open questions for the product decision, not for engineering

1. **Contractor lifecycle** — Trial / Active / Past Due / Suspended /
   Cancelled / Internal. Is that a field on `Contractor`, or derived from
   billing state with only Suspended stored? Deriving it means Stripe outages
   change what the console reports.
2. **What "Attention Needed" counts** (Storyboard 1). It should be
   contractor-actionable, not everything a verifier can fail.
3. **Whether `PLATFORM_SUPPORT` may enter a contractor at all**, or only read
   the health screen. The handoff leans cautious; the schema already reserves
   the role.
4. **Elite's re-onboarding fidelity target** — must the rebuilt Elite match
   today's Elite price-for-price (271 distinct price points), or is it a fresh
   contractor that happens to be Elite? The first is a far stronger proof and a
   far harder one, and the answer changes what Guided Setup must capture.
