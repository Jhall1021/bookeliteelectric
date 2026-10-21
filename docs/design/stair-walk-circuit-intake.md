# Stair Walk: dedicated-circuit route intake

Replaces the live Route Walk on the `dedicated_route_access` question of `dedicated-120v-circuit-outlet`.
Owner-reviewed in conversation on 20 Oct 2026 (prototype: https://claude.ai/artifact/KQQJfJsFphgik1BUbmWHdN).

## Why

Route Walk asked the customer to describe the house (style, foundation, basement ceiling, garage size and wall, panel floor, outlet floor) so the software could rebuild the route: 12 to 14 screens. Stair Walk asks for what the customer experiences: where the panel is, and one walk from the panel to the outlet. Floor changes come from the stairs they counted, so split-levels need no house-style picture and no level labels.

It also fixed a live dead end (PR #152; the flow engine handoff was completed in #155). Route Walk prices only when it knows the equipment, but the tree asks "What will this power?" *after* the route question, so "Use this route and see my price" did nothing. Stair Walk's route answers are complete without equipment, and the package prices as soon as the tree adds it.

## Screens (route-only, as wired)

Six fixed stages (Your panel, The walk, Stairs, Open space, The wall, Confirm). Every follow-up question belongs to the panel location that triggers it: garage questions only for a garage panel, basement questions only for a basement panel.

1. **Where is your electrical panel?** Basement · Garage · Somewhere else inside · Outside · I can't find it.
   - *Basement panel:* "Look up above the panel. What's there?"
   - *Garage panel:* "Can you see wooden studs on the garage walls?", "Is there an attic above the garage that someone can get into?", and "How far is the panel from the door into the house?" (a few feet / across a 1-, 2- or 3-car garage).
2. **Walk from the panel to where the outlet will go.** Distance by tape measure, steps (2.5 ft each, rounded up), or an estimate the customer approves, plus doorways walked through.
3. **Did that walk take you up or down any stairs?** Full staircases and short half-flights, plus *Up / Down to another floor / Down to the basement* when it matters. *Basement panel with exactly one half-flight up:* "Is the room with the outlet right over the basement?" (over / beside it on a slab or crawlspace / not sure).
4. **Can the wire travel through an open space?** Only options that can be true:
   - the garage (garage panel, no stairs)
   - *basement panel:* "Open basement ceiling along the way"
   - *any other panel, only when the outlet is on the lowest level:* "Basement or crawlspace under the walk"
   - "Attic right above the outlet" (when the outlet is on the top floor walked to)
   - "Neither, or I'm not sure" (priced as the harder, concealed route)

   Choosing the basement option asks how much of the way it covers (all / part, which part, about how many feet) and prices the open and finished parts separately.
5. **About the wall where the outlet goes.** Knock test and *Is it an outside wall?*
6. **Here's what we'll do.** *You told us* (each with Change) beside *We figured out*, the access-opening disclosure, and Start over.

The tree then asks "What will this power?". The walk keeps its answers in the tab, so Back from that question reopens the review screen instead of starting over.

## Field rules (owner scenarios, 21 Oct 2026)

| Condition | How it's priced |
|---|---|
| Garage panel, garage attic, covered walls | 4 ft of EMT up into the garage attic, then open cable (not conduit across the garage wall) |
| Garage panel with an open garage stretch (studs showing or garage attic), house part in finished walls | Mixed route: the garage stretch (panel-to-door distance) open, the rest concealed with its doorways |
| Basement panel, one half-flight up to a room *beside* the basement (slab or crawlspace) | One floor change (5 ft, a plate and an opening, 1 h), not a basement-ceiling pop-up; "not sure" is priced this way |
| Basement panel, half-flight up into a room *over* the basement | No floor change, as for a full staircase up to a first floor |
| Inside or garage panel after walking **up** a floor | No basement option: the outlet can't be over the basement |

`scripts/verify-stair-walk-adapter.ts` carries all five owner scenarios as regression tests, plus the approved $835 tri-level example.

## Engine changes

- **Stair-count path** (`lib/electrical/dedicatedStairRoute.ts`): new keys `dedicated_floor_changes_full`, `dedicated_floor_changes_half`, `dedicated_vertical_attic`, `dedicated_vertical_from_basement`, `dedicated_panel_end`. Same unit costs as the approved basement-to-attic plan (9 ft, 2 plates, 1 opening per full story; 5 ft, 1 plate, 1 opening per half-flight; 3 ft basement rise; 6 ft attic drop; 1 hour per floor change). Used only when the keys are present; stair keys together with home-profile keys fail closed. The approved tri-level example (45 ft, 3 staircases, attic) produces identical facts: 81 ft, 3 risers.
- **Finished-garage conduit** (owner-approved): `dedicated_surface_conduit=yes` with `dedicated_garage_emt_feet` prices the cable in 1/2-inch EMT across the garage (plus 4 ft to the ceiling on an attic route), or the whole run to a surface box when `dedicated_garage_emt_outlet=yes`. Seven existing EMT operations were added to the dedicated receptacle recipe behind the `garageEmtRoute` condition, so no other route needs them approved. Fitting and strap counts follow the garage EMT outlet takeoff. `surface_conduit` without a conduit length (old Route Walk answers) still fails closed. Sump-pump and fireplace recipes have no EMT lines, so those still go to review on a conduit route.

## Release notes

- Adding the EMT operations and materials to the dedicated circuit changes its approval fingerprint: contractors' approved dedicated-circuit pricing will show as out of date and need re-approving once.
- EMT material costs already ship with the software (owner, 20 Oct 2026).
- A whole-garage conduit run also counts a few NM-support labor minutes; owner accepted the small overcount.

## Checks

`npx tsx scripts/verify-stair-walk-adapter.ts` (scenarios against `circuitPackageFor`, including the route-only handoff), plus the existing dedicated-circuit and labor-baseline scripts. The prototype page is built from the same module: `npx tsx scripts/build-stair-walk-prototype.ts`.
