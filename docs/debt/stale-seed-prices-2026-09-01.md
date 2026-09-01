# Repo seeds have drifted from production — found 1 September 2026

**Status:** open. **Deliberately not fixed** in the change that found it.

Found while capturing the marketing homepage's hero walkthrough read-only from
the live `elite-electric` catalog (`scripts/capture-hero-flow.ts`). The hero
needed the real questions and the real prices; comparing what came back against
the repo's own seed files showed the seeds are behind production.

Nothing here was changed. The homepage takes production as its source of truth
and the drift check keeps it there, so the hero is correct either way — but the
seeds are now a trap for anyone who reads them expecting current values.

## What differs

| Thing | Repo seed | Production (elite-electric) |
|---|---|---|
| `replace-standard-outlet` standalone | `basePrice: 225` — [prisma/seed.ts:69](../../prisma/seed.ts) | **$260** |
| `replace-standard-outlet` same-visit | `whileWeThereBasePrice: 85` — same line | **$95** |
| `replace-standard-outlet` tree | one question, `outlet_condition` — [prisma/seed-questions.ts](../../prisma/seed-questions.ts) | **two** questions: `device_replacement_reason` then `outlet_condition` |

The missing `device_replacement_reason` question is the larger of the two. Its
live prompt is *"Why are you replacing this?"*, and it does real routing work
before the condition question is ever reached: *"It stopped working"*, *"I'm not
sure what's wrong"* and *"Something's wrong beyond this one device — a burning
smell, sparks, or several things dead"* all `REROUTE_TROUBLESHOOTING`, while
*"It's damaged, loose, cracked or worn"* continues to the swap. A seed that
recreates this service without that question produces a materially different
product — one that sells a replacement for a fault it should be diagnosing.

## Why it was not fixed here

The change that found it is a marketing homepage change. Reconciling seeds
against production is pricing and catalog work: it needs a decision about which
direction is authoritative per field, it touches services beyond these two, and
it is exactly the kind of scope creep that turns a page revision into a data
migration. The owner's instruction was to record it and reconcile intentionally
in its own pass.

## What to look at when it is picked up

1. **The direction is not obvious.** Production is authoritative for what
   customers are being charged today. The seeds are authoritative for what a
   NEW contractor gets provisioned. If they disagree, contractor #2 launches
   with contractor #1's old prices — which is the actual defect, not the
   mismatch itself.
2. **Check the whole catalog, not these two rows.** Two services were compared
   because two services were needed. The sample size is two; the finding is
   probably not.
3. **`prisma/seed.ts` prices are Elite's retail figures.** Whether a template
   for other contractors should carry them at all is a separate question, and
   POSITIONING.md already says the electrical template carries trade structure
   and no economics.
4. The hero fixture does not depend on any of this being fixed. It reads
   production directly and `npx tsx scripts/capture-hero-flow.ts --check` fails
   the build if production moves.
