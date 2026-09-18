import type { LaborOperation, LaborRecipe } from "../laborOperations";

const partial = (observationId: string, note: string) => ({ observationId, scope: "PARTIAL" as const, note });

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
];

const c = (operationKey: string, value: number, condition?: string) => ({ operationKey, quantity: { kind: "constant" as const, value }, condition });
const m = (operationKey: string, fact: string, condition?: string) => ({ operationKey, quantity: { kind: "measurement" as const, fact, unit: "ft" as const }, condition });

export const ELECTRICAL_ATOMIC_LABOR_RECIPES: LaborRecipe[] = [
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
