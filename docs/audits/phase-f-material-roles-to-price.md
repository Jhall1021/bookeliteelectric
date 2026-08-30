# Phase F — 23 roles awaiting an Elite cost

> **Partly superseded — 29 August 2026, evening.** The 18 costs below are
> loaded. Three roles here were retired and replaced after the NEMA and LED
> architecture decisions. **The current outstanding list is at the bottom of
> this file, under "Still to price".**


**29 August 2026.** All 23 exist in the canonical library now, active, with no
cost for anyone. Elite's library stands at **68 roles: 45 priced, 23 awaiting**.

**A correction to my last report.** I called this "17 roles" while listing 20 in
the table underneath. The real figure is 20, plus 3 from splitting the
double-pole breaker, so **23**. The list below is the accurate one.

Nothing can misprice while these are empty. A role with no contractor cost
makes any service reaching it resolve *unpriced* rather than cheap — so the
roles being created ahead of the figures is safe, and Phase F stops here on
purpose.

---

## How to enter a cost

The system wants **the package you actually buy**, not a unit cost you worked
out. It derives the unit itself:

```
unitCostMilliCents = round(packagePriceCents * 1000 / packageQuantity)
unitCostCents      = round(unitCostMilliCents / 1000)
```

Storing the package is what lets a rounding artifact and a real price rise stay
distinguishable a year from now, and what makes the admin's figure match the
invoice in your hand. So for `WIRE_6_3`, enter *"$189.00 for a 125 ft roll"* —
not *"$1.51/ft"*.

Milli-cents give three decimals on a cent and a ceiling past $21,000, so a
$400 panel is nowhere near a limit.

**Keep the canonical layer clean.** The role is the job the material does. The
retailer, brand, model and SKU belong on the contractor's supplier link, never
in the key, the name or the notes. `WIRE_6_3` is a role; `SOUTHWIRE_125FT_6_3`
is a product wearing a role's clothes.

---

## The 23

`qty` is what the standard package consumes, so you can sanity-check a cost
against what it does to the job total.

### Video doorbell — 1 role

| role | unit | what to price | qty |
|---|---|---|---|
| `WIRE_BELL_18_2` | ft | 18/2 solid low-voltage bell wire. Sold in 50/100/500 ft coils. Not NM-B. | 25 |

This is the only thing standing between `new-video-doorbell-wiring` and a
derived price — the other two roles it needs are already priced.

### Under-cabinet lighting — 2 roles

| role | unit | what to price | qty |
|---|---|---|---|
| `LED_UNDERCABINET_BAR` | ft | Hardwired linkable LED bar/strip, priced per linear foot so a 1-run and a 3-run kitchen share the role. Excludes the driver. | 12 |
| `LED_DRIVER` | each | Low-voltage driver sized to the total run. One per install, not one per bar. | 1 |

### 240V garage outlet — 4 roles

| role | unit | what to price | qty |
|---|---|---|---|
| `RECEPTACLE_240V_30A` | each | NEMA 6-30 or 14-30 shop receptacle. Not the laundry `RECEPTACLE_DRYER_30A`. | 1 (30 A) |
| `RECEPTACLE_240V_50A` | each | NEMA 6-50 or 14-50 welder receptacle. Not the kitchen `RECEPTACLE_RANGE_50A`. | 1 (50 A) |
| `BOX_SURFACE_4S` | each | 4″ square metal surface box for an exposed wall. | 1 |
| `WIRE_10_3` | ft | 10/3 NM-B w/ ground. Sold in 25/50/125 ft. | 25 (30 A) |

The 50 A variant also uses `WIRE_6_3` below.

### Hot tub / spa — 4 roles

| role | unit | what to price | qty |
|---|---|---|---|
| `SPA_PANEL_GFCI_50A` | each | Outdoor 50 A disconnect with integral GFCI. The single most expensive part in this package. | 1 |
| `WIRE_6_3` | ft | 6/3 NM-B w/ ground. Sold in 125 ft rolls. Also used by the 50 A garage outlet. | 25 |
| `CONDUIT_PVC_1` | ft | 1″ rigid PVC, sold in 10 ft lengths. | 25 |
| `CONDUIT_FITTINGS_1` | set | Couplings, straps, connectors and glue for one run. Priced as a set because nobody counts them. | 1 |

### Generator inlet + interlock — 3 roles

| role | unit | what to price | qty |
|---|---|---|---|
| `GENERATOR_INLET_BOX_30A` | each | Weatherproof exterior inlet, typically L14-30. | 1 |
| `INTERLOCK_KIT` | each | **Varies most by brand of any role here** — a listed kit for one panel make/model. If the spread is wide, price the brands the standard package covers and let the rest go to review. That is a scope decision, and it is yours. | 1 |
| `WIRE_10_3` | ft | (as above) | 10 |

### Panel replacement — 4 roles

| role | unit | what to price | qty |
|---|---|---|---|
| `PANEL_MAIN_BREAKER` | each | Like-for-like main-breaker load centre at the existing amperage. Excludes branch breakers. | 1 |
| `GROUND_ROD` | each | 8 ft copper-clad electrode. | 2 |
| `GROUND_CLAMP` | each | Acorn or water-pipe clamp. | 2 |
| `WIRE_GROUND_6` | ft | 6 AWG bare copper. | 15 |

### 200 A service upgrade — 4 roles (plus the four above)

| role | unit | what to price | qty |
|---|---|---|---|
| `PANEL_200A_MAIN_BREAKER` | each | 200 A main-breaker load centre. Separate from the replacement panel on purpose: an upgrade is a different product and the two must price apart. | 1 |
| `METER_SOCKET_200A` | each | Utility-approved 200 A meter enclosure. | 1 |
| `SERVICE_ENTRANCE_CABLE_200A` | ft | SER or SE-U for 200 A, socket to load centre. | 20 |
| `WIRE_GROUND_6` | ft | (as above) | 25 |

### Breakers, now split by amperage — 3 roles

| role | unit | what to price | used by |
|---|---|---|---|
| `BREAKER_DOUBLE_POLE_20A` | each | Standard 2-pole 20 A. | whole-house surge device |
| `BREAKER_DOUBLE_POLE_30A` | each | Standard 2-pole 30 A. | generator backfeed, 30 A garage outlet |
| `BREAKER_DOUBLE_POLE_50A` | each | Standard 2-pole 50 A. | spa disconnect feed, 50 A garage outlet |

A spa's ground-fault protection lives in the disconnect panel, so the breaker
feeding it is a standard one. A 2-pole 50 A **GFCI** breaker is a genuinely
different part and would be its own role if a package ever needs one.

---

## One decision that comes with the breaker split

`BREAKER_DOUBLE_POLE` — the original, at **$18.00, with no amperage in it** —
is still used by two published services:

| service | published | recipe |
|---|---|---|
| `whole-house-surge-protection` | $600 | `SURGE_PROTECTOR_WHOLE_HOUSE ×1`, `SURGE_TRIM_KIT ×1`, `BREAKER_DOUBLE_POLE ×1` |
| `double-pole-breaker-replacement` | $280 | `BREAKER_DOUBLE_POLE ×1`, `CONSUMABLES_SMALL ×1` |

I have **not** migrated either. Both are correct today and moving them would
change their material cost, and so their suggested price, before you have set
the new figures.

- **Surge protection** is unambiguous: that device takes a 2-pole 20 A, so it
  should move to `BREAKER_DOUBLE_POLE_20A` once that has a cost. If your 20 A
  cost is near $18 the suggested price barely moves; if it is $12 the model
  will want $595 against a published $600, which is inside the $5 rounding
  band and a non-event.
- **Breaker replacement** is the real question. The service replaces *whatever
  2-pole breaker the customer has*, which could be 20 A to 50 A — so a single
  generic role is arguably right for it, and it may be the one legitimate home
  for `BREAKER_DOUBLE_POLE`. The alternative is to bound the service ("standard
  20–30 A 2-pole") and send the rest to review, which is the same scope-first
  move as everywhere else. Your call; it does not block Phase F.

---

## What unblocks when

| package | roles needed | still missing after your pass |
|---|---|---|
| `new-video-doorbell-wiring` | 3 | none — **first to derive** |
| `under-cabinet-led-lighting` | 7 | none |
| `240v-garage-outlet` | 6 | none |
| `generator-inlet-interlock` | 5 | none |
| `hot-tub-spa-electrical` | 6 | none |
| `electrical-panel-replacement` | 6 | crew-hours still provisional at 6 h |
| `200a-service-upgrade` | 10 | crew-hours still provisional at 8 h |

The two panel services will derive a price once the roles are costed, and the
figure will be reportable — but per your decision they stay provisional, and
neither gets published on a back-solve from $3,995 or $4,995.

Rate and minimum are back at **$250/$250**, so every derived figure will be
consistent with the 57 published prices around it.


---

# Still to price — 10 roles

**29 August 2026, evening.** Library: **73 canonical roles · 63 priced · 10
awaiting.** Same rule — enter the package you buy, not a unit cost.

## 240V garage outlet — split by NEMA configuration

`RECEPTACLE_240V_30A` and `RECEPTACLE_240V_50A` are **retired**. Each straddled
a physical difference: a 6-30 has no neutral, a 14-30 does, and one role
covering both meant the recipe silently chose 3-conductor cable for every job.

| role | unit | what to price |
|---|---|---|
| `RECEPTACLE_6_30` | each | NEMA 6-30, 3-prong 30A. Two hots and a ground |
| `RECEPTACLE_14_30` | each | NEMA 14-30, 4-prong 30A. Adds a neutral |
| `RECEPTACLE_6_50` | each | NEMA 6-50, 3-prong 50A — the classic welder outlet |
| `RECEPTACLE_14_50` | each | NEMA 14-50, 4-prong 50A |
| `WIRE_10_2` | ft | 10/2 NM-B. Feeds a 6-30 |
| `WIRE_6_2` | ft | 6/2 NM-B. Feeds a 6-50 |

`WIRE_10_3` ($4.48/ft) and `WIRE_6_3` ($3.97/ft) are already costed and feed the
4-wire half of each pair.

**The tree that consumes them**, as decided:

```
amperage?              30A  /  50A  /  not sure -> review
prongs on the plug?    3    /  4    /  not sure -> photo review

  30A + 3-prong  ->  RECEPTACLE_6_30  + WIRE_10_2
  30A + 4-prong  ->  RECEPTACLE_14_30 + WIRE_10_3
  50A + 3-prong  ->  RECEPTACLE_6_50  + WIRE_6_2
  50A + 4-prong  ->  RECEPTACLE_14_50 + WIRE_6_3
```

## Under-cabinet lighting — architecture B

`LED_UNDERCABINET_BAR` is **retired**. It was denominated per foot, which is how
tape is sold, while the products surveyed were integrated fixtures counted each
— the role had already answered a question nobody had asked.

| role | unit | what to price |
|---|---|---|
| `LED_TAPE` | ft | Warm-white high-CRI tape, cut to length. No driver, no housing |
| `LED_CHANNEL_DIFFUSER` | ft | Aluminium extrusion and lens the tape mounts into |
| `LED_DRIVER` | each | One hardwired driver sized to the run |

**Standard package**: up to 12 linear feet, **one continuous run**, usable
existing 120V power nearby, one driver, normal wood cabinetry, normal access.
Review for multiple separated runs · no usable power · masonry or tile drilling
beyond normal penetrations · a driver with difficult access · RGB,
tunable-white or smart control · unusually deep or high cabinetry · over 12 ft.

**Labour revised 2.5 h → 4.0 h.** Cutting tape, mounting channel, concealing a
driver and making the low-voltage connections is materially more work than
screwing up three bar fixtures. Provisional; it will be derived through the
engine and compared against the old $1,200–$1,800 calibration, never
back-solved to it.

## Spa

| role | unit | what to price |
|---|---|---|
| `CONDUIT_FITTINGS_1` | set | Couplings, straps, connectors and glue for one 1″ run |

The only thing between the spa package and a derived price.

## Before publishing garage or spa

`WIRE_10_3` at $4.48/ft and `WIRE_6_3` at $3.97/ft are the largest single lines
in those two packages, and copper is high. **Recheck the supplier package prices
before either goes public.** Development proceeds on the current confirmed
figures; publication waits.
