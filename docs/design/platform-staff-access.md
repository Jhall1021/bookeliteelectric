# Platform staff access levels

Status: DESIGN LOCK FOR NEXT IMPLEMENTATION PASS

## Purpose

Price2Book needs more than one level of internal staff access before the platform admin can safely expand beyond founder use. This document defines the permission model without changing any current authorization behavior yet.

The goal is narrow: preserve the existing tenant boundary, preserve `PlatformAccess` as the single source of staff authorization, and distinguish ordinary support work from onboarding operations and full platform administration.

## Current state

Today a person is platform staff only when they have an active `PlatformAccess` row. Contractor ownership is intentionally unrelated. `lib/platformContext.ts` authorizes the staff actor first and then enters an individual contractor through the same guarded tenant boundary used elsewhere.

The Prisma enum currently contains only `PLATFORM_ADMIN`. The schema already anticipates a future narrower `SUPPORT` role in a comment, but that role is not implemented. More importantly, the current platform boundary treats every active `PlatformAccess` row as authorized; it does not yet perform action-level role checks.

This means role names must not be added to the UI and assumed to provide security. The command layer must enforce them before any navigation hiding is meaningful.

## Recommended roles

### PLATFORM_ADMIN

Full Price2Book platform authority.

May read all platform operational views, onboard contractors, manage owner invitations, enroll trades, install catalogs, launch contractors, retire contractors, and eventually grant or revoke staff access.

This is the only role that should be able to perform destructive or platform-governance actions.

### ONBOARDING

Operational staff who bring contractors from signed agreement to a handed-off account.

May read platform overview, contractor directory, contractor control centers, attention queue, and onboarding status. May create contractor records, invite or attach an owner, enroll a trade, and install the published catalog.

May not launch a contractor, retire a contractor, manage staff access, enter a contractor as the owner, or directly edit contractor pricing/catalog data outside the reviewed onboarding commands.

Launch remains an admin decision because it changes what homeowners can reach.

### SUPPORT

Read-first support role.

May read platform overview, contractor directory, contractor control centers, attention queue, and onboarding status. May inspect facts needed to explain what is blocking a contractor.

May not create contractors, invite owners, enroll trades, install catalogs, launch, retire, or change contractor data.

A future audited support-entry feature may temporarily allow contractor-bound assistance, but that is a separate capability and must create a `SupportAccessEvent`; it must not be inferred from the SUPPORT role itself.

## Capability matrix

| Capability | SUPPORT | ONBOARDING | PLATFORM_ADMIN |
| --- | --- | --- | --- |
| Platform overview / directory | yes | yes | yes |
| Contractor control center | yes | yes | yes |
| Attention queue | yes | yes | yes |
| Read onboarding status | yes | yes | yes |
| Create contractor | no | yes | yes |
| Invite / attach / revoke owner invitation | no | yes | yes |
| Enroll trade | no | yes | yes |
| Install catalog | no | yes | yes |
| Launch contractor | no | no | yes |
| Retire contractor | no | no | yes |
| Manage platform staff access | no | no | yes |
| Enter contractor owner UI | no | no | no, until audited support entry exists |

## Enforcement architecture

Do not scatter checks through React pages.

Add one platform capability decision layer adjacent to `platformContext`, for example:

- `PlatformCapability`
- `canPlatformActor(actor, capability)`
- `requirePlatformCapability(actor, capability)`

Every command in `lib/platformOnboarding.ts` must require the relevant capability after staff identity is established and before the mutation is attempted. Read routes should use the same capability system where a role should not see a surface at all.

The order remains:

1. authenticate the user;
2. resolve active `PlatformAccess`;
3. authorize the required platform capability;
4. validate any contractor id;
5. enter the contractor through the existing guarded tenant boundary;
6. execute the existing domain authority.

Role checks must never replace contractor scoping or service activation guards.

## Proposed capability mapping

- `PLATFORM_READ`: SUPPORT, ONBOARDING, PLATFORM_ADMIN
- `CONTRACTOR_ONBOARD`: ONBOARDING, PLATFORM_ADMIN
- `CONTRACTOR_LAUNCH`: PLATFORM_ADMIN
- `CONTRACTOR_RETIRE`: PLATFORM_ADMIN
- `STAFF_ACCESS_MANAGE`: PLATFORM_ADMIN
- `SUPPORT_ENTER_CONTRACTOR`: nobody in this phase

Keeping capabilities separate from role names prevents future code from turning into repeated `role === ...` conditionals and gives us room to add or change roles without rewriting every action.

## UI behavior

The staff shell should identify the signed-in staff role so people know which authority they are operating under.

Navigation may hide actions the role cannot perform, but hiding is presentation only. Server-side command enforcement is authoritative.

Onboarding pages should render read-only progress for SUPPORT. ONBOARDING should see setup actions but not Launch or Retire. PLATFORM_ADMIN sees the complete workflow.

Forbidden direct URLs should return a deliberate refusal rather than silently redirect to another platform page.

## Audit boundary

Normal platform reads do not need a support-entry event. Contractor mutations already occur through reviewed onboarding commands and should continue to record the actor where the underlying model supports it.

Any future feature that lets staff operate inside the contractor-facing dashboard is different. It needs explicit contractor-bound entry, reason/purpose, actor, start/end timestamps, and an immutable `SupportAccessEvent`. No current role automatically grants that ability.

## Implementation order

1. Add `SUPPORT` and `ONBOARDING` to `PlatformRole` with a Prisma migration; keep existing grants as `PLATFORM_ADMIN`.
2. Add the centralized capability map and verifier coverage.
3. Put capability guards inside platform command functions, not only server actions or pages.
4. Add page/navigation presentation based on the same capability decisions.
5. Add staff-access management UI only after grant/revoke commands and audit behavior are defined.
6. Leave audited support entry for its own phase.

## Invariants

- Contractor membership never grants platform access.
- Platform access never grants contractor membership.
- A platform role never bypasses tenant scoping.
- A platform role never bypasses service activation/readiness guards.
- UI visibility is not authorization.
- SUPPORT is read-only until an explicitly audited support-entry system exists.
- Launch and retirement remain PLATFORM_ADMIN-only.
- No role may impersonate an owner through an ordinary dashboard URL.
