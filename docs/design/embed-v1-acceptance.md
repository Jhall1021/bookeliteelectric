# Embed V1 — manual acceptance

**Why this is manual.** Browser automation cannot interact with a cross-origin
child frame: the accessibility tree stops at the frame boundary and synthetic
clicks do not reach it. The only ways to automate it would be to weaken
`frame-ancestors`, run the storefront same-origin with the parent, or drive a
browser with cross-origin isolation disabled — each of which tests something
other than the product. So the last mile is a person.

**What is already automated** (`npm run verify:embed`, 30 checks): real
cross-origin framing, per-contractor `frame-ancestors` including the fail-closed
cases, visit-token continuity and cross-tenant isolation, every route serving
under the embed base, no link escaping the surface, chrome suppression with the
hosted page asserted to keep its own, and the one-way height channel. The
customer journey is exercised end to end with the embed route driven directly.

**What this checklist adds:** the same journey with a real parent page in the
way, plus the refresh and navigation cases only a person can drive.

## Setup

1. A contractor with at least two live services, one of them carrying an add-on
   price so the same-visit path is reachable.
2. Register the test page's origin: Setup → Business → allowed embed origins,
   or `PATCH /api/admin/setup/embed-origins`.
3. A page on that origin with the snippet:
   ```html
   <div id="p2b"></div>
   <script src="https://price2book.com/embed.js" data-site="site_…" async></script>
   ```

## The journey

| # | Step | Expected |
| --- | --- | --- |
| 1 | Load the parent page | Embed appears inline, sized to its content. No second header, no hero, no duplicate business intro |
| 2 | Pick a service | Guided pricing opens inside the frame; the parent's URL does not change |
| 3 | Answer the questions | Real questions with the contractor's own band labels — no `{b1}` |
| 4 | Reach the outcome | A price, a review hand-off, or a diagnostic hand-off — whichever the tree gives |
| 5 | Add to visit | Cart affordance shows the item |
| 6 | Navigate back to the catalog | Still inside the frame, still on the parent's URL |
| 7 | Add a second eligible service | Offered only where it can actually be placed; refused combinations are never presented |
| 8 | My Visit | Both items, correct total |
| 9 | Availability | Real windows; none offered that checkout cannot honor |
| 10 | Checkout | Details form inside the frame |
| 11 | Complete a test booking | Confirmation inside the frame |

## During the flow

- [ ] **Refresh the iframe** mid-journey — the open visit survives
- [ ] **Refresh the parent page** mid-journey — the open visit survives
- [ ] **Back and forward** inside the frame — no dead ends, no escape
- [ ] **Second tab** on the same parent — a separate visit, because
      `sessionStorage` is per tab. Confirm this reads as intended rather than
      as a lost cart
- [ ] **Mobile viewport** — the frame resizes with the page; nothing scrolls
      inside the frame that should scroll the page
- [ ] **Never ejected to the hosted surface** — no URL, link or redirect leaves
      `/embed/<publicId>` for `/<slug>`

## Security cases

- [ ] Load the same snippet from an **unregistered origin** — the browser
      refuses the frame; the page shows an empty box rather than the storefront
- [ ] Tamper with the visit token in `sessionStorage` — the cart empties; no
      other visit is reachable
- [ ] Paste a token taken from **another contractor's** embed — nothing resolves
- [ ] Confirm the parent page cannot read the frame's storage or DOM

## Result

Record the date, contractor, parent origin, browser and outcome here. A failure
is a defect to report, not a reason to relax the origin allowlist or the token
rules.

_Not yet performed._


---

## Test-infrastructure debt

**Fixed throwaway slugs collide across workstreams.** Four verifiers create a
fixture under a constant slug:

| verifier | slug |
| --- | --- |
| `verify-activation-dependencies` | fixed → **now run-unique** |
| `verify-launch-behavior` | `test-launch-behavior` |
| `verify-policy-resolution` | `test-policy-refusal` |
| `verify-template-installation` | `test-template-install` |

In a shared worktree with parallel workstreams, two runs of the same verifier
race: the second run's teardown deletes the first run's fixture mid-assertion,
and the failure reads as a product defect. This happened once here — a failure
that passed on rerun, which is the worst kind, because it teaches everybody to
re-run past a real signal.

`verify-activation-dependencies` is fixed: the slug carries a per-run suffix,
and abandoned fixtures are swept by PREFIX **and age**, never by prefix alone —
sweeping every sibling would delete a concurrent run's live fixture, which is
the same collision reintroduced by the cleanup meant to prevent it. Proved with
two concurrent runs, both green, nothing left behind.

The other three are the identical one-file change and no product semantics are
involved. Opportunistic, not blocking.
