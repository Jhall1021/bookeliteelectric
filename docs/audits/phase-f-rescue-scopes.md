# Phase F — the seven rescue services

**29 August 2026.** Scope first, economics second, public price third. This
document is steps 1 and 2 complete for all seven, step 3 specified and blocked,
step 4 blocked twice.

Nothing here is written to the database. A scope is a promise about what a
price covers, and it should be read before it is enforced.

---

## Two blockers found before any scope was drawn

### 1. The material roles these services need do not exist

Elite's canonical library is **45 roles, all priced** — there are no
exists-but-unpriced roles waiting to be filled in. Every one of the seven needs
at least one role that is not in the library, and five need several. The exact
list is at the end of this document.

This is what "economics second" is for. Had the order been reversed, each of
these would have been given a lump-sum material allowance — which is precisely
the `addMaterialCostCents`-as-a-dollar-amount antipattern the v1.1 audit was
written to find.

### 2. The pricing settings changed today, and the catalogue has not

`PricingSettings` for Elite was updated at **21:47 UTC today**:

| | was | now |
|---|---|---|
| crew-hour rate | $250.00 | **$150.00** |
| service-call minimum | $250.00 | **$290.00** |
| rounding | $5 | $5 |

No code in this repository writes those values — `seed-pricing-settings.ts`
sets $250/$250 and deliberately never overwrites a rate an admin has changed.
The admin pricing-settings API is the only other writer. So this reads as a
deliberate owner change, and **it has not been undone.**

It is also internally coherent, which is why it does not look like a slip: a
lower hourly with a higher trip charge is a normal restructure. But only the
settings moved. Against the new model, **111 published price points now
disagree with Elite's own stated economics**:

```
price would RISE : 36     short jobs, floored by the new $290 minimum
price would FALL : 75     longer jobs, at the lower hourly
range            : -$250 to +$45

Dedicated Circuit & Outlet              $685 -> $435   -250
New Exterior Flood or Camera Location   $705 -> $455   -250
Replace Interior Light Fixture          $250 -> $295    +45
```

**This blocks step 4 for all seven.** Deriving a starting price now would put
the new packages 20–40% below the published services they sit next to: a 2.5-hour
garage outlet would derive around $375 beside a published $685 dedicated
circuit that is nearly the same work. The packages would be internally correct
and externally absurd.

Three ways forward, and it is not my call:

1. **The restructure is intended** → reprice the catalogue to the new model
   first, then derive the seven into a consistent book.
2. **The restructure is intended, phased** → derive the seven at the new model
   and accept a mixed book until the rest follows.
3. **It was exploratory** → restore $250/$250 and derive at the old model.

Until then, every price below is expressed as a formula, not a number.

---

## The seven

Crew-hours are **proposals grounded in comparables**, not measured figures.
§3.1 forbids inventing hours to fill a gap; proposing a bounded scope's hours
for owner confirmation is the legitimate route to establishing them, and each
one below names what it was reasoned from.

---

### 1. `240v-garage-outlet` — 240V Garage Outlet

*For equipment other than an EV charger: welder, compressor, dust collector.*

**Standard scope.** One 240V receptacle in an attached garage, on an exposed or
unfinished wall, fed from a panel **in that same garage**, run **within 25 ft**,
surface-mounted or through a single open stud bay. Two adjacent breaker spaces
free. 30 A or 50 A.

**Disqualifying → review.** Finished or insulated wall needing a fish · run over
25 ft · panel outside the garage · fewer than two adjacent spaces free ·
detached garage · any trenching or underground · masonry or conduit through
block · load calculation showing insufficient capacity · subpanel required.

**Questions.** (1) Is your electrical panel in the same garage? (2) Is the wall
where the outlet goes open framing, or finished? (3) What does the equipment
call for — 30 A, 50 A, not sure? (4) Photo: the panel with its cover on, and
the wall where the outlet goes.

**Crew-hours.** **2.5 h** standalone. Reasoned from `dedicated-120v-circuit-outlet`
(2.5 h, 50 ft of 14/2, finished-wall routing): this run is shorter and mostly
exposed, but the conductor is far heavier to pull and terminate and the
receptacle is a larger device. Those cancel to about the same figure.

**Material recipe.** `BREAKER_DOUBLE_POLE ×1` ✅ · `CONSUMABLES_MEDIUM ×1` ✅ ·
**`RECEPTACLE_240V_50A ×1`** ❌ · **`WIRE_6_3 ×25` or `WIRE_10_3 ×25`** ❌ ·
**`BOX_SURFACE_4S ×1`** ❌

**Derived price.** Blocked — 3 roles missing, and the settings question.
Formula: `2.5h × rate` (floored) `+ material × 1.3`, rounded up to $5.

**Historical.** None. Quote-only since the original seed.

**Public when?** Needs owner approval of the 2.5 h and of the amperage the
standard package covers.

---

### 2. `hot-tub-spa-electrical` — Hot Tub / Spa Electrical

**Standard scope.** Tub already set on its pad. One 50 A GFCI spa disconnect
mounted on the exterior wall, in sight of the tub and at least 5 ft from it, fed
from the main panel **within 25 ft**, run in **surface conduit on the exterior
wall**. Two adjacent spaces free and capacity for 50 A.

**Disqualifying → review.** Any trenching or underground run · tub not yet
placed · run over 25 ft · interior finished-wall routing · panel full or short
of capacity · subpanel required · 60 A tubs · pad or structure work · anything
needing a load calculation.

**Questions.** (1) Is the tub already in place? (2) How far is your panel from
it — under 25 ft, more, not sure? (3) Does the wiring need to cross a lawn,
patio or driveway? (4) What does the tub's plate call for — 50 A, 60 A, not
sure? (5) Photos: the panel with cover on, the tub location, the wall between
them.

**Crew-hours.** **4.0 h** standalone. Reasoned from `exterior-gfci-standard`
(1.5 h for one exterior device on a short run) scaled for a 50 A circuit, a
mounted disconnect enclosure, a conduit run and bonding. Not derived from the
seed's 120 min, which predates any scope model.

**Material recipe.** `CONSUMABLES_MEDIUM ×1` ✅ · **`SPA_PANEL_GFCI_50A ×1`** ❌ ·
**`WIRE_6_3 ×25`** ❌ · **`CONDUIT_PVC_1 ×25`** ❌ · **`CONDUIT_FITTINGS_1 ×1`** ❌ ·
**`BREAKER_DOUBLE_POLE_50A ×1`** ⚠️ (`BREAKER_DOUBLE_POLE` exists at $18 but is
not amperage-specific — a 50 A breaker is not an $18 part)

**Derived price.** Blocked — 4 roles missing, 1 ambiguous, plus settings.

**Historical.** None.

**Public when?** Needs owner approval of 4.0 h and confirmation that the
no-trenching boundary matches what Elite actually sells.

---

### 3. `generator-inlet-interlock` — Generator Inlet + Interlock

**Standard scope.** A 30 A (L14-30) power inlet box on an exterior wall **within
10 ft** of the main panel, a **listed interlock kit for that panel's make and
model**, a 2-pole 30 A backfeed breaker in the top position, surface run. Main
breaker at the top of the panel with two adjacent spaces free beneath it.

**Disqualifying → review.** No listed interlock exists for the panel · main
breaker not at the top · fewer than two adjacent top spaces free · inlet more
than 10 ft away · generator over 30 A / 7500 W · customer wants a transfer
switch instead (a different, now-hidden service) · trenching · panel replacement
needed first.

**Questions.** (1) Photo of the panel with the cover **off** — required, because
the interlock is make-and-model specific and no other answer establishes it.
(2) Photo of the panel label/brand. (3) Where would the generator sit, and how
far is that from the panel? (4) What is the generator's outlet — L14-30, other,
not sure?

**Crew-hours.** **3.0 h** standalone. The seed's 180 min agrees, and unlike the
others it is plausible on its face: mount inlet, drill, run 10 ft, fit
interlock, install breaker, test under load.

**Material recipe.** `CONSUMABLES_MEDIUM ×1` ✅ · **`GENERATOR_INLET_BOX_30A ×1`** ❌ ·
**`INTERLOCK_KIT ×1`** ❌ · **`WIRE_10_3 ×10`** ❌ · **`BREAKER_DOUBLE_POLE_30A ×1`** ⚠️

**Derived price.** Blocked — 3 roles missing, 1 ambiguous, plus settings.

Note: `INTERLOCK_KIT` prices vary by panel brand ($60–$150). If that spread is
real, the standard package covers the common brands and the rest routes to
review — a scope decision, not a pricing one.

**Historical.** None.

**Public when?** Needs owner approval of 3.0 h and of which panel brands the
standard package covers.

---

### 4. `200a-service-upgrade` — 200-Amp Service Upgrade

**Standard scope.** Single-family, **overhead** service. Existing 100 A or 125 A
replaced with 200 A. **Meter socket and panel both stay where they are, on the
same wall.** Up to 30 existing branch circuits relanded and labelled. Two ground
rods and a water bond. Permit and utility coordination included as a fixed
allowance.

**Disqualifying → review.** Underground service · meter or panel relocating ·
mast, riser or weatherhead damage · any subpanel · aluminium branch wiring ·
knob-and-tube · more than 30 circuits · load calculation calling for more than
200 A · service entrance through finished space · anything structural.

**Questions.** (1) Photos: the meter from outside, the mast/weatherhead, the
panel with cover on, the panel with cover off. (2) Is the service overhead or
underground? (3) Are the meter and panel staying where they are? (4) Roughly how
many breakers are in the panel now?

**Crew-hours.** **8.0 h proposed — and this is the one figure I do not believe.**
The seed records 480 min. But the historical price was **$4,995**, and 8 crew-hours
at the *old* $250 rate is $2,000 of labour; even generous service-equipment
material does not close a $3,000 gap. Either the real figure is 14–16 crew-hours,
or two vans were assumed, or $4,995 carried margin the model never saw. **Do not
publish this until an actual job is measured.**

**Material recipe.** **`PANEL_200A_MAIN_BREAKER ×1`** ❌ · **`METER_SOCKET_200A ×1`** ❌ ·
**`SERVICE_ENTRANCE_CABLE_200A ×20`** ❌ · **`GROUND_ROD ×2`** ❌ ·
**`GROUND_CLAMP ×3`** ❌ · **`WIRE_GROUND_6 ×25`** ❌ · `BREAKER_SINGLE_POLE ×20` ✅ ·
`CONSUMABLES_MEDIUM ×1` ✅ · permit as `permitAdminCents`, not a material

**Derived price.** Blocked — 6 roles missing, hours unconfirmed, plus settings.

**Historical.** **$4,995** (`prisma/seed.ts`, cleared 23 Aug because it had no
crew-hours behind it).

**Public when?** Not soon. Needs measured hours from a real job, six material
roles, and a permit allowance. The most honest interim answer for this service
is a starting price with an explicit "from" framing, or continued quote-only —
and quote-only for a service upgrade is defensible in a way it is not for a
garage outlet.

---

### 5. `electrical-panel-replacement` — Electrical Panel Replacement

**Standard scope.** Same amperage, **same location**, existing service
conductors and meter reused. Up to 30 branch circuits relanded and labelled.
Grounding and bonding brought to current code. Permit included.

**Disqualifying → review.** Amperage changing (that is the service upgrade) ·
panel relocating · service conductors too short to reland · aluminium branch
wiring · knob-and-tube · more than 30 circuits · federal-pacific or Zinsco
requiring extra remediation · any meter or utility work.

**Questions.** As the service upgrade, minus the meter and mast photos, plus:
is the panel staying in exactly the same spot?

**Crew-hours.** **6.0 h proposed**, and the same doubt applies: the seed says
360 min, the historical price was **$3,995**, and 6 h at the old rate is $1,500
of labour. Same three explanations, same recommendation.

**Material recipe.** **`PANEL_MAIN_BREAKER ×1`** ❌ · **`GROUND_ROD ×2`** ❌ ·
**`GROUND_CLAMP ×2`** ❌ · **`WIRE_GROUND_6 ×15`** ❌ · `BREAKER_SINGLE_POLE ×20` ✅ ·
`CONSUMABLES_MEDIUM ×1` ✅

**Derived price.** Blocked — 4 roles missing, hours unconfirmed, plus settings.

**Historical.** **$3,995**.

**Public when?** Same answer as the service upgrade.

---

### 6. `new-video-doorbell-wiring` — New Video Doorbell Wiring

*A doorbell where there is no existing doorbell wiring or transformer.*

**Standard scope.** Front door, **customer supplies the doorbell**. A
transformer installed at an existing junction box or a panel knockout, and
18/2 bell wire fished **within 25 ft** through an **accessible attic, basement
or crawlspace**. Wood, vinyl or fibre-cement siding or a standard wood frame.

**Disqualifying → review.** Brick, stucco or stone drilling · no accessible
attic, basement or crawlspace (slab with finished ceilings) · run over 25 ft ·
second storey with no access above · customer wants an interior chime added ·
existing chime to be reused but not found.

**Questions.** (1) Is there an attic, basement or crawlspace above or below the
door? (2) What is the door surrounded by — wood/vinyl/fibre cement, or brick/
stucco/stone? (3) Do you want an indoor chime as well? (4) Are you supplying the
doorbell? (5) Photo of the doorway from outside.

**Crew-hours.** **2.0 h** standalone. Reasoned from `video-doorbell-existing-wiring`
(0.75 h — mount and connect only) plus `doorbell-transformer-replacement`
(1.0 h — transformer work), plus the fish that neither includes. The seed's
60 min describes the first of those three, not the job.

**Material recipe.** `DOORBELL_TRANSFORMER ×1` ✅ ($12) · `CONSUMABLES_SMALL ×1` ✅
($3) · **`WIRE_BELL_18_2 ×25`** ❌

**Derived price.** Blocked on **one role**, plus the settings question. This is
the closest of the seven to shippable: `2.0h × rate + (12 + 3 + 25×bell) × 1.3`.

**Historical.** None.

**Public when?** As soon as `WIRE_BELL_18_2` has a cost and the rate question is
settled. Owner approval of 2.0 h recommended but the reasoning is tight.

---

### 7. `under-cabinet-led-lighting` — Professional LED Under-Cabinet Lighting

**Standard scope.** One kitchen, **up to 3 cabinet runs and up to 12 linear
feet** of hardwired LED bar, driver concealed under a cabinet, powered from an
existing circuit reached through a **single stud bay** from an outlet or switch
below, controlled by **one** switch or LED dimmer at an existing or one new box.

**Disqualifying → review.** Tiled backsplash already installed · plaster walls ·
no accessible outlet or circuit below the cabinets · more than 3 runs or more
than 12 ft · smart or scene control · under-cabinet receptacles · open-shelving
or glass-front cabinets needing concealment work · anything above a peninsula
with no wall behind it.

**Questions.** (1) How many separate cabinet runs need light? (2) Roughly how
many feet in total — under 12, more, not sure? (3) Is the backsplash tiled
already? (4) Is there an outlet or switch on the wall below the cabinets?
(5) Photo of the kitchen showing the cabinets and the wall beneath them.

**Crew-hours.** **2.5 h** standalone. Reasoned from `recessed-lighting`
(1.25 h for the first light including a 25 ft home run) doubled for three
separate runs of concealed bar, a driver, and a switch leg through a stud bay.
The seed's 120 min is close and was reached independently.

**Material recipe.** `DIMMER_LED ×1` ✅ ($30) · `BOX_OLD_WORK ×1` ✅ ·
`WALL_PLATE ×1` ✅ · `WIRE_14_2 ×25` ✅ · `CONSUMABLES_SMALL ×1` ✅ ·
**`LED_UNDERCABINET_BAR ×12`** ❌ (per ft) · **`LED_DRIVER ×1`** ❌

**Derived price.** Blocked on **two roles**, plus settings.

**Historical.** None. Displays "Custom Quote" today — the only one of the seven
with a deliberate label rather than a fallback.

**Public when?** After the two LED roles land. 2.5 h is well-grounded.

---

## The material roles Phase F needs

Named per `docs/MATERIAL-SUPPLIER-CATALOG.md`: a role names the **job the
material does**, never a brand, model, SKU or package size. **17 new roles**,
plus 2 existing roles that need an amperage decision.

| role | unit | needed by |
|---|---|---|
| `WIRE_BELL_18_2` | ft | video doorbell |
| `LED_UNDERCABINET_BAR` | ft | under-cabinet |
| `LED_DRIVER` | each | under-cabinet |
| `RECEPTACLE_240V_30A` | each | garage outlet |
| `RECEPTACLE_240V_50A` | each | garage outlet |
| `BOX_SURFACE_4S` | each | garage outlet |
| `WIRE_10_3` | ft | garage outlet, generator |
| `WIRE_6_3` | ft | garage outlet, spa |
| `SPA_PANEL_GFCI_50A` | each | spa |
| `CONDUIT_PVC_1` | ft | spa |
| `CONDUIT_FITTINGS_1` | set | spa |
| `GENERATOR_INLET_BOX_30A` | each | generator |
| `INTERLOCK_KIT` | each | generator |
| `PANEL_MAIN_BREAKER` | each | panel replacement |
| `PANEL_200A_MAIN_BREAKER` | each | service upgrade |
| `METER_SOCKET_200A` | each | service upgrade |
| `SERVICE_ENTRANCE_CABLE_200A` | ft | service upgrade |
| `GROUND_ROD` | each | both panel services |
| `GROUND_CLAMP` | each | both panel services |
| `WIRE_GROUND_6` | ft | both panel services |

**Ambiguous existing roles.** `BREAKER_DOUBLE_POLE` is one role at $18 with no
amperage. A 30 A backfeed breaker and a 50 A spa breaker are not the same part
and not the same price. Either the role splits by amperage, or $18 is wrong for
some of its current uses. This affects `double-pole-breaker-replacement`
(published $280) and should be decided before, not after, these packages
consume it.

---

## Status against the user's six steps

| step | state |
|---|---|
| 1. bounded standard scopes | **done** — all seven above |
| 2. labour | **done** — proposed with reasoning; two flagged as not believable |
| 3. materials | **specified, blocked** — 17 roles missing, 1 ambiguous |
| 4. derive starting prices | **blocked twice** — materials, and the settings change |
| 5. compare to historical | done where one exists: $4,995 and $3,995, both contradicting their recorded hours |
| 6. publish | **nothing published.** All seven remain under the §1.4 rescue allowlist |

EV charger untouched, as instructed — its scope-normalisation pass is separate.
