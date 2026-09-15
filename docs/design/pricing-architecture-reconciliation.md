# Phase G — Pricing Architecture Reconciliation

**Question:** can `ContractorComponent.approvedPriceCents × quantity` truthfully
consume package-aware material economics?

**Answer: no**, and not because of a rounding detail. The two mechanisms are not
connected at all — the takeoff has no path to a customer price, and the path that
does exist is structurally linear in component quantity.

---

## 1. The current pricing flow, as it actually runs

```
Routing answers
   └─► resolveRoute()                            lib/routeResolver.ts
        └─► per selected component, builds:
              approvedPriceCents   ← ContractorComponent (null ⇒ review)
              addFieldLaborHours   ← ContractorComponent (null ⇒ review)
              materialRecipe.cents ← Σ(ownMaterialCosts[role] × recipeQty)   ◄── PER ONE UNIT
   └─► applyBranch()                             lib/pricing.ts:630-716
        ├─ material                += materialRecipe.cents × q      ◄── LINEAR
        ├─ approvedIncrementCents  += approvedPriceCents × q        ◄── LINEAR
        ├─ awaitingComponentLabor      (null labor)
        ├─ awaitingComponentApproval   (null approved price)
        └─ awaitingComponentMaterialCost (unresolved recipe role)
   ├─► customerPrice()                           lib/pricing.ts:730-752
   │     = publishedBaseCents + approvedIncrementCents + legacyModifierCents
   │       "never from the calculated configuration"
   └─► suggestConfigurationPrice()               ADMIN-INTERNAL ONLY
         = compute(fieldLaborHours, materialCostCents, …)
```

`suggestPrimaryPrice` / `suggestWwtPrice` operate on `ServicePricingInputs`, a
**service-level** shape with a single `materialCostCents` and no component or
route dimension. `publishSuggestedPrice` (`lib/pricePublication.ts`) runs that
suggestion and writes a service `basePrice`. Neither has ever seen a route.

### What exists vs. what does not

| Link in the chain | State |
|---|---|
| Routing answers → terminal components | **exists** |
| Component quantities (incl. `quantityAnswerKey`) | **exists** |
| Contractor component labor | **exists** (nullable, fails closed) |
| Component material cost via recipe | **exists**, linear per unit |
| **MaterialTakeoff → any price** | **does not exist** |
| PricingSettings → labor economics | **exists**, service-level only |
| Proposed price for a *route* | **exists but admin-internal** (`suggestConfigurationPrice`) |
| `approvedPriceCents` → customer total | **exists** — the only customer mechanism |
| Contractor write path for component economics | **does not exist** (known) |

---

## 2. What `approvedPriceCents` means today

An **approved customer-facing selling price for one unit of the component**,
summed as `Σ(price × quantity)` and added to the service's published base. It is
a *selling price*, not a cost: no markup, minimum or rounding is applied to it —
those live in `compute()`, which the customer path never calls.

Its nullability is load-bearing and correct: null ⇒ `awaitingComponentApproval`
⇒ review, never a guess and never another contractor's figure.

---

## 3. The package-rounding conflict, measured

Real numbers from the rehearsal contractor, 31 ft straight route:

```
unitCostCents (derived)        291 c/ft   ( = 1457c ÷ 5 ft )
LINEAR    31 ft × 291c        9 021 c     ← what routeResolver computes
PACKAGE   7 sticks × 1457c   10 199 c     ← what the contractor actually buys
UNDERSTATEMENT                1 178 c     ← 4 ft of offcut nobody pays for
```

**Where does the seventh stick's cost live in the component-price model?
Nowhere.** `SURFACE_ROUTE_FT` recipe is `CHANNEL × 1 ft`, and 31 of them is 31
feet of channel at a per-foot price. The purchase is 7 whole sticks. To express
that with `approvedPriceCents × 31` the contractor must set a per-foot price that
amortises expected waste — which is right for no specific length (at 30 ft it
overcharges, at 31 ft it is exact, at 35 ft it overcharges again) and is a
**business policy Price2Book must not choose**.

### It is worse than rounding: six of eight roles are invisible

```
SURFACE_RACEWAY_JOINT              1 122 c   — no component recipe names it
SURFACE_RACEWAY_SUPPORT_CLIP         456 c   — no component recipe names it
SURFACE_RACEWAY_TRANSITION           447 c   — no component recipe names it
CONDUCTOR_THHN_12_UNGROUNDED       8 917 c   — no component recipe names it
CONDUCTOR_THHN_12_GROUNDED         8 917 c   — no component recipe names it
CONDUCTOR_THHN_12_EQUIPMENT_GROUND 7 417 c   — no component recipe names it
                                  ─────────
                                  27 276 c   of a 38 122 c takeoff
```

Because they are **derived** (joints from piece count, clips from the system
rule, conductors from policy) rather than named by a recipe line, no component
quantity can carry them. This is not fixable by adding recipe lines: a joint
count depends on the purchased piece count, which depends on the product.

### Per-category verdict

| Material | Linear in a component quantity? |
|---|---|
| Channel | **No** — package-rounded |
| Joint covers | **No** — derived from piece count |
| Support clips | **No** — derived from a system rule with a terminus term |
| Source transition | Yes (per endpoint), but no component names it |
| Device box | **Yes** — genuinely 1 per endpoint |
| Conductors | **No** — spool-rounded, and length includes policy slack |

Only the device box is truthfully expressible today.

---

## 4. Three concepts the current model conflates

```
physical quantity        31 route feet              Routing V2
cost basis               7 sticks = 10 199 c        MaterialTakeoff
customer price basis     ???                        contractor business policy
```

`approvedPriceCents × quantity` fuses the third to the first and skips the
second. A contractor might legitimately price from actual takeoff cost, from
standardised unit economics, at a route-level price, or by another approved
method — and **Price2Book currently assumes exactly one** (linear per unit)
without ever asking.

---

## 5. Recommendation — B, as an explicit per-component pricing METHOD

**Not A.** Retaining `approvedPriceCents × quantity` as the only mechanism forces
waste-spreading, which is a policy decision, and still cannot carry the six
derived roles.

**Not C alone.** A whole-`ResolvedScope` approval cannot work by itself: the
route quantity is unbounded (31 ft, 32 ft, …), so pre-approving every scope is
impossible. Approving a *rule* that covers them all collapses into B.

**Recommended: B, minimally.** Keep `approvedPriceCents` exactly as it is — it is
truthful for components that really are linear per unit — and add a **sibling
method** the contractor selects per component:

```
APPROVED_UNIT_PRICE     (today's behaviour, unchanged)
DERIVED_FROM_TAKEOFF    price built from route-level takeoff cost
                        + contractor labor economics + their markup rules
```

No method selected ⇒ review. Price2Book never picks.

This preserves every constraint:

- **Contractor authority** — they choose the method and its parameters; neither is defaulted.
- **Determinism** — (method, parameters, route answers, product selections) → exactly one price.
- **Package-aware cost** — `DERIVED_FROM_TAKEOFF` consumes `purchaseRequirements` directly.
- **Auditability** — the quote stores the resolved takeoff and the parameter version, so a past price is reproducible even after a cost changes.
- **WWT semantics** — the method produces an *increment*; the base and the no-minimum rule are untouched.
- **Fresh-contractor fail-closed** — no method, no parameters, no products ⇒ review, as today.

It also changes no existing semantics, which matters given the standing
instruction not to move `approvedPriceCents`.

---

## 6. Labor readiness for the straight pilot

Measured on the rehearsal contractor:

| Component | Qty | `ContractorComponent` | Labor |
|---|---|---|---|
| `ELEC_ROUTE_SURFACE_MOUNTED` | 1 | **no row** | not established |
| `SURFACE_ROUTE_FT` | 31 | **no row** | not established |
| `OUTLET_EXTENSION_CORE` | 1 | **no row** | not established |
| `SURFACE_DEVICE_BOX_OUTLET` | 1 | **no row** | not established |

**None established. None manufactured here.** `awaitingComponentLabor: true` and
`awaitingComponentApproval: true` on the real resolver output.

`ELEC_ROUTE_SURFACE_MOUNTED` is the strongest *candidate* for an explicit zero —
it reads as a strategy marker whose labor lives in `SURFACE_ROUTE_FT` — but that
is the contractor's adjudication, not a conclusion the platform may reach.
Canonical labor evidence (the MLU rows from Stage A) stays reference
intelligence; it is not a substitute for calibration.

---

## 7. PricingSettings — confirmed against the implementation

| Field | Where it is consumed | Scope |
|---|---|---|
| `crewHourRateCents` | `compute()` — `actualTechHours × rate` | **component/labor economics** |
| `primaryMinimumCents` | `Math.max(rawLabor, min)`, `isPrimary && isPrimaryEligible` | whole customer job; never WWT |
| `roundingIncrementCents` | `roundUp(total, inc)` on the assembled total | whole customer price |
| `defaultPermitAdminCents` | fallback when a service has no override | only where the scope needs a permit |

The proposed semantics hold, and the code reveals **no contrary invariant** —
`compute()` reads the four independently and never infers one from another.

**All four should become nullable together.** They are one row with one lifecycle
and a partially-decided contractor is a real state; making only `crewHourRateCents`
nullable would leave the other three as mandatory invented numbers. Today the row
is all-or-nothing, so provisioning creates none and `loadPricingSettings` throws a
message that cannot distinguish "decided nothing" from "decided three of four".

Target: row exists, `null` = undecided, `0` = deliberate zero. This is the same
distinction `ContractorPolicyValue.measurement` and `addFieldLaborHours` already
make. **Not implemented in this pass.**

---

## 8. First PRICED acceptance path (design only)

```
Routing V2 recipe        31 ft straight, 4 components          ✅ exists
Material takeoff         38 122 c, purchaseComplete            ✅ exists
Contractor labor         4 components calibrated by contractor ❌ not established
Pricing settings         crewHourRateCents decided             ⚠️ synthetic fixture
Pricing method           DERIVED_FROM_TAKEOFF + parameters     ❌ does not exist
Proposed price           deterministic, explainable            ❌ does not exist
Contractor approval      explicit, versioned                   ❌ no write path
PRICED                                                          ❌
```

Three gaps are contractor input; three are architecture. **Not made PRICED here.**

---

## 9. Materials & Costs — admin/domain inventory

Unlike component economics, this does **not** start from nothing.

| Capability | State |
|---|---|
| Read contractor materials | **exists** — `GET /api/admin/materials`: cost, source, confidence, status, package geometry, active supplier link |
| Write custom cost | **exists** — `POST action:"cost"`, accepts package price + quantity or bare unit cost |
| Derived-unit preview | **exists** — `POST action:"preview-package"` |
| Create a material | **exists** — `POST action:"create"` |
| Service material add/qty/remove | **exists** |
| **Change product selection** | **MISSING** — nothing anywhere writes `activeSupplierLinkId` |
| **MaterialSystem configuration** | **MISSING** — no API; only `loadSurfaceTakeoff` reads it |
| **Category grouping** | **MISSING** — `CanonicalMaterial` has key/name/unit/notes; no category |
| **Used-by** | **derivable but not exposed** — via `ServiceMaterial`, `AnswerOptionMaterial`, and `CanonicalComponentMaterial → AnswerOptionComponent`; three paths, needs one query |
| Friendly names | partial — `name` + `nameOverride` exist; no "family — variant" split |
| Status vocabulary | **exists** — `MaterialCostSource`, `MaterialCostConfidence`, `MaterialCostStatus`; reuse, don't invent |

**Architecturally the screen is a view/editor over
`canonical role → contractor material selection → supplier/custom cost`**, and
`ContractorMaterial @@unique([contractorId, canonicalMaterialId])` already
guarantees the single-source property — there cannot be fifteen copies of the
12/2 price, because the schema permits exactly one row per role per contractor.

The onboarding denominator must be computed from the contractor's **enabled
catalog** (roles reachable from their active services' recipes and component
recipes), never hard-coded.

Material-system configuration should be a **detail subpage**, not a table column:
grounding strategy and terminus behaviour are not unit costs and would need four
columns that are blank for every non-raceway row.

---

## 10. Seams to implement next, smallest first

1. **`PricingSettings` nullable (all four).** Independent of the pricing decision, unblocks the fresh-contractor incomplete state.
2. **Supported write path for component labor + approval.** The known gap; blocks any PRICED proof.
3. **`activeSupplierLinkId` write path.** Blocks product selection in Materials & Costs.
4. **`ContractorMaterialSystem` read/write API.** Blocks system configuration outside a script.
5. **Material category + used-by query.** Blocks grouping and "where is this used".
6. **Pricing method selection + parameters** (the §5 decision), with the quote storing the resolved takeoff for auditability.

1 and 3–5 are independent of the pricing-architecture decision and can proceed.
