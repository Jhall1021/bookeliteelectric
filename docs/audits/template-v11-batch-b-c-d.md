# Template v1.1 — Phases B, C, D

Stopped before Phase E as instructed. Every conversion below is proved against
**269 distinct price points across 69 active services**: the outcome and price of
every resolvable path, captured before and after.

---

## Phase B — seven components converted, no price moved

Recipes now live on the canonical component; cost stays on `ContractorMaterial`.

| Component | Was | Now | At Elite's costs |
|---|---|---|---|
| `OUTLET_RUN_ACCESSIBLE_10_20` | $5.00 | `WIRE_14_2` ×10 | $5.00 |
| `OUTLET_RUN_FINISHED_10_20` | $5.00 | `WIRE_14_2` ×10 | $5.00 |
| `EXT_GFCI_RUN_ACCESSIBLE_10_20` | $7.20 | `WIRE_12_2` ×10 | $7.20 |
| `EXT_GFCI_RUN_FINISHED_10_20` | $7.20 | `WIRE_12_2` ×10 | $7.20 |
| `RECESSED_ADDITIONAL_ACCESSIBLE` | $38.00 | `RECESSED_WAFER` ×1 + `WIRE_14_2` ×10 + `CONSUMABLES_SMALL` ×1 | $38.00 |
| `RECESSED_ADDITIONAL_FINISHED` | $38.00 | same | $38.00 |
| `LED_DIMMER_UPGRADE` | $30.00 | `DIMMER_LED` ×1 | $30.00 |

`scripts/convert-component-recipes.ts` **refuses** to write any recipe that does not
reproduce the constant. Matching the dollar amount is the evidence the composition was
understood — not a target. All seven reconciled; none refused.

Legacy `addMaterialCostCents` is left in place. The recipe takes precedence, so it is
inert, and it stays a readable record of the constant plus a fallback if a recipe is
removed.

**Proof: 0 of 269 price points moved.**

### One consequence worth stating

For a contractor who has **not** costed a role, these services now fail closed to review
where the constant previously produced a price — Elite's constant, on someone else's
storefront. That is the §1.1 rule working, and it only bites contractors who do not yet
exist.

## Phase C — eleven consumables recipes, no price moved

`CONSUMABLES_SMALL` ×1 added to services that genuinely consume misc. material:
three fixture replacements, ceiling-fan replacement, video doorbell on existing wiring,
floodlight camera, and five appliance connections.

Not applied mechanically (§14): the thermostat and the owner-supplied bath fan keep their
deliberate zeros.

Published prices untouched. The cached `materialCostCents` was brought into line with the
new recipe, which moves the **suggested** price by $5 on each — every one of these
currently has published exactly equal to suggested, so the $5 is the whole divergence:

```
replace-interior-light-fixture   published $250.00   suggested $250.00 -> $255.00
replace-ceiling-fan              published $315.00   suggested $315.00 -> $320.00
otr-microwave-install            published $375.00   suggested $375.00 -> $380.00
install-new-microwave            published $500.00   suggested $500.00 -> $505.00
```

**Proof: 0 of 269 price points moved.**

### Two left for you (§6.2, §6.3 are conditional, not directive)

`tv-install-existing-location` and `soundbar-installation` — the handoff says "only if the
existing service promise assumes customer-supplied mount" and "if Elite normally supplies
basic fasteners". That is a question about what Elite actually supplies, so I have not
guessed. Both are $0 with no recipe today.

## Phase D — audited, nothing converted, and that is the finding

§4.5 says not to convert these by matching a dollar amount. Having looked, they **cannot**
be converted, and the reason is visible in the numbers:

| Role | Material | Labor | Attachments |
|---|---|---|---|
| `SWITCHLEG_ACCESSIBLE_UNDER_10` | $35.00 | 1h | 4 |
| `SWITCHLEG_ACCESSIBLE_10_20` | **$35.00** | 1.25h | 4 |
| `SWITCHLEG_FINISHED_UNDER_10` | $45.00 | 1.5h | 4 |
| `SWITCHLEG_FINISHED_10_20` | **$45.00** | 2h | 4 |
| `SWITCH_POWER_RUN_ACCESSIBLE` | $21.80 | 1h | 4 |
| `SWITCH_POWER_RUN_FINISHED` | **$21.80** | 1.5h | 4 |
| `CONVERT_SWITCHED_OUTLET_TO_LIGHTING_ACCESSIBLE` | $25.00 | 0.75h | 4 |
| `CONVERT_SWITCHED_OUTLET_TO_LIGHTING_FINISHED` | $35.00 | 1.25h | 4 |
| `NEW_SWITCH_AND_SWITCH_LEG_ACCESSIBLE` | $35.00 | 1h | **0** |
| `NEW_SWITCH_AND_SWITCH_LEG_FINISHED` | $45.00 | 1.5h | **0** |

**Material varies with access. It does not vary with distance.** Doubling the run from
"under 10 feet" to "10–20 feet" adds zero material and only labor. A cable recipe would
necessarily make material scale with distance, so converting these would not be a
behaviour-neutral migration — it would change the shape of the economics. These constants
were never built as cable packages, and no arithmetic will make them into one.

They also do not decompose. A plausible switch package —
`SWITCH_STANDARD` $2 + `BOX_OLD_WORK` $3 + `WALL_PLATE` $1 + `CONSUMABLES_SMALL` $3 = $9 —
leaves $26 of the $35, which at $0.50/ft is 52 feet of cable on a run described as under
ten feet.

### Tree gap

The tree establishes **distance band** and **access class**, and nothing else. To build a
real recipe it would also need: cable type (14/2 vs 14/3 for three-way), whether a new box
is required or an existing one reused, and the device type. None is collected.

### Dead roles

`NEW_SWITCH_AND_SWITCH_LEG_ACCESSIBLE` and `_FINISHED` carry full economics — $35/$45
material, 1h/1.5h labor, **approved prices of $300 and $435** — and **no answer anywhere
selects them.** Configured, priced, unreachable. Left alone; they are either a gap in the
tree or roles that should be retired.

## `CABLE_RG6` — the change has already been made, outside this session

You asked me to report and wait. The cost had already moved before I could:

```
at audit time (committed JSON)   $0.30/ft   ASSUMED
now                              $0.15/ft   CONFIRMED   costUpdatedAt 2026-08-29T19:32:17Z
```

None of my scripts write `ContractorMaterial`. The service's cached cost was updated too
($32.00 → $23.00 on `new-coax-line`), so this was a considered change, not a stray write.

**Published price was correctly left alone**, which is the important part:

```
new-coax-line   published $420.00  (unchanged)
                suggested @ $0.30/ft  $420.00
                suggested @ $0.15/ft  $405.00
```

So there is now a **$15 divergence** on that service awaiting a decision. Worth confirming
it was you.

## Phase E input — recorded, not written

Exhaust-fan reference costs, held until the full material list arrives:

| Role | Product | Elite cost |
|---|---|---|
| `BATH_FAN_STANDARD` | Broan-NuTone BE8, 80 CFM | $69 |
| `BATH_FAN_LIGHT_STANDARD` | Broan-NuTone BEL8, 80 CFM + LED | $85 |
| `BATH_FAN_UPGRADE_110` | Broan-NuTone AER110K, 110 CFM | $119 |
| `BATH_FAN_LIGHT_UPGRADE_110` | Broan-NuTone AER110CCTK, 110 CFM + light | $169 |

The 110 CFM products are **alternatives**, not additions.

Your upgrade figures are exactly what the existing engine produces — checked, not assumed:

```
BE8  $69.00 -> sell $89.70     AER110K     $119.00 -> sell $154.70    delta $65.00  -> $65
BEL8 $85.00 -> sell $110.50    AER110CCTK  $169.00 -> sell $219.70    delta $109.20 -> $110
```

Both at the 30% first-tier markup, rounded to Elite's $5 increment. They should be derived
this way rather than stored as fixed upgrade prices.

---

# Continuation — decisions applied, dead roles retired, Phase E roles created

Each step proved against the same 269 price points. **Every one: zero movement.**

## Decisions recorded

- `CABLE_RG6 = $0.15/ft CONFIRMED` — confirmed intentional, kept.
- `new-coax-line` — published **$420 stands**; suggested $405; **$15 divergence recorded, not repriced**.
- Bathroom-fan upgrades stay **engine-derived**: BE8→AER110K = +$65.00, BEL8→AER110CCTK = $109.20 → **$110** after Elite's $5 rounding. Nothing hardcoded.

## §6.2 / §6.3 resolved by Elite policy

`CONSUMABLES_SMALL` ×1 added to `tv-install-existing-location` and `soundbar-installation`.
The mount and any specialty soundbar bracket remain customer-supplied unless an
Elite-supplied mount role is selected. Published $250 each unchanged; suggested moves to
$255 — the same $5 divergence as the other eleven.

## The two dead roles are gone

`scripts/prove-component-unreachable.ts` checks **four** selection paths, not one:

| Path | `NEW_SWITCH_AND_SWITCH_LEG_*` |
|---|---|
| Answer options on ACTIVE services | 0 |
| Answer options on INACTIVE services | 0 |
| The TEMPLATE a new contractor provisions | 0 |
| The LEGACY `JobComponent` link | 0 |

The legacy path nearly went unchecked. `AnswerOptionComponent.componentId` can point at a
pre-canonical `JobComponent` **instead of** the canonical role, so a component can be
selected with no canonical link at all — checking only the canonical side would have
declared a live role dead.

The proof is falsifiable: run against `SWITCHLEG_ACCESSIBLE_UNDER_10` it returns
**REACHABLE (4 active, 4 template)** and the retirement script refuses it.

Retired: canonical roles deactivated, Elite's economics deleted — **$300.00 and $435.00
approved, $35.00/$45.00 material, 1h/1.5h**, recorded here because the rows are gone.

## Phase E — equipment roles created, none wired to a choice yet

| Role | Class | Elite cost |
|---|---|---|
| `BATH_FAN_STANDARD` | 80 CFM | $69 |
| `BATH_FAN_LIGHT_STANDARD` | 80 CFM + light | $85 |
| `BATH_FAN_HIGH_CFM` | 110 CFM | $119 |
| `BATH_FAN_LIGHT_HIGH_CFM` | 110 CFM + light | $169 |
| `TV_MOUNT_TILT_STANDARD` | tilting mount | $50 |
| `TV_MOUNT_FULL_MOTION_STANDARD` | full-motion mount | $100 |

Keys name the **equipment class**; the Broan model lives in Elite's contractor row as a
note, where it can change without touching trade knowledge (§1.1).

The two TV mount roles are wired into `elite-tilt-mount` and `elite-articulating-mount`,
where the role cost reproduces the cached figure exactly — the script refuses on any
mismatch. **That closes both `costWithoutRecipe` findings.**

The four fan roles are created and costed but **nothing selects them**. Wiring the
customer's fan-only / fan+light choice, and the 110 CFM alternatives, is tree work — Phase F.

## Audit movement

| Finding | Before | Now |
|---|---|---|
| Cached cost with no recipe | 2 | **0** |
| Recipe with an uncosted role | 0 | 0 |
| Component roles priced as a lump sum | 19 | **17** |
| Services with no recipe and no cost | 34 | **21** |

## Locked (Phase D)

Do not decompose the switch-leg / access lump sums until the tree collects cable type,
box new-vs-reused, and device type. Material there varies with **access**, not distance;
any cable recipe would change the shape of the economics rather than preserve it.

---

# Bath-fan Phase E, and the retirement verifier

## Scope conditions are not material roles

Housing size, duct size and configuration, CFM requirement, humidity sensor, heater,
unusual access and termination work are recorded as **scope/qualification conditions**.
They change what the job *is*, not what a standard job consumes, so they belong in a
disclosure and a review path rather than in a recipe. No roles were created for them.

Service-level disclosure now on `replace-bathroom-exhaust-fan`:

> The starting price assumes a standard-size replacement fan, an existing duct connection
> we can reuse, and normal access to the fan location. If the housing size, duct size or
> configuration is different, or the work needs a higher-airflow fan, a humidity sensor, a
> heater or unusual access, we will show you the price difference and get your approval
> before installing anything.

Humidity-sensor and heater variants stay review/custom. The 110 CFM classes are
**alternate equipment classes**, not automatic upgrades.

## Package prices, computed from Elite's actual economics

Rate $250/crew-hour, 30% first-tier material markup, $5 rounding. Material is the fan
plus `CONSUMABLES_SMALL`.

| Package | Material | Material sell | @1.5h | @1.75h | @2h |
|---|---|---|---|---|---|
| fan only, 80 CFM | $72.00 | $93.60 | $470 | **$535** | $595 |
| fan + light, 80 CFM | $88.00 | $114.40 | $490 | $555 | **$615** |
| fan only, 110 CFM *(alt)* | $122.00 | $158.60 | $535 | — | $660 |
| fan + light, 110 CFM *(alt)* | $172.00 | $223.60 | $600 | — | $725 |

### The calibration says labor differs between the packages

Working backwards from the historical figures rather than forwards from a guess:

```
fan only      $525 − $93.60 material sell  = $431.40 labor = 1.73h
fan + light   $595 − $114.40 material sell = $480.60 labor = 1.92h
```

**No single labor figure reproduces both.** The historical prices are internally
consistent with roughly **1.75h for fan-only and 2h for fan + light** — the light adds
wiring work, and the old prices already knew that. At those hours current economics give:

| Package | Suggested | Historical | Delta |
|---|---|---|---|
| fan only @1.75h | $535 | $525 | **+$10** |
| fan + light @2h | $615 | $595 | **+$20** |

Both land slightly above, which is what you would expect once the fan is a real costed
line rather than an assumption. **Nothing was published.** `replace-bathroom-exhaust-fan`
still has no base price and still reads "Get a quote".

**Open for Phase F:** this service has `fieldLaborHours` unset entirely, so the hours above
are the comparable service's, not its own. Setting them per package is the decision that
turns this into a real starting price.

## The retirement verifier — and what it found immediately

`scripts/verify-component-retirement.ts` is in the deploy gate. For every retired role it
asserts nothing selects it through **any** of four paths, and that no contractor still
carries its economics.

It failed on its first run, on roles retired long before this work:

| Role | Retired | Economics still attached |
|---|---|---|
| `TV_SECOND_TECHNICIAN` | yes | **$375.00 approved** |
| `TV_LARGE_SIZE_PREMIUM_56_85` | yes | **$375.00 approved** |

Both proved unreachable and were retired properly. **20 checks, 0 failures.** Gate is now
257 checks.

It also reports — without failing — active roles nothing selects, as retirement
candidates. Currently zero.

---

# The bathroom fan packages — one entry, two priced packages

## Why not one service

Both packages differ in **labor and equipment**: 1.75h with a standard fan, 2.0h with a
fan-and-light. Nothing in the schema substitutes one material role for another —
`applyBranch` only ever does `material +=`, and a component recipe adds to the service
total rather than replacing part of it. So one service cannot carry both, and forcing them
into one `fieldLaborHours` would have meant one package quietly pricing as the other.

The chosen shape is the one this catalogue already uses for equipment choice: a hidden
sibling, reached by reference. `elite-tilt-mount` has worked that way in production.

Hidden is still reachable — verified, not assumed: neither `/api/services/[slug]` nor
`/api/services/by-id` filters on `active`, while the category listings do. The sibling is
out of the catalogue and out of search, and resolves when the reroute sends someone to it,
carrying their answers.

## Derived, never typed

| Package | Labor | Equipment | Material | **Derived** | Calibration | Delta |
|---|---|---|---|---|---|---|
| Fan only | 1.75h | `BATH_FAN_STANDARD` | $72.00 | **$535** | $525 | +$10 |
| Fan + light | 2.0h | `BATH_FAN_LIGHT_STANDARD` | $88.00 | **$615** | $595 | +$20 |

`$525` / `$595` are compared against and never written. The script runs the package
economics through `suggestPrimaryPrice` and **throws rather than publish** if the engine
yields no price — so what was approved is the hours and the rounding rules, not a number.

## The tree

```
replace-bathroom-exhaust-fan            PUBLIC   ADJUSTED   $535
  Which would you like?
    Fan only        -> qualification -> $535
    Fan with a light -> REROUTE ------------------→ hidden sibling

replace-bathroom-exhaust-fan-with-light HIDDEN   ADJUSTED   $615
  qualification -> $615
```

Qualification is identical on both, and every answer that leaves the standard package
routes to review with photos: nonstandard housing or ducting, higher airflow, a humidity
sensor or heater, and difficult access. **Nothing silently reprices** — §5.5.

Resolved outcomes:

```
public   PRICED 1 ($535) · REVIEW 6 · REROUTE 1 -> the hidden sibling
hidden   PRICED 1 ($615) · REVIEW 6
```

## Proof

Of the 269 price points, **exactly one service changed**, and it is the one that was meant
to:

```
replace-bathroom-exhaust-fan
  before  priced 0, review 1, prices []
  after   priced 1, review 6, prices [$535]
```

§1.4 satisfied for this service: it was a public, price-less `REMOTE_QUOTE` and now shows
a real starting price.

## The gate caught the publish

`audit-price-writers` refused the run: a script that writes `basePrice` **and** stamps
`publishedPriceApprovedAt` moves a customer price outside the admin, so it has to be named
with a written reason. Registered. Gate back to **257 checks**.

## Still open under §1.4

**12 active `REMOTE_QUOTE` services remain**, 9 of them with neither a price nor a starting
label — including `240v-garage-outlet`, `hot-tub-spa-electrical`, `pool-equipment-electrical`,
`transfer-switch` and `generator-inlet-interlock`. Each either gets a real starting package
or gets hidden. That is Phase F.

One of the nine is not a quote service at all: `remove-and-replace-existing-chandelier` is
**ADJUSTED with no base price**, which is a different defect — a service that should price
and cannot.
