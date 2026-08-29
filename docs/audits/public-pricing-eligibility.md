# Public pricing eligibility — Phase F pre-flight

**29 August 2026.** Read-only. `scripts/audit-public-pricing-eligibility.ts`.

Run before building any starting packages, so that another chandelier turns
up here rather than halfway through the heavy-service work.

## The table

All 12 public services with no price. Every one is `REMOTE_QUOTE`, public,
with **null crew-hours and an empty recipe** — so none can be rescued by
supplying a number. Each needs a bounded scope first, which is what
"starting package" has to mean here.

| slug | booking | public? | current price path | proposed disposition | reason |
|---|---|---|---|---|---|
| `200a-service-upgrade` | REMOTE_QUOTE | yes | quote-only — "Get a quote" | Rescue — starting package | Named for a starting package |
| `240v-garage-outlet` | REMOTE_QUOTE | yes | quote-only — *falls back* | Rescue — starting package | Named for a starting package |
| `electrical-panel-replacement` | REMOTE_QUOTE | yes | quote-only — "Get a quote" | Rescue — starting package | Named for a starting package |
| `generator-inlet-interlock` | REMOTE_QUOTE | yes | quote-only — *falls back* | Rescue — starting package | Named for a starting package |
| `hot-tub-spa-electrical` | REMOTE_QUOTE | yes | quote-only — *falls back* | Rescue — starting package | Named for a starting package |
| `level-2-ev-charger` | REMOTE_QUOTE | yes | quote-only — "Get a quote" | Rescue — **scope first** | Named "probably". Run length, conductor size and panel capacity are still unbounded; hours mean nothing until they are |
| `new-video-doorbell-wiring` | REMOTE_QUOTE | yes | quote-only — *falls back* | Rescue — starting package | Named for a starting package |
| `under-cabinet-led-lighting` | REMOTE_QUOTE | yes | quote-only — "Custom Quote" | Rescue — starting package | Named "if still quote-only" — it is |
| `new-exterior-lighting-locations` | REMOTE_QUOTE | yes | quote-only — *falls back* | Hide until narrowed | Broad custom service; "new locations" is unbounded by definition |
| `outdoor-landscape-lighting` | REMOTE_QUOTE | yes | quote-only — *falls back* | Hide until narrowed | Broad landscape/custom service |
| `pool-equipment-electrical` | REMOTE_QUOTE | yes | quote-only — *falls back* | Hide until narrowed | Hide unless narrowed first |
| `transfer-switch` | REMOTE_QUOTE | yes | quote-only — *falls back* | Hide until narrowed | Hide unless narrowed first |

7 rescue · 1 rescue-after-scoping · 4 hide · **0 undecided**.

`level-2-ev-charger` already has a 3-question tree and 36 review routes — the
most scoping work of the twelve, and the reason the "probably" is worth
keeping until its bands are defined.

## Defects: none

With the chandelier repaired, **no public service can be answered to the end
and left with nothing.** Every route reaches a price, a review, or a hand-off.

Getting to that answer meant discarding three false positives. Recording them
because each one would otherwise look like a defect on the next run:

**1. 47× "Reroute from X has no target service" — not customer-facing.**
Every one is `REROUTE_TROUBLESHOOTING` with a null `rerouteServiceId`, across
15 active services. These are the commonest real answers a homeowner gives:
*"It stopped working"*, *"I'm not sure what's wrong"*, *"Something's wrong
beyond this one device"*.

The two implementations of the tree disagree:

- `components/guided-flow/GuidedFlowEngine.tsx` treats it as a **terminal**,
  fetches `electrical-troubleshooting`, and shows the customer the $249
  hand-off with the answer's disclaimer attached.
- `lib/routeResolver.ts` requires an explicit `rerouteServiceId` and returns
  `INVALID` without one.

The customer sees the hand-off, so nothing is broken in the storefront. But
`resolveRoute` is what `/api/visit` and `/api/quotes` use, and it is what
every offline tree walk uses — including `scripts/_pathProof.ts`, the
before/after proof standard. Those 47 have been sitting in its `other`
bucket. **Not fixed here** (it is a resolver change, outside this pass) but
it should be: either the resolver learns the implicit destination the UI
already knows, or the seeds set the target explicitly.

**2. 12× "No answer for X" — an artifact of the audit, now fixed.**
Following a reroute and resolving the destination with the *origin's* answers
reports a fault where the hand-off is working: the destination asks its own
questions. The audit now checks the target exists and stops there.

**3. 7× "has no published base price" on REMOTE_QUOTE services** — correct by
design. A quote-only service has no price; that is the state, not a fault.

## Smaller finding: the quote label is inconsistent

Of the 12, only 4 store a `startingPriceLabel` — three say **"Get a quote"**
and one says **"Custom Quote"**. The other 8 fall back, and the fallback
differs by page:

| surface | fallback |
|---|---|
| `app/[site]/page.tsx` | `copy.noPriceLabel` — "Custom Quote", or "Estimate on request" on the other voice |
| `app/[site]/services/[category]/page.tsx` | `"Custom Quote"` |
| `app/[site]/my-visit/page.tsx` | `"Custom quote"` (lowercase q) |

Nothing renders blank, so this is cosmetic — but the same service can be
called three different things depending on where the customer is standing.
Worth settling when the twelve are dispositioned, since eight of them will
change state anyway.
