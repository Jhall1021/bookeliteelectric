# Platform Admin — Phase 2: the read model, and three views over it

**6 September 2026.** Read-only. Follows `platform-admin-phase1.md` (authority
foundation, merged) and precedes support entry and any mutation.

## What exists after this

| piece | where |
|---|---|
| directory + per-contractor facts + attention filter + overview | `lib/platformReadModel.ts` |
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

## Not in Phase 2

Support entry and `SupportAccessEvent`; any mutation, including "resend" or
"reconnect"; a lifecycle field; billing; `PLATFORM_SUPPORT`; template review.
