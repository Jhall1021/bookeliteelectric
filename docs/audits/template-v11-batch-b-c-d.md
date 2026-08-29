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

| Role | Material | Labour | Attachments |
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
"under 10 feet" to "10–20 feet" adds zero material and only labour. A cable recipe would
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
material, 1h/1.5h labour, **approved prices of $300 and $435** — and **no answer anywhere
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
