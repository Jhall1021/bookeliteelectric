# The troubleshooting route contract

**29 August 2026.** An isolated resolver correction. Not part of Electrical
Template v1.1 Phase F — Phase F paused for it and resumes with its eligibility
report unchanged.

## What was wrong

`REROUTE_TROUBLESHOOTING` is deliberately terminal and deliberately carries no
`rerouteServiceId`. The resolver did not know that. It applied
`REROUTE_SERVICE`'s rule to both actions:

```ts
if (option.routeAction === "REROUTE_SERVICE" || option.routeAction === "REROUTE_TROUBLESHOOTING") {
  if (!option.rerouteServiceId) {
    return { status: "INVALID", reason: `Reroute from "${current.key}" has no target service` };
  }
```

So 47 answer options across 15 active services resolved `INVALID` on the
server. They are the commonest answers a homeowner actually gives:

> *"It stopped working"* · *"I'm not sure what's wrong"* · *"Something's wrong
> beyond this one device — a burning smell, sparks, or several things dead"*

Meanwhile `GuidedFlowEngine.tsx` treated the same action as a terminal, fetched
the diagnostic's price, and showed the customer a working hand-off. **Two
implementations of the same tree, disagreeing about where it led.** The
storefront looking correct was never evidence the route contract was correct;
it was evidence that the storefront's copy of the contract was.

No customer hit it, because the storefront never asks the server to resolve
those answers. That is luck about which caller runs, not a property of the
system. `resolveRoute` is what `/api/visit` and `/api/quotes` use.

## The fix

Not a backfill. Writing 47 troubleshooting ids onto answer rows would have
encoded "this action needs a target" as data, when the whole point is that it
does not.

**Identity by role, not by name.** `lib/troubleshooting.ts` is now the single
definition, and both sides call it:

```ts
findTroubleshootingService(db, contractorId)   // BookingType.TROUBLESHOOT_ONLY, active
```

`TROUBLESHOOT_ONLY` is the schema's own words for "the $249 diagnostic service
itself". It is a structural fact that survives a contractor renaming the
service, re-slugging it, or filing it elsewhere. A slug survives none of those
— and `electrical-troubleshooting` is an *electrical* name on a platform that
is not an electrical product.

| | before | after |
|---|---|---|
| `REROUTE_SERVICE` | needs `rerouteServiceId` | unchanged — still INVALID without one |
| `REROUTE_TROUBLESHOOTING` | INVALID without `rerouteServiceId` | resolves by role to the contractor's own diagnostic |
| storefront destination | hard-coded `panels-troubleshooting/electrical-troubleshooting` | server-built path from the same lookup |
| storefront price | fetched by hard-coded Elite slug | `/api/troubleshooting`, by role |

The lookup is a **fifth tenant-rooted top-level query** in
`loadServiceForResolution`, run only when the tree actually contains such an
option. `resolveRoute` is pure and cannot query, so the answer travels with the
service. Scoping it to the service's own contractor is what makes a
cross-tenant hand-off impossible rather than merely unlikely.

`ResolvedRoute.REROUTE` gained a `via: "SERVICE" | "TROUBLESHOOTING"`
discriminator rather than a new status, so no existing caller silently falls
through into the PRICED path. `carriedAnswers` is empty for troubleshooting:
those answers describe a service the customer turns out not to be booking, and
the diagnostic asks its own questions.

## Two things found on the way

**The storefront was the lenient one for the other action.** A
`REROUTE_SERVICE` with no target fell through to `{ kind: "resolved" }` — the
customer booked and paid the running total for a service the tree had just
decided they were not buying. The server called that INVALID all along. It now
routes to blocking review on both sides. Latent, not live: no active
`REROUTE_SERVICE` option has a null target.

**`_pathProof`'s `other` bucket was hiding all 47.** A bucket named for what
it is *not* never looks wrong. It now counts `handoff` separately, and `other`
went back to meaning what its name says:

```
other  76 -> 7      handoff (was inside other): 69
```

The residual 7 are quote-only services correctly reporting they have no base
price.

## Proof

`scripts/verify-troubleshooting-route.ts`, in the deploy gate — so the two
implementations cannot drift apart again:

```
1. every live troubleshooting answer resolves
   ✓ all 47 REROUTE_TROUBLESHOOTING options resolve (51 routes over 15 services)
   ✓ every one lands on Elite's own diagnostic
2/3. the two actions have different rules
   ✓ REROUTE_SERVICE without a target is INVALID
   ✓ REROUTE_TROUBLESHOOTING without a target SUCCEEDS
   ✓   ...and lands on the contractor's diagnostic
4. a contractor with no diagnostic fails closed
   ✓ no diagnostic service -> INVALID, not a guess
   ✓   ...and says why
   ✓ a real contractor with no diagnostic resolves to a refusal
5. cross-tenant
   ✓ contractor B does NOT inherit Elite's diagnostic
   ✓ Elite still resolves to its own
6. storefront and /api/visit produce the same destination
   ✓ same destination service id from the same answers
   ✓ the destination is bookable (it has a published price)
```

The synthetic-tree controls (2, 3, 4) are built in memory on purpose: the claim
is about the RULE, and a rule proved against a row somebody can delete is
proved against nothing.

**7 — the proof stopped mis-bucketing them.** 69 hand-offs now counted as
hand-offs; `other` fell 76 → 7.

**8 — no price moved.** Every path of every active service, before and after:

```
services with any price change      : 0
services with priced/review change  : 0
distinct price points  271 -> 271     IDENTICAL
```

(271 is the current figure: the 269 baseline plus the two bathroom-fan packages
and the restored chandelier, all added earlier in this pass.)

**Storefront, exercised end to end.** `replace-standard-outlet` →
*"I'm not sure what's wrong"* → the troubleshooting terminal, disclaimer
carried, `GET /api/troubleshooting → 200`, price $249, and the button lands on
`/elite-electric/services/panels-troubleshooting/electrical-troubleshooting` —
the same destination as before, now derived rather than hard-coded. No console
errors. `npm run verify` passes.

## Noted, not changed

`scripts/verify-theme-structure.ts`'s identity rule excludes `typeof` shape
guards, but only on its first alternative — `typeof x.slug === "string"` still
trips the `slug === "…"` branch. It caught this change honestly and the fix was
to stop putting slugs in a customer-facing component at all (the server returns
a finished path now), so the gate was left alone. Worth completing the
exclusion the rule's own comment describes, separately.
