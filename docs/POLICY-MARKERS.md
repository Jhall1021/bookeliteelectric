# POLICY markers

Breadcrumbs marking which parts of this catalog are **Elite's choices** rather
than **electrical truth**.

The distinction is invisible in the code today and expensive to rediscover
later. "A dedicated circuit needs a breaker" is true for every contractor
alive. "Elite includes 50 ft of run before sending it to review" is a business
decision that the next contractor will make differently — and someone reading
`WIRE_PORTION_CENTS = 3500` in a year has no way to tell which kind of fact
they're looking at.

## Format

```ts
// POLICY[parameter.name]: VALUE
```

Stable parameter names, machine-greppable, no prose. The point is that
`grep -rn "POLICY\[" .` produces a complete list of everything a second
contractor would need to be asked about.

```ts
// POLICY[fixture_supply]: CUSTOMER_SUPPLIED
// POLICY[new_outlet.standard_run_ft]: 20
// POLICY[exterior_surface.brick]: REVIEW
// POLICY[diagnostic.initial_minutes]: 60
```

## Two rules

**A marker describes a contractor policy, not physics.** If it would be true
at every electrical company in the country, it isn't a POLICY marker — it's
template knowledge and belongs in an ordinary comment. Ask: would the next
contractor plausibly answer this differently? If no, don't mark it.

**These are breadcrumbs, not architecture.** They exist so the eventual
extraction into real `ScopePolicy` configuration doesn't require re-deriving
every decision from scratch. When that work happens, the markers become data
and the comments disappear. Don't build tooling around them, don't validate
them at runtime, don't let them become load-bearing.

## When to add one

When creating or changing something **because of a contractor-specific scope
decision**. Not retroactively across the whole catalog — that's a project
nobody needs today. Backfill opportunistically when a file is being edited
anyway.

## What is NOT a policy marker

- Physical requirements: a fan needs a fan-rated box, 20A needs 12/2
- Code compliance: GFCI where required, permits where required
- Arithmetic: how crew-hours multiply, how markup is applied
- Anything already stored as configuration — the crew-hour rate is in
  `PricingSettings`, so it doesn't need a marker; it's already extracted

The rate being $250 is a policy. It doesn't need a marker because it's already
a settings row. Markers are for policies currently hiding in code.
