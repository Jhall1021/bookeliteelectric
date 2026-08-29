# Batch 1 — structural cleanup and dedicated-circuit scope audit

**Read-only.** No published price, contractor cost, component, recipe or tree was
changed. Elite's counts are identical before and after: 75 services, 123 service-material
rows, 39 material roles, 31 component roles.

---

## 1. The wire-dollar conversion is blocked, and not by data

The mapping is exactly right. At the costs you confirmed:

| Component | Current material delta | Implied physical quantity |
|---|---|---|
| `OUTLET_RUN_ACCESSIBLE_10_20` · `OUTLET_RUN_FINISHED_10_20` | $5.00 | `WIRE_14_2` × 10 ft @ $0.50 = **$5.00** |
| `EXT_GFCI_RUN_ACCESSIBLE_10_20` · `EXT_GFCI_RUN_FINISHED_10_20` | $7.20 | `WIRE_12_2` × 10 ft @ $0.72 = **$7.20** |

Both reconcile to the cent. The constants *are* ten feet of wire.

**They cannot be replaced, because a component cannot reference a material role.**
`ContractorComponent.addMaterialCostCents` is an `Int`. There is no join table anywhere
in the schema between a component and `CanonicalMaterial` — verified by enumerating every
model that references either. `ServiceMaterial` attaches roles to a *service*
unconditionally; a component's consumption is per-selection and conditional, so it cannot
be expressed there either.

So the goal — supplier-cost changes flowing through roles rather than stale constants —
needs a schema addition, roughly:

```
ComponentMaterial
  contractorComponentId  (or canonicalComponentId + contractor scope)
  canonicalMaterialId
  quantity
```

…plus `applyBranch` summing it the way the base recipe is summed. That is a model and
engine change, not a data edit, and I have not started it.

**What it would be worth.** 19 component roles currently carry a lump-sum material amount
totalling the switch-leg, recessed-lighting, outlet-run and exterior-GFCI families. Every
one of them is invisible to a cost update today.

## 2. Contractor costs — confirmed unchanged

All seven are as you listed and were not touched:

| Role | Cost | Confidence |
|---|---|---|
| `WIRE_14_2` | $0.50 / ft | CONFIRMED |
| `WIRE_12_2` | $0.72 / ft | CONFIRMED |
| `RECEPTACLE_STANDARD` | $2.00 each | CONFIRMED |
| `BOX_OLD_WORK` | $3.00 each | CONFIRMED |
| `WALL_PLATE` | $1.00 each | CONFIRMED |
| `CONSUMABLES_SMALL` | $3.00 each | CONFIRMED |
| `BREAKER_SINGLE_POLE` | $8.00 each | CONFIRMED |

## 3. `dedicated-120v-circuit-outlet` — what the tree knows

ADJUSTED · active · 2.5 h · base recipe $46.00 · published $685.
Six questions, 1,073 paths: **480 price, 593 go to review.** Three distinct prices:
**$685 / $700 / $715.**

Base recipe, which is the *15 amp, 120 volt* case:

| Role | Qty | Cost |
|---|---|---|
| `BREAKER_SINGLE_POLE` | 1 | $8.00 |
| `RECEPTACLE_STANDARD` | 1 | $2.00 |
| `BOX_OLD_WORK` | 1 | $3.00 |
| `WALL_PLATE` | 1 | $1.00 |
| `WIRE_14_2` | 50 ft | $25.00 |
| `CONSUMABLES_MEDIUM` | 1 | $7.00 *(ASSUMED)* |
| | | **$46.00** |

### Knows versus needs

| Scope dimension | Captured? | How | Gap |
|---|---|---|---|
| **15 A vs 20 A** | Partly | 4 of 6 appliances attach `DEDICATED_CIRCUIT_20A`; explicit amperage question | Refrigerator and bidet attach nothing → priced as 15 A |
| **120 V vs 240 V** | One option | "15 or 20 amp, 240 volt" | Conflates 15 A and 20 A at 240 V — different conductor gauge |
| **Breaker pole count** | **No** | Derivable from voltage | Base carries `BREAKER_SINGLE_POLE`; a 240 V circuit needs 2-pole. `BREAKER_DOUBLE_POLE` exists at $18 and is never selected |
| **AFCI / GFCI / dual-function** | **No** | Not asked at all | Code-driven by room and load. $8 vs roughly $45–60. **The largest unpriced variable in the service** |
| **Conductor count / gauge** | Derivable | From amperage | No 3-conductor role exists; 240 V loads needing 12/3 cannot be expressed |
| **Receptacle / device type** | **No** | Base assumes `RECEPTACLE_STANDARD` | 20 A T-slot and 240 V (NEMA 6-15/6-20) are different devices; no role exists for either |
| **Appliance implies the rest?** | Partly | Sump pump, OTR microwave, window AC, fireplace ⇒ 20 A | No appliance implies protection type, and none implies 240 V |

### What the substitutions would need

| Replacing | Physical change | Available today |
|---|---|---|
| `DEDICATED_CIRCUIT_20A` = $10.50 | `WIRE_14_2` ×50 → `WIRE_12_2` ×50 = **+$11.00**; 20 A receptacle | Wire yes. **20 A receptacle role does not exist** |
| `DEDICATED_CIRCUIT_240V` = $11.00 | `BREAKER_SINGLE_POLE` → `BREAKER_DOUBLE_POLE` = **+$10.00**; 240 V receptacle | Breaker yes. **240 V receptacle role does not exist** |

Each constant is within a dollar of a *single* physical substitution — wire for the first,
breaker for the second — and neither accounts for the device. The numbers are defensible
and incomplete in the same way.

**Missing roles before either conversion is possible:** a 20 A receptacle, a 240 V
receptacle, AFCI / GFCI / dual-function breakers, and 3-conductor cable.

### One defect found while auditing

**"30 amp or more" prices at $685 — the same as a 15 amp circuit, and it books.**
The option is `CONTINUE` and attaches no component, so it falls through to the base
recipe. A 30 A circuit needs 10 AWG conductor, a 30 A breaker and a different receptacle;
none is priced, and nothing sends the path to review. Verified by resolving it:

```
30 amp or more      PRICED   $685
15A 120V (base)     PRICED   $685
20A 120V            PRICED   $700
240V                PRICED   $715
Refrigerator        PRICED   $685
Sump pump           PRICED   $700
```

I have not changed it. If the intent was that it route to review, that is a one-option
fix; if the intent was to price 30 A work, it needs the scope questions above.

## 4. Will published prices move?

**Structurally, no — and this is stronger than a before/after comparison.**

A component's contribution to what the customer pays is `approvedPriceCents`
(`lib/pricing.ts`, `componentPriceCents += p * quantity`). `addMaterialCostCents` is
never read on that path; it feeds the configuration's internal material total, which
drives the **suggested** price, not the published one.

So converting a material adder from a constant to a recipe cannot move $685 / $700 /
$715, because those come from `basePrice` plus `approvedPriceCents`, neither of which the
conversion touches.

It *would* move the **suggested** price for those services — which is the signal worth
having, since it is exactly the divergence between what the work now costs and what is
published. That belongs in a reconciliation report for approval, not in an automatic
republish.

## 5. Not done, deliberately

- No conversion of the outlet-run or exterior-GFCI adders — blocked on the schema.
- No conversion of dedicated-circuit adders — you asked to audit first, and the audit says
  the tree does not yet carry protection type or device type.
- No inactive dedicated-circuit services touched.
- No costs repriced.
- No reconciliation run: nothing changed, so there is nothing to reconcile.
