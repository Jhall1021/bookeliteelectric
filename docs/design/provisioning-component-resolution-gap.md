# Shared provisioning gap: component relationships are silently discarded

*Found 1 September 2026 during the Plumbing Template V1 two-contractor proof.
For the provisioning/platform owner. **Not a Plumbing problem, and Plumbing must
not compensate for it.***

Plumbing V1 is green and refrozen. This is a pre-existing shared behavior the
rehearsal happened to expose, and it should be reviewed on its own terms.

---

## The behavior

`installCatalog()` creates an answer-option/component relationship only when the
contractor **already owns** the corresponding configured `ContractorComponent`:

```
TemplateAnswerOptionComponent exists
  -> look for the contractor's ContractorComponent
  -> absent? `continue`
  -> no runtime relationship is created
  -> nothing records that anything was skipped
```

The last line is the problem. The skip itself is defensible; its silence is not.

## What it did in the rehearsal

- the canonical template published **135** `TemplateAnswerOptionComponent` rows
- provisioning into a brand-new contractor produced **0** runtime
  `AnswerOptionComponent` rows
- creating the `ContractorComponent` rows afterwards did **not** retroactively
  restore them

Nothing failed. Nothing warned. The catalog simply arrived without the
component attachments it declares, and the only way to notice was to go looking
for rows that should have existed.

This bites hardest in the case that is supposed to be normal. A contractor
being provisioned from a canonical template is, by definition, one who has not
configured their economics yet — that is the entire premise of the template
library. The current rule is survivable for an established contractor and a bad
default for a new one.

## Why it matters more than "0 of 135"

The missing rows can be recreated. What cannot be recovered is the
**distinction**:

|  | recorded today? |
| --- | --- |
| the template never required a component here | — |
| the template required one, and the contractor had not configured it yet | **no** |

Both states look identical afterwards: an answer with no component. The second
is silently discarded.

The platform already solves this problem twice, in two different ways, for the
two neighboring concepts:

- **Materials** — an uncosted role is not dropped. It lands in
  `Service.unresolvedMaterialKeys`, `materialCostResolved` goes false, and the
  service cannot publish a price until it is answered.
- **Policies** — an unanswered policy stays in `Service.unresolvedPolicyKeys`,
  and `resolvePolicy()` is the authority that both records the answer and
  clears the dependents.

**Components have no equivalent.** They are the odd one out, and the asymmetry
looks unintended rather than decided.

## The invariant worth restoring

> Canonical provisioning should not silently lose a template requirement merely
> because contractor economics or configuration do not exist yet.

A new contractor should receive the complete canonical structure first, then
resolve contractor-owned economics afterwards, without provisioning ORDER
changing what the catalog means.

## Directions — for the owner to choose, not for Plumbing to pick

1. **Preserve the canonical relationship** independently of whether the
   contractor has priced the component, the way `AnswerOptionMaterial` now does
   for branch materials. Readiness then refuses on the missing economics rather
   than the relationship vanishing.
2. **Introduce unresolved component state**, analogous to
   `unresolvedMaterialKeys` / `unresolvedPolicyKeys`.
3. **Make component configuration a formal prerequisite** and fail the install
   loudly instead of skipping quietly.
4. **An existing pattern** that already covers this cleanly, if one does.

Whichever is chosen must keep the ownership line intact: the canonical template
owns *that a component is part of a branch*; the contractor owns *the actual
product, price and economics*.

## Evidence

Reproduced on a fresh production-descended Neon branch
(`ep-delicate-bird-aycd7vp1`, lineage `7679066014247993703`) during the Plumbing
V1 two-contractor rehearsal, with both incumbent tenants present.

`scripts/rehearse-plumbing-two-contractor.ts` now creates contractor components
before provisioning and passes 106/106. **That is a harness accommodation to the
current ordering rule, not evidence the rule is right** — and it is exactly the
accommodation every future trade would otherwise have to rediscover.

## Scope

Not blocking Plumbing V1 pilot-hardening: the final proof exercises the real
ordering and every Plumbing promise is green.

It should be resolved before the general claim *"any new trade can be added to a
brand-new contractor with no prior configuration"* is considered finished,
because that is precisely the case it breaks.
