# Anonymous session bootstrap

## The invariant

For browser-based homeowner flows, anonymous session identity
(`elite_session_id`) is established on the initial qualifying page response,
before any client-side session-dependent request executes. API-side session
creation (`getOrCreateSessionId()` in `lib/session.ts`) remains a defensive
fallback for requests that genuinely arrive with no prior page load — it is
not the normal browser bootstrap mechanism.

```
browser requests homeowner page
        |
middleware sees no elite_session_id
        |
middleware generates one
        |
document response sets the cookie
        |
React hydrates
        |
Header / GuidedFlowEngine fire their own API requests
        |
all requests carry the SAME elite_session_id
```

`middleware.ts`'s `isHomeownerStorefrontPath()` scopes this to real
`app/[site]/**` storefront pages — the only place a client fetch depending on
this cookie originates — and only mints when the cookie is absent. An
existing identity, including one Device Handoff just assigned the browser, is
never touched.

## Why this was necessary

`Header.tsx` (the storefront's cart badge) and `GuidedFlowEngine.tsx` (the
guided-flow engine) each independently fire their own startup request on
mount — `GET /api/visit`, and `GET /api/visit` + `POST
/api/guided-flow-sessions` respectively. Every one of these calls
`getOrCreateSessionId()` (`lib/session.ts`), which mints and `Set-Cookie`s a
new anonymous session id whenever the incoming request carries none.

On a genuinely first-time visitor, these requests fire concurrently with no
cookie yet present. Each independently mints its own id and its own
`Set-Cookie`; whichever response the browser applies last becomes the
browser's actual cookie. Any `GuidedFlowSession` row created under one of the
other, non-winning ids becomes orphaned — the row is valid, but its owning
`sessionId` never matches the id the browser ends up holding, so every later
request against it fails `loadOwnedSession`'s ownership check with a 404,
even though nothing about the row itself was wrong.

Reproduced against a real `app/[site]/services/[category]/[service]` page on
`main`, no Route Assist code involved: 3 distinct session ids minted per
first-load navigation, 12/12 fresh-context runs across both a production
build and dev mode, with the `GuidedFlowSession`-owning id orphaned in all
but one of those runs.

## What this fix does and does not change

- Adds cookie issuance to `middleware.ts`, scoped to homeowner storefront
  pages, mint-only-if-absent.
- Extracts the cookie's name and attributes into a small, zero-dependency
  module (`lib/sessionCookieConfig.ts`) that both `middleware.ts` (Edge) and
  `lib/session.ts` (Node) import, so the two are never subtly different
  cookies.
- Extracts `RESERVED_HOSTED_SLUGS` into its own zero-dependency module
  (`lib/reservedHostedSlugs.ts`), re-exported unchanged from
  `lib/siteRouting.ts`, so `middleware.ts` can use the same reserved-path list
  without pulling that file's Prisma import into the Edge bundle.
- Does not change `elite_session_id`'s identity semantics, the cookie's
  attributes, `loadOwnedSession`'s ownership check, `GuidedFlowSession`
  persistence, or Device Handoff's resolve step (which still unconditionally
  overwrites the cookie to the desktop's session id on success, regardless of
  what the phone had before).
- Does not remove `getOrCreateSessionId()`'s own minting ability — it still
  mints when a request genuinely has no cookie and no prior page load
  established one.
