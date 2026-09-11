/**
 * Vendor-neutral material ROLES for Routing V2's physical model — Stage C.
 *
 * A role says what the work physically consumes. It never says whose product
 * satisfies it. `SURFACE_RACEWAY_ELBOW_FLAT` is the role; Wiremold 2911,
 * Legrand's equivalent, or anything else a contractor stocks is a
 * ContractorMaterial with a MaterialSupplierLink underneath. That rule is
 * already written down in docs/MATERIAL-SUPPLIER-CATALOG.md and these roles
 * exist to be the thing it protects.
 *
 * NO PACKAGE GEOMETRY LIVES HERE. The NECA MLU publishes Wiremold's 2900
 * family in 6 ft and 8 ft lengths and the 400/800 families in 5 ft only — real
 * facts, and all three belong to the PRODUCT, not the role. A 31 ft run needs
 * 31 feet of channel; how many sticks that is depends on what the contractor
 * buys, and that question belongs to the takeoff layer, not to this vocabulary.
 *
 * PHYSICAL COMPATIBILITY BEATS ROLE ECONOMY.
 *
 * `BOX_SURFACE_4S` already exists and is NOT reused here. A 4-square box with
 * a raised cover is a 4x4 metal box fed by conduit knockouts; a raceway device
 * box is a shallow box designed to mate with a raceway base and its cover. They
 * mount differently, they accept different fittings, and a contractor buys them
 * from different pages. Collapsing them would save one row and produce a
 * takeoff that orders the wrong part.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Role = { key: string; name: string; unit: string; notes: string };

/** Surface raceway — the family the research closed. */
export const SURFACE_RACEWAY_ROLES: Role[] = [
  { key: "SURFACE_RACEWAY_CHANNEL", unit: "ft", name: "Surface raceway channel (base and cover), per foot",
    notes: "LINEAR REQUIREMENT. One foot of assembled base+cover. Stock length is a property of the contractor's chosen product (the MLU records 5 ft, 6 ft, 8 ft and 10 ft families) and never of this role." },
  { key: "SURFACE_RACEWAY_JOINT", unit: "each", name: "Surface raceway joint cover / coupling",
    notes: "Joins two lengths of channel. Its COUNT is derived from how the run is cut from stock, not from the route's footage — a takeoff output, never a homeowner question." },
  { key: "SURFACE_RACEWAY_ELBOW_INSIDE", unit: "each", name: "Surface raceway internal elbow",
    notes: "Turn into a concave corner, in the plane of the two walls. 1:1 with an inside-corner turn." },
  { key: "SURFACE_RACEWAY_ELBOW_OUTSIDE", unit: "each", name: "Surface raceway external elbow",
    notes: "Turn around a convex corner. 1:1 with an outside-corner turn." },
  { key: "SURFACE_RACEWAY_ELBOW_FLAT", unit: "each", name: "Surface raceway flat elbow",
    notes: "Ninety-degree turn WITHIN one flat surface — the raceway changes direction without leaving the wall. Physically distinct from inside and outside elbows and separately published by the MLU in every family. 1:1 with a flat-corner turn." },
  { key: "SURFACE_RACEWAY_END", unit: "each", name: "Surface raceway blank end fitting",
    notes: "Closes a terminated run. Per-run, not per-foot." },
  { key: "SURFACE_RACEWAY_TRANSITION", unit: "each", name: "Surface raceway transition / entrance fitting",
    notes: "Where the raceway meets a box, a wall penetration or another wiring method. Per entry point." },
  { key: "SURFACE_RACEWAY_SUPPORT_CLIP", unit: "each", name: "Surface raceway support clip / strap",
    notes: "Mechanical support along the run. The MLU publishes fasteners and supports as their own labor units and states they are not included in the raceway figure." },
  { key: "SURFACE_DEVICE_BOX_1G", unit: "each", name: "Surface-mounted raceway device box, 1-gang",
    notes: "Shallow box that mates with a raceway base. NOT a 4-square box (see BOX_SURFACE_4S) — different mounting, different fittings, different part." },
  { key: "SURFACE_DEVICE_BOX_2G", unit: "each", name: "Surface-mounted raceway device box, 2-gang",
    notes: "As the 1-gang, two devices wide." },
  { key: "SURFACE_FIXTURE_BOX", unit: "each", name: "Surface-mounted raceway fixture box",
    notes: "Raceway-fed box rated to carry a luminaire." },
];

/**
 * EMT — sizes chosen from what this catalog actually does, not from what NECA
 * happens to publish.
 *
 *   1/2"  the default for 15/20A branch circuits, which is what Routing V2
 *         routes today.
 *   3/4"  where conductor fill or a 30/50A appliance circuit requires it —
 *         the catalog already carries WIRE_10_2, WIRE_10_3 and range/dryer work.
 *   1"    precedent already in the catalog: hot-tub-spa-electrical consumes
 *         CONDUIT_PVC_1 at 25 ft, so feeder-scale conduit is real here.
 *
 * Nothing above 1". 1-1/4" and up is service-entrance and commercial work that
 * no service in this catalog performs. The naming is `EMT_<SIZE>` so adding one
 * later is a row, not a redesign.
 */
const EMT_SIZES: { suffix: string; label: string }[] = [
  { suffix: "1_2", label: '1/2"' },
  { suffix: "3_4", label: '3/4"' },
  { suffix: "1", label: '1"' },
];

export const EMT_ROLES: Role[] = EMT_SIZES.flatMap((s) => [
  { key: `EMT_${s.suffix}`, unit: "ft", name: `EMT ${s.label}, per foot`,
    notes: `LINEAR REQUIREMENT. Stock length (typically 10 ft) belongs to the contractor's product, not to this role.` },
  { key: `EMT_COUPLING_${s.suffix}`, unit: "each", name: `EMT coupling ${s.label}`,
    notes: "Joins two lengths. Count derives from stock segmentation, like the raceway joint." },
  { key: `EMT_CONNECTOR_${s.suffix}`, unit: "each", name: `EMT box connector ${s.label}`,
    notes: "Terminates conduit into a box or enclosure. Per termination." },
  { key: `EMT_STRAP_${s.suffix}`, unit: "each", name: `EMT strap / support ${s.label}`,
    notes: "Mechanical support. Separately published by the MLU as its own labor unit." },
  { key: `CONDUIT_BODY_LB_${s.suffix}`, unit: "each", name: `Conduit body, LB, ${s.label}`,
    notes: "Pull point at a 90-degree change of direction where a bend is impractical. LB only for now — the T and C bodies have no route that needs them yet." },
  { key: `BUSHING_${s.suffix}`, unit: "each", name: `Insulating bushing ${s.label}`,
    notes: "Where the fitting used does not already provide an insulated throat." },
]);

/**
 * Individual conductors, for raceway and conduit.
 *
 * DELIBERATELY SEPARATE FROM NM CABLE. `WIRE_14_2` is a jacketed two-conductor
 * assembly with a ground; `CONDUCTOR_THHN_14` is one single conductor. They are
 * not interchangeable, they are not priced alike, and the MLU publishes them in
 * different sections with different units — NM per thousand feet of CABLE,
 * building wire per thousand feet of ONE conductor.
 *
 * Gauges follow the branch-circuit work the catalog actually performs: #14 for
 * 15A, #12 for 20A, #10 for 30A, matching the NM gauges that have live
 * consumers. #6 exists as NM for feeders and hot tubs, but no Routing V2 path
 * routes a feeder through raceway yet, so it is deferred rather than guessed.
 */
export const CONDUCTOR_ROLES: Role[] = [
  { key: "CONDUCTOR_THHN_14", unit: "ft", name: "THHN/THWN copper conductor #14, per foot",
    notes: "ONE conductor, one foot. 15A branch circuits. Not interchangeable with WIRE_14_2 (NM cable)." },
  { key: "CONDUCTOR_THHN_12", unit: "ft", name: "THHN/THWN copper conductor #12, per foot",
    notes: "ONE conductor, one foot. 20A branch circuits." },
  { key: "CONDUCTOR_THHN_10", unit: "ft", name: "THHN/THWN copper conductor #10, per foot",
    notes: "ONE conductor, one foot. 30A circuits." },
];

export const ROUTING_V2_MATERIAL_ROLES: Role[] = [
  ...SURFACE_RACEWAY_ROLES, ...EMT_ROLES, ...CONDUCTOR_ROLES,
];

/** Vendor names that must never appear in a canonical role. */
export const FORBIDDEN_BRANDS = [
  "wiremold", "legrand", "panduit", "hubbell", "carlon", "southwire",
  "cerrowire", "lowes", "lowe's", "homedepot", "home depot", "graybar",
];

export async function seedRoutingV2MaterialRoles(db: PrismaClient = prisma) {
  let created = 0, updated = 0;
  for (const r of ROUTING_V2_MATERIAL_ROLES) {
    const brand = FORBIDDEN_BRANDS.find((b) => `${r.key} ${r.name}`.toLowerCase().includes(b));
    if (brand) throw new Error(`Canonical role "${r.key}" names a vendor ("${brand}"). Roles are vendor-neutral.`);
    const existing = await db.canonicalMaterial.findUnique({ where: { key: r.key }, select: { id: true } });
    await db.canonicalMaterial.upsert({
      where: { key: r.key },
      update: { name: r.name, unit: r.unit, notes: r.notes },
      create: { key: r.key, name: r.name, unit: r.unit, notes: r.notes },
    });
    existing ? updated++ : created++;
  }
  return { created, updated, total: ROUTING_V2_MATERIAL_ROLES.length };
}

if (process.argv[1] && process.argv[1].endsWith("seed-routing-v2-material-roles.ts")) {
  seedRoutingV2MaterialRoles()
    .then(async (r) => {
      console.log(`\n  ${r.total} roles: ${r.created} created, ${r.updated} updated.`);
      console.log(`  surface raceway ${SURFACE_RACEWAY_ROLES.length}, EMT ${EMT_ROLES.length}, conductors ${CONDUCTOR_ROLES.length}\n`);
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
