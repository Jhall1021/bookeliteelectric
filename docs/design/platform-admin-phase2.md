# Platform Admin — Phase 2: the read model, and four views over it

**6 September 2026.** Read-only. Follows `platform-admin-phase1.md` (authority
foundation, merged) and precedes support entry and any mutation.

## What exists after this

| piece | where |
|---|---|
| directory + per-contractor facts + attention filter + overview (per-contractor failure isolation, bounded concurrency) | `lib/platformReadModel.ts` |
| Overview, Contractors, Attention needed | `app/platform/page.tsx`, `app/platform/contractors/page.tsx`, `app/platform/attention/page.tsx` |
| Contractor Control Center | `app/platform/contractors/[contractorId]/page.tsx` |
| the gate | `scripts/verify-platform-read-model.ts`, in `npm run verify` |

No schema change. No new role. Nothing writes.

## Two kinds of fact, two doors

Directory facts are platform-model rows — `Contractor`, `ContractorSite`, the
membership table — read inside `withPlatform` on the unguarded client once the
actor is resolved. Tenant-owned facts — services, quotes, bookings, guided
setup, trades, the calendar connection — are read only inside
`withPlatformContractor`, on the guarded client, one contractor at a time. The
overview is therefore a loop over authorized entries, never a query without a
tenant. Four contractors today; at forty the answer is a cache, not a shortcut.

## One health engine

Readiness is `assessOnboarding`'s answer, shown as its stages and findings.
Catalog counts use the same four-way split the contractor's own dashboard
shows. Payment readiness is `connectReadiness`. The read model renders; it
does not decide.

## Attention needed is a filter, not a dump

Per the 29 August decision, a contractor appears only when a person at
Price2Book should do something today. `attentionFor` is a pure function over
the facts above with four rules: a launch check failing after setup finished
or services went live (material blockers reported separately from the rest),
an external calendar that is not connected, and a setup idle for fourteen or
more days. Failed payments, expired invitations, email delivery, whether an
embed was actually installed, and template updates awaiting review have no
data source yet and are stated as absent on the page rather than guessed.

## The one request-supplied contractor id

The Control Center route hands `params.contractorId` straight to
`platformContractor`, which hands it to `withPlatformContractor`, which
authorizes before it looks. The Phase 1 verifier's rule "no platform surface
reads a contractor id from a request" is narrowed to "none but that file, and
only that way", and the new verifier holds that there is exactly one such file.

## Review corrections (PR #17)

- **Calendar:** connected means a `JobberConnection` row exists, the meaning
  the readiness engine and the dashboard already use. Access tokens expire
  hourly and are refreshed on use; expiry is shown as "due for its routine
  refresh", never as disconnection, and never raises attention.
- **Storefront:** the live storefront is the active site, newest first;
  retired sites are counted separately and never reported as current.
- **Overview resilience:** each contractor's facts are read in isolation, a
  few at a time; a failure becomes an explicit unreadable row with its
  reason, and the sums cover the rows that were read.
- **Verifier strength:** platform files are audited by syntax tree
  (`scripts/_platformSurfaceAudit.ts`), not by regular expression: every
  module edge — import, bare import, re-export, dynamic import, require — is
  held to an allowlist by module and exported symbol under any local alias;
  mutating Prisma calls are found on any receiver; request access is found by
  binding (`params`/`searchParams` props under any name, next/headers calls
  under any alias, request arguments used); and the Control Center's one
  permitted call is checked argument-for-argument. Twenty-odd mutants prove it.

- **Catalog split:** disjoint by construction — quote-only is decided first,
  then priced and needs-a-price split the rest — so a quote-only service that
  also carries an approved price is counted once. The contractor dashboard's
  own split has the same overlap; it is noted, not changed here.
- **Audit strength (final rounds):** alias tracking sees through casts,
  parentheses, non-null and `satisfies`; the directory clients are constrained
  positively (approved platform-model reads or approved sinks only — an alias,
  cast, destructure, spread, return or escape into any other function is a
  stray); request props are found on every argument, including a route
  handler's second-argument context; destructure keys are normalized, so
  `{ ["delete"]: write }` is the mutator it names.

- **Audit strength (round seven):** every relation a directory query touches
  — under include, select, `_count`, where, at any depth, through module-scope
  select constants — is resolved against `prisma/schema.prisma` and must land
  on a non-tenant model; an approved sink name must resolve to the genuine
  import or module-scope declaration, never a shadowing local or parameter;
  destructuring assignments are read like declarations; and the implicit
  `arguments` object is refused on any platform surface.

- **Audit strength (round eight):** relation traversal reads the query
  receiver in any spelling — dot or bracket for the model and the method,
  casts between — and a computed model or method, or a spread argument, is
  unknowable and refused; sink resolution treats object and array binding
  patterns, destructured parameters and catch bindings as shadows, and a
  module-scope name declared by pattern or declared twice is never the
  genuine sink.

## Not in Phase 2

Support entry and `SupportAccessEvent`; any mutation, including "resend" or
"reconnect"; a lifecycle field; billing; `PLATFORM_SUPPORT`; template review.
