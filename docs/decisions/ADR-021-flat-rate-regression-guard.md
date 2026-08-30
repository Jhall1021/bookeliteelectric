# ADR-021 — The flat-rate regression guard

**29 August 2026. Accepted.**

## Decision

**Established flat-rate outputs must not change unless the change is explicitly
approved and the baseline is deliberately re-recorded. A failing snapshot is
never authority to update itself.**

`scripts/verify-flat-rate-unchanged.ts` is permanent. It replays every active
service's flat-rate route through the real engine and compares the resolved
prices against `docs/migration/flat-rate-baseline.json`.

## Reference state

**276 distinct flat-rate price points across 65 active services**, recorded
29 August 2026 at the close of the Electrical Template v1.1 Phase F rescue
work.

## The rules, locked

1. **276 distinct flat-rate price points is the reference state.** Not a
   target — a fact that should stay true until somebody decides otherwise.
2. **The guard is permanent.** It is not scaffolding for the migration that
   produced it.
3. **A baseline reset requires an explicit reviewed diff**, complete and
   classified, written down before `--record` is run. Not after, and not
   instead.
4. **`null → price` still requires approval.** A service acquiring its first
   price is a change to the price book, not an exemption from review because
   nothing was overwritten.
5. **Any established-price movement — `$725 → $730` — is presumed suspicious
   until explained.** The presumption sits with the change, not with the
   person questioning it.
6. **Withdrawn and hidden services must stay distinguishable from pricing
   drift.** A service leaving the catalog and a service changing price are
   different events and must not appear in a diff as the same one.

## Why the wording changed

The guard was born narrow, for ADR-018: *did adding time-and-materials change
what a flat-rate customer pays?* That question has been answered, and a check
kept only for a question already settled is a check nobody reads.

Its real value showed when it went red and stayed red through Phase F. Phase F
withdrew four services and published seven previously price-less ones, all by
explicit approval — and the snapshot refused to absorb any of it quietly. **A
regression guard that silently reinterprets intentional change as "nothing
happened" is worth nothing afterwards.** Staying red was the guard working.

## What red means

Two things, and they are not interchangeable:

- **Something changed that nobody approved.** A bug. Find it.
- **Something changed that somebody did.** A decision. Finish it by proving the
  whole diff maps to approved changes, then re-recording on purpose.

The failure output cannot tell you which. Only the diff can, which is why
rule 3 exists.

## The reset that established this state

`docs/migration/flat-rate-baseline-reset-2026-08-29.md` carries the full diff
and each entry's approval. Its decisive property, and the standard a future
reset should be held to:

> **Not one entry was `$X → $Y`.** Every change was a service that had no price
> acquiring one, and every withdrawn service carried no price. Had an
> established price drifted — a material cost moving, a rate change, a rounding
> shift — it would appear as a number-to-number change.

That is what separates a reset that is *clean* from one that is merely
*explainable*.

## Related

- ADR-018 — pricing strategy, which the guard was originally built for
- §1.4 — a public service shows a real starting price or is not public
  (`scripts/verify-public-pricing.ts`)
- `scripts/reconcile-prices.ts` — published price against what the model
  derives, which is a different question from whether the price moved
