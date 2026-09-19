import type { LaborCalibrationGroup, LaborOperation, LaborRecipe } from "../laborOperations";

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
  {
    key: "ELEC_REPLACE_STANDARD_RECEPTACLE", trade: "electrical", name: "Replace one standard receptacle in the existing box", unit: "each",
    includes: "De-energize, remove one existing standard receptacle, install its like-for-like replacement and function-test it.",
    excludes: "Box repair, circuit diagnosis, new cable, GFCI/AFCI work and cover/finish repair.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      direct("O001", "RESIDENTIAL_SERVICE", 0.30, "each", "Direct published replacement task."),
      direct("O018", "INSTITUTIONAL_MAINTENANCE", 1.00, "each", "Direct task but materially different overhead/context."),
      { observationId: "O025", scope: "DIRECT", note: "Published range 0.25–0.50 elapsed hours; no midpoint adopted." },
    ],
  },
  {
    key: "ELEC_REPLACE_STANDARD_SWITCH", trade: "electrical", name: "Replace one standard single-pole switch", unit: "each",
    includes: "De-energize, remove one existing switch, install a like-for-like single-pole switch and function-test it.",
    excludes: "Three-way identification, smart commissioning, box repair, diagnosis and new wiring.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      direct("O002", "RESIDENTIAL_SERVICE", 0.30, "each", "Direct published replacement task."),
      direct("O019", "INSTITUTIONAL_MAINTENANCE", 1.00, "each", "Direct task but materially different overhead/context."),
      { observationId: "O028", scope: "DIRECT", note: "Published range 0.25–0.50 elapsed hours; no midpoint adopted." },
    ],
  },
  {
    key: "ELEC_REPLACE_GFCI_RECEPTACLE", trade: "electrical", name: "Replace one GFCI receptacle", unit: "each",
    includes: "Remove a failed/existing GFCI, preserve line/load connections, install replacement, reset and test it.",
    excludes: "Finding downstream faults, correcting line/load wiring, box repair and new circuit work.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      direct("O003", "RESIDENTIAL_SERVICE", 0.40, "each", "Direct replacement observation."),
      { observationId: "O087", scope: "PARTIAL", normalizedLaborHours: 0.50, normalizedUnit: "each", note: "Estimate line item in project/install context." },
    ],
  },
  {
    key: "ELEC_REPLACE_THREE_WAY_SWITCH", trade: "electrical", name: "Replace one existing three-way switch", unit: "each",
    includes: "Identify common/travelers, replace one switch in an existing multi-location circuit and function-test both locations.",
    excludes: "Replacing the pair, tracing undocumented conductors, adding a location and correcting circuit faults.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O034", scope: "DIRECT", note: "Published range 0.25–0.50 elapsed hours; no midpoint adopted." },
      { observationId: "O176", scope: "PARTIAL", normalizedLaborHours: 0.25, normalizedUnit: "each", note: "New installation in a box, not replacement." },
    ],
  },
  {
    key: "ELEC_REPLACE_LED_DIMMER", trade: "electrical", name: "Replace one compatible single-pole LED dimmer", unit: "each",
    includes: "Replace one compatible dimmer and verify basic dimming operation with the existing load.",
    excludes: "Lamp/driver incompatibility diagnosis, three-way dimming, programming and neutral-wire remediation.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O029", scope: "DIRECT", note: "Simple compatible dimmer: 0.33–0.50 elapsed hours." },
      { observationId: "O030", scope: "PARTIAL", note: "Broader dimmer range: 0.33–0.75 hours." },
    ],
  },
  {
    key: "ELEC_REPLACE_USB_RECEPTACLE", trade: "electrical", name: "Replace one receptacle with a USB/USB-C receptacle", unit: "each",
    includes: "Replace one existing receptacle with a compatible USB receptacle and function-test it.",
    excludes: "Box enlargement, box-fill correction, circuit diagnosis and new wiring.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O031", scope: "DIRECT", note: "Published range 0.25–0.50 elapsed hours per outlet." },
    ],
  },
  {
    key: "ELEC_REPLACE_HIGH_AMP_RECEPTACLE", trade: "electrical", name: "Replace one existing high-amperage appliance receptacle", unit: "each",
    includes: "Replace one compatible existing dryer/range receptacle in a serviceable box and verify connections.",
    excludes: "New circuit, conductor/configuration conversion, box replacement, cord replacement and diagnosis.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      direct("O004", "RANGE_RECEPTACLE", 0.50, "each", "Direct 240V range-receptacle replacement observation."),
      { observationId: "O184", scope: "PARTIAL", normalizedLaborHours: 0.25, normalizedUnit: "each", note: "14-30R install in box, not replacement." },
      { observationId: "O185", scope: "PARTIAL", normalizedLaborHours: 0.35, normalizedUnit: "each", note: "14-50R install in box, not replacement." },
    ],
  },
  {
    key: "ELEC_REPLACE_HARDWIRED_DETECTOR", trade: "electrical", name: "Replace one existing hardwired smoke or smoke/CO detector", unit: "each",
    includes: "Replace one compatible existing detector/base connection and perform its built-in test.",
    excludes: "New interconnect wiring, circuit diagnosis, code survey and system-wide commissioning.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O035", scope: "DIRECT", note: "Published range 0.25–0.333 elapsed hours per existing hardwired detector." },
      { observationId: "O194", scope: "PARTIAL", normalizedLaborHours: 0.50, normalizedUnit: "each", note: "New detector installation, not replacement." },
    ],
  },
  {
    key: "ELEC_INSTALL_SMART_DEVICE_HARDWARE", trade: "electrical", name: "Install one compatible smart switch or receptacle", unit: "each",
    includes: "Physically replace the existing compatible device and verify local electrical operation.",
    excludes: "Account creation, Wi-Fi pairing, app setup, neutral remediation and compatibility diagnosis.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O032", scope: "PARTIAL", note: "Smart switch with cooperative wiring: 0.25–0.50 hours; commissioning boundary unresolved." },
      { observationId: "O033", scope: "PARTIAL", note: "Smart outlet physical swap: 0.333–0.50 hours; commissioning excluded." },
    ],
  },
  {
    key: "ELEC_COMMISSION_CONNECTED_DEVICE", trade: "electrical", name: "Commission one connected control in the customer's app", unit: "each",
    includes: "Pair one supported installed device to the customer's available network/app and confirm basic control.",
    excludes: "Creating vendor accounts, network repair, subscription setup, automation programming and unsupported ecosystems.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_INSTALL_OCCUPANCY_CONTROL", trade: "electrical", name: "Install and configure one occupancy/motion wall control", unit: "each",
    includes: "Replace a compatible existing switch with one occupancy control and set its basic hardware parameters.",
    excludes: "Coverage redesign, ceiling sensors, new wiring, multi-device commissioning and diagnosis.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      { observationId: "O020", scope: "PARTIAL", note: "Broader wall/ceiling sensor replacement: 1–3 hours." },
      { observationId: "O104", scope: "PARTIAL", normalizedLaborHours: 0.35, normalizedUnit: "each", note: "New-work wall-switch sensor hardware unit." },
    ],
  },
  {
    key: "ELEC_INSTALL_TIMER_CONTROL", trade: "electrical", name: "Install and configure one bounded timer-control type", unit: "each",
    includes: "Replace a compatible existing control and program the specifically selected timer type.",
    excludes: "An unspecified mix of countdown, astronomical, pool and 40A enclosure timers.",
    referenceLaborHours: null, referenceStatus: "DISPUTED", evidence: [
      { observationId: "O102", scope: "PARTIAL", normalizedLaborHours: 1.60, normalizedUnit: "each", note: "24-hour multi-pole timer." },
      { observationId: "O103", scope: "PARTIAL", normalizedLaborHours: 2.25, normalizedUnit: "each", note: "Programmable astronomical switch; materially different scope." },
      { observationId: "O178", scope: "PARTIAL", normalizedLaborHours: 1.00, normalizedUnit: "each", note: "40A plain-dial time switch." },
    ],
  },
  {
    key: "ELEC_REPLACE_SMART_THERMOSTAT", trade: "electrical", name: "Replace one compatible thermostat", unit: "each",
    includes: "Replace one compatible thermostat on established control wiring and verify basic HVAC response.",
    excludes: "New C-wire, adapters, equipment rewiring, advanced calibration, app pairing and HVAC diagnosis.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O083", scope: "DIRECT", note: "Simple replacement range: 0.50–1.00 elapsed hours." },
    ],
  },
  {
    key: "ELEC_THERMOSTAT_POWER_REMEDIATION", trade: "electrical", name: "Provide thermostat C-wire or supported power adapter", unit: "each",
    includes: "Install one already-selected supported power remedy for the thermostat.",
    excludes: "HVAC equipment diagnosis, inaccessible routing and control-board repair.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O084", scope: "PARTIAL", note: "Thermostat with new wiring/C-wire adapter/calibration: 1–2 hours as a combined scope; increment not isolated." },
    ],
  },
  {
    key: "ELEC_DISHWASHER_DISCONNECT_RECONNECT", trade: "electrical", name: "Disconnect and reconnect one dishwasher electrically", unit: "each",
    includes: "Disconnect the existing dishwasher and connect its replacement to the established electrical connection.",
    excludes: "Moving/fitting the appliance, water, drain, cabinet work, levelling and a new circuit.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [
      { observationId: "O198", scope: "CONTEXT_ONLY", normalizedLaborHours: 5.00, normalizedUnit: "each", note: "Commercial/small-kitchen equipment hookup is far broader than this residential electrical-only scope and is not applied." },
    ],
  },
  {
    key: "ELEC_DISPOSAL_DISCONNECT_RECONNECT", trade: "electrical", name: "Disconnect and reconnect one garbage disposal electrically", unit: "each",
    includes: "Disconnect and reconnect the electrical feed to an existing/replacement disposal where the working switch and connection remain.",
    excludes: "Installing the disposal, sink flange, drain piping, dishwasher drain connection, leaks and a new circuit.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O197", scope: "PARTIAL", normalizedLaborHours: 1.25, normalizedUnit: "each", note: "Kitchen-equipment hookup; removal/disconnect and exact electrical-only boundary are not explicit." },
    ],
  },
  {
    key: "ELEC_REPLACE_OTR_MICROWAVE", trade: "electrical", name: "Replace one over-the-range microwave in the established location", unit: "each",
    includes: "Remove the existing OTR microwave and mount/connect a compatible replacement using aligned bracket, power and vent conditions.",
    excludes: "New bracket layout, hole repair, cabinet modification, new venting and new circuit.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O054", scope: "DIRECT", note: "Clean aligned swap: 1.25–1.75 elapsed hours; no midpoint adopted." },
      { observationId: "O055", scope: "CONTEXT_ONLY", note: "New bracket/old-hole patching expands scope to 2–2.5 hours and is excluded from instant work." },
    ],
  },
  {
    key: "ELEC_MOUNT_NEW_OTR_MICROWAVE", trade: "electrical", name: "Mount one new over-the-range microwave", unit: "each",
    includes: "Lay out, bracket, mount and connect one compatible OTR microwave where its mounting area is ready.",
    excludes: "Removing a hood, cabinet modification, new venting, dedicated circuit and finished-surface repair.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      { observationId: "O056", scope: "PARTIAL", note: "Hood-to-OTR conversion is 2.5–3 hours as a combined scope; base mounting is not isolated." },
    ],
  },
  {
    key: "ELEC_REMOVE_EXISTING_RANGE_HOOD", trade: "electrical", name: "Remove one existing range hood for an OTR conversion", unit: "each",
    includes: "Electrically disconnect and remove an existing compatible under-cabinet hood to clear the prepared microwave location.",
    excludes: "Duct/cabinet reconstruction, finished-surface repair and disposal/haul-away.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_ADD_RECEPTACLE_FROM_HOOD_FEED", trade: "electrical", name: "Convert an established hood feed to one boxed microwave receptacle", unit: "each",
    includes: "Terminate the established suitable hood feed in one code-compliant box and receptacle for the OTR microwave.",
    excludes: "Circuit adequacy diagnosis, a new circuit, inaccessible routing and cabinet reconstruction.",
    referenceLaborHours: null, referenceStatus: "NONE", evidence: [],
  },
  {
    key: "ELEC_REPLACE_RANGE_HOOD_CLEAN_SWAP", trade: "electrical", name: "Replace one same-location range hood", unit: "each",
    includes: "Remove the old hood; mount, reconnect existing power/duct and test a compatible same-type replacement in the same location.",
    excludes: "New ductwork, cabinet modification, backsplash cutting, island/chimney conversion and haul-away.",
    referenceLaborHours: null, referenceStatus: "PARTIAL", evidence: [
      direct("O008", "SAME_LOCATION_HOOD", 1.50, "each", "Direct same-location hood replacement."),
      { observationId: "O057", scope: "DIRECT", note: "Under-cabinet clean swap: 1.25–1.75 elapsed hours." },
      { observationId: "O058", scope: "CONTEXT_ONLY", note: "Wall-chimney replacement: 2.5–3.5 hours; outside clean-swap scope." },
      { observationId: "O059", scope: "CONTEXT_ONLY", note: "Island hood replacement: 3–4 hours; outside clean-swap scope." },
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
  { key: "ELECTRICAL_REPLACE_STANDARD_RECEPTACLE", trade: "electrical", appliesTo: ["replace-standard-outlet"], lines: [c("ELEC_REPLACE_STANDARD_RECEPTACLE", 1)] },
  { key: "ELECTRICAL_REPLACE_STANDARD_SWITCH", trade: "electrical", appliesTo: ["replace-standard-switch"], lines: [c("ELEC_REPLACE_STANDARD_SWITCH", 1)] },
  { key: "ELECTRICAL_REPLACE_GFCI", trade: "electrical", appliesTo: ["replace-gfci-outlet"], lines: [c("ELEC_REPLACE_GFCI_RECEPTACLE", 1)] },
  { key: "ELECTRICAL_REPLACE_THREE_WAY", trade: "electrical", appliesTo: ["replace-3-way-switch"], lines: [c("ELEC_REPLACE_THREE_WAY_SWITCH", 1)] },
  { key: "ELECTRICAL_REPLACE_LED_DIMMER", trade: "electrical", appliesTo: ["replace-led-dimmer"], lines: [c("ELEC_REPLACE_LED_DIMMER", 1)] },
  { key: "ELECTRICAL_REPLACE_USB_RECEPTACLE", trade: "electrical", appliesTo: ["usb-outlet-upgrade"], lines: [c("ELEC_REPLACE_USB_RECEPTACLE", 1)] },
  { key: "ELECTRICAL_REPLACE_HIGH_AMP_RECEPTACLE", trade: "electrical", appliesTo: ["dryer-receptacle-replacement", "range-receptacle-replacement"], lines: [c("ELEC_REPLACE_HIGH_AMP_RECEPTACLE", 1)] },
  { key: "ELECTRICAL_REPLACE_HARDWIRED_DETECTOR", trade: "electrical", appliesTo: ["hardwired-smoke-detector", "smoke-co-detector"], lines: [c("ELEC_REPLACE_HARDWIRED_DETECTOR", 1)] },
  {
    key: "ELECTRICAL_SMART_DEVICE", trade: "electrical", appliesTo: ["customer-supplied-smart-switch", "smart-outlet-upgrade"],
    lines: [c("ELEC_INSTALL_SMART_DEVICE_HARDWARE", 1), c("ELEC_COMMISSION_CONNECTED_DEVICE", 1, "commissioningIncluded")],
  },
  { key: "ELECTRICAL_OCCUPANCY_CONTROL", trade: "electrical", appliesTo: ["occupancy-motion-switch"], lines: [c("ELEC_INSTALL_OCCUPANCY_CONTROL", 1)] },
  { key: "ELECTRICAL_TIMER_CONTROL", trade: "electrical", appliesTo: ["timer-switch-install"], lines: [c("ELEC_INSTALL_TIMER_CONTROL", 1)] },
  {
    key: "ELECTRICAL_SMART_THERMOSTAT", trade: "electrical", appliesTo: ["smart-thermostat-install"],
    lines: [c("ELEC_REPLACE_SMART_THERMOSTAT", 1), c("ELEC_THERMOSTAT_POWER_REMEDIATION", 1, "powerRemediationRequired"), c("ELEC_COMMISSION_CONNECTED_DEVICE", 1, "commissioningIncluded")],
  },
  { key: "ELECTRICAL_DISHWASHER_CONNECTION", trade: "electrical", appliesTo: ["dishwasher-electrical"], lines: [c("ELEC_DISHWASHER_DISCONNECT_RECONNECT", 1)] },
  { key: "ELECTRICAL_DISPOSAL_CONNECTION", trade: "electrical", appliesTo: ["garbage-disposal-install"], lines: [c("ELEC_DISPOSAL_DISCONNECT_RECONNECT", 1)] },
  { key: "ELECTRICAL_OTR_MICROWAVE_REPLACEMENT", trade: "electrical", appliesTo: ["otr-microwave-install"], lines: [c("ELEC_REPLACE_OTR_MICROWAVE", 1)] },
  {
    key: "ELECTRICAL_NEW_OTR_MICROWAVE", trade: "electrical", appliesTo: ["install-new-microwave"],
    lines: [c("ELEC_MOUNT_NEW_OTR_MICROWAVE", 1), c("ELEC_REMOVE_EXISTING_RANGE_HOOD", 1, "existingHoodRemoval"), c("ELEC_ADD_RECEPTACLE_FROM_HOOD_FEED", 1, "convertHoodFeedToReceptacle")],
  },
  { key: "ELECTRICAL_RANGE_HOOD_CLEAN_SWAP", trade: "electrical", appliesTo: ["replace-range-hood"], lines: [c("ELEC_REPLACE_RANGE_HOOD_CLEAN_SWAP", 1)] },
];

export const ELECTRICAL_LABOR_CALIBRATION_GROUPS: LaborCalibrationGroup[] = [
  {
    key: "DEVICE_REPLACEMENT", trade: "electrical", name: "Straightforward device replacements",
    anchorOperationKeys: ["ELEC_REPLACE_STANDARD_RECEPTACLE", "ELEC_REPLACE_STANDARD_SWITCH"],
    relatedOperationKeys: ["ELEC_REPLACE_GFCI_RECEPTACLE", "ELEC_REPLACE_THREE_WAY_SWITCH", "ELEC_REPLACE_LED_DIMMER", "ELEC_REPLACE_USB_RECEPTACLE"],
    method: "RELATIONSHIP_PROPOSAL",
    guardrail: "Use several contractor answers to propose related device units; never apply one speed factor outside this physical family or auto-approve a proposal.",
  },
  {
    key: "HIGH_AMP_RECEPTACLE", trade: "electrical", name: "High-amperage receptacle replacement",
    anchorOperationKeys: ["ELEC_REPLACE_HIGH_AMP_RECEPTACLE"], relatedOperationKeys: [], method: "DIRECT_ANCHOR",
    guardrail: "Confirm the existing receptacle configuration and mounting; a new circuit or conversion is a different recipe.",
  },
  {
    key: "HARDWIRED_DETECTOR", trade: "electrical", name: "Hardwired detector replacement",
    anchorOperationKeys: ["ELEC_REPLACE_HARDWIRED_DETECTOR"], relatedOperationKeys: [], method: "DIRECT_ANCHOR",
    guardrail: "Existing compatible hardwired replacement only; do not transfer to new interconnect wiring.",
  },
  {
    key: "CONNECTED_CONTROLS", trade: "electrical", name: "Connected and programmable controls",
    anchorOperationKeys: ["ELEC_INSTALL_SMART_DEVICE_HARDWARE", "ELEC_COMMISSION_CONNECTED_DEVICE"],
    relatedOperationKeys: ["ELEC_INSTALL_OCCUPANCY_CONTROL", "ELEC_INSTALL_TIMER_CONTROL"], method: "RELATIONSHIP_PROPOSAL",
    guardrail: "Hardware and commissioning are separate. Timer type and supported app/network responsibility must be bounded before proposing labor.",
  },
  {
    key: "SMART_THERMOSTAT", trade: "electrical", name: "Smart thermostat work",
    anchorOperationKeys: ["ELEC_REPLACE_SMART_THERMOSTAT"], relatedOperationKeys: ["ELEC_THERMOSTAT_POWER_REMEDIATION", "ELEC_COMMISSION_CONNECTED_DEVICE"], method: "RELATIONSHIP_PROPOSAL",
    guardrail: "C-wire/power remediation and app commissioning are explicit adders; HVAC diagnosis is outside this recipe.",
  },
  {
    key: "APPLIANCE_ELECTRICAL_CONNECTION", trade: "electrical", name: "Electrical-only appliance disconnect/reconnect",
    anchorOperationKeys: ["ELEC_DISHWASHER_DISCONNECT_RECONNECT", "ELEC_DISPOSAL_DISCONNECT_RECONNECT"],
    relatedOperationKeys: [], method: "DIRECT_ANCHOR",
    guardrail: "Do not transfer whole-appliance installation labor into the electrical-only scope.",
  },
  {
    key: "OVERHEAD_KITCHEN_APPLIANCE", trade: "electrical", name: "Overhead microwave and hood work",
    anchorOperationKeys: ["ELEC_REPLACE_OTR_MICROWAVE", "ELEC_REPLACE_RANGE_HOOD_CLEAN_SWAP"],
    relatedOperationKeys: ["ELEC_MOUNT_NEW_OTR_MICROWAVE", "ELEC_REMOVE_EXISTING_RANGE_HOOD", "ELEC_ADD_RECEPTACLE_FROM_HOOD_FEED"],
    method: "RELATIONSHIP_PROPOSAL",
    guardrail: "Only compare compatible under-cabinet/same-location scopes. Cabinet, duct, backsplash and new-circuit work remain separate or review-led.",
  },
];
