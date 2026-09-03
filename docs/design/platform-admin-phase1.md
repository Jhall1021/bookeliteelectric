# Platform Admin — Phase 1: the authority foundation

**2 September 2026.** Authorization only. No screens beyond a protected shell
and a proof page, no read model, no support sessions, no lifecycle, no
mutations, no new roles. Supersedes the sequencing in
`platform-admin.md` where they differ; that document's architecture rule is
unchanged and is now enforced.

## What exists after this

| piece | where |
|---|---|
| `PlatformActor`, `platformActorFor`, `resolvePlatformActor` | `lib/platformContext.ts` |
| `withPlatform` / `withPlatformRoute` — cross-tenant platform reads | same |
| `withPlatformContractor` / `withPlatformContractorRoute` — staff entering one contractor | same |
| `/platform` layout and proof page | `app/platform/` |
| `GET /api/platform/whoami` | `app/api/platform/whoami/route.ts` |
| first-administrator bootstrap | `scripts/bootstrap-platform-admin.ts` |
| the gate | `scripts/verify-platform-authority.ts`, in `npm run verify` |

No schema change. `PlatformAccess` and `PlatformRole` are used as they were
modelled in August; `SupportAccessEvent` stays unwritten until there is a
support visit to record.

## The rule, now code

A person is Price2Book staff when, and only when, they hold a `PlatformAccess`
row with `revokedAt` null, looked up by **user id**. Not by email, not by
domain, not by owning a contractor, not by being first. `ContractorMembership`
and `PlatformAccess` are independent in both directions, and the verifier
holds that: the contractor boundary (`lib/adminContext.ts`) never reads
`PlatformAccess`, and the platform boundary never reads
`ContractorMembership`. A contractor OWNER of an active business is refused at
`/platform` — shown a refusal, not redirected home.

`asPlatform()` and `platformDb` remain database-scope tools. Every wrapper
resolves the actor before handing either out; neither is evidence of anything.

### Entering a contractor

`withPlatformContractor(contractorId, fn)` is the only wrapper in the codebase
that accepts a contractor id, and it does three things in a fixed order:

1. **Authorize.** `platformActorFor` runs before the id is inspected. An
   unauthorized caller gets `NotPlatformStaffError` whether the id is Elite's
   or nonsense, and the contractor table is never consulted — proven by
   handing the wrapper a recording proxy and reading back which models it
   touched.
2. **Validate.** The id must be plausible and must resolve. Malformed and
   absent produce one `PlatformContractorNotFoundError`, reachable only after
   step 1.
3. **Scope.** It calls the same `withContractor()` every other path uses,
   with source `platform-session` (added to the closed union in
   `lib/tenantContext.ts` so logs can tell staff from the contractor). Inside,
   Elite's real service and booking ids resolve to nothing from a throwaway
   contractor, and a write against them matches zero rows.

### Two shapes of every function

The `...For` variants take the signed-in user as an argument and are the
decision. The bare variants read the user from the request and call them.
That is what lets the verifier prove signed-out, owner, revoked and active
without a request scope, and leaves the request-bound wrappers with no logic
of their own.

## The bootstrap

```
npx tsx scripts/bootstrap-platform-admin.ts --user <userId> --expect price2book-production
npx tsx scripts/bootstrap-platform-admin.ts --user <userId> --expect price2book-production --apply
```

Operator-only, run by whoever holds the database credentials. It takes a user
id and refuses anything containing `@`; requires `--expect` and checks it
against the stamped `DatabaseIdentity` of the live endpoint before reading
anything else; requires an existing, verified user; refuses if any active
administrator exists; refuses to reinstate a revoked grant, even as a dry run;
is report-only without `--apply`; writes one row inside a transaction that
re-checks the two racing refusals; and reads the row back before reporting.
The grant carries `grantedByUserId: null` — the only grant that legitimately
has no granter.

There is no route, page or server action that writes `PlatformAccess`. The
verifier scans `app/`, `lib/` and `components/` for one and fails if it
appears.

## The verifier, and one thing to know about it

`verify-platform-authority` runs the bootstrap as a child process in every
mode, which creates a **real, transient** `PLATFORM_ADMIN` grant for a
throwaway user and removes it in teardown. The throwaway has no credential and
an undeliverable address, so it cannot sign in; a crashed run's leftovers are
swept by the next run; and a real bootstrap attempted against such a leftover
refuses loudly rather than proceeding. Once a real administrator exists the
apply path is unreachable by design, and the verifier proves the refusal
instead of the grant. `npm run verify` runs inside the Vercel build, so this
happens against production on every deploy — the same discipline as the other
throwaway-fixture verifiers, stated here because the row in question is an
administrator grant.

Negative-tested: with the lookup moved ahead of authorization and revocation
ignored, seven checks go red.

## Not in Phase 1, on purpose

Support entry and `SupportAccessEvent` writes; a lifecycle beyond
`Contractor.active`; any read model, directory, overview or metric; platform
mutation endpoints; `PLATFORM_SUPPORT` or any second role; changes to the
contractor dashboard. Each waits for the step that needs it.

## Known red on the shared main, not touched here

Two gate checks were already failing on `origin/main` before this branch and
are unrelated to it: `audit-guard-adoption` (the admin services route passes
the unguarded client to `availableTrades`) and `verify-us-spelling` (one
canonical field in the database spells "neighbour"). Both belong to their own
workstreams.
