# Run order — 23 August 2026

Two schema changes, four seeds, one migration. **Order matters** on the last
two: the price migration refuses to publish a service whose crew-hours aren't
established yet, so its seed has to run first.

```bash
npx prisma db push
npx prisma generate

npx tsx prisma/seed-materials.ts            # chandelier + flood/camera parts
npx tsx prisma/seed-chandelier.ts           # scope model, 2.0 crew-hours
npx tsx prisma/seed-flood-camera.ts         # scope model, 2.5 crew-hours
npx tsx prisma/seed-content-fixes.ts        # pendants named in the standard fixture

npx tsx prisma/reconcile-scope-services.ts            # report first
npx tsx prisma/reconcile-scope-services.ts --apply    # then publish

npx tsx prisma/repair-trees.ts              # 0 dangling, 0 unreachable
npm run db:reconcile                        # both should read MATCH
                                            # operational verification, not a
                                            # build gate — see ADR-003
```

## Before the chandelier flow works

Three images go in `public/images/fixtures/`:

| file | which |
|---|---|
| `chandelier-standard.jpg` | the eight-arm gold fixture with modest drops |
| `chandelier-crystal.jpg` | the large crystal piece |
| `chandelier-multi-tier.jpg` | the two-tier wagon wheel |

The first illustrates the instant-price option; the other two illustrate what
sends a job to review. Without them the options still work — they just lose
the pictures, which are most of how a homeowner decides.

## What changed

**Working hours are configurable.** `/admin/business-hours` — which days,
start and finish, window length. Arrival windows are generated from these
rather than entered, so they can't drift out of step. Three hardcoded places
now read from the record: the windows, the 4:30 cutoff, and the Monday-to-
Friday filter on the schedule page.

**The workday cutoff applies everywhere.** It already stopped a seven-hour job
being offered at 2pm — but not on the two paths where Jobber is unreachable or
no crews are configured, which returned every window as available. Failing
open on Jobber is right; 4:30 is when crews go home and an API outage doesn't
change that. Checkout enforces it too, so a stale tab can't walk past it.

**Chandelier is bookable.** Narrow envelope: existing location, normal ceiling
12 ft or under, standard fixture. 2.0 crew-hours, $530 both ways. Anything
larger, higher, over a stairwell, or that the customer isn't sure about goes
to review with photos. No surcharge bridges an eight-arm fixture and a
three-tier crystal one, so it doesn't try.

**Flood/camera is bookable**, assembled from parts that already existed: the
exterior receptacle at 1.5 crew-hours plus 1.0 to mount, aim and run the cord.
$705 standalone, $645 same-visit. An existing powered fixture reroutes to the
swap service rather than dead-ending. Network setup is explicitly out of
scope, in wording the crew can point at.

**Pendants are standard fixtures**, said out loud in the service description
so nobody books a chandelier for a pendant.

## The category backfill is a recovery tool, not a step

`prisma/backfill-category-split-2026-08-27.ts` was required after every seed
for exactly one day. It no longer is.

Seeds write the split structure themselves, through
`prisma/_categoryHelpers.ts` — one call creates the `CanonicalCategory`, this
contractor's `ContractorCategory`, and the pre-split scaffolding, and every
seeded service attaches both pointers. There is no ordering left to remember.

`npm run verify` runs `scripts/verify-category-integrity.ts` as the backstop,
and `npm run build` runs `npm run verify`. A service without a contractor
category fails the build with the slug that is wrong and the fix.

Keep the backfill for:

- migration recovery, if a service is somehow written without one
- older environments being brought forward
- rollback and replay

Run it when the verify gate tells you to. Do not add it to a routine sequence.

The rule this came from is worth keeping: **if correct execution depends on a
human remembering an ordering rule, encode the order into the write path and
use verification as the backstop.** Stronger than either documentation or a
gate alone.
