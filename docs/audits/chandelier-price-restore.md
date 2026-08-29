# `remove-and-replace-existing-chandelier` — diagnosis and repair

**29 August 2026.** Ordered ahead of the REMOTE_QUOTE starting-package pass
because an active `ADJUSTED` service with no base price breaks the pricing
contract harder than a service that is honestly quote-only.

## What was actually wrong

Almost nothing. The diagnosis expected a half-built service and found a
finished one with its price missing.

| Checked | Found |
|---|---|
| `fieldLaborHours` | 2.0 — real, present, seeded deliberately |
| Service recipe | `BOX_FAN_RATED ×1`, `CONSUMABLES_SMALL ×1` = $21.00 |
| Unresolved material roles | **none** — fully resolved |
| Unresolved policies | **none** |
| Fan-rated box intended in base scope? | **Yes.** TreeV1 §4.4: "Keep existing recipe. No change." A chandelier is a heavy fixture; the support-rated box is the physical requirement, not an upsell |
| Height / access branches | Present and correct — >12 ft, staircase/open foyer both route to review |
| Customer supplies the chandelier? | **Yes.** No fixture role in the recipe, and the copy says "swapping a chandelier for a new one". Equipment stays $0 |
| Prior published price | **$530**, derived and approved 23 Aug |
| `basePrice` | **NULL** |

The unresolved material roles I expected to find belong to the *template*
copy of this service, not to Elite's.

## The defect

One field. The service carried an owner approval stamp with no price behind
it — the only row in the catalogue in that state:

```
active  ADJUSTED   basePrice NULL   publishedPriceApprovedAt 2026-08-24
```

`prisma/reconcile-scope-services.ts` derived $530 on 23 August and published
both services in its list. The two approval stamps are 91 ms apart, in the
array's order — chandelier first, `new-exterior-flood-camera` second. The
flood camera still carries its $705/$645. The chandelier's money did not
survive whatever came next. The stamp is the receipt for a payment that
isn't in the row.

This is the failure §1.4 was written to catch, and it caught it: a public
service that can be reached, answered all the way to the end, and then
answers `INVALID` — not "we'll quote it", which the customer could act on,
but nothing.

## Not a defect

`estimatedMinutes: 240` against `fieldLaborHours: 2.0` reads like an
inconsistency and is deliberate — the seed says so in place:

> Four hours of calendar for a two-hour job. The spread on these is wide even
> inside the standard envelope, and a crew held up on a fixture that fought
> them shouldn't make the next appointment late.

The customer pays for the work; the calendar plans for the variance. That is
what separate fields are for. Left alone.

## The repair

`scripts/publish-chandelier-price.ts`, registered in the price-writer gate.
It re-derives through `lib/pricing.ts` rather than restoring the remembered
number, and refuses if the engine no longer reproduces the figure the
standing approval was given for — because a moved cost would make this a
pricing change, which is not what was authorised:

```
2 crew-hours          $500.00
material @ 1.3x        $27.30   ($21.00 direct)
                      --------
standalone             $530.00
same-visit             $530.00
```

Same figure both ways, and the engine produces it twice on its own:
`wwtLaborHours` is also 2.0. Nothing about the job gets shorter because a
crew is already at the house — the ladder still goes up, the old fixture
still comes down piece by piece.

The 23 August approval stamp was left where it was. Restamping it would
relabel an old decision as a new one.

## Proof

End-to-end, every route resolves and none is `INVALID`:

```
PRICED  $530.00   existing location / normal ceiling ≤12 ft / standard chandelier
REVIEW            ...                / normal ceiling      / large or elaborate
REVIEW            ...                / normal ceiling      / not sure
REVIEW            existing location  / higher than 12 ft
REVIEW            existing location  / staircase or open foyer
REVIEW            new location — no light there now
```

Catalogue-wide, across all 69 active services:

```
services compared : 69
services changed  : 1
  remove-and-replace-existing-chandelier
    before {"priced":0,"review":5,"other":1,"prices":[]}
    after  {"priced":1,"review":5,"other":0,"prices":[53000]}

distinct price points  270 -> 271
```

The five review routes are unchanged; the single `INVALID` became the single
priced route. No other published price moved. `npm run verify` passes.
