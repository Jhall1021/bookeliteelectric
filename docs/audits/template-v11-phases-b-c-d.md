# Electrical Template v1.1 — Phases B, C and D

Stopped before Phase E as instructed. Every conversion below was followed by the
same proof: **every resolvable path of all 69 active services, 269 distinct price
points — zero changed.**

---

## Phase B — seven component recipes (§3.1, §4.1, §4.2)

Each reconciles to the cent at Elite's current costs. The script refuses to write
a recipe that does not, because matching the constant is the *evidence* the
composition was understood, not a target to hit.

| Component | Was | Now | Reconciles |
|---|---|---|---|
| `OUTLET_RUN_ACCESSIBLE_10_20` | $5.00 | `WIRE_14_2` × 10 | $5.00 |
| `OUTLET_RUN_FINISHED_10_20` | $5.00 | `WIRE_14_2` × 10 | $5.00 |
| `EXT_GFCI_RUN_ACCESSIBLE_10_20` | $7.20 | `WIRE_12_2` × 10 | $7.20 |
| `EXT_GFCI_RUN_FINISHED_10_20` | $7.20 | `WIRE_12_2` × 10 | $7.20 |
| `RECESSED_ADDITIONAL_ACCESSIBLE` | $38.00 | `RECESSED_WAFER` ×1 + `WIRE_14_2` ×10 + `CONSUMABLES_SMALL` ×1 | $38.00 |
| `RECESSED_ADDITIONAL_FINISHED` | $38.00 | same package | $38.00 |
| `LED_DIMMER_UPGRADE` | $30.00 | `DIMMER_LED` ×1 | $30.00 |

The legacy `addMaterialCostCents` is left in place. It is ignored while a recipe
exists, so it costs nothing, and it remains a readable record of the constant
plus a fallback if a recipe is ever removed.

**One consequence worth stating.** A contractor who has not costed `WIRE_14_2`
used to get Elite's $5.00 constant. They now fail closed to review until they
record their own cost. That is the §1.1 rule working — never another
contractor's figure — and it only becomes visible when a second contractor is
provisioned.

## Phase C — eleven consumables recipes (§4.3, §5.3, §7.2, §7.3, §8, §14)

`CONSUMABLES_SMALL` ×1 added to services that install into an existing opening
and consume connectors, anchors and tape that were never recorded.

Not applied mechanically (§14): the smart thermostat keeps its deliberate zero,
and so does the owner-supplied bathroom fan.

Published prices unchanged. The **suggested** price moves $5 on each — $3 of
cost, marked up, rounded to Elite's $5 increment — and that divergence is the
reportable signal (§16), not a licence to reprice:

| | published | suggested before | suggested after |
|---|---|---|---|
| `replace-interior-light-fixture` and 7 others at this price | $250.00 | $250.00 | $255.00 |
| `replace-ceiling-fan` | $315.00 | $315.00 | $320.00 |
| `otr-microwave-install`, `replace-range-hood` | $375.00 | $375.00 | $380.00 |
| `install-new-microwave` | $500.00 | $500.00 | $505.00 |

### Left for a decision

§6.2 and §6.3 are conditional — "only if the existing service promise assumes
customer-supplied mount", "if Elite normally supplies basic fasteners". Those are
statements about what Elite promises, not facts I can read out of the data, so
`tv-install-existing-location` and `soundbar-installation` are untouched.

## Phase D — audit only. Nothing converted, and that is the finding

§4.5 says determine the actual physical package and report a tree gap rather
than mutating the component. Here is why none of the ten switch/control roles
were converted.

### The constants do not behave like cable

| Role | Material | Labor |
|---|---|---|
| `SWITCHLEG_ACCESSIBLE_UNDER_10` | $35.00 | 1.0 h |
| `SWITCHLEG_ACCESSIBLE_10_20` | **$35.00** | 1.25 h |
| `SWITCHLEG_FINISHED_UNDER_10` | $45.00 | 1.5 h |
| `SWITCHLEG_FINISHED_10_20` | **$45.00** | 2.0 h |
| `SWITCH_POWER_RUN_ACCESSIBLE` | $21.80 | 1.0 h |
| `SWITCH_POWER_RUN_FINISHED` | **$21.80** | 1.5 h |

**Material varies with access. Labor varies with distance.** A cable-quantity
recipe would make material vary with distance — which these constants
deliberately do not. Converting by matching would invent a distance-dependence
that is not in the current economics: a change in the shape of the model, not in
its representation, and not behaviour-neutral.

Decomposition confirms it. `SWITCHLEG_ACCESSIBLE_UNDER_10` at $35.00 against a
plausible package — `SWITCH_STANDARD` $2 + `BOX_OLD_WORK` $3 + `WALL_PLATE` $1 +
`CONSUMABLES_SMALL` $3 = $9 — leaves $26 unexplained, which is 52 ft of 14/2 on
a run defined as *under ten feet*. The remainder is not cable.

### Tree gaps, by role

| Role | What the tree establishes | Missing before a recipe is possible |
|---|---|---|
| `SWITCHLEG_*` | Distance band (`switch_leg_distance`) and access class | Device type — standard vs 3-way changes both the switch and the cable (14/2 vs 14/3, and 14/3 is not costed). Whether a new box is needed or an existing one reused |
| `SWITCH_POWER_RUN_*` | Access only — selected by `below_above_access` / `finished_space_both_sides` | **No distance question at all.** Cable quantity is simply not collected |
| `CONVERT_SWITCHED_OUTLET_TO_LIGHTING_*` | Access only, via `lighting_control` | Distance; what is removed versus added; whether the existing box is reused |

### Two dead roles

`NEW_SWITCH_AND_SWITCH_LEG_ACCESSIBLE` and `NEW_SWITCH_AND_SWITCH_LEG_FINISHED`
carry full economics — $35/$45 material, 1 h/1.5 h labor, $300/$435 approved —
and **nothing selects them.** Zero attachments across the catalogue. Either the
answers that used them were removed, or they were configured ahead of a tree
change that never landed. Left alone; they price nothing today.

## CABLE_RG6 — report only, no write (§2, §6.5)

`$0.30/ft` ASSUMED → proposed `$0.15/ft`. One service uses it:

| Service | Qty | Published | Suggested now | Suggested after | Delta |
|---|---|---|---|---|---|
| `new-coax-line` | 60 ft | $420.00 | $420.00 | $405.00 | **−$15.00** |

Published price would not move on its own; the suggested price drops $15,
opening a $15 divergence. **Not written. Awaiting explicit approval.**

## Exhaust fan reference costs — checked against the engine, not written (§5.5)

Priced through `suggestPrimaryPrice` on `bathroom-fan-light-combo` (2 h labor),
adding each fan as the equipment line:

| Fan | Cost | Engine price |
|---|---|---|
| BE8 80 CFM | $69 | $590.00 |
| BEL8 80 CFM + LED | $85 | $615.00 |
| AER110K 110 CFM | $119 | $655.00 |
| AER110CCTK 110 CFM + light | $169 | $720.00 |

| Upgrade | Engine | Expected |
|---|---|---|
| BE8 → AER110K | **+$65.00** | +$65 ✓ |
| BEL8 → AER110CCTK | **+$105.00** | +$110 — **$5 apart** |

The $5 is Elite's rounding increment. The engine produces $105; adopting $110
would mean storing a number the engine does not derive, which is what §5.5 says
not to do. Flagged for Phase E rather than resolved here.

Also noted: `replace-bathroom-exhaust-fan` currently has **no base price and no
labor hours** — the undefined equipment state §5.5 describes.
