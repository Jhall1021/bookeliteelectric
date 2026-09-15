/**
 * Published labor observations, attached to the canonical components they
 * describe — Stage A of Component Economics.
 *
 * NOTHING HERE IS DERIVED. Every row carries the source's own line item, its
 * printed figure, its unit code and its difficulty column, alongside our
 * normalization. A reader can check one against the other.
 *
 * WHY MANY ROWS PER COMPONENT
 *
 * The research made it concrete. A surface-raceway flat elbow is 0.11 manhours
 * in Wiremold's 2900 family, 0.11 in the 400 and 800 families, 0.10 in the 2800
 * family — and 0.40 in the metal G4000 family. The same canonical component,
 * four published figures, differing by a factor of four because the physical
 * product differs. `materialSystem` scopes each one so a family-specific figure
 * can never be read as universal.
 *
 * And CONCEALED_ROUTE_FT has two CURRENT references disagreeing five-fold:
 * NECA MLU publishes NM 2/C #14 with ground at 30.00 per thousand feet
 * (0.030 mh/ft); the 2026 National Electrical Estimator publishes 6.00 per
 * KLF (0.006). Both are ingested. Neither is averaged. The component's
 * referenceLaborStatus is DISPUTED and its referenceLaborHours stays null,
 * because a midpoint would be a number nobody published.
 *
 * OUTLET_EXTENSION_CORE is PARTIAL for a different reason: box and device
 * labor are both published, but the old-work OPENING is not — the 2026 NEE
 * says cutting openings in existing surfaces must be estimated separately and
 * gives no figure, and the MLU is a new-work manual that says remodel work
 * "needs to be substantially increased" without saying by how much.
 */
import { PrismaClient, type LaborEvidenceScopeMatch, type ReferenceLaborStatus } from "@prisma/client";

const prisma = new PrismaClient();

type Ev = {
  component: string;
  observationId: string;
  source: string;
  edition: string;
  sourceRef?: string;
  publishedLineItem: string;
  publishedValue: string;
  originalUnit: string;
  crewConvention?: string;
  difficulty?: string;
  normalizedLabor: number;
  normalizedUnit: string;
  materialSystem?: string;
  sizeApplicability?: string;
  scopeMatch: LaborEvidenceScopeMatch;
  confidence: string;
  caution?: string;
};

const MLU = { source: "NECA Manual of Labor Units", edition: "2015-2016", crewConvention: "man-hours" };
const NEE = { source: "National Electrical Estimator", edition: "2026", crewConvention: "L1 — one electrician" };

/** Per-100 (`C`) to per-item/per-foot. Stated, not hidden in a constant. */
const perC = (v: number) => v / 100;
const perM = (v: number) => v / 1000;

export const COMPONENT_LABOR_EVIDENCE: Ev[] = [
  // ---- SURFACE_ROUTE_FT — channel, per linear foot, four product families --
  { component: "SURFACE_ROUTE_FT", observationId: "MLU2015:2900BAC", ...MLU, sourceRef: "2-46",
    publishedLineItem: "2900 Latching Raceway - Base and Cover", publishedValue: "6.00 C",
    originalUnit: "C", difficulty: "Normal", normalizedLabor: perC(6), normalizedUnit: "manhours/ft",
    materialSystem: "WIREMOLD_2900", scopeMatch: "DIRECT", confidence: "HIGH",
    caution: "Nonmetallic latching raceway, adhesive backed, supplied in 6 ft and 8 ft lengths." },
  { component: "SURFACE_ROUTE_FT", observationId: "MLU2015:400BAC", ...MLU, sourceRef: "2-46",
    publishedLineItem: "400BAC 2-Piece Raceway - Base and Cover", publishedValue: "7.00 C",
    originalUnit: "C", difficulty: "Normal", normalizedLabor: perC(7), normalizedUnit: "manhours/ft",
    materialSystem: "WIREMOLD_400", scopeMatch: "DIRECT", confidence: "HIGH",
    caution: "Two-piece nonmetallic raceway, 5 ft lengths only." },
  { component: "SURFACE_ROUTE_FT", observationId: "MLU2015:800BAC", ...MLU, sourceRef: "2-47",
    publishedLineItem: "800BAC 2-Piece Raceway - Base and Cover", publishedValue: "7.50 C",
    originalUnit: "C", difficulty: "Normal", normalizedLabor: perC(7.5), normalizedUnit: "manhours/ft",
    materialSystem: "WIREMOLD_800", scopeMatch: "DIRECT", confidence: "HIGH",
    caution: "5 ft lengths only; requires screw fasteners in addition to adhesive." },
  { component: "SURFACE_ROUTE_FT", observationId: "MLU2015:G4000B", ...MLU, sourceRef: "2-42",
    publishedLineItem: "G4000B Raceway Base", publishedValue: "16.00 C",
    originalUnit: "C", difficulty: "Normal", normalizedLabor: perC(16), normalizedUnit: "manhours/ft",
    materialSystem: "METAL_G4000", scopeMatch: "PARTIAL", confidence: "MEDIUM",
    caution: "Metal multi-channel raceway BASE only; cover is a separate published line. Not comparable to a one-piece nonmetallic figure." },

  // ---- inside / outside / flat turns, kept separate -----------------------
  { component: "SURFACE_ROUTE_INSIDE_CORNER", observationId: "MLU2015:2917", ...MLU, sourceRef: "2-46",
    publishedLineItem: "2917 Internal Elbow", publishedValue: "12.00 C", originalUnit: "C",
    difficulty: "Normal", normalizedLabor: perC(12), normalizedUnit: "manhours/each",
    materialSystem: "WIREMOLD_2900", scopeMatch: "DIRECT", confidence: "HIGH" },
  { component: "SURFACE_ROUTE_INSIDE_CORNER", observationId: "MLU2015:G4017", ...MLU, sourceRef: "2-42",
    publishedLineItem: "G4017 Internal Elbow", publishedValue: "40.00 C", originalUnit: "C",
    difficulty: "Normal", normalizedLabor: perC(40), normalizedUnit: "manhours/each",
    materialSystem: "METAL_G4000", scopeMatch: "DIRECT", confidence: "HIGH",
    caution: "Metal family. More than three times the nonmetallic figure for the same canonical turn." },
  { component: "SURFACE_ROUTE_OUTSIDE_CORNER", observationId: "MLU2015:2918", ...MLU, sourceRef: "2-46",
    publishedLineItem: "2918 External Elbow", publishedValue: "12.00 C", originalUnit: "C",
    difficulty: "Normal", normalizedLabor: perC(12), normalizedUnit: "manhours/each",
    materialSystem: "WIREMOLD_2900", scopeMatch: "DIRECT", confidence: "HIGH" },
  { component: "SURFACE_ROUTE_OUTSIDE_CORNER", observationId: "MLU2015:G4018", ...MLU, sourceRef: "2-42",
    publishedLineItem: "G4018 External Elbow", publishedValue: "40.00 C", originalUnit: "C",
    difficulty: "Normal", normalizedLabor: perC(40), normalizedUnit: "manhours/each",
    materialSystem: "METAL_G4000", scopeMatch: "DIRECT", confidence: "HIGH" },

  // ---- endpoint box -------------------------------------------------------
  { component: "SURFACE_DEVICE_BOX_OUTLET", observationId: "MLU2015:NM2044-1G", ...MLU, sourceRef: "2-46",
    publishedLineItem: "NM2044 1-Gang Deep Device Box", publishedValue: "30.00 C", originalUnit: "C",
    difficulty: "Normal", normalizedLabor: perC(30), normalizedUnit: "manhours/each",
    materialSystem: "WIREMOLD_2900", scopeMatch: "DIRECT", confidence: "HIGH",
    caution: "Published for voice/data device mounting; physically the same box-setting operation." },

  // ---- CONCEALED_ROUTE_FT — two current references, five-fold disagreement -
  { component: "CONCEALED_ROUTE_FT", observationId: "MLU2015:NM-2C14-WG", ...MLU, sourceRef: "3-16",
    publishedLineItem: "600 Volt Non-Metallic Sheathed Cable Copper, Type NM with Ground, 2/C #14",
    publishedValue: "30.00 M", originalUnit: "M", difficulty: "Normal",
    normalizedLabor: perM(30), normalizedUnit: "manhours/ft",
    scopeMatch: "PARTIAL", confidence: "HIGH",
    caution: "New-work basis. MLU states labor units are for new work only and must be substantially increased for remodel, with no factor given. Supports are separately published." },
  { component: "CONCEALED_ROUTE_FT", observationId: "NEE2026:NM-14-2", ...NEE, sourceRef: "O192",
    publishedLineItem: "Type NM (Romex) with ground, #14-2", publishedValue: "L1@6.00 KLF",
    originalUnit: "KLF", normalizedLabor: 0.006, normalizedUnit: "manhours/ft",
    scopeMatch: "PARTIAL", confidence: "HIGH",
    caution: "FIVE TIMES lower than the MLU figure for the same cable. Two current references disagree; neither is adjudicated and no midpoint may be taken. Excludes supports and staples." },

  // ---- OUTLET_EXTENSION_CORE — box + device published, opening is not ------
  { component: "OUTLET_EXTENSION_CORE", observationId: "NEE2026:oldwork-box", ...NEE, sourceRef: "O166",
    publishedLineItem: "Plastic old-work 1-gang switch box, 2 clamps", publishedValue: "L1@0.25 Ea",
    originalUnit: "Ea", normalizedLabor: 0.25, normalizedUnit: "manhours/each",
    scopeMatch: "PARTIAL", confidence: "HIGH", caution: "Box install only; excludes cutting the opening." },
  { component: "OUTLET_EXTENSION_CORE", observationId: "NEE2026:receptacle-in-box", ...NEE, sourceRef: "O181",
    publishedLineItem: "15A 125V duplex receptacle installed in outlet box", publishedValue: "L1@0.20 Ea",
    originalUnit: "Ea", normalizedLabor: 0.2, normalizedUnit: "manhours/each",
    scopeMatch: "PARTIAL", confidence: "HIGH", caution: "Device only; NEE states device rows exclude the outlet box." },
  { component: "OUTLET_EXTENSION_CORE", observationId: "NEE2026:cut-in-opening", ...NEE, sourceRef: "O154",
    publishedLineItem: "Cutting openings for outlet boxes in existing surfaces (old work)",
    publishedValue: "Additional labor required; estimate separately", originalUnit: "none",
    normalizedLabor: 0, normalizedUnit: "manhours/each",
    scopeMatch: "SCOPE_BLOCKED", confidence: "NONE",
    caution: "THE REFERENCE REFUSES TO QUANTIFY THIS. normalizedLabor 0 records that no figure was published — it is NOT a measurement of zero, and SCOPE_BLOCKED is what stops it being summed." },
];

/**
 * Adjudicated status per component. Derived from the evidence above by a
 * person, recorded here, and never computed by averaging.
 */
const ADJUDICATION: Record<string, { status: ReferenceLaborStatus; hours?: number; unit?: string; why: string }> = {
  SURFACE_ROUTE_FT: { status: "DISPUTED", why: "0.060–0.075 mh/ft across nonmetallic families and 0.16 for metal base alone. Product-family dependent; no product-independent value exists." },
  SURFACE_ROUTE_INSIDE_CORNER: { status: "DISPUTED", why: "0.12 nonmetallic vs 0.40 metal for the same canonical turn." },
  SURFACE_ROUTE_OUTSIDE_CORNER: { status: "DISPUTED", why: "As the inside turn — family dependent." },
  SURFACE_DEVICE_BOX_OUTLET: { status: "PARTIAL", hours: 0.3, unit: "each", why: "One current family-specific figure, no cross-family corroboration yet." },
  CONCEALED_ROUTE_FT: { status: "DISPUTED", why: "MLU 0.030 mh/ft vs 2026 NEE 0.006 mh/ft for the same cable. Two current references, five-fold apart." },
  OUTLET_EXTENSION_CORE: { status: "PARTIAL", why: "Box 0.25 and device 0.20 are published in one convention, but the old-work opening is explicitly unquantified by both references." },
};

export async function seedComponentLaborEvidence(db: PrismaClient = prisma) {
  let written = 0, skipped = 0;
  for (const e of COMPONENT_LABOR_EVIDENCE) {
    const c = await db.canonicalComponent.findUnique({ where: { key: e.component }, select: { id: true } });
    if (!c) { skipped++; console.log(`  skip ${e.component} — no such canonical component`); continue; }
    const { component, observationId, ...rest } = e;
    void component;
    await db.componentLaborEvidence.upsert({
      where: { canonicalComponentId_observationId: { canonicalComponentId: c.id, observationId } },
      update: { ...rest },
      create: { canonicalComponentId: c.id, observationId, ...rest },
    });
    written++;
  }
  for (const [key, a] of Object.entries(ADJUDICATION)) {
    const c = await db.canonicalComponent.findUnique({ where: { key }, select: { id: true } });
    if (!c) continue;
    await db.canonicalComponent.update({
      where: { id: c.id },
      data: {
        referenceLaborStatus: a.status,
        referenceLaborHours: a.hours ?? null,
        referenceLaborUnit: a.unit ?? null,
      },
    });
  }
  return { written, skipped, adjudicated: Object.keys(ADJUDICATION).length };
}

if (process.argv[1] && process.argv[1].endsWith("seed-component-labor-evidence.ts")) {
  seedComponentLaborEvidence()
    .then(async (r) => {
      console.log(`\n  ${r.written} observations, ${r.adjudicated} components adjudicated, ${r.skipped} skipped.\n`);
      await prisma.$disconnect();
    })
    .catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
