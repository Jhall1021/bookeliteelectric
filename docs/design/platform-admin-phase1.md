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
| the gate, production-safe | `scripts/verify-platform-authority.ts`, in `npm run verify` |
| the live bootstrap proof, on a rehearsal branch | `scripts/verify-platform-bootstrap-live.ts`, `npm run verify:platform-live` |

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
is report-only without `--apply`; writes one row under `Serializable`
isolation behind a transaction-scoped advisory lock, re-checking the two
racing refusals inside; and reads the row back before reporting.
The grant carries `grantedByUserId: null` — the only grant that legitimately
has no granter.

There is no route, page or server action that writes `PlatformAccess`. The
verifier scans `app/`, `lib/` and `components/` for one and fails if it
appears.

## Two verifiers, split by where they may write

**`verify-platform-authority`** is in `npm run verify`, which runs inside every
deploy against production. So it never creates, revokes or deletes a
`PlatformAccess` row — not a transient one, not for a throwaway. The
active / revoked / absent decisions are exercised through a recording double:
a client whose `platformAccess.findUnique` answers from an in-memory table and
whose every other model delegates to the real client, so the contractor lookup
and the tenant guard underneath are the real ones. Its only rows are ordinary
throwaway fixtures — a contractor, an owner with a membership on it, users
with no grant — and it removes them. The bootstrap is run from it only in the
modes that write nothing: refused arguments and a dry run. It never passes the
apply flag — its bootstrap helper refuses the flag at runtime, and the file
asserts that its own source does not spell it — so a future reordering of the
bootstrap's refusals could not turn a production test into a grant. It checks its own
source for a `PlatformAccess` write and checks that the live verifier is not
in the default chain.

**`verify-platform-bootstrap-live`** (`npm run verify:platform-live`) is
invoked explicitly and runs against `REHEARSAL_DATABASE_URL`. Before anything
else it asks `scripts/_lineage.ts` the same question the contract rehearsal
asks — is this a branch of the current production lineage whose marker was
stamped for a different endpoint? — and refuses production, the archive, an
unrelated database and an unmarked one by that positive test; then it also
refuses a target on `DATABASE_URL`'s endpoint. Then, and only then, it performs one
destructive preparation: it deletes every `PlatformAccess` row the branch
inherited, with a count and the affected identities printed. A branch of
production carries production's grants, so once the first real administrator
exists every new branch would otherwise report "an administrator already
exists" and the apply and concurrency proofs would be unreachable. On a copy
that row is data, not a decision. The deletion runs through a function that
re-derives its permission from the same verdict and the same endpoint
comparison and throws before touching anything if either is not what the
proof required, so production cannot reach it. There it runs the bootstrap in
every mode: dry run, apply, repeat for the same user, repeat for another user,
revoke-then-not-reinstated, and a first grant to someone else after a
revocation. It also starts two bootstraps at the same instant from two
connections, three times over, and requires exactly one grant each time.

### The bootstrap's rehearsal mode

`--rehearsal-branch-of <key>` is how the live verifier runs the real script on
a branch. It is not a relaxation of `--expect`; it is a second, equally strict
question: the target must be a proven branch of the named database, by lineage
and by a marker stamped for a different endpoint. Production fails that by
construction — its marker names the endpoint it is on — which the default
verifier proves by invoking the flag against production and reading the
refusal. The two flags are exclusive. Both modes accept a `--url-var`.

### Why the transaction is serialized

A count followed by an insert under default isolation is not enough: two
operators at the same moment both read zero administrators, and the unique
constraint is on `userId`, so two different users would both succeed. The
grant now runs under `Serializable` isolation and takes a transaction-scoped
advisory lock on one well-known key first. The lock makes the second bootstrap
wait and then see the first's commit; if its snapshot nonetheless predates
that commit, Serializable detects the dependent read at commit (SQLSTATE
40001, Prisma P2034) and rolls the insert back. Either way the loser is
refused with the reason and never retried.

Negative-tested: with the lookup moved ahead of authorization and revocation
ignored, seven checks in the default verifier go red.

## Not in Phase 1, on purpose

Support entry and `SupportAccessEvent` writes; a lifecycle beyond
`Contractor.active`; any read model, directory, overview or metric; platform
mutation endpoints; `PLATFORM_SUPPORT` or any second role; changes to the
contractor dashboard. Each waits for the step that needs it.

## Two gate failures repaired beside this, not in it

Two checks were red on the shared main before this branch and unrelated to
it. Both are fixed on `fix/shared-gate-repairs`: `audit-guard-adoption` (the
admin services route handed the unguarded client to `availableTrades`; it now
passes `db`) and `verify-us-spelling` (one British spelling in a design-document
table, not in any database field).
