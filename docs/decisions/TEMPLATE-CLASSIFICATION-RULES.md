# Classifying trade content — physical fact, configurable policy, contractor economics

Extraction is classification, not copying. Every value in a contractor's catalogue sits in
exactly one of three layers, and which layer it sits in determines whether it enters the
template, enters as a configurable slot, or does not enter at all.

Written while resolving the electrical catalogue, but deliberately trade-agnostic: plumbing
and HVAC will meet the same questions, and should not have to answer them again from scratch.

---

## The three layers

**1. Physical fact.** True of the work regardless of who performs it. A 12-foot ceiling needs
different equipment than an 8-foot one. A 240 V circuit needs two poles. A ceiling fan needs a
fan-rated box. → **Enters the template as canonical content.**

**2. Configurable policy.** Where a contractor draws a line across a physical continuum, or
what they include before charging more. Included run length, distance bands, who supplies the
part, what counts as "standard access". → **The template holds the structure; the contractor
holds the position.** The template says *there is an included run length*; it never says 25 feet.

**3. Contractor economics.** Prices, labor hours, material costs, multipliers, price
modifiers. → **Never in the template.** Not as `0`, not as a placeholder, not as a default.

---

## Tests, in the order they resolve things

### The two-contractor test
Would two competent contractors in the same trade *necessarily* agree?

- Necessarily agree → physical fact.
- Could reasonably differ → policy.
- Would compete → economics.

### The continuum test
This is the one that does the most work, and the one a machine can nearly apply on its own.

- A value that is a **boundary on a continuum** — feet, minutes, dollars, square footage — is
  **policy**. Somebody chose where to cut. `25 feet`, `10 to 20 feet`, `more than 50 feet`.
- A value that is a **discrete standardized rating** drawn from a code, spec or product
  standard is **physical fact**. `15 amp`, `20 amp`, `120 volt`, `240 volt`, `200 amp service`.
  Nobody chose these; the NEC and the manufacturers did.

Both look like "a number with a unit", which is why a naive detector flags them together and
why the detector must stay fail-closed. The distinction is *who chose the number*.

### The equipment-breakpoint exception
A boundary on a continuum is a physical fact when it coincides with a real equipment limit
rather than a pricing preference. A 6-foot ladder reaches an 8-foot ceiling; past roughly 12
feet the job wants a lift or scaffold. Where a band boundary tracks equipment, it is canonical.

Where bands subdivide **more finely than equipment requires**, the extra subdivision is the
contractor's pricing granularity, not the trade's. Splitting 9–10 from 11–12 does not change
what you stand on; it changes what you charge.

### The identity test — for who supplies the part
- If the supply arrangement **distinguishes one service from another in the catalogue**, it is
  part of that service's identity and canonical. "Customer-supplied smart switch" is a real,
  universal way to structure a trade catalogue.
- If it is a passing statement of **how this contractor prefers to work**, it is policy.
  "We supply the fan" is Elite choosing to stock fans.

### The product test
A specific product a contractor stocks and resells is economics. The **slot it fills** is
canonical. The template keeps "add a tilting wall mount"; it does not keep whose mount.

### The mouth test
If canonicalizing would put words in a contractor's mouth they have not approved — a promise,
an exclusion, a guarantee, a scope limit — refuse. This is the backstop when the other tests
are ambiguous, and it is why the extractor fails loudly rather than generalizing.

---

## Three ways a refusal gets resolved

Not every refusal needs authored text. Recognising which kind you have is most of the work.

**a. Teach the classifier.** The value was canonical all along and the detector was being
appropriately careful. The fix is a rule in `scripts/_extractCore.ts`, so the next trade never
asks again. *Standardized electrical ratings are canonical* is one rule that retired five
refusals here and will retire every amperage and voltage in every future electrical catalogue.

**b. Author the wording.** The value genuinely is business-specific and Price2Book must
deliberately decide what it says universally. Goes in the trade's wording manifest with a
`reason`. This is real product work and should stay visible as such.

**c. Structure it as policy, or exclude it.** The value does not belong in the template at all,
or belongs only as a slot the contractor fills. *Not everything needs a canonical equivalent* —
an included run length correctly becomes "requires contractor configuration" rather than an
invented universal number.

A refusal resolved by (a) leaves the manifest untouched. Resist the temptation to write a
manifest entry whose authored value equals the source — that records a decision that was never
made and hides the rule that should have been encoded.
