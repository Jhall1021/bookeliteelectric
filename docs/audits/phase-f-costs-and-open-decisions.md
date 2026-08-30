# Phase F — costs loaded, and two decisions before freezing

**29 August 2026.** 18 of 23 roles now carry an Elite cost. 5 are held, and
they are held on questions about *what the standard package is*, not what it
costs. The first package derives.

Library: **68 canonical roles · 63 priced · 5 awaiting.**

---

## Loaded

Package figures, not unit costs — the unit is derived and the package is kept,
so a rounding artifact and a real price rise stay distinguishable later.

| role | package entered | derived unit | confidence |
|---|---|---|---|
| `WIRE_BELL_18_2` | $19.81 / 100 ft | $0.20/ft | CONFIRMED |
| `WIRE_10_3` | $224.00 / 50 ft | $4.48/ft | CONFIRMED |
| `WIRE_6_3` | $496.00 / 125 ft | $3.97/ft | CONFIRMED |
| `WIRE_GROUND_6` | $54.00 / 50 ft | $1.08/ft | CONFIRMED |
| `CONDUIT_PVC_1` | $10.75 / 10 ft | $1.08/ft | CONFIRMED |
| `BOX_SURFACE_4S` | $2.67 each | $2.67 | CONFIRMED |
| `SPA_PANEL_GFCI_50A` | $129.00 each | $129.00 | CONFIRMED |
| `GENERATOR_INLET_BOX_30A` | $64.90 each | $64.90 | CONFIRMED |
| `GROUND_ROD` | $29.01 each | $29.01 | CONFIRMED |
| `GROUND_CLAMP` | $3.60 each | $3.60 | CONFIRMED |
| `METER_SOCKET_200A` | $104.00 each | $104.00 | CONFIRMED |
| `SERVICE_ENTRANCE_CABLE_200A` | $8.30 / ft | $8.30/ft | CONFIRMED |
| `BREAKER_DOUBLE_POLE_20A` | $18.24 each | $18.24 | CONFIRMED |
| `BREAKER_DOUBLE_POLE_30A` | $18.24 each | $18.24 | CONFIRMED |
| `BREAKER_DOUBLE_POLE_50A` | $18.24 each | $18.24 | CONFIRMED |
| `INTERLOCK_KIT` | $115.00 each | $115.00 | **ASSUMED** |
| `PANEL_MAIN_BREAKER` | $225.00 each | $225.00 | **ASSUMED** |
| `PANEL_200A_MAIN_BREAKER` | $275.00 each | $275.00 | **ASSUMED** |

`CONFIRMED` means read off a current listing. `ASSUMED` means chosen to
represent a class of parts — the interlock and both panels. A later reader can
tell which is which, which is the point of the field.

Brand evidence (Square D, Reliance, Homeline) lives on Elite's contractor rows,
never in a canonical key, name or note.

**Copper caveat, recorded on both cable rows.** $4.48/ft for 10/3 and $3.97/ft
for 6/3 are high, and they are the largest single lines in the garage and spa
packages. Worth a recheck before either is published.

### Interlock scope, decided

`INTERLOCK_KIT = $115` with the boundary written into the role's cost note:

> The standard package covers panels with a listed kit at a normal material
> cost. Specialty, obsolete, unsupported or unusually expensive panel-specific
> kits route to review.

Observed spread was roughly $54–$142. Not the cheapest, not an average of every
panel ever made.

### Breakers

All three ratings priced identically at $18.24 today — the old generic $18 was
very nearly right. Recorded separately anyway, because the reason for the split
was never that they differ *now*; it was that when they diverge, the divergence
should land on the packages that use each rating instead of hiding in an
average.

`whole-house-surge-protection` moved to `BREAKER_DOUBLE_POLE_20A`. Checked
before writing and **price-neutral**: material $218.00 → $218.24, sell +$0.31,
absorbed by the $5 rounding. Model stays $600 / $535, matching the published
pair.

`double-pole-breaker-replacement` keeps the generic role, as decided. That
service genuinely means "replace the 2-pole breaker already in your panel", and
a generic role is the honest model for a genuinely generic job.

---

## First package derived: `new-video-doorbell-wiring`

```
DOORBELL_TRANSFORMER  x1   @ $12.00/each  =  $12.00
WIRE_BELL_18_2        x25  @  $0.20/ft    =   $5.00
CONSUMABLES_SMALL     x1   @  $3.00/job   =   $3.00
                                             -------
direct material                               $20.00

2.0 crew-hours                               $500.00
material @ 1.30x                              $26.00
                                             -------
DERIVED STANDALONE                           $530.00
derived same-visit (1.75 h)                  $465.00
```

**Calibration.** There is no historical price for this service, so the check is
against its two neighbours:

| | price | hours |
|---|---|---|
| `video-doorbell-existing-wiring` | $250 | 0.75 h |
| `doorbell-transformer-replacement` | $270 | 1.0 h |
| **sum** | **$520** | **1.75 h** |
| `new-video-doorbell-wiring` derived | **$530** | 2.0 h |

New wiring is materially "mount the doorbell" plus "install a transformer",
plus a fish that neither of those includes. Two independent routes — one from
crew-hours and materials, one from adding two published neighbours — land $10
apart. That is the strongest calibration evidence available for a service that
has never carried a price.

**Not published.** The scope exists on paper; the *tree* does not. The service
still has a single "send photos" step, so nothing in the product yet routes
brick drilling or a slab-with-no-attic to review. Publishing $530 before those
questions exist would promise a price for jobs the scope explicitly excludes —
the chandelier failure inverted. Building the tree is the next step for this
one.

---

## Decision 1 — the 240V outlet is currently specified 4-wire, and its own
## description argues against that

Flagged before freezing, as asked. The recipe selects `WIRE_10_3` / `WIRE_6_3`
— **three conductors plus ground**, which means a neutral, which means NEMA
**14**-30 / 14-50.

The service describes itself as:

> "Adding a new 240V outlet in your garage for equipment other than an EV
> charger (welder, air compressor, etc.)."

A welder is classically **6-50**. A compressor is usually **6-30 or 6-50**.
Both are 2 hots and a ground, no neutral — 10/2 or 6/2 cable. So the named
equipment mostly does *not* want the configuration the recipe currently
implies, and the standard package is over-specified against its own copy.

Roughly what it costs to be wrong:

| | cable at 25 ft | vs 3-wire |
|---|---|---|
| 6/3 @ $3.97/ft | $99.25 | — |
| 6/2 (not yet a role) | ~$70 | ~$29 direct, ~$38 to the customer |
| 10/3 @ $4.48/ft | $112.00 | — |
| 10/2 (not yet a role) | ~$80 | ~$32 direct, ~$42 to the customer |

**You cannot standardise your way out of this.** A 4-wire receptacle does not
accept a 3-prong plug, so picking one configuration silently serves half the
customers wrongly. The configuration has to be established per job.

**Recommendation.** Split as you proposed — `RECEPTACLE_6_30`, `RECEPTACLE_14_30`,
`RECEPTACLE_6_50`, `RECEPTACLE_14_50` — add `WIRE_10_2` and `WIRE_6_2`, and add
one homeowner question:

> **How many prongs are on your equipment's plug — 3 or 4?**
> *(Not sure → review.)*

That is answerable by looking at the plug, which is the test for a good
qualifying question, and it selects both the receptacle and the cable. Two
questions total for this service then: amperage and prong count.

The four receptacles are cheap — a 6-30 is about $8.28 — so the device is not
the economics. The cable is.

---

## Decision 2 — under-cabinet lighting: which product architecture

Not priced, as instructed. Worth adding: **the role I created already encodes an
answer.** `LED_UNDERCABINET_BAR` is denominated **per foot**, which fits tape;
integrated fixtures come in 12″/18″/24″ units and are counted each. So the
current role is half-way between the two architectures and is wrong for at
least one of them.

**If A — linkable integrated bars:**
`LED_UNDERCABINET_BAR` should become `LED_UNDERCABINET_FIXTURE`, unit **each**,
priced by size class. `LED_DRIVER` is **deleted** — integrated fixtures carry
their own electronics. Retail is roughly $40–$55 per 24″ unit, so a 3-run
kitchen is ~$120–$165 of fixtures. Faster to install, less finish work.

**If B — tape in channel with a remote driver** (your preference, and mine):
one role is not enough. It wants roughly `LED_TAPE` (ft), `LED_CHANNEL_DIFFUSER`
(ft) and `LED_DRIVER` (each) — and the labor goes up, because cutting,
channel-mounting and concealing a driver is more work than screwing up three
bar fixtures. The 2.5 h in the scope document was reasoned against a
bar-fixture install and would need revisiting for B.

So this decision moves crew-hours as well as materials. I have not touched
either. Tell me A or B and I will research the correct system for it rather
than price a tape package from integrated-fixture listings.

---

## What unblocks when

| package | status |
|---|---|
| `new-video-doorbell-wiring` | **derived $530.** Needs its tree built before publishing |
| `generator-inlet-interlock` | all roles costed — ready to build |
| `electrical-panel-replacement` | all roles costed — ready to build, hours provisional at 6 h |
| `200a-service-upgrade` | all roles costed — ready to build, hours provisional at 8 h |
| `hot-tub-spa-electrical` | needs `CONDUIT_FITTINGS_1` |
| `240v-garage-outlet` | needs decision 1, then 4 receptacle roles and 2 cable roles |
| `under-cabinet-led-lighting` | needs decision 2, then roles and a labor revisit |

Rate and minimum are $250/$250. Catalogue reconciles at 2 unexplained
divergences (`new-coax-line`) plus 2 approved exceptions. 0 services moved,
271 distinct price points.
