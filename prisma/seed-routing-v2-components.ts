/**
 * ROUTING V2 — the canonical physical vocabulary.
 *
 * The model this replaces bundled two independent facts into one component:
 *
 *     access class  ×  distance band     →  OUTLET_RUN_FINISHED_10_20
 *
 * which made 21 feet a different KIND of work from 19 feet, and made an
 * accessible 50-foot route unpriceable rather than simply longer. V2 separates
 * them:
 *
 *     endpoint  +  route strategy  +  measured quantities  +  restoration
 *
 * Distance determines QUANTITY. Predictability determines PRICEABILITY. A
 * component here therefore never encodes a length, and the eligibility envelope
 * for concealed work lives in the decision tree, not in a component key.
 *
 * ECONOMICS ARE DELIBERATELY ABSENT. Every component below is created
 * price-unapproved. The legacy OUTLET_RUN_* and SWITCHLEG_* rows carry real
 * approved prices, but those bundled access-and-distance in one figure and
 * cannot be decomposed into endpoint / setup / per-foot / per-corner /
 * restoration without asking the contractor. The calibration wizard collects
 * them. Nothing here may be derived from them, and no figure here is invented.
 */
import { PrismaClient } from "@prisma/client";
import { upsertComponents, eliteContractorId, type ComponentDefinition } from "./_componentHelpers";

const prisma = new PrismaClient();

/**
 * Frozen physical meanings. `notes` is the contract: what the component
 * INCLUDES and what it explicitly EXCLUDES. If a meaning has to change
 * materially later, version a new key — never redefine one of these, because a
 * booked job already means what its component said at the time.
 */
export const ROUTING_V2_COMPONENTS: ComponentDefinition[] = [
  // ── route strategies. Each is "set up this kind of route", once per job. ──
  {
    key: "ELEC_ROUTE_SURFACE_MOUNTED",
    name: "Surface-mounted wiring route — setup",
    customerFacingLabel: "Surface-mounted wiring",
    notes:
      "ROUTE SETUP, quantity 1. The wiring runs visibly on the surface rather than inside the wall. " +
      "INCLUDES: planning and setting out the run, mounting the channel or raceway system the " +
      "contractor uses for this environment, terminations at each end. " +
      "DELIBERATELY BROADER THAN DECORATIVE RACEWAY: in a finished room this is a finished " +
      "raceway system; in a garage, unfinished basement, workshop or utility space it may be " +
      "exposed conduit. The customer is choosing VISIBLE WIRING, not a product. " +
      "EXCLUDES: route length (SURFACE_ROUTE_FT), corners (SURFACE_ROUTE_*_CORNER), the endpoint " +
      "itself, any wall opening or restoration, and painting of any kind.",
  },
  {
    key: "ELEC_ROUTE_BACK_TO_BACK",
    name: "Concealed route — back to back",
    customerFacingLabel: "Concealed wiring, opposite side of the same wall",
    notes:
      "ROUTE SETUP, quantity 1. New location is directly opposite the source on the same wall. " +
      "INCLUDES: the short concealed connection through that wall. " +
      "EXCLUDES: route footage (there is effectively none), restoration, endpoint.",
  },
  {
    key: "ELEC_ROUTE_ACCESSIBLE_CONCEALED",
    name: "Concealed route — through accessible unfinished space",
    customerFacingLabel: "Concealed wiring through open space",
    notes:
      "ROUTE SETUP, quantity 1. An attic, unfinished basement, crawlspace or similar open area " +
      "connects source to destination, so the wiring is concealed without opening finished " +
      "surfaces. INCLUDES: running and supporting the cable through that space, drilling as needed. " +
      "EXCLUDES: route length (CONCEALED_ROUTE_FT), the endpoint, and any restoration — there is " +
      "none, which is the point of this strategy. LENGTH DOES NOT CHANGE THE STRATEGY: a 50 ft " +
      "accessible route is this component with a larger footage quantity, not a different route.",
  },
  {
    key: "ELEC_ROUTE_CONCEALED_BASEBOARD_ACCESS",
    name: "Concealed route — behind removable baseboard",
    customerFacingLabel: "Concealed wiring behind the baseboard",
    notes:
      "ROUTE SETUP, quantity 1. Finished wall, no accessible space; the route follows removable " +
      "continuous baseboard. INCLUDES: planning the run behind the trim. " +
      "EXCLUDES: route length, the endpoint, and the trim removal/reinstallation itself, which is " +
      "RESTORE_BASEBOARD_ACCESS and is priced separately because a contractor may not offer it.",
  },
  {
    key: "ELEC_ROUTE_CONCEALED_DRYWALL_ACCESS",
    name: "Concealed route — drywall access openings",
    customerFacingLabel: "Concealed wiring through the wall",
    notes:
      "ROUTE SETUP, quantity 1. Finished drywall wall, no accessible space and no usable " +
      "baseboard; the route needs access openings. INCLUDES: locating and forming the openings. " +
      "EXCLUDES: route length, the endpoint, and the patching itself (RESTORE_DRYWALL_ACCESS).",
  },

  // ── measured quantities. These are what a distance band used to hide. ──
  {
    key: "SURFACE_ROUTE_FT",
    name: "Surface-mounted route — per foot",
    customerFacingLabel: "Surface-mounted wiring run",
    notes:
      "MEASURED QUANTITY, unit = one linear foot of surface route, quantity from the homeowner's " +
      "measurement. INCLUDES: the per-foot channel/conduit material and the labor of running and " +
      "fixing it. EXCLUDES: setup, corners, fittings at direction changes, endpoint. " +
      "A quantity of 40 is forty feet of the same work, not a different tier.",
  },
  {
    key: "CONCEALED_ROUTE_FT",
    name: "Concealed route — per foot",
    customerFacingLabel: "Concealed wiring run",
    notes:
      "MEASURED QUANTITY, unit = one linear foot of concealed route, quantity from the homeowner's " +
      "measurement. INCLUDES: per-foot cable and the labor of pulling and supporting it. " +
      "EXCLUDES: setup, endpoint, restoration. Used with any concealed strategy; the strategy " +
      "component says HOW the route is made, this says how long it is.",
  },
  {
    key: "SURFACE_ROUTE_INSIDE_CORNER",
    name: "Surface-mounted route — inside corner",
    customerFacingLabel: "Inside corner",
    notes:
      "MEASURED QUANTITY, unit = one inside corner, quantity from the homeowner's count. " +
      "INCLUDES: turning the surface route through one internal corner — the fitting or bend the " +
      "contractor's chosen wiring method requires there, and the labor of forming and fixing it. " +
      "EXCLUDES: route length either side of the corner (SURFACE_ROUTE_FT), route setup, the " +
      "endpoint, and outside corners, which are counted separately because they are different work. " +
      "OBSERVABLE GEOMETRY, NOT A PRODUCT: the customer counts corners the route turns; the wiring " +
      "method decides what that requires. OMITTED ENTIRELY WHEN THE COUNT IS ZERO.",
  },
  {
    key: "SURFACE_ROUTE_OUTSIDE_CORNER",
    name: "Surface-mounted route — outside corner",
    customerFacingLabel: "Outside corner",
    notes:
      "MEASURED QUANTITY, unit = one outside corner, quantity from the homeowner's count. " +
      "INCLUDES: turning the surface route around one external corner — the fitting or bend that " +
      "requires, and the labor of forming and fixing it. " +
      "EXCLUDES: route length, route setup, the endpoint, and inside corners, which are counted " +
      "separately. OBSERVABLE GEOMETRY, NOT A PRODUCT. OMITTED ENTIRELY WHEN THE COUNT IS ZERO.",
  },

  // ── endpoints. What is being installed, independent of how power reaches it. ──
  {
    key: "OUTLET_EXTENSION_CORE",
    name: "Outlet endpoint — extend from an existing source",
    customerFacingLabel: "New outlet",
    notes:
      "ENDPOINT, quantity 1. INCLUDES: opening the permitted existing source, making the branch " +
      "connection, installing and connecting the new receptacle, testing, basic cleanup. " +
      "EXCLUDES ABSOLUTELY: any route strategy, any route length, surface raceway, concealed " +
      "wiring, wall openings, baseboard removal, drywall repair, and any notion of distance. " +
      "This component means the same thing whether the route is 3 ft or 50 ft.",
  },
  {
    key: "SWITCH_ENDPOINT_CORE",
    name: "Switch endpoint — new switch location",
    customerFacingLabel: "New wall switch",
    notes:
      "ENDPOINT, quantity 1. INCLUDES: making the connection at the source, installing and " +
      "connecting the switch at the new location, testing, basic cleanup. " +
      "EXCLUDES: route strategy, route length, restoration, and the fixture or device the switch " +
      "eventually controls.",
  },
  {
    key: "FIXTURE_BOX_ENDPOINT",
    name: "Fixture box endpoint — new powered location",
    customerFacingLabel: "New fixture location",
    notes:
      "ENDPOINT, quantity 1. Establishes a POWERED ELECTRICAL BOX at a new location. " +
      "INCLUDES: connection at the source, mounting the box, terminating the wiring, testing. " +
      "EXCLUDES ABSOLUTELY: the decorative fixture itself — mounting, assembling and connecting a " +
      "sconce, chandelier, vanity light or fan is separate work with its own component, and " +
      "raceway pricing must never depend on which fixture is chosen. Also excludes route strategy, " +
      "length and restoration.",
  },

  // ── surface hardware at the endpoint. ──
  {
    key: "SURFACE_DEVICE_BOX_OUTLET",
    name: "Surface-mounted box — outlet",
    customerFacingLabel: "Surface-mounted outlet box",
    notes:
      "ENDPOINT HARDWARE, quantity 1. The surface box the receptacle mounts in when wiring is " +
      "surface-mounted. INCLUDES: box and its mounting. EXCLUDES: the receptacle work itself " +
      "(OUTLET_EXTENSION_CORE), route, corners.",
  },
  {
    key: "SURFACE_DEVICE_BOX_SWITCH",
    name: "Surface-mounted box — switch",
    customerFacingLabel: "Surface-mounted switch box",
    notes:
      "ENDPOINT HARDWARE, quantity 1. The surface box the switch mounts in when wiring is " +
      "surface-mounted. INCLUDES: the box and its mounting to the wall surface. " +
      "EXCLUDES: the switch connection work itself (SWITCH_ENDPOINT_CORE), route setup, route " +
      "length, corners, and the fixture or device the switch controls.",
  },
  {
    key: "SURFACE_FIXTURE_BOX",
    name: "Surface-mounted box — fixture",
    customerFacingLabel: "Surface-mounted fixture box",
    notes:
      "ENDPOINT HARDWARE, quantity 1. The surface-mounted box a fixture will later attach to. " +
      "INCLUDES: the box and its mounting to the ceiling or wall surface, rated for fixture support. " +
      "EXCLUDES: the decorative fixture itself and any mounting, assembling or connecting of it; " +
      "the box connection work (FIXTURE_BOX_ENDPOINT); route setup, length and corners.",
  },

  // ── restoration. Modelled explicitly so it cannot hide inside "finished wall". ──
  {
    key: "RESTORE_BASEBOARD_ACCESS",
    name: "Baseboard access and reinstallation",
    customerFacingLabel: "Baseboard removal and reinstallation",
    notes:
      "RESTORATION, quantity 1. INCLUDES: carefully removing reusable existing baseboard as needed " +
      "for wiring access, and reinstalling THE SAME baseboard with basic refastening afterwards. " +
      "EXCLUDES UNLESS SEPARATELY AUTHORED: replacement trim, repair of pre-existing damage, " +
      "cosmetic nail-hole filling, caulk, stain, primer, paint, touch-up.",
  },
  {
    key: "RESTORE_DRYWALL_ACCESS",
    name: "Drywall access and restoration",
    customerFacingLabel: "Drywall patching",
    notes:
      "RESTORATION, quantity 1. INCLUDES: access openings replaced, taped, compounded and sanded " +
      "ready for primer and paint. " +
      "EXCLUDES: primer, paint, texture matching unless separately supported, wallpaper, and any " +
      "decorative wall-finish restoration. Painting is outside V2 scope entirely. " +
      "A contractor who does not offer this scope must not silently price it — the tree routes to " +
      "review instead.",
  },
];

export async function seedRoutingV2Components(db: PrismaClient = prisma) {
  // No economics passed: approvedPriceCents defaults to null, which the
  // resolver treats as "this contractor has never priced this role" and fails
  // closed on. That is the intended state until calibration.
  //
  // The contractor row still has to exist so the role is visible to price
  // LATER — an absent row and an unpriced row both fail closed today, but only
  // the unpriced one is something the wizard can find and fill in.
  const contractorId = await eliteContractorId(db);
  await upsertComponents(db, contractorId, ROUTING_V2_COMPONENTS);
  return ROUTING_V2_COMPONENTS.length;
}

if (process.argv[1] && process.argv[1].endsWith("seed-routing-v2-components.ts")) {
  seedRoutingV2Components()
    .then(async (n) => {
      console.log(`\n  ${n} Routing V2 canonical components upserted, all price-unapproved.\n`);
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
