# Stair Walk: dedicated-circuit route intake

Replaces the live Route Walk on the `dedicated_route_access` question of `dedicated-120v-circuit-outlet`.
Owner-reviewed in conversation on 20 Oct 2026 (prototype: https://claude.ai/artifact/KQQJfJsFphgik1BUbmWHdN).

## Why

Route Walk asked the customer to describe the house (style, foundation, basement ceiling, garage size and wall, panel floor, outlet floor) so the software could rebuild the route: 12 to 14 screens. Stair Walk asks for what the customer experiences: where the panel is, and one walk from the panel to the outlet. Floor changes come from the stairs they counted, so split-levels need no house-style picture and no level labels.

It also fixes a live dead end. Route Walk prices only when it knows the equipment, but the tree asks "What will this power?" *after* the route question, so "Use this route and see my price" did nothing. Stair Walk's route answers are complete without equipment, and the package prices as soon as the tree adds it.

## Screens (route-only, as wired)

1. **Where is your electrical panel?** Basement · Garage · Somewhere else inside · Outside · I can't find it. A basement panel adds *Look up above the panel. What's there?* A garage panel adds *Can you see wooden studs on the garage walls?*, and for covered or unsure walls *How far is the panel from the door into the house?* (a few feet / across a 1-, 2- or 3-car garage).
2. **Walk from the panel to where the outlet will go.** Distance by tape measure, steps (2.5 ft each, rounded up), or an estimate the customer approves (priced at the top of the contractor's band), plus doorways walked through.
3. **Did that walk take you up or down any stairs?** Full staircases and short half-flights (− / +), and *Up / Down to another floor / Down to the basement* when it matters. "No stairs — continue" when both are zero.
4. **Can the wire travel through an open space?** Only the options that fit the walk: the garage, a basement or crawl space right under the outlet, or an attic right above it; otherwise *Neither, or I'm not sure* (priced as the harder, concealed route). Skipped when nothing fits.
5. **About the wall where the outlet goes.** Knock test (hollow / concrete or block / brick, stone, tile or plaster / not sure) and *Is it an outside wall?*
6. **Here's what we'll do.** *You told us* (each with Change) beside *We figured out* (each with its basis), plus the access-opening disclosure.

The tree then asks "What will this power?" as before.

## Engine changes

- **Stair-count path** (`lib/electrical/dedicatedStairRoute.ts`): new keys `dedicated_floor_changes_full`, `dedicated_floor_changes_half`, `dedicated_vertical_attic`, `dedicated_vertical_from_basement`, `dedicated_panel_end`. Same unit costs as the approved basement-to-attic plan (9 ft, 2 plates, 1 opening per full story; 5 ft, 1 plate, 1 opening per half-flight; 3 ft basement rise; 6 ft attic drop; 1 hour per floor change). Used only when the keys are present; stair keys together with home-profile keys fail closed. The approved tri-level example (45 ft, 3 staircases, attic) produces identical facts: 81 ft, 3 risers.
- **Finished-garage conduit** (owner-approved): `dedicated_surface_conduit=yes` with `dedicated_garage_emt_feet` prices the cable in 1/2-inch EMT across the garage (plus 4 ft to the ceiling on an attic route), or the whole run to a surface box when `dedicated_garage_emt_outlet=yes`. Seven existing EMT operations were added to the dedicated receptacle recipe behind the `garageEmtRoute` condition, so no other route needs them approved. Fitting and strap counts follow the garage EMT outlet takeoff. `surface_conduit` without a conduit length (old Route Walk answers) still fails closed. Sump-pump and fireplace recipes have no EMT lines, so those still go to review on a conduit route.

## Release notes

- Adding the EMT operations and materials to the dedicated circuit changes its approval fingerprint: contractors' approved dedicated-circuit pricing will show as out of date and need re-approving once.
- EMT material costs already ship with the software (owner, 20 Oct 2026).
- A whole-garage conduit run also counts a few NM-support labor minutes; owner accepted the small overcount.

## Checks

`npx tsx scripts/verify-stair-walk-adapter.ts` (scenarios against `circuitPackageFor`, including the route-only handoff), plus the existing dedicated-circuit and labor-baseline scripts. The prototype page is built from the same module: `npx tsx scripts/build-stair-walk-prototype.ts`.
