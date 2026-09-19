import type { LaborOperation, LaborRecipe } from "../laborOperations";

const partial = (observationId: string, note: string) => ({ observationId, scope: "PARTIAL" as const, note });
const direct = (observationId: string, materialSystem: string, normalizedLaborHours: number, normalizedUnit: "each" | "ft", note: string) => ({
  observationId, scope: "DIRECT" as const, materialSystem, normalizedLaborHours, normalizedUnit, note,
});

/** First physical-operation family: branch wiring and recessed lighting. */
export const ELECTRICAL_ATOMIC_LABOR_OPERATIONS: LaborOperation[] = [
  {
    key: "ELEC_ROUTE_LAYOUT_SETUP", trade: "electrical", name: "Lay out a branch-wiring route", unit: "each",
    includes: "Inspect source and destination, select the physical route, lay out openings and crossings.",
    excludes: "Drilling, openings, cable installation, boxes, devices, fixtures and restoration.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_DRILL_TOP_OR_BOTTOM_PLATE", trade: "electrical", name: "Drill through a wall top or bottom plate", unit: "each",
    includes: "One accessible plate penetration sized for the branch cable.",
    excludes: "Finished-surface access needed to reach the plate, firestopping and cable pulling.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_FISH_WALL_TO_BOX", trade: "electrical", name: "Fish cable between accessible framing space and a wall box", unit: "each",
    includes: "One vertical fish from attic/basement/ceiling space into one wall-box opening.",
    excludes: "Plate drilling, box installation, horizontal framing crossings and drywall access openings.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_NM_CABLE_ACCESSIBLE", trade: "electrical", name: "Run NM cable through accessible space", unit: "ft",
    includes: "Place branch cable through open attic, basement or framing space.",
    excludes: "Route setup, drilling, supports, boxes, terminations and finished-wall fishing.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      partial("O121", "NECA 2015 #14 NM normal column: 0.030 manhours/ft; cable only."),
      partial("O192", "2026 estimator #14-2 NM: 0.006 manhours/ft; supports/connectors excluded."),
      partial("O089", "Estimator context: 1.5 hours per 100 ft; scope is not an incremental route."),
    ],
  },
  {
    key: "ELEC_FISH_CABLE_CONCEALED", trade: "electrical", name: "Fish cable through an enclosed framing bay", unit: "ft",
    includes: "Move branch cable through one enclosed wall or ceiling bay after required access exists.",
    excludes: "Creating access openings, drilling framing crossings, boxes, supports and terminations.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [
      { observationId: "O154", scope: "DECOMPOSITION_ONLY", note: "Published source separates old-work access labor but does not provide a numeric concealed-fishing unit." },
    ],
  },
  {
    key: "ELEC_DRILL_FRAMING_CROSSING", trade: "electrical", name: "Drill one stud or joist crossing", unit: "each",
    includes: "Locate and drill one framing member on a perpendicular concealed route.",
    excludes: "Surface access, cable pulling, structural engineering and prohibited framing alterations.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_CUT_DRYWALL_ACCESS_OPENING", trade: "electrical", name: "Cut and protect one drywall access opening", unit: "each",
    includes: "Locate, mark and form one opening needed to drill or retrieve cable.",
    excludes: "Patching, sanding, painting, plaster, wallpaper and trim restoration.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O154", scope: "DECOMPOSITION_ONLY", note: "Published source says old-work openings require separate additional labor but gives no numeric unit." },
    ],
  },
  {
    key: "ELEC_INSTALL_OLD_WORK_BOX", trade: "electrical", name: "Cut in and secure a one-gang old-work box", unit: "each",
    includes: "Box opening and installation in an existing finished surface.",
    excludes: "Cable routing, device installation, terminations and wall restoration.",
    referenceLaborHours: 0.25, referenceStatus: "PARTIAL", evidence: [
      partial("O166", "2026 plastic old-work one-gang switch box: L1@0.25 each; box only."),
      partial("O152", "Current estimator old-work MC box: 0.40 labor-hours/box; different system."),
    ],
  },
  {
    key: "ELEC_CUT_RECESSED_LIGHT_OPENING", trade: "electrical", name: "Lay out and cut one recessed-light opening", unit: "each",
    includes: "Locate and cut a ceiling opening for one remodel wafer/downlight.",
    excludes: "Fixture wiring, inter-light cable, joist drilling and surface restoration.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_INSTALL_RECESSED_WAFER", trade: "electrical", name: "Install and make up one recessed wafer/downlight", unit: "each",
    includes: "Mount and electrically connect one contractor-standard remodel wafer/downlight after cable is present.",
    excludes: "Opening cut-in, route work, feed tie-in and dimmer/control work.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      partial("O107", "NECA LED downlight: 1.25/1.56/1.95 manhours per item; broader whole-fixture scope."),
      partial("O168", "2026 prewired recessed housing: 0.60 manhours/fixture; new construction."),
      partial("O169", "2026 recessed LED downlight: 1.21 manhours/fixture; new construction."),
      partial("O135", "Practitioner clear-attic remodel can: 0.75 labor-hours/can; older evidence."),
    ],
  },
  {
    key: "ELEC_TIE_IN_LIGHTING_FEED", trade: "electrical", name: "Tie a new lighting run into an existing lighting feed", unit: "each",
    includes: "One identified, suitable existing lighting-feed connection.",
    excludes: "Circuit tracing, diagnostics, new switch leg, fixture installation and cable routing.",
    referenceLaborHours: 0.5, referenceStatus: "PARTIAL", evidence: [
      partial("O136", "Practitioner tie-in observation: 0.5 labor-hours; older evidence and not a complete first-light setup."),
    ],
  },
  {
    key: "ELEC_TERMINATE_SWITCH", trade: "electrical", name: "Install and terminate one wall switch", unit: "each",
    includes: "Terminate branch conductors on one standard switch and install device/plate.",
    excludes: "Box, cable route, dimmer premium, troubleshooting and multi-location controls.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_TERMINATE_LIGHTING_LOAD", trade: "electrical", name: "Terminate one lighting load", unit: "each",
    includes: "Make up the branch cable at one light or fan outlet point.",
    excludes: "Fixture assembly/mounting, box installation, cable route and controls.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_SETUP", trade: "electrical", name: "Lay out and start one surface-raceway route", unit: "each",
    includes: "Plan and set out one surface route and prepare its source and destination transitions.",
    excludes: "Raceway footage, fittings, boxes, conductors, devices and testing.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_SURFACE_RACEWAY", trade: "electrical", name: "Install surface-raceway base and cover", unit: "ft",
    includes: "Install one foot of the selected raceway family's base and cover on a prepared route.",
    excludes: "Fittings, boxes, conductors, terminations and product-specific supports not included by the published line item.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      direct("MLU2015:2900BAC", "WIREMOLD_2900", 0.06, "ft", "Nonmetallic latching base and cover."),
      direct("MLU2015:400BAC", "WIREMOLD_400", 0.07, "ft", "Two-piece nonmetallic base and cover."),
      direct("MLU2015:800BAC", "WIREMOLD_800", 0.075, "ft", "Two-piece nonmetallic base and cover; screw fasteners also required."),
      { observationId: "MLU2015:G4000B", scope: "PARTIAL", materialSystem: "METAL_G4000", normalizedLaborHours: 0.16, normalizedUnit: "ft", note: "Metal multi-channel base only; cover is a separate line and cannot be compared as a complete assembly." },
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_JOINT", trade: "electrical", name: "Install one surface-raceway joint cover", unit: "each",
    includes: "Fit one straight joint cover between adjacent raceway lengths.", excludes: "Cutting raceway and installing either adjacent length.",
    referenceLaborHours: 0.04, referenceStatus: "PARTIAL", evidence: [
      direct("MLU2015:2906", "WIREMOLD_2900", 0.04, "each", "Joint cover."),
      direct("MLU2015:406", "WIREMOLD_400", 0.04, "each", "Joint cover."),
      direct("MLU2015:806", "WIREMOLD_800", 0.04, "each", "Joint cover."),
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_INSIDE_CORNER", trade: "electrical", name: "Install one surface-raceway inside corner", unit: "each",
    includes: "Fit one listed internal elbow.", excludes: "Raceway footage and wall preparation.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      direct("MLU2015:2917", "WIREMOLD_2900", 0.12, "each", "Nonmetallic internal elbow."),
      direct("MLU2015:G4017", "METAL_G4000", 0.40, "each", "Metal internal elbow."),
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_OUTSIDE_CORNER", trade: "electrical", name: "Install one surface-raceway outside corner", unit: "each",
    includes: "Fit one listed external elbow.", excludes: "Raceway footage and wall preparation.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      direct("MLU2015:2918", "WIREMOLD_2900", 0.12, "each", "Nonmetallic external elbow."),
      direct("MLU2015:G4018", "METAL_G4000", 0.40, "each", "Metal external elbow."),
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_FLAT_CORNER", trade: "electrical", name: "Install one surface-raceway flat corner", unit: "each",
    includes: "Fit one listed flat elbow where direction changes on the same plane.", excludes: "Raceway footage and wall preparation.",
    referenceLaborHours: 0.11, referenceStatus: "PARTIAL", evidence: [
      direct("MLU2015:2911", "WIREMOLD_2900", 0.11, "each", "Nonmetallic flat elbow."),
      direct("MLU2015:411", "WIREMOLD_400", 0.11, "each", "Nonmetallic flat elbow."),
      direct("MLU2015:811", "WIREMOLD_800", 0.11, "each", "Nonmetallic flat elbow."),
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_END", trade: "electrical", name: "Install one surface-raceway blank end", unit: "each",
    includes: "Fit one listed blank end fitting.", excludes: "Entrance fittings and endpoint boxes.",
    referenceLaborHours: 0.04, referenceStatus: "PARTIAL", evidence: [
      direct("MLU2015:2910B", "WIREMOLD_2900", 0.04, "each", "Blank end."),
      direct("MLU2015:410B", "WIREMOLD_400", 0.04, "each", "Blank end."),
      direct("MLU2015:810B", "WIREMOLD_800", 0.04, "each", "Blank end."),
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_TRANSITION", trade: "electrical", name: "Install one surface-raceway entrance or transition fitting", unit: "each",
    includes: "Fit one listed entrance/transition fitting at a declared terminus.", excludes: "Endpoint box, conductor termination and raceway footage.",
    referenceLaborHours: 0.16, referenceStatus: "PARTIAL", evidence: [
      direct("MLU2015:810A2", "WIREMOLD_400_OR_800", 0.16, "each", "Entrance end fitting; exact selected family still governs applicability."),
    ],
  },
  {
    key: "ELEC_SURFACE_DEVICE_BOX", trade: "electrical", name: "Mount one surface-raceway device box", unit: "each",
    includes: "Mount one one-gang surface device box compatible with the selected raceway.", excludes: "Device, conductor, raceway and testing.",
    referenceLaborHours: 0.30, referenceStatus: "PARTIAL", evidence: [
      direct("MLU2015:NM2044-1G", "WIREMOLD_2900", 0.30, "each", "One-gang deep device box; one family-specific observation."),
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_WIRE_CLIP", trade: "electrical", name: "Install one raceway conductor-retaining clip", unit: "each",
    includes: "Install one selected-system clip that retains conductors inside the raceway.",
    excludes: "Wall supports, mounting fasteners, raceway footage and assumptions that every family needs this part.",
    referenceLaborHours: 0.025, referenceStatus: "PARTIAL", evidence: [
      direct("MLU2015:400WC", "WIREMOLD_400", 0.025, "each", "Wire clip."),
      direct("MLU2015:800WC", "WIREMOLD_800", 0.025, "each", "Wire clip."),
    ],
  },
  {
    key: "ELEC_SURFACE_RACEWAY_SUPPORT", trade: "electrical", name: "Install one required raceway wall support or fastener", unit: "each",
    includes: "Install one product-appropriate wall support or fastener when it is not already included in the raceway-foot operation.",
    excludes: "Conductor-retaining clips and any support already included by the selected family's published base-and-cover unit.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_PULL_SURFACE_RACEWAY_CONDUCTOR", trade: "electrical", name: "Pull one conductor-foot through surface raceway", unit: "ft",
    includes: "Pull one linear foot of one building-wire conductor through an installed surface-raceway path.",
    excludes: "Raceway installation, conductor material, terminations and any cable assembly installed under a different convention.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      direct("MLU2015:THHN-14", "THHN_14_COPPER", 0.005, "ft", "One #14 THHN/THWN copper conductor-foot."),
      direct("MLU2015:THHN-12", "THHN_12_COPPER", 0.006, "ft", "One #12 THHN/THWN copper conductor-foot."),
    ],
  },
];

const c = (operationKey: string, value: number, condition?: string) => ({ operationKey, quantity: { kind: "constant" as const, value }, condition });
const m = (operationKey: string, fact: string, condition?: string) => ({ operationKey, quantity: { kind: "measurement" as const, fact, unit: "ft" as const }, condition });

export const ELECTRICAL_ATOMIC_LABOR_RECIPES: LaborRecipe[] = [
  {
    key: "ELECTRICAL_SURFACE_RACEWAY_ROUTE", trade: "electrical",
    appliesTo: ["ELEC_ROUTE_SURFACE_MOUNTED", "SURFACE_ROUTE_FT", "SURFACE_ROUTE_INSIDE_CORNER", "SURFACE_ROUTE_OUTSIDE_CORNER", "SURFACE_ROUTE_FLAT_CORNER", "SURFACE_DEVICE_BOX_OUTLET"],
    lines: [
      c("ELEC_SURFACE_RACEWAY_SETUP", 1),
      m("ELEC_SURFACE_RACEWAY", "surfaceRouteFeet"),
      m("ELEC_PULL_SURFACE_RACEWAY_CONDUCTOR", "conductorFeet"),
      { operationKey: "ELEC_SURFACE_RACEWAY_JOINT", quantity: { kind: "contractor-input", fact: "straightJointCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_RACEWAY_SUPPORT", quantity: { kind: "contractor-input", fact: "supportCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_RACEWAY_WIRE_CLIP", quantity: { kind: "contractor-input", fact: "wireClipCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_RACEWAY_INSIDE_CORNER", quantity: { kind: "contractor-input", fact: "insideCornerCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_RACEWAY_OUTSIDE_CORNER", quantity: { kind: "contractor-input", fact: "outsideCornerCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_RACEWAY_FLAT_CORNER", quantity: { kind: "contractor-input", fact: "flatCornerCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_RACEWAY_END", quantity: { kind: "contractor-input", fact: "blankEndCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_RACEWAY_TRANSITION", quantity: { kind: "contractor-input", fact: "transitionCount", unit: "each" } },
      { operationKey: "ELEC_SURFACE_DEVICE_BOX", quantity: { kind: "contractor-input", fact: "surfaceDeviceBoxCount", unit: "each" } },
    ],
  },
  {
    key: "ELECTRICAL_ACCESSIBLE_SWITCH_LEG", trade: "electrical",
    appliesTo: ["SWITCHLEG_ACCESSIBLE_UNDER_10", "SWITCHLEG_ACCESSIBLE_10_20", "SWITCH_POWER_RUN_ACCESSIBLE"],
    lines: [
      c("ELEC_ROUTE_LAYOUT_SETUP", 1), c("ELEC_INSTALL_OLD_WORK_BOX", 1),
      c("ELEC_DRILL_TOP_OR_BOTTOM_PLATE", 1), c("ELEC_FISH_WALL_TO_BOX", 1),
      m("ELEC_NM_CABLE_ACCESSIBLE", "routeFeet"), c("ELEC_TERMINATE_SWITCH", 1),
      c("ELEC_TERMINATE_LIGHTING_LOAD", 1),
    ],
  },
  {
    key: "ELECTRICAL_FINISHED_SWITCH_LEG", trade: "electrical",
    appliesTo: ["SWITCHLEG_FINISHED_UNDER_10", "SWITCHLEG_FINISHED_10_20", "SWITCH_POWER_RUN_FINISHED"],
    lines: [
      c("ELEC_ROUTE_LAYOUT_SETUP", 1), c("ELEC_INSTALL_OLD_WORK_BOX", 1),
      c("ELEC_DRILL_TOP_OR_BOTTOM_PLATE", 1), c("ELEC_FISH_WALL_TO_BOX", 1),
      c("ELEC_CUT_DRYWALL_ACCESS_OPENING", 2),
      m("ELEC_FISH_CABLE_CONCEALED", "routeFeet"),
      { operationKey: "ELEC_DRILL_FRAMING_CROSSING", quantity: { kind: "framing-crossings", distanceFact: "perpendicularCeilingFeet", spacingFact: "framingSpacingInches" } },
      { operationKey: "ELEC_CUT_DRYWALL_ACCESS_OPENING", quantity: { kind: "framing-crossings", distanceFact: "perpendicularCeilingFeet", spacingFact: "framingSpacingInches" }, note: "One opening at each concealed framing crossing." },
      c("ELEC_TERMINATE_SWITCH", 1), c("ELEC_TERMINATE_LIGHTING_LOAD", 1),
    ],
  },
  {
    key: "ELECTRICAL_RECESSED_LIGHT_GROUP", trade: "electrical",
    appliesTo: ["recessed-lighting", "RECESSED_ADDITIONAL_ACCESSIBLE", "RECESSED_FIRST_LIGHT_FINISHED", "RECESSED_ADDITIONAL_FINISHED"],
    lines: [
      c("ELEC_ROUTE_LAYOUT_SETUP", 1), c("ELEC_TIE_IN_LIGHTING_FEED", 1),
      { operationKey: "ELEC_CUT_RECESSED_LIGHT_OPENING", quantity: { kind: "contractor-input", fact: "lightCount", unit: "each" } },
      { operationKey: "ELEC_INSTALL_RECESSED_WAFER", quantity: { kind: "contractor-input", fact: "lightCount", unit: "each" } },
      m("ELEC_NM_CABLE_ACCESSIBLE", "interLightCableFeet", "accessibleRoute"),
      m("ELEC_FISH_CABLE_CONCEALED", "interLightCableFeet", "finishedRoute"),
      { operationKey: "ELEC_DRILL_FRAMING_CROSSING", quantity: { kind: "framing-crossings", distanceFact: "perpendicularCeilingFeet", spacingFact: "framingSpacingInches" } },
      c("ELEC_CUT_DRYWALL_ACCESS_OPENING", 2, "finishedRoute"),
      { operationKey: "ELEC_CUT_DRYWALL_ACCESS_OPENING", quantity: { kind: "framing-crossings", distanceFact: "perpendicularCeilingFeet", spacingFact: "framingSpacingInches" }, condition: "finishedRoute", note: "One opening at each concealed joist crossing." },
    ],
  },
];
