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
 * assembly with a ground; a THHN role is one single conductor. They are not
 * interchangeable, they are not priced alike, and the MLU publishes them in
 * different sections with different units — NM per thousand feet of CABLE,
 * building wire per thousand feet of ONE conductor.
 *
 * FUNCTION IS PART OF THE ROLE, AND COLOUR IS NOT.
 *
 * A takeoff needs an ungrounded, a grounded and an equipment grounding
 * conductor, and they are three different purchases. But ContractorMaterial is
 * unique per (contractor, canonicalMaterial) and carries exactly one active
 * supplier link, so a role resolves to exactly ONE product. `3 x
 * CONDUCTOR_THHN_14` therefore asks for three of the same spool, which cannot
 * satisfy three functions at once. Distinct roles are how this schema already
 * expresses distinct products, so the function belongs in the key.
 *
 * The function is the electrical one — what the conductor DOES. Colour is how a
 * jurisdiction and a contractor happen to identify that function, it varies
 * (grounded is white or grey; ungrounded is any unreserved colour; equipment
 * ground may be bare), and it is a property of the product the contractor
 * links, not of the canonical role. So no BLACK / WHITE / GREEN appears here.
 *
 * Gauges follow the branch-circuit work the catalog actually performs: #14 for
 * 15A, #12 for 20A, #10 for 30A, matching the NM gauges that have live
 * consumers. Feeder-scale #6 function-specific wet-location roles live in the
 * Phase F vocabulary for the reviewed spa package. They are not duplicated
 * here because Routing V2 still routes only the branch-circuit gauges below.
 */
const CONDUCTOR_GAUGES = [
  { gauge: "14", circuit: "15A branch circuits" },
  { gauge: "12", circuit: "20A branch circuits" },
  { gauge: "10", circuit: "30A circuits" },
];

/** What the conductor does. Not what colour it is. */
const CONDUCTOR_FUNCTIONS = [
  { suffix: "UNGROUNDED", label: "ungrounded (line)",
    note: "Carries current from the overcurrent device to the load." },
  { suffix: "GROUNDED", label: "grounded (neutral)",
    note: "The grounded circuit conductor. Carries current; is not the equipment ground." },
  { suffix: "EQUIPMENT_GROUND", label: "equipment grounding",
    note: "Bonds metal parts. Not a current-carrying conductor in normal operation." },
];

export const CONDUCTOR_ROLES: Role[] = CONDUCTOR_GAUGES.flatMap((g) =>
  CONDUCTOR_FUNCTIONS.map((f) => ({
    key: `CONDUCTOR_THHN_${g.gauge}_${f.suffix}`,
    unit: "ft",
    name: `THHN/THWN copper conductor #${g.gauge}, ${f.label}, per foot`,
    notes: `ONE conductor, one foot. ${g.circuit}. ${f.note} Not interchangeable with WIRE_${g.gauge}_2 (NM cable).`,
  })));

/**
 * RETIRED: CONDUCTOR_THHN_14 / _12 / _10, the function-less roles.
 *
 * They were seeded in Stage C and never used: zero ContractorMaterial, zero
 * CanonicalComponentMaterial, zero AnswerOptionMaterial, zero ServiceMaterial,
 * zero TemplateServiceMaterial, zero TemplateAnswerOptionMaterial and zero
 * MaterialBaselineVersion rows referenced them — checked across every model in
 * the schema that can hold a canonicalMaterialId, not just the obvious one.
 *
 * Keeping them would leave three roles that LOOK purchasable and silently
 * cannot serve a takeoff, because one product cannot be three functions. They
 * are removed rather than deprecated in place: a role with no consumer and no
 * correct use is not a deprecation, it is a mistake with a longer life.
 */
export const RETIRED_CONDUCTOR_ROLES = [
  "CONDUCTOR_THHN_14", "CONDUCTOR_THHN_12", "CONDUCTOR_THHN_10",
];

export const ROUTING_V2_MATERIAL_ROLES: Role[] = [
  ...SURFACE_RACEWAY_ROLES,
  {
    key: "NM_CABLE_SUPPORT", unit: "each", name: "NM cable staple or listed support",
    notes: "One product-appropriate support for jacketed NM cable. Spacing and supports near terminations are contractor declarations; this role is only the physical support consumed.",
  },
  ...EMT_ROLES, ...CONDUCTOR_ROLES,
];

/** Vendor names that must never appear in a canonical role. */
export const FORBIDDEN_BRANDS = [
  "wiremold", "legrand", "panduit", "hubbell", "carlon", "southwire",
  "cerrowire", "lowes", "lowe's", "homedepot", "home depot", "graybar",
];

/**
 * Delete the retired roles — but only after proving nothing points at them.
 *
 * Every model in the schema that can hold a canonicalMaterialId is counted, not
 * just the obvious one. A role with even a single reference is LEFT ALONE and
 * reported, because the safe failure here is a stale role, and the unsafe one
 * is deleting a role some contractor has already priced.
 */
export async function retireFunctionlessConductorRoles(db: PrismaClient = prisma) {
  const retired: string[] = [], blocked: { key: string; refs: number }[] = [];
  for (const key of RETIRED_CONDUCTOR_ROLES) {
    const role = await db.canonicalMaterial.findUnique({ where: { key }, select: { id: true } });
    if (!role) continue;
    const id = role.id;
    const refs =
      (await db.contractorMaterial.count({ where: { canonicalMaterialId: id } })) +
      (await db.canonicalComponentMaterial.count({ where: { canonicalMaterialId: id } })) +
      (await db.answerOptionMaterial.count({ where: { canonicalMaterialId: id } })) +
      (await db.serviceMaterial.count({ where: { canonicalMaterialId: id } })) +
      (await db.templateServiceMaterial.count({ where: { canonicalMaterialId: id } })) +
      (await db.templateAnswerOptionMaterial.count({ where: { canonicalMaterialId: id } })) +
      (await db.materialBaselineVersion.count({ where: { canonicalMaterialId: id } }));
    if (refs > 0) { blocked.push({ key, refs }); continue; }
    await db.canonicalMaterial.delete({ where: { id } });
    retired.push(key);
  }
  return { retired, blocked };
}

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
      console.log(`  surface raceway ${SURFACE_RACEWAY_ROLES.length}, EMT ${EMT_ROLES.length}, conductors ${CONDUCTOR_ROLES.length}`);
      const ret = await retireFunctionlessConductorRoles();
      console.log(`  retired ${ret.retired.length}: ${ret.retired.join(", ") || "(none)"}`);
      if (ret.blocked.length > 0) {
        console.log(`  LEFT IN PLACE (still referenced): ${ret.blocked.map((b) => `${b.key} x${b.refs}`).join(", ")}`);
      }
      console.log();
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
