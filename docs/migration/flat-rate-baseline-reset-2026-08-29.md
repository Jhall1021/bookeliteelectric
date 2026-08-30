# Flat-rate baseline reset — 29 August 2026

The snapshot in `docs/migration/flat-rate-baseline.json` was recorded at
`d6b7f15` ("Build the T&M surfaces and wire the real guided flow") to answer
one question: **did adding time-and-materials change what a flat-rate customer
pays?** It answered it, and kept answering it, and then went red through the
whole of Phase F.

**That was the verifier working.** Phase F changed the flat-rate catalog
deliberately, and a regression snapshot that quietly absorbed those changes
would have been worth nothing afterwards. It refused to reinterpret intentional
change as "nothing happened", which is the only useful behavior a snapshot has.

This records the reset. The old baseline stays in git history at the commit
below; nothing tries to make two snapshots coexist at runtime.

---

## The complete diff

```
OLD BASELINE -> CURRENT   (69 -> 65 services)
```

**69 − 4 withdrawn = 65.** Exact. Nothing silently appeared or vanished.

### No longer active — 4

| service | price when withdrawn |
|---|---|
| `new-exterior-lighting-locations` | none |
| `outdoor-landscape-lighting` | none |
| `pool-equipment-electrical` | none |
| `transfer-switch` | none |

All four withdrawn by `scripts/hide-unbounded-services.ts` under §1.4: no
bounded standard scope exists, so they showed nothing in the price slot.
Owner-approved — *"for the 4 hide services, I'd actually hide them as part of
Phase F once the public-eligibility gate exists"*. **None carried a price**, so
no customer-visible price was withdrawn.

### Newly active — 0

The three garage siblings are `active: false` and reached only by reroute, so
they correctly do not enter the baseline. A sibling appearing here would have
meant one had escaped into the public catalog.

### Price moved — 7, every one `null -> price`

| service | before | after | approval |
|---|---|---|---|
| `remove-and-replace-existing-chandelier` | — | $530 | approved 23 Aug, price lost, restored 29 Aug |
| `replace-bathroom-exhaust-fan` | — | $535 | fan packages, owner-approved hours |
| `new-video-doorbell-wiring` | — | $530 | *"publish only if all disqualifiers route correctly"* |
| `generator-inlet-interlock` | — | $1,040 | *"rederive generator and publish if all gates remain green"* |
| `hot-tub-spa-electrical` | — | $1,385 | *"Publish hot-tub-spa-electrical at $1,385 / $1,320"* |
| `under-cabinet-led-lighting` | — | $1,235 | *"Publish under-cabinet-led-lighting at $1,235 / $1,170"* |
| `240v-garage-outlet` | — | $725 | *"Garage pricing approved… Public service displays From $725"* |

**Not one entry is `$X -> $Y`.** Every change is a service that had no price
acquiring one. That is the decisive evidence for precondition 3: had any
established price drifted — from a material cost moving, a rate change, a
rounding shift — it would appear here as a number-to-number change. None does.

### Scope / component shape moved — 0

No component selection and no `awaitingComponentApproval` state changed
anywhere.

---

## State at the reset

```
reconciliation   2 unexplained (both new-coax-line) + 2 approved exceptions
§1.4             62 public services priced, 3 under explicit rescue, none price-less
npm run verify   green
price points     276
```

**276 distinct price points is the new reference state.** After this, an
unexpected 276 → 277, or a $725 → $730, should make noise again.
