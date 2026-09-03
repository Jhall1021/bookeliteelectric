# HVAC V0 — catalog review

*1 September 2026. The six audits run against the 55 candidates in
`docs/design/hvac-v0-architecture.md`, and the catalog proposed to replace them.*

**55 is not a target.** The charter prioritizes trustworthy scope over catalog size, and
this review merges, renames, defers and removes accordingly.

**Headline:** 55 candidates → **29 canonical services**, of which **22 ship in V1**.
Eighteen candidates were merged into survivors, eight removed outright, seven kept
canonical but deferred. Twelve categories → **seven**.

---

# Part 1 — Verdicts on all 55

Verdict vocabulary: **KEEP** · **RENAME** · **MERGE→** *(absorbed into another service)* ·
**REMOVE** *(not canonical in V0)* · **DEFER** *(canonical, not in the V1 catalog)*.

Full descriptions, rationales and aliases for the survivors are in Part 3; this part is
the disposition of the incoming list.

### Thermostats & Controls

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 1 | `thermostat-replacement` | **KEEP** → `thermostat-installation` | Becomes the merged survivor |
| 2 | `smart-thermostat-installation` | **MERGE→** `thermostat-installation` | Same work — remove old, mount new, land wires, configure. "Smart or conventional" is a configuration answer that drives the C-wire gate and a setup-time override, not a second service |
| 3 | `thermostat-new-installation` | **MERGE→** `thermostat-installation` | *"Is there a thermostat there now?"* is already question 1 of the replacement flow. `control_present: ABSENT` routes to the new-run branch |
| 4 | `additional-zone-thermostat-installation` | **MERGE→** `zoning-installation` | Adding a zone is one job; which thermostat it gets is part of it |
| 5 | `zoning-system-installation` | **KEEP, DEFER** → `zoning-installation` | Real homeowner want, but V1 has no distribution vocabulary to describe it |
| 6 | `zone-damper-replacement` | **REMOVE** | Component-named (§22) and a target a symptom could resolve to (audit 3) |

### Heating Equipment

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 7 | `gas-furnace-replacement` | **KEEP** → `furnace-replacement` | Becomes the merged survivor |
| 8 | `electric-furnace-replacement` | **MERGE→** `furnace-replacement` | `fuel_type` is question 2 of the flow. A homeowner asks for "a new furnace", not for a fuel variant |
| 9 | `oil-furnace-replacement` | **DEFER** | V1's vocabulary has no oil tank or oil line, so the service would collect answers that do not describe its scope |
| 10 | `boiler-replacement` | **DEFER** | Same — no hydronic distribution facts exist in V1 |
| 11 | `matched-system-replacement` | **KEEP** → `whole-system-replacement` | Becomes the merged survivor |

### Cooling Equipment

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 12 | `ac-condenser-replacement` | **RENAME** → `ac-replacement` | "Condenser" is distributor language; the homeowner is replacing their air conditioner |
| 13 | `ac-and-coil-replacement` | **MERGE→** `whole-system-replacement` | Which two pieces get replaced is a contractor determination, not a homeowner selection |
| 14 | `evaporator-coil-replacement` | **REMOVE** | No homeowner deliberately selects an indoor coil. Component-named, and reachable only through a determination |
| 15 | `condenser-relocation` | **DEFER** | Genuine but rare request; kept canonical, carried in V1 as an intent into the replacement quote path |
| 16 | `condenser-pad-replacement` | **KEEP**, visit posture → While We're There | Real and bounded, but cannot pay for a van trip alone |
| 17 | `lineset-replacement` | **REMOVE** | Whether a line set needs replacing is exactly the trade judgment decision 5 forbids inferring |

### Heat Pumps

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 18 | `heat-pump-replacement` | **KEEP** | A distinct homeowner purchase, named the way they name it |
| 19 | `heat-pump-system-replacement` | **MERGE→** `whole-system-replacement` | Two-unit replacement is one homeowner intent |
| 20 | `dual-fuel-system-replacement` | **MERGE→** `whole-system-replacement` | "Dual fuel" is a technician's classification of the answer, not of the question |

### Ductless & Mini-Split

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 21 | `mini-split-single-head-installation` | **KEEP** → `mini-split-installation` | Becomes the merged survivor |
| 22 | `mini-split-multi-head-installation` | **MERGE→** `mini-split-installation` | The only difference is `head_count`, which is a number question |
| 23 | `mini-split-replacement-existing-lineset` | **MERGE→** `mini-split-installation` | The only difference is `lineset_status`, which the flow already asks |
| 24 | `mini-split-head-cleaning` | **KEEP** | Distinct work, distinct intent, genuinely priceable |
| 25 | `mini-split-condensate-pump-installation` | **MERGE→** `condensate-pump-installation` | Same pump, same tubing, same power. Location is `system_type` configuration |

### Indoor Air Quality

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 26 | `uv-lamp-installation` | **KEEP** → `duct-air-treatment-installation` | Becomes the merged survivor |
| 27 | `uv-lamp-bulb-replacement` | **MERGE→** `accessory-consumable-replacement` | Open the accessory, swap the consumable |
| 28 | `electronic-air-cleaner-installation` | **REMOVE** | A declining product category, and its only difference from the cabinet service is a power prerequisite the scope mapping already expresses |
| 29 | `media-cabinet-installation` | **MERGE→** `air-cleaner-cabinet-installation` | See audit 1 |
| 30 | `air-cleaner-media-replacement` | **MERGE→** `accessory-consumable-replacement` | Same |
| 31 | `duct-mounted-air-purifier-installation` | **MERGE→** `duct-air-treatment-installation` | Cut a hole in the plenum, mount the device, run power. The device is configuration |
| 32 | `energy-recovery-ventilator-installation` | **DEFER** | HRV/ERV is a term homeowners do not use, and the distribution facts it needs are outside V1 |

### Humidification

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 33 | `whole-house-humidifier-replacement` | **KEEP** → `whole-house-humidifier` | Becomes the merged survivor |
| 34 | `whole-house-humidifier-installation` | **MERGE→** `whole-house-humidifier` | *"Is there one there now?"* is question 1 either way — the same pattern applied to the thermostat merge, applied consistently here |
| 35 | `humidifier-pad-replacement` | **KEEP** → `accessory-consumable-replacement` | Becomes the merged survivor — the most recognizable of the three consumables, and the one whose seasonal errand justifies a primary visit |
| 36 | `whole-house-dehumidifier-installation` | **DEFER** | Real intent, but needs distribution facts V1 does not model |

### Filtration

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 37 | `filter-replacement` | **RENAME** → `air-filter-replacement` | Kept separate from the consumables merge — its visit posture genuinely differs (see audit 6) |
| 38 | `filter-cabinet-installation` | **KEEP** → `air-cleaner-cabinet-installation` | Becomes the merged survivor |
| 39 | `filter-rack-conversion` | **REMOVE** | Technician language for a configuration of the cabinet service |

### Condensate & Drainage

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 40 | `condensate-pump-replacement` | **KEEP** → `condensate-pump-installation` | Becomes the merged survivor |
| 41 | `condensate-pump-installation` | **MERGE→** `condensate-pump-installation` | Presence/absence is a branch, not a second service |
| 42 | `condensate-drain-clearing` | **REMOVE**, folded into tune-up scope | **The highest diagnostic-risk entry in the catalog.** See audit 3 |
| 43 | `condensate-safety-switch-installation` | **KEEP**, visit posture → While We're There | Sound protective work, but not a reason to send a van |
| 44 | `secondary-drain-pan-installation` | **REMOVE** | Requested by inspectors and technicians, never selected by a homeowner |

### Air Distribution

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 45 | `supply-register-replacement` | **RENAME** → `vent-cover-replacement` | "Supply register" is distributor language for a vent cover |
| 46 | `duct-modification-assessment` | **KEEP** → `duct-assessment` | Becomes the merged survivor |
| 47 | `return-air-addition-assessment` | **MERGE→** `duct-assessment` | Identical questions, identical outcome, identical visit |
| 48 | `duct-sealing-assessment` | **MERGE→** `duct-assessment` | Same |

### Maintenance

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 49 | `ac-tune-up` | **KEEP** | See audit 6 — the tune-ups are the case where merging would be wrong |
| 50 | `furnace-tune-up` | **KEEP** | Different gates, different `maintenanceScope`, different season |
| 51 | `heat-pump-tune-up` | **KEEP** | Its scope includes heating-mode checks an AC tune-up does not |
| 52 | `boiler-tune-up` | **DEFER** | Travels with `boiler-replacement` |
| 53 | `mini-split-tune-up` | **KEEP** | Distinct scope and distinct equipment |
| 54 | `multi-system-seasonal-maintenance` | **REMOVE** | `system_count` is a quantity the tune-ups already ask. A quantity is not a service |

### Service Calls

| # | Candidate | Verdict | Reason |
| --- | --- | --- | --- |
| 55 | `hvac-service-call` | **KEEP** | The single shell. Thirteen symptoms converge on it |

**Tally:** 55 candidates − 8 removed = 47, collapsing into **29 canonical** (18 merged away).
Of the 29, 7 are deferred and **22 ship**.

---

# Part 2 — The audits

## Audit 1 — Duplicate physical work

**`filter-cabinet-installation` vs `media-cabinet-installation` — merged, as expected.**
No meaningful scope difference exists. Both are: open the return duct or plenum, cut and
fit a sheet-metal cabinet, seal it, fit the element. Same access question, same
`filter_slot_size`, same material roles, same gates, same prerequisites. The difference is
**media depth and branding** — a 1-inch slot versus a 4- or 5-inch cabinet, and whether the
manufacturer calls the element a "filter" or "media". That is configuration, and
`filter_slot_size` already carries it.

Survivor: **`air-cleaner-cabinet-installation`** — "Air Cleaner Cabinet Installation".
Aliases absorb *media cabinet*, *media air cleaner*, *whole-house filter cabinet*,
*4-inch filter*, *5-inch filter*.

**Four more duplicate clusters found:**

| Cluster | Merged into | The physical job, once |
| --- | --- | --- |
| `uv-lamp-installation` + `duct-mounted-air-purifier-installation` | `duct-air-treatment-installation` | Cut a hole in the plenum, mount a powered device, run power to it. UV lamp, PCO cell and ionizer differ in the device, not the work |
| `uv-lamp-bulb-replacement` + `air-cleaner-media-replacement` + `humidifier-pad-replacement` | `accessory-consumable-replacement` | Open an existing accessory, remove the spent element, fit the new one. Which element is `accessory_present` configuration and selects the material role |
| `condensate-pump-replacement` + `condensate-pump-installation` + `mini-split-condensate-pump-installation` | `condensate-pump-installation` | Mount a pump, run tubing, connect power, run a discharge line |
| `duct-modification-assessment` + `return-air-addition-assessment` + `duct-sealing-assessment` | `duct-assessment` | Somebody attends and looks at the ductwork. Identical questions, identical outcome |

**One cluster examined and deliberately NOT merged:** the tune-ups. See audit 6.

## Audit 2 — Homeowner recognition

*"Would a normal homeowner recognize this as the thing they want performed?"*

**Fails — removed:**

| Candidate | Why it fails |
| --- | --- |
| `evaporator-coil-replacement` | Nobody knows they have an evaporator coil, let alone that it needs replacing. That is a finding, not a purchase |
| `lineset-replacement` | Same, and it is the exact judgment decision 5 forbids inferring |
| `secondary-drain-pan-installation` | Asked for by inspectors and technicians. A homeowner has never wanted one by name |
| `filter-rack-conversion` | Pure trade language for a configuration |
| `zone-damper-replacement` | A component inside a system the homeowner cannot see |

**Fails as a homeowner *classification* — merged rather than removed:**
`matched-system-replacement`, `ac-and-coil-replacement`, `heat-pump-system-replacement`
and `dual-fuel-system-replacement` are four names for *"replace my heating and cooling
system"*. Asking a homeowner to pick between them is asking them to make the equipment
decision the quote exists to make. One service, and the contractor determines the
configuration.

**Renamed out of trade language:**

| Was | Now | Why |
| --- | --- | --- |
| `ac-condenser-replacement` | `ac-replacement` — "Air Conditioner Replacement" | "Condenser" is distributor language |
| `supply-register-replacement` | `vent-cover-replacement` — "Replace Vent Covers and Grilles" | Homeowners say vents, not registers |
| `air-cleaner-media-replacement` | *(merged)* — "Replace a Filter, Pad or Lamp" | "Media" means nothing outside the trade |

**Borderline, kept with a weaker visit posture:** `condenser-pad-replacement` and
`condensate-safety-switch-installation`. Both are real, bounded work that a homeowner would
rarely seek out on purpose. Rather than delete them, both become **While We're There**
add-ons — which is exactly what they are in the field, and it gives the tune-ups a coherent
set of three natural companions alongside `air-filter-replacement`.

## Audit 3 — Diagnostic language

**No service in the incoming 55 is named for a symptom.** That holds. Three findings
below the naming layer:

**Finding 1 — `condensate-drain-clearing` is the highest-risk entry, and it is removed.**
It survives the naming test (*"clear my condensate drain"* is known work explicitly
selected) and fails the honest one: **almost no homeowner selects it deliberately.** The
overwhelming real-world path to this service is *"my AC is leaking water"* — a symptom,
and one whose common cause is a blocked drain. A catalog entry whose main function is to be
the destination of an inference is the shape audit 3 exists to catch, however innocent its
name.

Where the work actually goes: **into `ac-tune-up`'s `maintenanceScope`**, where drain
clearing is a routine inclusion of a maintenance visit rather than a repair somebody
guessed at. The symptom continues to route to `hvac-service-call` as `WATER_OBSERVED`.

**Finding 2 — two component-named services removed**, per §22 and the "no target to
resolve to" argument: `zone-damper-replacement` and `evaporator-coil-replacement`. Every
component-named service is a place a symptom can eventually land, and V1 declines to create
them.

**Finding 3 — category placement is clean.** No proposed category groups symptoms, and
`service-calls` remains the only path for reported symptoms. The thirteen intents —
No Cooling, No Heat, Won't Start, Weak Airflow, Leaking, Noise, Short Cycling, Frozen,
Odor, Humidity, Comfort, Intermittent, Control Not Responding — all resolve to
`hvac-service-call` and to nothing else.

**One watch item.** `zoning-installation` is deferred, but when it returns its natural
search intent is *"upstairs is always hot"* — which is a **comfort complaint**, i.e. a
symptom. It must arrive by explicit selection, never by that phrase.

## Audit 4 — V1 necessity, especially for REMOTE_QUOTE

Twenty-one candidates routed to review or appointment. Asking of each whether *naming* it
helps the homeowner:

**Naming helps — kept as catalog services (5):** `furnace-replacement`, `ac-replacement`,
`heat-pump-replacement`, `whole-system-replacement`, `mini-split-installation`. Each is a
purchase a homeowner comes looking for by name. Landing on a named service that says *"yes,
we do this — here is what we need to know"* and then collecting a complete observable scope
is a materially better experience than a generic quote form, even though both end in a
quote.

**Naming does not help — collapsed or deferred (8):**
`ac-and-coil-replacement`, `heat-pump-system-replacement` and `dual-fuel-system-replacement`
collapse into `whole-system-replacement` (audit 2). `evaporator-coil-replacement` and
`lineset-replacement` are removed. `condenser-relocation` is deferred and carried as an
intent. `oil-furnace-replacement` and `boiler-replacement` are deferred — **not because
contractors will not offer them**, but because V1's dimension vocabulary has no oil tank,
oil line or hydronic distribution facts, so the service would collect answers that do not
describe its own scope. That is a worse experience than a general enquiry.

**The three duct assessments become one** (audit 1). `duct-assessment` stays a named
service rather than folding into `hvac-service-call`, because planned improvement and
something-is-wrong are different commercial events and the shell carries a diagnostic visit
price that does not belong on planned work.

## Audit 5 — Categories

**Twelve, reviewed from the homeowner's side. Seven proposed.**

| Problem found | Categories | Fix |
| --- | --- | --- |
| **Depends on technical knowledge** | `heat-pumps` | A homeowner must already know they have a heat pump to find it — and the category straddles heating and cooling anyway. Folded into `heating-and-cooling` |
| **Overlapping** | `indoor-air-quality`, `humidification`, `filtration` | Three categories that all mean *air quality* to a homeowner. Merged into `indoor-air-quality` |
| **Confusing** | `condensate-drainage` | "Condensate" is a word homeowners do not have. After the removals it held one weak service; folded into `heating-and-cooling` |
| **Distributor terminology** | `air-distribution` | Renamed `ducts-and-vents` |
| **Mirrors internal structure** | `heating-equipment` + `cooling-equipment` | A homeowner thinks *"my system"*, not *"my heating equipment"*. Merged into `heating-and-cooling` |
| **Fine as-is** | `ductless-mini-split`, `maintenance`, `service-calls`, `thermostats-controls` | Kept; `thermostats-controls` shortened to `thermostats` |

**The seven:**

| Key | Homeowner-facing name | Ships | Holds |
| --- | --- | --- | --- |
| `thermostats` | Thermostats | 1 | Thermostat installation |
| `heating-and-cooling` | Heating & Cooling Systems | 7 | Every equipment replacement, condensate work, pad |
| `ductless-mini-split` | Ductless & Mini-Splits | 2 | Mini-split installation and head cleaning |
| `indoor-air-quality` | Indoor Air Quality | 5 | Humidifier, cabinet, air treatment, consumables, filters |
| `ducts-and-vents` | Ducts & Vents | 2 | Vent covers, duct assessment |
| `maintenance` | Maintenance & Tune-Ups | 4 | The four tune-ups |
| `service-calls` | Service Visit | 1 | The shell |

No category holds a single weak service, none overlaps another, and none requires the
homeowner to classify their own equipment before they can find what they want.

## Audit 6 — Service granularity

**The merge rule applied:** one physical service plus observable configuration plus search
aliases, *unless* physical scope, safety gates, pricing dimensions or homeowner intent are
genuinely different.

**A consistency rule fell out of it, and is applied everywhere:** where *"is there one there
now?"* is already the first question of the flow, presence and absence are **branches, not
services**. That single rule collapses three pairs — thermostat replacement/new, humidifier
replacement/installation, condensate pump replacement/installation — and it would have been
inconsistent to apply it to one and not the others.

**Where merging was refused, and why:**

| Kept apart | Because |
| --- | --- |
| The four tune-ups | Different `maintenanceScope` — the whole point of decision 1 — different gates (`furnace-tune-up` runs `fuel_gate` and `venting_gate`; `ac-tune-up` runs neither), different access (`INDOOR` vs `OUTDOOR`), and different seasons. Merging them would produce one service whose promise about what is included would have to be four promises |
| `air-filter-replacement` vs `accessory-consumable-replacement` | Physically the same swap, but a **different visit posture**: a standard filter cannot pay for a van trip and is While-We're-There only, while a humidifier pad or UV bulb is a legitimate seasonal errand. Visit posture is per-service metadata, so one service cannot hold both |
| `ac-replacement` vs `heat-pump-replacement` | Different equipment, different `system_type` gate coverage, and genuinely different homeowner purchases. `system_type` cross-routes a homeowner who picks the wrong one |
| `mini-split-installation` vs `mini-split-head-cleaning` | Installation and cleaning share equipment and nothing else |
| `hvac-service-call` vs `duct-assessment` | Something-is-wrong and planned-improvement are different events with different visit economics |

---

# Part 3 — The proposed catalog

Twenty-nine canonical services. **Twenty-two ship in V1**; seven are canonical and
deferred. `L` is `locationScope`.

## Thermostats

| Key | Name | What the customer is buying | Disposition | L | Families | Why that is responsible | V1 | Aliases / overlapping intents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `thermostat-installation` | Thermostat Installation | A thermostat fitted and set up — theirs or one supplied | **CONDITIONAL_FIXED** | INDOOR | `existing_control`, `supply_arrangement`, `system_identity` | Every deciding fact is countable in front of the device; the branch with no spare conductor leaves pricing rather than guessing at a cable run | SHIP | *replace thermostat · install nest · smart thermostat · ecobee · honeywell · wifi thermostat · new thermostat* |
| `zoning-installation` | Zoning Installation | Independent temperature control for separate parts of the house | **APPOINTMENT_ONLY** | INDOOR | `system_identity`, `distribution_and_zoning`, `indoor_equipment_access` | V1 models no distribution facts, so a visit establishes the scope rather than a form pretending to | DEFER | *add a zone · second zone · upstairs too hot* ⚠️ **symptom — must not route here** |

## Heating & Cooling Systems

| Key | Name | What the customer is buying | Disposition | L | Families | Why that is responsible | V1 | Aliases / overlapping intents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `furnace-replacement` | Furnace Replacement | A new furnace in place of the existing one | **REMOTE_QUOTE** | INDOOR | `system_identity`, `heating_equipment`, `indoor_equipment_access`, `condensate_route`, `supply_arrangement`, `existing_condition` | The observable scope resolves completely; efficiency, venting, combustion air and code-required changes at replacement do not, and they move the number a great deal | SHIP | *new furnace · replace my furnace · gas furnace · electric furnace · high efficiency furnace* |
| `ac-replacement` | Air Conditioner Replacement | A new outdoor air conditioning unit | **REMOTE_QUOTE** | OUTDOOR | `system_identity`, `cooling_equipment`, `outdoor_equipment_access`, `refrigerant_lineset`, `supply_arrangement` | Line-set reusability is a trade judgment (decision 5) and it is the dimension that most moves the price | SHIP | *new ac · replace air conditioner · new condenser · outside unit · new ac unit* |
| `heat-pump-replacement` | Heat Pump Replacement | A new outdoor heat pump | **REMOTE_QUOTE** | OUTDOOR | `system_identity`, `cooling_equipment`, `outdoor_equipment_access`, `refrigerant_lineset`, `existing_control` | Indoor coil match and line-set reuse dominate, and neither is homeowner-observable | SHIP | *new heat pump · replace heat pump · heat pump unit* |
| `whole-system-replacement` | Replace My Heating and Cooling System | Both indoor and outdoor equipment replaced together | **REMOTE_QUOTE** | **BOTH** | Every heating and cooling family, `refrigerant_lineset`, both access families | Refuses twice — `REMOTE_QUOTE` at the catalog and `location_pair_gate` independently — because the platform holds one access class and this job works two locations | SHIP | *new system · full system · furnace and ac together · complete system · matched system · dual fuel* |
| `condensate-pump-installation` | Condensate Pump | The small pump that carries water away from the equipment, replaced or newly fitted | **CONDITIONAL_FIXED** | INDOOR | `condensate_route`, `indoor_equipment_access`, `supply_arrangement`, `existing_condition` | A pump already there proves the power and discharge route; absent, the run is unbounded and it leaves pricing | SHIP | *condensate pump · ac pump · furnace pump · little pump by the furnace* |
| `condensate-safety-switch-installation` | Water Safety Switch | A switch that shuts the system off before an overflow reaches the ceiling | **FIXED** | INDOOR | `condensate_route`, `indoor_equipment_access` | Bounded, additive work with no dependence on anything unseen — offered alongside another visit, not as a reason for one | SHIP · WWT | *float switch · overflow switch · prevent ac leak damage* |
| `condenser-pad-replacement` | Outdoor Unit Pad Replacement | A new level pad under the outdoor unit | **FIXED** | OUTDOOR | `outdoor_equipment_access`, `existing_condition` | Visible, bounded, and independent of the equipment on top of it | SHIP · WWT | *ac pad · unit is sinking · unit is tilting* |
| `oil-furnace-replacement` | Oil Furnace Replacement | A new oil-fired furnace | **REMOTE_QUOTE** | INDOOR | as furnace, plus oil facts V1 lacks | Deferred rather than shipped half-modeled: the questions it needs do not exist yet | DEFER | *oil furnace · oil heat* |
| `boiler-replacement` | Boiler Replacement | A new boiler for a radiator or baseboard system | **REMOTE_QUOTE** | INDOOR | as furnace, plus hydronic facts V1 lacks | Same | DEFER | *new boiler · radiator heat · baseboard heat* |
| `condenser-relocation` | Move the Outdoor Unit | The outdoor unit moved to a different position | **REMOTE_QUOTE** | BOTH | `outdoor_equipment_access`, `refrigerant_lineset`, `run_distance` | Real but rare; carried as an intent into the replacement quote path rather than as a catalog tile | DEFER | *move my ac · relocate outside unit · building a deck* |

## Ductless & Mini-Splits

| Key | Name | What the customer is buying | Disposition | L | Families | Why that is responsible | V1 | Aliases / overlapping intents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `mini-split-installation` | Mini-Split Installation | Wall or ceiling units with an outdoor unit, ducts not required | **REMOTE_QUOTE** | **BOTH** | `distribution_and_zoning`, both access families, `run_distance`, `refrigerant_lineset`, `condensate_route` | Every question is answerable and the scope is genuinely bounded — **G1 alone is why it cannot be fixed-priced.** All answers travel to the quote | SHIP | *mini split · ductless · split system · sunroom ac · garage ac · one head · multi head* |
| `mini-split-head-cleaning` | Mini-Split Deep Cleaning | Indoor units stripped and cleaned | **FIXED** | INDOOR | `distribution_and_zoning`, `indoor_equipment_access` | Scope is set by unit count and nothing else | SHIP | *mini split cleaning · head cleaning · mold smell from mini split* ⚠️ *odor is a symptom — screen first* |

## Indoor Air Quality

| Key | Name | What the customer is buying | Disposition | L | Families | Why that is responsible | V1 | Aliases / overlapping intents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `whole-house-humidifier` | Whole-House Humidifier | A humidifier on the system, replaced or newly fitted | **CONDITIONAL_FIXED** | INDOOR | `accessory_and_media`, `indoor_equipment_access`, `condensate_route`, `supply_arrangement`, `run_distance` | One already there proves the water, drain, duct opening and power; absent, those are runs of unknown length and it leaves pricing | SHIP | *humidifier · aprilaire · dry air · static shocks · humidifier replacement* |
| `air-cleaner-cabinet-installation` | Air Cleaner Cabinet Installation | A deeper filter cabinet fitted into the ductwork | **CONDITIONAL_FIXED** | INDOOR | `accessory_and_media`, `indoor_equipment_access`, `system_identity` | Bounded where there is room at the return; the branch that needs duct modification leaves pricing | SHIP | *media cabinet · media air cleaner · 4 inch filter · 5 inch filter · whole house filter · better filtration* |
| `duct-air-treatment-installation` | In-Duct Air Treatment | A UV or air-treatment device fitted inside the ductwork | **CONDITIONAL_FIXED** | INDOOR | `accessory_and_media`, `indoor_equipment_access`, `system_identity` | Mounting is bounded; the branch with no power within reach names the prerequisite instead of absorbing it | SHIP | *uv light · uv lamp · air purifier · air scrubber · ionizer · kill mold in ducts* |
| `accessory-consumable-replacement` | Replace a Filter, Pad or Lamp | The consumable inside existing equipment, swapped | **FIXED** | INDOOR | `accessory_and_media`, `indoor_equipment_access` | Only the element differs, and which one is a configuration that selects the material role | SHIP | *humidifier pad · water panel · uv bulb · media filter · replace the media* |
| `air-filter-replacement` | Air Filter Replacement | The standard system filter changed | **FIXED** | INDOOR | `accessory_and_media` | Trivially bounded, and offered alongside another visit rather than as a reason for one | SHIP · WWT | *change my filter · furnace filter · 16x25 filter* |
| `whole-house-dehumidifier-installation` | Whole-House Dehumidifier | A dehumidifier fitted to the system | **REMOTE_QUOTE** | INDOOR | `accessory_and_media`, `indoor_equipment_access`, `condensate_route` | Needs distribution facts V1 does not model | DEFER | *basement dehumidifier · damp basement · muggy house* ⚠️ *humidity complaint is a symptom* |
| `energy-recovery-ventilator-installation` | Fresh Air Ventilation | Controlled fresh-air exchange fitted to the system | **REMOTE_QUOTE** | INDOOR | `system_identity`, `indoor_equipment_access` | Same, and homeowners do not use the term | DEFER | *hrv · erv · fresh air · stuffy house* |

## Ducts & Vents

| Key | Name | What the customer is buying | Disposition | L | Families | Why that is responsible | V1 | Aliases / overlapping intents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `vent-cover-replacement` | Replace Vent Covers and Grilles | New covers on existing openings | **FIXED** | INDOOR | `indoor_equipment_access`, count | Nothing behind the wall changes, so nothing unobserved can move the price | SHIP | *registers · grilles · vent covers · rusty vents* |
| `duct-assessment` | Ductwork Assessment | Somebody attends and works out what the ductwork needs | **APPOINTMENT_ONLY** | INDOOR | `system_identity`, `indoor_equipment_access` | Duct scope cannot be bounded from a form, and V1 says so instead of pricing a guess | SHIP | *duct sealing · add a return · duct modification · leaky ducts · rooms don't get air* ⚠️ *airflow is a symptom — screen first* |

## Maintenance & Tune-Ups

| Key | Name | What the customer is buying | Disposition | L | Families | Why that is responsible | V1 | Aliases / overlapping intents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ac-tune-up` | Air Conditioner Tune-Up | A defined seasonal inspection, clean and test — including drain clearing | **FIXED** | OUTDOOR | `system_identity`, `outdoor_equipment_access`, count | Scope is set by the procedure, not by the system's condition; a tune-up on a struggling unit is the same work | SHIP | *ac tune up · ac service · summer checkup · spring maintenance · clean my ac · clear the drain line* |
| `furnace-tune-up` | Furnace Tune-Up | A defined seasonal inspection, clean and test | **FIXED** | INDOOR | `system_identity`, `heating_equipment`, `indoor_equipment_access`, count | Same, plus fuel and venting gates that the cooling tune-up does not run | SHIP | *furnace tune up · heating service · fall checkup · winter maintenance* |
| `heat-pump-tune-up` | Heat Pump Tune-Up | A defined inspection covering both heating and cooling operation | **FIXED** | OUTDOOR | `system_identity`, `outdoor_equipment_access`, count | Its included scope genuinely differs from an AC tune-up, which is why it is not merged into one | SHIP | *heat pump service · heat pump maintenance* |
| `mini-split-tune-up` | Mini-Split Tune-Up | A defined inspection and clean of ductless equipment | **FIXED** | INDOOR | `distribution_and_zoning`, `indoor_equipment_access` | Bounded by unit count | SHIP | *mini split service · ductless maintenance* |
| `boiler-tune-up` | Boiler Tune-Up | A defined inspection of a boiler system | **CONDITIONAL_FIXED** | INDOOR | `system_identity`, `heating_equipment`, `indoor_equipment_access` | Travels with `boiler-replacement` — no hydronic vocabulary yet | DEFER | *boiler service · radiator maintenance* |

## Service Visit

| Key | Name | What the customer is buying | Disposition | L | Families | Why that is responsible | V1 | Aliases / overlapping intents |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `hvac-service-call` | HVAC Service Visit | A technician attends and establishes what the work is | **APPOINTMENT_ONLY** | INDOOR **or** OUTDOOR | `system_identity`, one access family, `reported_symptom` | The promise it makes — somebody competent attends, at a known time, for a known visit price — is one Price2Book can keep. Predicting the repair is not | SHIP | **all thirteen symptoms**: *not cooling · no heat · won't turn on · won't start · weak airflow · leaking water · strange noise · short cycling · thermostat not responding · frozen · smells · too humid · uncomfortable · intermittent* |

---

# Part 4 — Recommended V1

| | Count |
| --- | --- |
| Candidates reviewed | 55 |
| Merged into survivors | −18 |
| Removed from canonical | −8 |
| **Canonical services** | **29** |
| Canonical but deferred from V1 | −7 |
| **Shipping in HVAC V1** | **22** |

**By disposition, of the 22:**

| Disposition | Count | |
| --- | --- | --- |
| `FIXED` | 10 | Produces a price outright |
| `CONDITIONAL_FIXED` | 5 | Prices on resolved branches, leaves pricing otherwise |
| `REMOTE_QUOTE` | 5 | Collects a complete observable scope, then routes to a quote |
| `APPOINTMENT_ONLY` | 2 | Books a visit |

Fifteen of twenty-two can produce a price. Five collect a full canonical scope and hand it
to a person. Two book somebody to attend. Nothing predicts a repair.

**Three of the twenty-two are While-We're-There only** — `air-filter-replacement`,
`condensate-safety-switch-installation`, `condenser-pad-replacement` — which gives the four
tune-ups a coherent set of natural add-ons and keeps a van from being sent for a filter.

**What changed most, in one line each.** The four two-unit replacements became one service
a homeowner would actually pick. The three thermostat services became one, and the same
presence/absence rule then collapsed humidifier and condensate pump. Twelve categories
became seven by removing every one that asked the homeowner to classify their own
equipment. And `condensate-drain-clearing` was removed not for what it is called but for
what it would have been used for.

**Open for your call:** whether `oil-furnace-replacement` and `boiler-replacement` should
be deferred as recommended, or shipped as honest enquiry paths. The argument for shipping
them is that `Service.offered` defaults false, so a contractor who does not do oil or
hydronic never sees them. The argument against — and the one taken here — is that a service
whose questions cannot describe its own scope is a worse experience than a general enquiry.

---

# Part 5 — The HVAC V1 catalog

*Approved 1 September 2026. Twenty-two services, seven categories. This is the list the
service-by-service trade review works from.*

**Locked before this list:** the presence/absence merge rule (decision 8), all nine
approved merges and three removals, the seven-category structure, and decision 7 —
oil and hydronic stay deferred and are **not** folded in as fuel branches, because a
service whose vocabulary cannot describe its own scope drivers collects an incomplete
scope even at `REMOTE_QUOTE`. Neither carries search aliases in V1; see G10.

`WWT` marks a While-We're-There-only service — real work, offered alongside another
visit, never a reason to send a van.

## 1 · Thermostats

| Service | Disposition | Status | Scope, in one sentence | Principal observable questions |
| --- | --- | --- | --- | --- |
| **Thermostat Installation** | CONDITIONAL_FIXED | SHIP | A thermostat fitted to an existing system and set up — whether it replaces one or is the first on that wall. | Is there a thermostat there now, and does it control the system? · Is it a smart or Wi-Fi thermostat? · Do you have it already, or should we supply it? · How many wires land on the back plate? · Is one of them blue, or marked C? · How many thermostats? |

## 2 · Heating & Cooling Systems

| Service | Disposition | Status | Scope, in one sentence | Principal observable questions |
| --- | --- | --- | --- | --- |
| **Furnace Replacement** | REMOTE_QUOTE | SHIP | The existing furnace removed and a new one installed in its place. | What kind of system is it? · What fuel does it burn? · What leaves the top — a metal pipe, or one or two white plastic pipes? · What input is on the rating plate? · Where is it? · Is there a drain or a pump nearby? · Are you supplying the furnace? · What does the existing one look like? |
| **Air Conditioner Replacement** | REMOTE_QUOTE | SHIP | The outdoor air conditioning unit removed and replaced. | What kind of system is it? · What size is on the nameplate? · Where does the outdoor unit sit? · Are there insulated copper lines running to it, and can you see where they go? · Are you supplying the unit? |
| **Heat Pump Replacement** | REMOTE_QUOTE | SHIP | The outdoor heat pump removed and replaced. | What kind of system is it? · What size is on the nameplate? · Where does the outdoor unit sit? · Are there insulated copper lines, and can you see where they run? · Is the thermostat being kept? · Are you supplying the unit? |
| **Replace My Heating and Cooling System** | REMOTE_QUOTE | SHIP | Both the indoor and the outdoor equipment replaced together. | Every question above, plus: Where is the indoor equipment? · Where does the outdoor unit sit? · Is there a drain or pump for condensate? |
| **Condensate Pump** | CONDITIONAL_FIXED | SHIP | The small pump that carries water away from the equipment, replaced or newly fitted. | Where is the indoor equipment? · Is there a small pump with a plastic reservoir beside or under it? · Is there a socket within reach? · Do you have the pump already? · What does the existing installation look like? |
| **Water Safety Switch** | FIXED | SHIP · **WWT** | A switch that shuts the system down before an overflow reaches the ceiling. | Where is the indoor equipment? · Is there a drain line or a pump? |
| **Outdoor Unit Pad Replacement** | FIXED | SHIP · **WWT** | A new level pad under the outdoor unit. | Where does the outdoor unit sit? · What does the existing pad look like? |

## 3 · Ductless & Mini-Splits

| Service | Disposition | Status | Scope, in one sentence | Principal observable questions |
| --- | --- | --- | --- | --- |
| **Mini-Split Installation** | REMOTE_QUOTE | SHIP | Wall or ceiling units and an outdoor unit installed, with no ductwork involved. | How many indoor units? · Which wall or ceiling would each go on? · Where would the outdoor unit sit? · Roughly how far between them? · Is there an existing line set? · Where would the water drain to? |
| **Mini-Split Deep Cleaning** | FIXED | SHIP | The indoor units stripped down and cleaned. | How many indoor units? · Where are they? |

## 4 · Indoor Air Quality

| Service | Disposition | Status | Scope, in one sentence | Principal observable questions |
| --- | --- | --- | --- | --- |
| **Whole-House Humidifier** | CONDITIONAL_FIXED | SHIP | A humidifier fitted to the system's ductwork, replacing one or fitting the first. | Is there a humidifier on the ductwork now? · What kind of system is it? · Where is the indoor equipment? · Is there a water line within reach? · Is there a floor drain or a pump nearby? · Do you have the humidifier already? |
| **Air Cleaner Cabinet Installation** | CONDITIONAL_FIXED | SHIP | A deeper filter cabinet fitted into the ductwork so the system takes a thicker filter. | Is there a filter cabinet there now? · What size is printed on the filter you take out? · Where is the indoor equipment? · What kind of system is it? |
| **In-Duct Air Treatment** | CONDITIONAL_FIXED | SHIP | A UV or air-treatment device fitted inside the ductwork. | Is there one fitted now? · What kind of system is it? · Where is the indoor equipment? · Is there a socket within reach? |
| **Replace a Filter, Pad or Lamp** | FIXED | SHIP | The consumable inside a piece of existing equipment, swapped for a new one. | Which piece of equipment is it — humidifier, air cleaner, or UV lamp? · Where is the indoor equipment? · What size or part number is printed on the one you are taking out? |
| **Air Filter Replacement** | FIXED | SHIP · **WWT** | The standard system filter changed. | What size is printed on the edge of the filter? · Where is the filter slot? |

## 5 · Ducts & Vents

| Service | Disposition | Status | Scope, in one sentence | Principal observable questions |
| --- | --- | --- | --- | --- |
| **Replace Vent Covers and Grilles** | FIXED | SHIP | New covers fitted to existing openings, with nothing behind the wall changed. | How many are being replaced? · What size is each opening? · Are they on walls, ceilings or floors? |
| **Ductwork Assessment** | APPOINTMENT_ONLY | SHIP | Somebody attends, looks at the ductwork, and establishes what it needs. | What kind of system is it? · Where is the indoor equipment? · Which rooms are you concerned about? |

## 6 · Maintenance & Tune-Ups

| Service | Disposition | Status | Scope, in one sentence | Principal observable questions |
| --- | --- | --- | --- | --- |
| **Air Conditioner Tune-Up** | FIXED | SHIP | A defined seasonal inspection, clean and operational test of the cooling system, including clearing the condensate drain. | What kind of system is it? · Where does the outdoor unit sit? · How many cooling systems? |
| **Furnace Tune-Up** | FIXED | SHIP | A defined seasonal inspection, clean and operational test of the heating system. | What kind of system is it? · What fuel does it burn? · What leaves the top — metal pipe, or white plastic? · Where is it? · How many heating systems? |
| **Heat Pump Tune-Up** | FIXED | SHIP | A defined inspection and test covering both the heating and the cooling side of a heat pump. | What kind of system is it? · Where does the outdoor unit sit? · How many systems? |
| **Mini-Split Tune-Up** | FIXED | SHIP | A defined inspection and clean of ductless equipment. | How many indoor units? · Where are they? |

## 7 · Service Visit

| Service | Disposition | Status | Scope, in one sentence | Principal observable questions |
| --- | --- | --- | --- | --- |
| **HVAC Service Visit** | APPOINTMENT_ONLY | SHIP | A technician attends and establishes what the work is, at a known visit price. | What are you seeing? *(the thirteen symptoms — carried as context, selecting nothing)* · What kind of system is it? · Where is the equipment? |

## Totals

| | |
| --- | --- |
| Categories | 7 |
| Services shipping | **22** |
| `FIXED` | 10 |
| `CONDITIONAL_FIXED` | 5 |
| `REMOTE_QUOTE` | 5 |
| `APPOINTMENT_ONLY` | 2 |
| While-We're-There only | 3 |
| Canonical but deferred | 7 |

Fifteen of the twenty-two can produce a price. Five collect a complete observable scope and
hand it to a person. Two book somebody to attend. **None predicts a repair.**

## Standing constraints on this list

- **`condensate-drain-clearing` is not a service.** The work is inside
  `ac-tune-up`'s `maintenanceScope`; *"my AC is leaking water"* routes to the Service Visit
  as `WATER_OBSERVED`.
- **No component-named service exists**, which is what leaves a symptom nothing to resolve
  to. Adding one re-opens the §G.7 re-audit.
- **Two services are `locationScope: "BOTH"`** — Replace My Heating and Cooling System, and
  Mini-Split Installation — and both refuse twice. They are the V1 cost of G1.
- **Three services are `WWT`**, which gives the four tune-ups a coherent set of add-ons and
  keeps a van from being sent for a filter.

---

# Part 6 — G1 re-audit: the three tune-ups

*Requested before catalog lock. The result changed G1's status.*

> **RESOLVED, 2 September 2026.** This audit did its job: it found three routine
> tune-ups declared single-location while promising work at both, and escalated
> G1 from "constrains V1" to a blocker. Scoped access shipped and was accepted on
> a zero-delta ADR-021 proof. The three tune-ups keep their honest scope **and**
> their `FIXED` disposition, and `location_scope_matches_promised_work` now
> prevents the misdeclaration that started it. Kept in full — the reasoning is
> why the invariant exists.

## 6.1 The question, and the short answer

> If their promised work genuinely includes both indoor and outdoor equipment, explain how
> they are currently classified FIXED without violating the locked `locationScope=BOTH`
> double refusal.

**They are not.** All three genuinely work both locations, and they are classified `FIXED`
only because `locationScope` was **declared wrongly** — as `OUTDOOR` for the two central
tune-ups and `INDOOR` for the ductless one. The double refusal never fired because it was
never given a `BOTH` to refuse.

That is not a loophole in the rule. It is an input the rule cannot see, and the audit's real
finding is that **the rule has no defense against a misdeclaration** — see 6.4.

## 6.2 What each tune-up actually promises

| Tune-up | Work at the **outdoor** unit | Work at the **indoor** equipment | Truthful scope |
| --- | --- | --- | --- |
| **Air Conditioner** | Clean the condenser coil, clear debris, check the contactor, capacitor, disconnect and fan motor, verify operating pressures | Filter, blower, evaporator coil, thermostat operation, temperature split, **and clearing the condensate drain** | **BOTH** |
| **Heat Pump** | All of the above, plus defrost and reversing-valve operation in heating mode | All of the above, plus backup heat operation at the air handler | **BOTH** |
| **Mini-Split** | Condenser coil, electrical connections, mounting | Every indoor head — filters, blower wheel, drain pan, drain line | **BOTH** |
| **Furnace** *(control case)* | — none | Burners, heat exchanger, ignition, blower, filter, venting, safeties | **INDOOR** — correct as declared |

The furnace tune-up matters here: it is the one tune-up that is genuinely single-location,
and its `FIXED` classification is sound. Three of four were mis-declared, not four of four,
so this is a specific defect rather than a category error about maintenance.

**The AC tune-up's contradiction is written down in this very document.** Part 2, audit 3
removed `condensate-drain-clearing` as a standalone service and folded the work into
`ac-tune-up`'s `maintenanceScope` — condensate drain clearing happens at the **indoor**
equipment. Part 3 and Part 5 then declare the service `locationScope: OUTDOOR` and ask only
*"where does the outdoor unit sit?"*. The promise and the declaration were written on the
same day and disagree.

## 6.3 What that costs a real homeowner

A house with the air handler in the attic above a finished ceiling and the condenser at
ground level beside the patio:

```
  Q  What kind of system?          →  FURNACE_AND_AC
  Q  Where does the outdoor unit sit?  →  GROUND_LEVEL_ADJACENT  →  ACCESSIBLE
  Q  How many cooling systems?     →  1

  →  access_class = ACCESSIBLE.  Gates pass.  FIXED price shown.

  The promised scope includes flushing a condensate drain
  at equipment reached through an attic hatch over a finished ceiling.
  Nobody established that, and the price was a promise made against it.
```

This is the failure the whole architecture is built to prevent, arrived at from the one
direction the checks do not cover: not an uncertain scope priced anyway, but a **certain
scope whose access was never asked about**.

## 6.4 Why the double refusal did not catch it — and the missing third check

Decision 2's defense in depth is real but narrower than it reads. Both refusals key off the
**same author-declared field**:

| Refusal | Reads |
| --- | --- |
| Catalog `bookingType: REMOTE_QUOTE` | the author's `locationScope` |
| `location_pair_gate` | the author's `locationScope` |

Two independent refusals against a **catalog edit** — one cannot be removed without the
other objecting. **Zero refusals against a misdeclaration**, because a wrong `locationScope`
silences both at once.

Nothing today cross-checks `locationScope` against the work the service says it does. The
missing invariant:

> **`location_scope_matches_promised_work`.** A service whose `maintenanceScope` names work
> at both indoor and outdoor equipment, or which composes questions about both, must declare
> `locationScope: "BOTH"`. Declaring a narrower scope than the promised work fails the build.

This is checkable, but only if `maintenanceScope` items say **where** they are performed. So
decision 1's metadata should be a structured list rather than prose — each item carrying
`at: "INDOOR" | "OUTDOOR"`. That is a small change to an approved-but-unbuilt declaration,
and it is what turns this audit's finding into something a machine catches next time.

## 6.5 Why "just ask both questions" is not available

`lib/pricing.ts:507`:

```ts
const accessClass = branch.accessClassification ?? config.accessClass;
```

A later access answer **overwrites** an earlier one. Two access-writing questions in one
tree means the last one answered wins, silently, with no record that a different answer was
given first — the electrical synonym bug's direct descendant.

`composeService` refuses that at composition time (`DUPLICATE_FACT_WRITER`) and refuses it
**unconditionally, because no merge rule exists**. So the runtime path is unreachable
through a composed tree today. That refusal is correct and should stay. It is also the
reason there is no local workaround: the platform has one slot, and nowhere to say how two
answers would combine.

## 6.6 Truthful re-declaration across the catalog

Applying the rule that **`locationScope` describes the work, not the desired pricing
outcome** — declared truthfully everywhere, consequences taken where they fall:

| Service | Was | Truthfully | Cost of telling the truth |
| --- | --- | --- | --- |
| Replace My Heating and Cooling System | BOTH | BOTH | none — already `REMOTE_QUOTE` |
| Mini-Split Installation | BOTH | BOTH | none — already `REMOTE_QUOTE` |
| Central Air Conditioner Replacement | OUTDOOR | **BOTH** | **none** — already `REMOTE_QUOTE`; the indoor coil is worked, and decision-level guidance already says the service must not describe itself as if only the condenser matters |
| Heat Pump Replacement | OUTDOOR | **BOTH** | **none** — already `REMOTE_QUOTE`; indoor equipment and backup heat are worked |
| **Air Conditioner Tune-Up** | OUTDOOR | **BOTH** | **`FIXED` → refused** |
| **Heat Pump Tune-Up** | OUTDOOR | **BOTH** | **`FIXED` → refused** |
| **Mini-Split Tune-Up** | INDOOR | **BOTH** | **`FIXED` → refused** |
| Furnace Tune-Up | INDOOR | INDOOR | none — correct |
| Mini-Split Deep Cleaning | INDOOR | INDOOR | none — indoor heads only, the outdoor unit is untouched |
| Condensate Pump · Overflow Safety Switch · Humidifier · Filter Cabinet · In-Duct Treatment · Consumables · Standard Filter · Thermostat · Ductwork Assessment | INDOOR | INDOOR | none |
| Outdoor Unit Pad Replacement | OUTDOOR | OUTDOOR | none |

**Seven services are truthfully `BOTH`. Four are free** — they are already `REMOTE_QUOTE`,
so an honest declaration costs nothing and removes a second, quieter lie from the catalog.
**Three are the actual G1 bill**, and all three are routine known-scope maintenance.

**Identity is not access.** Capturing indoor coil or air-handler *identity* as evidence on
a replacement service is a different thing from classifying indoor *access*, and the two
must not be conflated: evidence rides on the job sheet and prices nothing, access is a scope
fact that gates. `ac-replacement` needs both, for different reasons.

## 6.7 Recommendation

### Primary — promote G1 to a pre-HVAC-production blocker

G1 moves from *"constrains what V1 may fixed-price"* to **a gate condition alongside
G2–G5**. The three tune-ups keep their honest scope and their intended `FIXED` product
decision, and they ship once access can be represented per location.

A sketch, for sizing only — **the shape is the platform owner's call, not HVAC's**:

- `JobConfiguration.accessClass` becomes a small keyed map rather than a scalar, over a
  closed slot vocabulary (`PRIMARY`, `INDOOR_EQUIPMENT`, `OUTDOOR_EQUIPMENT`).
- `AnswerOption` gains an `accessSlot`, defaulting to `PRIMARY`.
- Components and conditional disclaimers condition on `(slot, class)` rather than on class
  alone.
- `composeService` refuses two writers **per slot** rather than per fact.

The property that makes this safe for a frozen plumbing template and a live electrical
catalog: **everything existing writes and reads `PRIMARY`, so no current tree changes
meaning.** It is additive, in the way `AppointmentKind.SERVICE_CALL` is additive.

### Fallback — if the platform work slips, `CONDITIONAL_FIXED`, never a narrowed scope

If G1 is not resolved in time, the three tune-ups ship `CONDITIONAL_FIXED` on these terms:

- **The promised `maintenanceScope` does not change.** Both locations are still worked and
  still promised.
- One location writes `access_class` — the one that dominates the visit.
- The other location is asked as an **ordinary refusal-only fact** that no access gate
  reads: the straightforward answers continue, and attic, crawl space, roof or
  constrained answers leave automated pricing.

This narrows **how many homes get an automated price**, not what the tune-up includes —
which is the distinction the instruction *"do not narrow a legitimate tune-up scope merely
to evade G1"* draws. It merges nothing, invents no second access vocabulary that gates, and
converts to the primary recommendation with no change to the questions.

**Not recommended as the destination.** Turning routine maintenance into a review for the
common attic-air-handler house is a bad product outcome, and it is worth saying plainly that
this is a holding position rather than an answer.

### Rejected outright

Narrowing the tune-ups to one location — an AC tune-up that does not touch the indoor
equipment is not a tune-up, and shipping one under that name would be the catalog making a
promise the trade does not recognize.

---

# Part 7 — Service decisions from the trade pass

*Applied. The three tune-ups marked ⏸ held their implementation status pending
G1.* **That hold is released — G1 was accepted 2 September 2026 and all three
keep `FIXED`.** The ⏸ marks are left in place as the record of what was
conditional and on what.

| Service | Name change | Disposition | Other decisions applied |
| --- | --- | --- | --- |
| Thermostat Installation | → **Install or Replace a Thermostat** | CONDITIONAL_FIXED | **C-wire is asked, not inferred from color**: *"Is a wire connected to the terminal marked C?"* with *Not sure* + photo. A new location stays the same canonical service but needs a bounded wiring/path branch or `REMOTE_QUOTE` — the absence branch is **not** assumed fixed-price. Proprietary and communicating controls **fail closed** rather than being inferred from conductor count |
| Furnace Replacement | — | REMOTE_QUOTE | V1 structured scope is **gas/propane forced-air**. Oil stays deferred. Capture connected/matched equipment context |
| Air Conditioner Replacement | → **Central Air Conditioner Replacement** | REMOTE_QUOTE | Capture indoor coil / air-handler identity **as evidence**. `locationScope` → **BOTH** (§6.6) |
| Heat Pump Replacement | — | REMOTE_QUOTE | Capture indoor equipment identity, backup heat where observable, and thermostat identity. `locationScope` → **BOTH** (§6.6) |
| Replace My Heating and Cooling System | — | REMOTE_QUOTE | One intent preserved; answers determine the system classification |
| Condensate Pump | — | CONDITIONAL_FIXED | First-time installation must also bound the **discharge/tubing route**; unbounded route → review |
| Water Safety Switch | → **Condensate Overflow Safety Switch** | FIXED · WWT | Standard scope defined as **one accessible condensate drain/pan safety switch** |
| Outdoor Unit Pad Replacement | — | **FIXED → CONDITIONAL_FIXED** · WWT | Automated price requires a standard ground-mounted unit liftable without refrigerant or electrical disconnection, within bounded pad conditions. Stands, roofs and constrained sites review |
| Mini-Split Installation | — | REMOTE_QUOTE | Existing-vs-new added as a branch per decision 8. Capture electrical source/disconnect and outdoor mounting method alongside heads, locations, distance, line set and condensate. Line-set suitability stays a trade judgment |
| Mini-Split Deep Cleaning | — | **FIXED → CONDITIONAL_FIXED** | Capture indoor-unit **type**, quantity, height/access. Distinguished from the tune-up by explicit `maintenanceScope` |
| Whole-House Humidifier | — | CONDITIONAL_FIXED | Capture device type/model. Bypass and fan-powered have bounded priced branches; **steam reviews** |
| Air Cleaner Cabinet Installation | → **Whole-Home Filter Cabinet** | CONDITIONAL_FIXED | "Air cleaner" risked implying a powered purifier. Aliases keep *media cabinet · 4-inch filter · whole-house filter*. First-time insertion needing unbounded sheet-metal transitions **reviews** |
| In-Duct Air Treatment | → **UV Light / In-Duct Air Treatment** | CONDITIONAL_FIXED | Device is configuration; capture model/type and power arrangement. **No performance or air-quality claims in canonical scope** |
| Replace a Filter, Pad or Lamp | → **Humidifier Pad, Media Filter or UV Bulb Replacement** | FIXED | Longer, and it tells a homeowner what the merged service actually contains |
| Air Filter Replacement | → **Standard Air Filter Replacement** | FIXED · WWT | Quantity added. **Every tune-up's `maintenanceScope` audited** so a standard filter is never separately charged where that contractor's tune-up already includes it |
| Replace Vent Covers and Grilles | — | **SHIP → DEFER** | Canonical but not a default V1 slot; contractors who sell the work enable it later |
| Ductwork Assessment | → **Ductwork Inspection & Assessment** | APPOINTMENT_ONLY | — |
| Air Conditioner Tune-Up ⏸ | — | FIXED *(product)* | Routine accessible condensate drain flush defined precisely; significant blockage stays **discovered work**. Implementation held for G1 |
| Furnace Tune-Up | — | FIXED | V1 fixed scope is **gas/propane forced-air**. Selecting oil must **not** silently receive a gas-furnace maintenance promise |
| Heat Pump Tune-Up ⏸ | — | FIXED *(product)* | Implementation held for G1 |
| Mini-Split Tune-Up ⏸ | — | FIXED *(product)* | Routine tune-up and light cleaning explicitly distinguished from Deep Cleaning's disassembly washing. Implementation held for G1 |
| HVAC Service Visit | — | APPOINTMENT_ONLY | Symptoms stay context-only and safety-screened; none selects a component repair |

## Counts after the trade pass

Two different totals are in play and must not be conflated:

- **Canonical model — 29 services.** Everything HVAC models, including the seven deferred
  entirely from V1 (oil furnace, boiler, condenser relocation, zoning, dehumidifier,
  fresh-air ventilation, boiler tune-up).
- **V1 catalog — 22 services.** Of these, Vent Covers & Grilles is deferred, so
  **21 default-ship**.

**Moving a service between dispositions never changes a count.** The three tables below
describe the same 22 services under three conditions.

| | FIXED | CONDITIONAL_FIXED | REMOTE_QUOTE | APPOINTMENT_ONLY | Total |
| --- | --- | --- | --- | --- | --- |
| **V1 catalog** (incl. deferred Vent Covers) | 8 | 7 | 5 | 2 | **22** |
| **Default SHIP** — the actual state | 7 | 7 | 5 | 2 | **21** |
| ~~Default SHIP, G1 slipped~~ *(holding position, never needed)* | 4 | 10 | 5 | 2 | **21** |

**G1 was accepted as solved on 2 September 2026**, so the second row is the real
disposition and the third never applied. The three tune-ups keep `FIXED`; no
service moved to `CONDITIONAL_FIXED` for a G1 reason.

The trade pass moved two services — Outdoor Unit Pad and Mini-Split Deep Cleaning — from
`FIXED` to `CONDITIONAL_FIXED`, for the same reason in both cases: a bounded standard case
prices, and the non-standard case refuses rather than being averaged into the standard one.
That is the `10 → 8` and `5 → 7` shift in the first row.

The third row is the G1 holding position only: AC, Heat Pump and Mini-Split Tune-Up move
`FIXED → CONDITIONAL_FIXED`. **Their promised scope is unchanged in every row** — what
changes is how many homes receive an automated price.

**Two open items carried from the earlier pass, both now resolved by the trade decisions:**
the weak Vent Covers entry is deferred, and the awkward consumable name is replaced by one
that names its three contents.

---

# Part 8 — Customer modes and fact classification

*2 September 2026. The §4.6 and §5 ask from `docs/design/guided-estimates.md`
(branch `guided-estimates/v1-architecture`, `509eb0c`), answered for HVAC.*

**Documentation only. Guided Estimates is NOT implemented here** — no milestone
moves, no surfaces, no contractor controls, no code. This records what the HVAC
trade model can defend, so the reasons do not have to be reconstructed later
from services that no longer remember why a mode was excluded.

Cited decisions are `D1`–`D7` from that document's LOCKED DECISIONS block.

## 8.1 What is being recorded, and what it is not

Three modes, declared per service as a **set** (D2):

| Mode | Meaning |
| --- | --- |
| `PRICE_ONLINE` | Price2Book knows enough to produce the contractor-approved price |
| `GUIDED_ESTIMATE` | Price2Book collects what the contractor needs to price remotely; a human sets the number |
| `ONSITE_VISIT` | The scope genuinely requires someone onsite |

**This is canonical CAPABILITY, not commercial outcome and not readiness.** It
does not know which contractor is asking, what they configured, or whether
anything is ready. A contractor selects from this set and may not widen it (D3).

**Readiness never re-selects a mode (D4).** An HVAC service with unresolved
labor inputs, no approved price or an outstanding policy key is **blocked and
stays blocked**. It does not become a Guided Estimate and it does not reach a
homeowner. Every readiness rule already in `serviceActivation.ts` and
`onboardingReadiness.ts` applies unchanged; none of them may touch the mode.

**Note the difference from `bookingType`.** HVAC's `REMOTE_QUOTE` services are
canonically modeled in full and ship as quotes for a *commercial* reason (Q1).
That is not the same statement as "this cannot be priced online", which is what
a mode exclusion asserts. Four replacement services carry both, for different
reasons, and the two must not be collapsed.

## 8.2 The named-reason vocabulary

D2 requires the specific fact that cannot be established, never a general
judgment. **Six reasons cover the catalog**, down from seven: G1 removed the
seventh by removing the limitation it named — see 8.5.

| Reason | What cannot be established |
| --- | --- |
| `lineset_suitability_is_trade_judgment` | Whether an existing refrigerant line set may be reused. Observable presence and path only; reusability is a technician's determination (decision 5) |
| `equipment_match_not_observable` | Whether the indoor coil or air handler matches the proposed outdoor unit |
| `vent_termination_unmodeled` | The vent termination path and combustion-air provision at replacement. `venting_class` establishes how the existing appliance vents, not what the new one will require |
| `duct_scope_unbounded` | Duct sizing, condition and adequacy. V1 models no distribution facts (Q6) |
| `scope_produced_by_the_visit` | The work itself. The visit does not describe a scope, it establishes one — so there is nothing to price remotely either |
| `same_visit_only_service` | Not a fact about the job — a fact about the *purchase*. The service is not primary-eligible, so it is never bought on its own and no customer mode applies to it standalone. See 8.7 |

**`location_pair_unrepresentable` has been removed.** It named a limitation of
the platform rather than a fact about HVAC, and G1 removed the limitation — the
engine now holds `INDOOR_EQUIPMENT` and `OUTDOOR_EQUIPMENT` independently and
neither can overwrite the other. An exclusion whose only ground was "Price2Book
cannot represent this" is exactly the kind that must disappear when the platform
learns to represent it; keeping it would make Guided Estimate a place to put
limitations we can legitimately remove.

## 8.3 Supported modes, per service

`P` = `PRICE_ONLINE` · `G` = `GUIDED_ESTIMATE` · `V` = `ONSITE_VISIT`

### Thermostats

| Service | Modes | Excluded, and why |
| --- | --- | --- |
| Install or Replace a Thermostat | P · G · V | — |

### Heating & Cooling Systems

| Service | Modes | Excluded, and why |
| --- | --- | --- |
| Furnace Replacement | G · V | **P** — `vent_termination_unmodeled` |
| Central Air Conditioner Replacement | G · V | **P** — `lineset_suitability_is_trade_judgment`, `equipment_match_not_observable` |
| Heat Pump Replacement | G · V | **P** — `lineset_suitability_is_trade_judgment`, `equipment_match_not_observable` |
| Replace My Heating and Cooling System | G · V | **P** — `equipment_match_not_observable`, `vent_termination_unmodeled` |
| Condensate Pump | P · G · V | — |
| Condensate Overflow Safety Switch | P · G · V | — *(see 8.7)* |
| Outdoor Unit Pad Replacement | P · G · V | — *(see 8.7)* |

### Ductless & Mini-Splits

| Service | Modes | Excluded, and why |
| --- | --- | --- |
| Mini-Split Installation | G · V | **P** — `lineset_suitability_is_trade_judgment` |
| Mini-Split Deep Cleaning | P · G · V | — |

### Indoor Air Quality

| Service | Modes | Excluded, and why |
| --- | --- | --- |
| Whole-House Humidifier | P · G · V | — |
| Whole-Home Filter Cabinet | P · G · V | — |
| UV Light / In-Duct Air Treatment | P · G · V | — |
| Humidifier Pad, Media Filter or UV Bulb Replacement | P · G · V | — |
| Standard Air Filter Replacement | P · G | **V** — `same_visit_only_service` |

### Ducts & Vents

| Service | Modes | Excluded, and why |
| --- | --- | --- |
| Replace Vent Covers and Grilles *(deferred)* | P · G · V | — |
| Ductwork Inspection & Assessment | V | **P** and **G** — `duct_scope_unbounded`, `scope_produced_by_the_visit` |

### Maintenance & Tune-Ups

| Service | Modes | Excluded, and why |
| --- | --- | --- |
| Air Conditioner Tune-Up | P · G · V | — *(exclusion removed by G1; see 8.5)* |
| Furnace Tune-Up | P · G · V | — |
| Heat Pump Tune-Up | P · G · V | — *(exclusion removed by G1)* |
| Mini-Split Tune-Up | P · G · V | — *(exclusion removed by G1)* |

### Service Visit

| Service | Modes | Excluded, and why |
| --- | --- | --- |
| HVAC Service Visit | V | **P** and **G** — `scope_produced_by_the_visit`. A reported symptom is context, not a scope; there is nothing for a human to price remotely either |

## 8.4 Decision facts vs estimate-intake facts — §5

**Decision facts** are consumed deterministically to choose scope, price,
routing or refusal. **Estimate-intake facts** are collected because a human
needs them to price remotely, and the engine prices nothing from them. Some
facts are both; the classification is per use, not per name.

The failure the split prevents: without it, every fact a contractor wants ends
up in the deterministic tree as a routing-neutral `CONTINUE`, and the pricing
engine ends up carrying questions that price nothing.

### Decision facts — every one already gated

| Fact | Consumed by |
| --- | --- |
| `system_type` | `identity_gate` |
| `fuel_type` | `fuel_gate` |
| `venting_class` | `venting_gate` |
| `cooling_tons`, `heating_input_btu` | `capacity_gate` |
| `indoor_location`, `outdoor_location` | `access_gate` |
| `control_present`, `conductor_count`, `common_wire` | `control_gate` |
| `equipment_condition` | `condition_gate` — effect-free, routing only |
| `accessory_present`, `replacement_vs_new` | Service and branch selection |
| `condensate_route`, `filter_slot_size` | Scope and material roles |
| `supply_arrangement` | Policy-keyed pricing |
| `head_count`, `zone_count`, `system_count` | Quantity |
| `run_band` | Band policy |
| `lineset_status` | Refusal only — presence and path, never reusability |

### Estimate-intake facts — proposed, and priced by nobody

Collected only on `GUIDED_ESTIMATE` routes. **None of these may enter the
deterministic pricing tree**, and none is a gate input.

| Fact | Why a human needs it | On |
| --- | --- | --- |
| Proposed indoor head positions | Mounting feasibility and line routing | Mini-Split Installation |
| Proposed outdoor unit position | Pad, mounting, clearances, noise to neighbors | Mini-Split Installation, replacements |
| Line-set path photograph | Whether the existing run is usable and how far it goes | Any service touching a line set |
| Wall and ceiling construction | What the penetration involves | Mini-Split Installation |
| Vent termination photograph | Where the new vent can terminate | Furnace Replacement |
| Clearances around existing equipment | Whether the replacement fits where the old one stood | All equipment replacement |
| Electrical supply and disconnect photograph | Whether the circuit and disconnect serve the new unit | Replacements, mini-splits |
| Existing equipment photographs, wide and nameplate | Everything the questions did not think to ask | All `GUIDED_ESTIMATE` routes |
| Delivery and access notes | Getting equipment to where it is installed | All equipment replacement |

### Evidence-only facts — read by nothing, decision 3

`manufacturer` · `model` · `serial` · **`manufacture_date`**

Carried to the job sheet. No gate reads them, no mapping consumes them, no mode
declaration depends on them. `manufacture_date` in particular must never
trigger or recommend replacement — diagnosis by arithmetic.

**These are a third category, not a subset of estimate-intake.** An
estimate-intake fact is *given to a human to price with*; an evidence-only fact
is recorded and used by no one to decide anything.

## 8.5 Resolved by G1 — what the provisional marks became

G1 was approved under option (a) and its proof is green: ADR-021 reports zero
price delta across all 65 existing services, and the engine holds
`INDOOR_EQUIPMENT = FINISHED` alongside `OUTDOOR_EQUIPMENT = ACCESSIBLE` with
neither able to overwrite the other. **HVAC can represent the two-location fact
that motivated G1.**

Every provisional mark is therefore resolved, and they did not all resolve the
same way — which is the point:

| Service | Was | Now |
| --- | --- | --- |
| Air Conditioner Tune-Up | `PRICE_ONLINE` provisionally excluded | **Supported.** The only obstacle was representational |
| Heat Pump Tune-Up | same | **Supported** |
| Mini-Split Tune-Up | same | **Supported** |
| Mini-Split Installation | two reasons, one provisional | **Still excluded** — `lineset_suitability_is_trade_judgment` |
| Replace My Heating and Cooling System | three reasons, one provisional | **Still excluded** — `equipment_match_not_observable`, `vent_termination_unmodeled` |

This is what makes the Guided Estimate positioning credible rather than
convenient. The three routine tune-ups lost their exclusion because the platform
learned to represent their scope; the two genuinely hard jobs kept theirs
because a human still adds something. An estimate path that had absorbed all
five would have been hiding a data-model limitation behind a product mode.

### Consequences for HVAC's own architecture — not applied here

Two recorded HVAC decisions were written when `location_pair_gate` was the
answer, and both now need revisiting. **Neither is changed by this document.**

- **Decision 2** — the `locationScope: "BOTH"` double refusal (`REMOTE_QUOTE`
  booking outcome plus an independent `location_pair_gate`). Its premise was
  that the platform could not carry two locations. It now can.
- **Decision 9** — G1 as a pre-production blocker. It is delivered.

The three tune-ups' `FIXED` product decision, held pending G1, is unblocked on
the representational question. What has *not* been re-verified is whether each
still prices correctly end to end once `location_pair_gate` stops refusing —
that is HVAC implementation work, and HVAC is still parked.

## 8.6 What HVAC is NOT doing

No `supportedCustomerModes` field is added to the HVAC service type. No
contractor-facing control, no company default, no selection UI, no readiness
rule, no `QuotePricingForm` change. The §12 deposit-authority defect and D6/D7
are not HVAC's and are untouched.

This part is a record, and it stays a record until Guided Estimates is
scheduled as its own piece of work.

## 8.7 Audit — `visit_cannot_pay_for_itself`, and where it landed

**Canonical capability must not depend on contractor economics.** The original
reason failed that test on its own wording: *"cannot be sold at a defensible
price"* is a claim about a price list, and a different contractor could
reasonably disagree. Three services carried it, and they did not all resolve the
same way.

**Two exclusions withdrawn.** *Condensate Overflow Safety Switch* and *Outdoor
Unit Pad Replacement* are both things a homeowner can and does ring up about —
*"put a float switch on my AC"*, *"my outdoor unit is sinking"*. Each has a
fully known scope and a contractor may legitimately sell a visit for it. The
only ground for excluding `ONSITE_VISIT` was that the trip is unattractive,
which is **contractor policy, not canonical capability**. Both now support all
three modes; a contractor who does not want the call declines it through
selection (D3) or offering (`Service.offered`).

**One exclusion kept, renamed.** *Standard Air Filter Replacement* is
`WHILE_WE_ARE_THERE_ONLY`, which maps to the canonical
`TemplateService.isPrimaryEligible = false`. That is a platform-level statement
that the service is **never bought on its own**, so no customer mode applies to
it as a standalone purchase — a fact about the *purchase*, not about the price.
The reason is now `same_visit_only_service` and it is grounded in
`isPrimaryEligible`, not in a rate.

### The one exclusion whose ownership remains ambiguous

`same_visit_only_service` is honestly borderline, and it should be recorded as
such rather than tidied away.

The platform models it canonically — `VisitPosture` is trade metadata, not
contractor configuration — but `lib/plumbing/metadata.ts` justifies it in
economic terms: *"sells a visit that cannot pay for itself, and the service-call
minimum then makes the customer's price look absurd."* The **mechanism** is
canonical; the **argument for it** is economic.

That is tolerable while one service depends on it, and it would not be if the
reason spread. Two guards:

1. `same_visit_only_service` may be used **only** where the canonical service is
   already `isPrimaryEligible = false`. It may never be asserted directly as a
   judgment about a service's worth.
2. If a contractor ever needs a different answer — a maintenance-plan business
   that genuinely does sell filter visits — that is the signal the concept is
   contractor policy after all, and it moves. **It is not a reason to widen the
   canonical exclusion to fit them.**
