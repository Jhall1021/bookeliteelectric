# Route Walk: a simpler intake for dedicated circuits

Status: prototype only. Nothing here is wired into the live storefront or the pricing engine.
Branch: `proto/route-walk-circuit-intake` (off `main` at `c7b356f4`, which includes PR #148).

| Piece | Path |
|---|---|
| Flow, wording, inference, engine adapter | `lib/electrical/routeWalk.ts` |
| Adapter check against the real `circuitPackageFor` | `scripts/verify-route-walk-adapter.ts` |
| Phone prototype (built from the same module) | `docs/design/route-walk-prototype/` (`npx tsx scripts/build-route-walk-prototype.ts`) |
| Published prototype | https://claude.ai/artifact/6u6atPU3Y43sQmY46Mhe3S |

---

## 1. Recommendation in one paragraph

Stop asking the homeowner to model their house and the wire's path. Ask about the **two places they can stand in**: where the outlet goes and where the panel is. Then ask yes/no questions about the open space (basement, crawl space, attic) **next to those two places**, and have them **walk one distance** with a tape measure or by counting steps. The software builds the route from those anchors. It adds every floor change, the garage crossing, doorway detours and the vertical wire, so the customer can't leave out the hard parts. When the route needs more vertical work than the current engine can price, the flow sends it to review **before** the customer measures, so it never hands the engine a cheaper route than the one described.

---

## 2. Critique of the current journey

Reviewed in code (`components/guided-flow/DedicatedCircuitHomeProfile.tsx`, `DedicatedCircuitDistanceModel.tsx`, `lib/electrical/dedicatedHomeProfile.ts`, `lib/electrical/circuitPackagePricing.ts`) and on the live page at phone width.

### What works and should be kept

- Customers never measure up and down.
- Split-level homes are recognized from pictures.
- The exterior-wall disclaimer replaces a cluster of exterior-wall questions.
- The finished-wall disclosure is acknowledged before a price is shown.
- Routes over 100 ft fail closed.
- The tri-level attic example prices correctly (81 ft, 3 riser hours, $835).

### Where it asks too much of the homeowner

1. **It starts with the house instead of the job.** The first screen is "Build your home" with style, garage, basement, crawl space and attic toggles, before the customer has said what they're powering or where. Feature toggles describe the whole home, but routing depends on what's next to the panel and the outlet.
2. **The drawing asks for spatial reasoning it doesn't use.** Dragging the panel and outlet left/right changes nothing except the garage ratio. A side elevation also merges front-to-back with left-to-right, so "match their left-to-right positions" has no single right answer. At 375 px the diagram is about 330 px wide, and labels collide ("BASEMENT PANEL" overprints the drag caption).
3. **It asks routing questions in disguise.** "What is the area around the panel like? Accessible from above or below / Finished walls and ceilings" requires the customer to know how an electrician would leave the panel.
4. **The measurement has no method.** "About how far is it from the panel area to the new outlet?" doesn't define "panel area" when panel and outlet are on different floors, and doesn't say how to measure.
5. **Labels don't match what happens.** "Place my panel and outlet" leads to "What will this dedicated circuit power?"
6. **There's no "I'm not sure" for open spaces.** An unchecked attic means "no attic." A checked attic is assumed to cover the outlet's room, even if it covers only part of the house.

### Where it can underprice (confirmed against the engine on `main`)

Every row below runs through `circuitPackageFor("dedicated-120v-circuit-outlet", …)` with a 30 ft measurement:

| Customer's home | Engine route feet | Riser transitions | What's missing |
|---|---|---|---|
| Two-story, basement panel → 2nd floor, no attic | 30 | **0** | 2 floors of concealed vertical, plates, openings, 2 h riser labor |
| Two-story, 1st-floor panel → 2nd floor via attic | 30 | **0** | 1 floor of vertical, 1 h riser labor |
| Two-story, garage panel → 2nd floor via attic | 30 | **0** | Same as above |
| Tri-level with garage on the lower level | 30 | **0** | The profile fails to parse and `dedicatedPackage` silently treats it as no vertical |

The live page shows the first case. The diagram draws a dashed riser labelled "Included automatically" and tells the customer "we include both ends automatically," but the engine adds nothing.

Three more gaps:

- **Finished garages can't reach the surface-conduit path.** The home builder forces a garage panel to `panelAccess: "accessible"` and always sends `dedicated_surface_conduit: "no"`. A drywalled garage therefore prices as open framing, and the fail-closed EMT branch in `dedicatedPackage` is unreachable.
- **Outlets in the basement can't be described.** `destinationFloor` is first/second/third only. The common sump-pump case is entered as "first floor."
- **Wall material is never asked.** Plaster, brick, block and concrete walls price as drywall.

---

## 3. Alternative concepts

| | A. Route Walk (two places + one walk) | B. Photo-assisted | C. Tap-the-rooms floor map |
|---|---|---|---|
| Idea | Pick the floor of the outlet and of the panel, answer yes/no about open space beside each, walk one distance | Photograph the panel, the outlet wall, the basement ceiling or attic hatch; a vision model classifies access; one distance | Pick a floor-plan template, tap the panel room and the outlet room; the software computes distance from the template |
| Taps on a typical path | 10–12 taps + one number | 4 photos + one number | 8–10 taps, no number |
| Phone fit | Excellent; one question per screen | Good, but needs camera permission and upload time | Poor; small targets, pinch-zoom |
| Distance accuracy | Good (walked distance tends to run long, which is conservative) | Same as A | Weak; template distances aren't the customer's house |
| Resists leaving out hard parts | Strong; the route is built from anchors | Strong, if the classifier is right | Medium |
| Customer must know | Where things are, what a ceiling looks like | How to take a useful photo | How their house maps to a template |
| Build cost | Low; reuses the existing engine through answer keys | High; model, storage, review queue, failure modes | Medium–high |

**Recommendation: A**, with B as the later escape hatch for "I'm not sure" answers. A visual-assist module is in progress in another workstream; this flow should route to it rather than depend on it.

### Why A is simpler

- **Questions are about places, not paths.** "Is there an attic above the room where the outlet goes?" is answerable. "Is there open access along the wiring route?" is not.
- **One measurement, done by walking.** Walking is how people already estimate distance. The instructions name a start point, an end point and what not to count.
- **Questions shrink to the job.** Open-space questions appear only for the two places named, and only when they could change the route. A slab ranch never sees a basement question.
- **The software owns everything vertical**: floor changes, garage width, doorway detours, step-to-feet conversion, and choosing the harder path when the customer isn't sure.
- **It explains itself.** A "We'll handle this" strip appears after each answer that taught the software something. The final screen shows "You told us" (each fact has a Change link) beside "We figured out" (each inference has its basis).

---

## 4. The complete question flow

One question per screen. "Shown when" is the only branching. `pruneRouteWalkAnswers` drops answers to questions that stop applying, so changing an earlier answer can't leave a stale "yes, open attic" steering the route.

Progress strip (6 segments): Your project · Your home · The new outlet · Your panel · One measurement · Check and confirm. Open-space questions share the "Your panel" segment so the bar never jumps backward.

| # | Key | Shown when | Exact wording | Options (value) | Software infers after the answer |
|---|---|---|---|---|---|
| 1 | `equipment` | Always | **What will the new outlet power?** Help: "Pick the closest match. We'll choose the right breaker and wire." | Refrigerator or freezer (`fridge_freezer`) · Sump pump (`sump_pump`) · Microwave or window air conditioner (`microwave`) · Electric fireplace (`electric_fireplace`) · Something else (`knows_size`) | Circuit size: fridge 15 A; sump pump 20 A with GFCI; microwave/AC 20 A |
| 1a | `fireplaceAmperage` | Fireplace | **What does the fireplace's label or manual say it needs?** Help: "Look for "15 A" or "20 A" on the sticker or in the instructions." | 15 amp · 20 amp · I can't find it (`unsure` → review) | Circuit size |
| 1b | `amperage` | Something else | **What does the equipment's label or manual say it needs?** | 15 amp, 120 volt (*A regular-looking plug*) · 20 amp, 120 volt (*One prong of the plug is turned sideways*) · 240 volt, or a large round plug (→ review: different service) · I'm not sure (→ review) | Circuit size |
| 2 | `shape` | Always | **Which of these looks most like your home from the street?** Help: "Count only floors people live on. Don't count the basement or attic." | Pictures: One floor *(Ranch or single-story)* · Two floors *(One staircase between floors)* · Three floors · Front door between two floors *(You walk in and go a half-flight up or a half-flight down)* · Three staggered levels *(Short stairways up and down from the front-door level)* | Level list and labels; split-level transition height |
| 3 | `below` | After 2 | **What's under your first floor?** (split-levels: **Is there anything below your lowest level?**) | A basement *(A room you can walk down stairs into)* · A crawl space *(A low space you'd have to crouch or crawl in)* · Nothing — the floor sits on the ground · I'm not sure (→ review) | Whether a below-route exists at all |
| 3a | `basementCeiling` | Basement | **Look up in the basement. What does the ceiling look like?** | Pictures: I can see wooden beams (`open`) · Ceiling tiles that lift out (`drop`) · Smooth painted ceiling (`finished`) · Some of each (`mixed`) | Open or concealed basement route |
| 4 | `hasGarage` | After 3 | **Is there a garage attached to the house?** | Yes · No | Garage becomes a possible panel and outlet location |
| 4a | `garageSize` | Garage | **How many cars fit side by side in the garage?** | One car · Two cars · Three cars | Width 12 / 24 / 36 ft |
| 5 | `outletPlace` | After 4 | **Where will the new outlet go?** Help: "Pick the floor of the room where you'll plug the equipment in." | Basement (if any) · each living level by name · In the garage (if any) | Outlet level |
| 6 | `wall` | After 5 | **Knock on the wall where the outlet will go. What is it?** | Sounds hollow *(Ordinary drywall — most homes)* · Solid concrete or block *(Common on basement walls)* · Brick, stone, or tile · Hard and solid, in an older home *(Often plaster in homes built before about 1950)* · I'm not sure | Mounting method; non-drywall → review |
| 7 | `panelPlace` | After 6 | **Where is your electrical panel?** Help: "It's a gray metal door, about the size of a medicine cabinet, with switches (breakers) inside. Common spots: garage, basement, laundry room, hallway or closet." | In the basement (if any) · In the garage (if any) · Somewhere else inside the house · Outside the house (→ review) · I can't find it (→ review) | Panel level (basement = 0; garage = garage level) |
| 7a | `panelLevel` | Inside panel, multi-level home | **Which floor is the panel on?** | Level names | Panel level |
| 7b | `garageWall` | Garage panel | **Which garage wall is the panel on?** | Top-down pictures: The wall shared with the house · Another wall, on the half closer to the house · Another wall, on the half farther from the house | Garage crossing = width × 0 / 0.5 / 1 |
| 7c | `garageFinished` | Garage panel or garage outlet | **Are the garage walls and ceiling covered (drywall), or can you see the wooden studs?** | I can see the wooden studs · Covered with drywall (→ review: surface conduit) · I'm not sure (→ review) | Open garage framing |
| 8 | `openBelowOutlet` | Outlet on the basement or lowest living level and an open basement or crawl space exists | **Is the open part of the basement (crawl space) directly under the room where the outlet goes?** Help: "Stand in the basement under that room. If you can see wooden beams or lift-out tiles above you there, choose Yes." For a basement outlet with a mixed ceiling: **Can you see wooden beams or lift-out tiles in the ceiling near where the outlet goes?** | Yes · No · I'm not sure | Below-route if Yes; otherwise keep looking |
| 9 | `atticOverOutlet` | Outlet on the top living level and no below-route | **Is there an attic above the room where the outlet goes that someone can get into?** Help: "Look for a hatch or pull-down stairs in a ceiling, often in a hallway or closet. If the attic is packed with insulation to the roof or has no way in, choose No." | Yes, there's a way in · No · I'm not sure | Attic route if Yes; otherwise concealed walls |
| 10 | `openNearPanel` | Inside panel on the level next to the chosen open space; or basement panel with a mixed ceiling | **Is that open basement space also under the panel?** / **Does that attic also reach over the panel?** / **Look at the basement ceiling right above the panel. Can you see wooden beams or lift-out tiles?** | Yes · No · I'm not sure | Whether the panel end is open or concealed |
| 11 | `distanceMethod` (+ `distanceFeet` / `distanceSteps` / `distanceEstimate`) | Panel and outlet known | **Walk from your panel to where the outlet will go.** (garage panel: **Walk from the door between the garage and the house to where the outlet will go.**; panel and outlet both in the garage: **…along the garage walls.**) See §5 for the help text. | Tape measure · Count steps · I can't measure | Horizontal distance |
| 12 | `doorways` | Concealed-wall route | **On that walk, how many doorways or open archways did you pass through?** Help: "Wire can't go straight across a doorway inside a finished wall, so it has to go around." | None · 1 · 2 · 3 or more | 14 ft detour each |
| 13 | `exterior` | After 11 | **Is the outlet going on a wall that has the outdoors on the other side?** | Yes · No · I'm not sure | Standard exterior-wall disclaimer for Yes / Not sure |
| 14 | `finishAck` | Last | **Here's what we'll do** — "Check the left side. We worked out the right side from it." Two panels: **You told us** (each with Change) and **We figured out** (each with its basis). Then the existing finished-wall disclosure, written plainly. | **Looks right — show my price** | — |

### What the customer never sees

Route access class, plate penetrations, wall-to-box fishes, framing crossings, riser transitions, vertical footage, conductor size. These all appear only in the inspector (internal) and in the engine inputs.

### Typical paths

- **Tri-level, basement panel, outlet upstairs, attic** (the $835 case): 1 → 2 → 3 → 3a → 4 → 5 → 6 → 7 → 9 → 11 → 13 → 14. That's 11 taps and one number.
- **Slab ranch, hallway panel, no attic**: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9 → 11 → 12 → 13 → 14.
- **Two-story, basement panel, outlet upstairs, no attic**: goes to review after question 9, **before** the measurement.

---

## 5. The one measurement

**What to measure:** the distance a person would walk from the panel to the outlet spot, following hallways and doorways rather than cutting through walls. If the panel and outlet are on different floors, do the walk on one floor, from the spot above or below the panel to the spot above or below the outlet. "Close is fine." Don't count stairs or anything vertical.

Exact help text, built from these parts as they apply:
> Follow hallways and doorways the way you'd normally walk — don't cut through walls. If they're on different floors, do the walk on one floor: start at the spot right above or below the panel and end at the spot right above or below the outlet. Close is fine. Don't count stairs or anything up and down — we add that for you.

Garage panel: start at the door between the garage and the house. The garage crossing is added from the standard width and the wall the panel is on ("We've already counted the wire across the garage").

| Method | Customer does | Software does |
|---|---|---|
| Tape measure | Types feet | Rounds up to whole feet |
| Count steps | Walks normally and counts | × 2.5 ft per step, rounded up, shown live ("≈ 35 ft") |
| I can't measure | Picks: Same room or the next room over · Across the house · The far end of a large house | Uses the contractor's own `panel_circuit_run.breakpoints` band ceilings (`under_25` → first breakpoint, `25_to_50` → second). A garage crossing bumps the band up one. "Far end" goes to review. Flagged `DISTANCE_ESTIMATED`. |

A walked path tends to be longer than the wire's path through an attic or basement, so the error runs toward higher prices. Along finished walls, the wire follows walls just as a walker does.

---

## 6. Handling uncertainty

| Situation | Behavior | Why |
|---|---|---|
| Not sure about the open space under or over the outlet, or at the panel | Price the concealed-wall route; flag `ACCESS_UNSURE_PRICED_CONCEALED`; the summary says "You weren't sure about open space, so we priced the harder path" | Never underprice; the customer sees why |
| Not sure about the foundation | Review (`FOUNDATION_UNKNOWN`) | Can't model below-routes |
| Can't find the panel / panel outside | Review with photo help | The anchor is missing |
| Not sure about the garage finish | Review (`GARAGE_FINISH_UNKNOWN`) | The method changes (EMT vs NM) |
| Not sure about the wall | Price as drywall, flag `WALL_TYPE_ASSUMED_DRYWALL`, show a disclosure that any change is priced before work starts | Decided 20 Oct 2026 |
| Not sure about circuit size | Review with a label photo (same as today) | — |
| Can't measure | Contractor's band ceilings (above), booked only after the customer approves on an extra screen (**Okay to price from your estimate?** → Yes, price it from my estimate / I'll measure instead) | Decided 20 Oct 2026 |
| Inaccessible attic (no hatch, packed insulation) | The question's help text tells them to answer No | Treated as no attic |
| Route the engine can't represent | Review (`RISER_NOT_MODELLED` / `PROFILE_NOT_REPRESENTABLE`) **before** the measurement | Don't make them work for a review |

Review screens never sound like a failure: "Nothing you answered was wrong. Your answers are saved, and an electrician will reply with a fixed price."

---

## 7. Split-level homes

- Two picture cards in the home-style question, described by what you see at the front door ("You walk in and go a half-flight up or a half-flight down"; "Short stairways up and down from the front-door level"), not by trade names. The internal names stay `bi-level` / `tri-level`.
- Levels are named the way owners talk: Lower / Upper; Lower / Middle (front door) / Upper (bedrooms).
- A basement under a split-level is asked with the same question ("Is there anything below your lowest level?").
- Floor changes are counted the same way as standard homes (one per level). The engine's split-level branch prices each at 5 ft of vertical wire; the basement-to-attic branch prices each story at 9 ft.
- The garage is on the **lower** level of a tri-level (owner decision, 20 Oct 2026). The engine on `main` wrongly pins it to the middle level, so a tri-level garage panel goes to review until the engine fix lands.

---

## 8. Wireframe / prototype

https://claude.ai/artifact/6u6atPU3Y43sQmY46Mhe3S. It's private until you share it from the page's Share menu.

The left side is the phone flow; the right side shows behind the scenes:
1. **Customer supplied** (every answer, with the question it answered).
2. **Software inferred** (each inference with its basis).
3. **What the existing pricing engine receives**: route feet with its arithmetic (`45 walked + 36 vertical = 81 ft`), floor changes, vertical openings, access class, flags, and the exact answer keys.

Example buttons load the tri-level $835 case, a ranch with a garage panel, the two-story case that goes to review, and a fresh start. A Playwright smoke run at 390 × 844 showed no console errors and no horizontal overflow.

The prototype bundles `lib/electrical/routeWalk.ts` directly, so its questions and mapping are the ones the verify script checks. It doesn't show a dollar price; that needs the contractor's approved rates from the database.

---

## 9. Mapping to the existing pricing inputs

The adapter (`routeWalkToDedicatedAnswers`) produces only keys the current `dedicatedPackage` already reads. No pricing code changes.

| Route Walk | Existing answer key | Value |
|---|---|---|
| `equipment` | `dedicated_equipment` | Same values |
| `amperage` / `fireplaceAmperage` | `dedicated_amperage` / `dedicated_fireplace_amperage` | Same values |
| `shape` | `dedicated_home_stories`, `dedicated_home_layout` | one/two/three + standard; bi-level → two + bi-level; tri-level → three + tri-level |
| `below` + `basementCeiling` | `dedicated_basement_ceiling`, `dedicated_home_has_crawl_space` | open/drop/finished; mixed resolves to the panel-area answer |
| `hasGarage`, `garageSize` | `dedicated_home_has_garage`, `dedicated_garage_size` | Same |
| `atticOverOutlet` | `dedicated_home_has_attic` | yes only if Yes |
| `outletPlace` | `dedicated_destination_floor` | basement/1 → first, 2 → second, 3 → third |
| route plane (inferred) | `dedicated_home_access` | below / attic / none |
| `panelPlace`, `panelLevel` | `dedicated_panel_location`, `dedicated_panel_floor` | basement/garage/inside; floor |
| panel-end openness (inferred) | `dedicated_panel_access` | basement: ceiling; garage: accessible; inside: accessible only if `openNearPanel` = Yes, else finished |
| — | `dedicated_surface_conduit` | always `no` (finished garages go to review instead) |
| profile (inferred) | `dedicated_route_access` | `dedicatedHomeProfileRouteAccess(profile)`, the engine's own rule |
| walk + garage crossing | `dedicated_distance` | walked feet + garage feet, or a band value |
| `doorways` (concealed only) | `dedicated_distance_doorway` | count |
| `exterior` | `dedicated_distance_exterior` | yes/no/unsure (drives the standard disclaimer) |
| `finishAck` | `dedicated_finish_ack` | accepted |
| Garage panel → garage outlet | no profile keys; `dedicated_route_access = accessible` | Priced as an open garage run |

The engine then derives vertical feet, risers (`multiStoryRiserTransitions`), plate penetrations, wall-to-box fishes, vertical drywall openings, concealed feet, framing crossings and supports exactly as it does today.

### Verification (`npx tsx scripts/verify-route-walk-adapter.ts`)

```
PRICE   Tri-level, basement panel → upper level via attic, 45 ft    81 ft  risers 3  concealed  5.19 h
PRICE   One story, basement panel, outlet over open basement, 30 ft  30 ft  risers 0  open  1.27 h
PRICE   Sump pump in open basement next to panel, 12 ft             12 ft  risers 0  open  1.34 h
PRICE   One story, garage panel on far wall (2-car), attic, 30 ft   54 ft  risers 0  open  1.41 h
PRICE   Slab ranch, hallway panel, finished walls, 14 steps, 2 doorways  63 ft  risers 0  concealed  6.47 h
PRICE   Bi-level, lower-level panel → upper level via attic, 25 ft  30 ft  risers 1  concealed  4.46 h
PRICE   Tri-level, garage panel → upper level via attic, 20 ft      25 ft  risers 1  open  2.12 h
PRICE   Unsure about attic → priced as finished walls               20 ft  risers 0  concealed  2.73 h  [ACCESS_UNSURE_PRICED_CONCEALED]
PRICE   Estimate 'same or next room' → contractor's first band      25 ft  risers 0  open  1.24 h  [DISTANCE_ESTIMATED]
PRICE   Garage freezer, panel in same open garage, 18 ft            18 ft  risers 0  open  1.19 h
REVIEW  Two story, basement panel → second floor, no attic         RISER_NOT_MODELLED
REVIEW  Two story, first-floor panel → second floor via attic      RISER_NOT_MODELLED
REVIEW  Two story, garage panel → second floor via attic           RISER_NOT_MODELLED
REVIEW  Drywalled garage panel                                     GARAGE_SURFACE_CONDUIT
REVIEW  Plaster wall                                               WALL_NOT_DRYWALL
REVIEW  Can't find the panel                                       PANEL_NOT_FOUND
```

Hours are platform-baseline labor only, not a contractor's price. The tri-level case's facts are asserted `deepEqual` to the facts the current home builder produces.

---

## 10. Underpricing risks and safeguards

| Risk | Safeguard in this prototype | Still needed |
|---|---|---|
| Engine under-counts floor changes (§2 table) | `requiredFloorTransitions` is computed independently; if the engine's count is lower, the adapter returns `RISER_NOT_MODELLED` | **Engine extension (owner approval):** generalize `dedicatedVerticalRoutePlan` so any route with a floor change gets one riser per change, 9 ft per standard story (5 ft split-level), 2 plates and 1 opening per concealed story. The same gap affects the **live** home builder today. |
| Unparseable profile silently becomes "no vertical" | Adapter refuses (`PROFILE_NOT_REPRESENTABLE`) | The engine itself should return null instead of defaulting to zero |
| Attic or basement assumed to cover the whole house | Open space is asked about **the outlet's room** and **the panel**, not the house | — |
| "Not sure" answers | Always priced as concealed, or sent to review; never assumed open | — |
| Customer skips the hard part of the route | The customer measures only the horizontal walk; vertical, garage and doorway parts are added by rule from anchors | — |
| Steps undercount | 2.5 ft/step, rounded up | Owner to confirm the step length |
| Estimated distance | Contractor's band ceiling; flagged | Owner to decide whether estimates may book without a site check |
| Drywalled garage priced as open framing | Review until the EMT adapter exists (matches the engine's existing fail-closed rule) | EMT surface-conduit package |
| Plaster, masonry walls | Review | — |
| Concrete/block walls | Review until the surface-mount package lands | Surface-mount package (approved, in progress) |
| Stale answers after editing | `pruneRouteWalkAnswers`, verified | — |
| Walk-through-doorway count is low | Asked only for concealed routes, with a plain reason | Could cross-check against walk length later |
| Long routes | Engine's 100 ft cap still applies; "far end" estimates go to review | — |

### Owner decisions (20 Oct 2026)

1. Riser generalization: **approved**. Being implemented on its own engine branch, not released.
2. Wall "I'm not sure": **price as drywall with a disclosure**.
3. Concrete-wall outlets (sump pumps): **surface-mount pricing**. Engine contract: `dedicated_outlet_mount=surface_concrete`. Until that package lands, the adapter returns `SURFACE_MOUNT_PENDING_ENGINE` (review), because pricing it as an old-work drywall box would undercharge.
4. Step length 2.5 ft and garage-wall ratios 0 / 0.5 / 1: **approved**.
5. Estimates: **may book directly once the customer approves** the estimate-based price.
6. Tri-level garage: **lower level**; the engine is wrong and is being fixed with item 1.

When the engine branch lands, flip three adapter checks: `RISER_NOT_MODELLED` stops firing for the cases it fixes, the tri-level garage priced case returns, and concrete emits `dedicated_outlet_mount` instead of review.

---

## 11. What was not done

- Not wired into `GuidedFlowEngine`, not seeded, not deployed. The natural next step is a custom question component that replaces `dedicated_route_access` + `dedicated_distance` for one test contractor, behind a flag, submitting the adapter's answer keys through the existing `onAnswer(option, supplementalAnswers)` path.
- The pricing engine is unchanged; the riser extension is a proposal.
- No photo upload in the prototype (the review CTA is a stub).
- Dollar prices aren't shown in the prototype; route feet, risers and engine keys are.
