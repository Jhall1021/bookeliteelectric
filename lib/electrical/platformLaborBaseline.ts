import type { LaborOperation } from "../laborOperations";
import { ELECTRICAL_ATOMIC_LABOR_OPERATIONS } from "./atomicLabor";

export type ElectricalPlatformLaborBaseline = {
  operationKey: string;
  hoursPerUnit: number;
  status: "PUBLISHED_REFERENCE" | "WORKBOOK_PLANNING_FACTOR";
  sourceKeys: string[];
  note: string;
};

type PlanningSeed = Omit<ElectricalPlatformLaborBaseline, "operationKey" | "status">;

/**
 * Platform starting values translated from price2book_atomic_recipes.xlsx.
 *
 * These values are not contractor observations. Composite workbook atoms are
 * split where the runtime vocabulary keeps route, support, termination, test
 * and cleanup separate. The note on every split states the allocation so the
 * parts can be reviewed without hiding work or counting it twice.
 */
const PLANNING_SEEDS: Record<string, PlanningSeed> = {
  ELEC_ROUTE_LAYOUT_SETUP: { hoursPerUnit: 0.20, sourceKeys: ["CONFIRM_SCOPE", "PROTECT_AREA"], note: "Combines the workbook's 0.10-hour scope confirmation and 0.10-hour work-area protection atoms once per route." },
  ELEC_DRILL_TOP_OR_BOTTOM_PLATE: { hoursPerUnit: 0.25, sourceKeys: ["DRILL_WALL_PLATE"], note: "Direct workbook planning factor for one wall-plate penetration." },
  ELEC_FISH_WALL_TO_BOX: { hoursPerUnit: 0.35, sourceKeys: ["FISH_WALL_DROP"], note: "Direct workbook planning factor for one finished wall drop to a box." },
  ELEC_FISH_WALL_TO_EQUIPMENT: { hoursPerUnit: 0.35, sourceKeys: ["FISH_WALL_DROP"], note: "Uses the same bounded wall-drop task at an equipment endpoint; equipment termination remains separate." },
  ELEC_NM_CABLE_ACCESSIBLE: { hoursPerUnit: 0.01, sourceKeys: ["RUN_CABLE_ACCESSIBLE_FT"], note: "Route-only allocation from the workbook's 0.018 hr/ft run-and-support factor; supports, framing drills, source makeup and testing remain separate runtime operations." },
  ELEC_HEAVY_BRANCH_CABLE_ACCESSIBLE: { hoursPerUnit: 0.015, sourceKeys: ["RUN_CABLE_ACCESSIBLE_FT", "NEE-06", "NEE-08"], note: "Provisional route-only allocation for larger cable, above the ordinary NM route allocation; supports, drilling and terminations remain separate." },
  ELEC_SUPPORT_NM_CABLE: { hoursPerUnit: 0.03, sourceKeys: ["RUN_CABLE_ACCESSIBLE_FT"], note: "Per-support allocation removed from the workbook's combined run-and-support factor so support count remains explicit." },
  ELEC_FISH_CABLE_CONCEALED: { hoursPerUnit: 0.045, sourceKeys: ["RUN_CABLE_FINISHED_FT"], note: "Direct workbook planning factor for concealed cable movement after openings and framing crossings are separately created." },
  ELEC_DRILL_FRAMING_CROSSING: { hoursPerUnit: 0.12, sourceKeys: ["DRILL_BLOCKING"], note: "Direct workbook planning factor per framing penetration." },
  ELEC_CUT_DRYWALL_ACCESS_OPENING: { hoursPerUnit: 0.18, sourceKeys: ["CUT_SINGLE_GANG", "CUT_FIXTURE_OPENING"], note: "Planning allocation for one protected access opening; patching and finish restoration remain excluded." },
  ELEC_MOUNT_SURFACE_4S_DEVICE_BOX: { hoursPerUnit: 0.22, sourceKeys: ["INSTALL_SURFACE_BOX"], note: "Direct workbook planning factor for one exposed surface box; endpoint device work remains separate." },
  ELEC_CONNECT_EXISTING_BRANCH_SOURCE: { hoursPerUnit: 0.22, sourceKeys: ["MAKEUP_SOURCE"], note: "Direct workbook planning factor for one established source connection." },
  ELEC_TEST_BRANCH_EXTENSION: { hoursPerUnit: 0.20, sourceKeys: ["ENERGIZE_TEST"], note: "Direct workbook planning factor for circuit energization and functional verification." },
  ELEC_BRANCH_WORK_CLEANUP: { hoursPerUnit: 0.15, sourceKeys: ["LABEL_DOCUMENT"], note: "Provisional closeout allocation for ordinary cleanup and labeling; repair and finish restoration remain excluded." },
  ELEC_BRANCH_PANEL_OPEN_VERIFY_CLOSE: { hoursPerUnit: 0.30, sourceKeys: ["PANEL_OPEN_CLOSE"], note: "Direct workbook planning factor for one panel access and safe closeout occurrence." },
  ELEC_TERMINATE_NEW_BREAKER_CONDUCTOR: { hoursPerUnit: 0.06, sourceKeys: ["INSTALL_BREAKER", "NEE-24", "NEE-25"], note: "Per-conductor allocation of the workbook's composite breaker task after retaining the published mechanical breaker units separately." },
  ELEC_INSTALL_NEW_RECEPTACLE: { hoursPerUnit: 0.23, sourceKeys: ["TERMINATE_RECEPTACLE", "INSTALL_PLATE"], note: "Workbook device termination plus plate only; the recipe's separate branch test supplies energization and verification." },
  ELEC_INSTALL_NEW_GFCI_RECEPTACLE: { hoursPerUnit: 0.27, sourceKeys: ["TERMINATE_GFCI", "INSTALL_PLATE"], note: "Workbook GFCI termination plus plate only; the recipe's separate branch test supplies energization and verification." },
  ELEC_INSTALL_NEW_240V_RECEPTACLE: { hoursPerUnit: 0.35, sourceKeys: ["TERMINATE_RECEPTACLE"], note: "Provisional larger-conductor endpoint factor; box, cable route, breaker work and branch testing remain separate." },
  ELEC_TERMINATE_EVSE: { hoursPerUnit: 0.75, sourceKeys: ["INSTALL_EV_CHARGER"], note: "Direct workbook planning factor for mounting and terminating customer-selected hardwired EV equipment at a prepared endpoint." },
  ELEC_REPLACE_STANDARD_RECEPTACLE: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:replace-standard-outlet"], note: "Workbook complete-service planning total for one bounded same-box replacement; no other labor operation is present in this recipe." },
  ELEC_REPLACE_STANDARD_SWITCH: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:replace-standard-switch"], note: "Workbook complete-service planning total for one bounded same-box replacement." },
  ELEC_REPLACE_GFCI_RECEPTACLE: { hoursPerUnit: 1.27, sourceKeys: ["SERVICE:replace-gfci-outlet"], note: "Workbook complete-service planning total including the bounded GFCI function check." },
  ELEC_REPLACE_THREE_WAY_SWITCH: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:replace-3-way-switch"], note: "Workbook complete-service planning total for one identified same-box three-way switch replacement." },
  ELEC_REPLACE_LED_DIMMER: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:replace-led-dimmer"], note: "Workbook complete-service planning total for one compatible same-box dimmer replacement." },
  ELEC_REPLACE_USB_RECEPTACLE: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:usb-outlet-upgrade"], note: "Workbook complete-service planning total for one compatible same-box USB receptacle replacement." },
  ELEC_REPLACE_HIGH_AMP_RECEPTACLE: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:dryer-receptacle-replacement", "SERVICE:range-receptacle-replacement"], note: "Shared workbook complete-service planning total for a compatible existing dryer or range receptacle replacement." },
  ELEC_REPLACE_HARDWIRED_DETECTOR: { hoursPerUnit: 0.90, sourceKeys: ["SERVICE:hardwired-smoke-detector", "SERVICE:smoke-co-detector", "INSTALL_DETECTOR"], note: "Workbook complete-service planning total for one compatible hardwired detector replacement." },
  ELEC_INSTALL_SMART_DEVICE_HARDWARE: { hoursPerUnit: 0.90, sourceKeys: ["SERVICE:customer-supplied-smart-switch", "SERVICE:smart-outlet-upgrade"], note: "Hardware allocation from the 1.15-hour workbook service total; connected-device commissioning remains a separate 0.25-hour operation." },
  ELEC_COMMISSION_CONNECTED_DEVICE: { hoursPerUnit: 0.25, sourceKeys: ["INSTALL_DOORBELL", "INSTALL_THERMOSTAT"], note: "Explicit planning allocation for bounded app pairing and basic configuration after physical installation." },
  ELEC_INSTALL_OCCUPANCY_CONTROL: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:occupancy-motion-switch"], note: "Workbook complete-service planning total for one compatible occupancy control replacement." },
  ELEC_INSTALL_TIMER_CONTROL: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:timer-switch-install"], note: "Workbook complete-service planning total for one bounded timer-control installation and setup." },
  ELEC_REPLACE_SMART_THERMOSTAT: { hoursPerUnit: 1.05, sourceKeys: ["SERVICE:smart-thermostat-install", "INSTALL_THERMOSTAT"], note: "Physical replacement allocation from the 1.30-hour workbook standard service total; optional commissioning remains separate." },
  ELEC_THERMOSTAT_POWER_REMEDIATION: { hoursPerUnit: 0.65, sourceKeys: ["INSTALL_THERMOSTAT"], note: "Conditional planning factor for a separately confirmed C-wire or supported power-adapter remediation." },
  ELEC_CUT_RECESSED_LIGHT_OPENING: { hoursPerUnit: 0.18, sourceKeys: ["CUT_FIXTURE_OPENING", "INSTALL_RECESSED_LIGHT"], note: "Opening allocation split from the workbook recessed-light atom; wafer installation and cable routing remain separate." },
  ELEC_INSTALL_RECESSED_WAFER: { hoursPerUnit: 0.27, sourceKeys: ["INSTALL_RECESSED_LIGHT"], note: "Wafer mounting and makeup allocation after the separate 0.18-hour opening is removed from the workbook's 0.45-hour recessed-light atom." },
  ELEC_REPLACE_INTERIOR_LIGHT_FIXTURE: { hoursPerUnit: 1.54, sourceKeys: ["SERVICE:replace-interior-light-fixture"], note: "Workbook complete-service planning total for one ordinary same-box interior fixture replacement." },
  ELEC_REPLACE_EXTERIOR_LIGHT_FIXTURE: { hoursPerUnit: 1.64, sourceKeys: ["SERVICE:replace-exterior-light-fixture"], note: "Workbook complete-service planning total for one ordinary weather-sealed exterior fixture replacement." },
  ELEC_REPLACE_MOTION_FLOOD_FIXTURE: { hoursPerUnit: 1.64, sourceKeys: ["SERVICE:replace-motion-flood-light"], note: "Workbook complete-service planning total for one compatible motion/flood replacement and aiming." },
  ELEC_REPLACE_WALL_SCONCE: { hoursPerUnit: 1.54, sourceKeys: ["SERVICE:replace-wall-sconce"], note: "Workbook complete-service planning total for one ordinary same-box wall-sconce replacement." },
  ELEC_REPLACE_CEILING_FAN: { hoursPerUnit: 2.32, sourceKeys: ["SERVICE:replace-ceiling-fan"], note: "Workbook complete-service planning total for one compatible fan replacement on confirmed support." },
  ELEC_INSTALL_FAN_RATED_BOX: { hoursPerUnit: 0.55, sourceKeys: ["INSTALL_FAN_BOX"], note: "Direct workbook planning factor for one fan-rated remodel box and brace." },
  ELEC_INSTALL_CEILING_FIXTURE_BOX: { hoursPerUnit: 0.25, sourceKeys: ["INSTALL_FIXTURE_BOX"], note: "Direct workbook planning factor for one standard ceiling fixture box." },
  ELEC_INSTALL_NEW_CEILING_LIGHT: { hoursPerUnit: 0.32, sourceKeys: ["MOUNT_LIGHT"], note: "Direct prepared-point fixture mounting and connection factor; box, route, switch and test remain separate." },
  ELEC_INSTALL_NEW_CEILING_FAN: { hoursPerUnit: 1.97, sourceKeys: ["ASSEMBLE_CEILING_FAN", "MOUNT_CEILING_FAN", "BALANCE_PROGRAM_FAN", "SERVICE:fan-replacing-light"], note: "Prepared-point fan assembly, hanging, control setup and endpoint verification; fan-rated support and removal remain separate." },
  ELEC_INSTALL_NEW_WALL_SCONCE: { hoursPerUnit: 0.32, sourceKeys: ["MOUNT_LIGHT"], note: "Direct prepared-point wall-fixture mounting factor; box, route, source and test remain separate." },
  ELEC_REPLACE_BATH_EXHAUST_FAN: { hoursPerUnit: 1.97, sourceKeys: ["SERVICE:replace-bathroom-exhaust-fan", "SERVICE:bathroom-fan-light-combo"], note: "Workbook complete-service clean-swap total for a compatible housing and duct connection." },
  ELEC_ADAPT_BATH_FAN_HOUSING: { hoursPerUnit: 0.55, sourceKeys: ["INSTALL_FAN_BOX"], note: "Conditional planning allowance for one confirmed housing/opening adaptation beyond the clean swap." },
  ELEC_ADAPT_BATH_FAN_DUCT: { hoursPerUnit: 0.25, sourceKeys: ["CONNECT_DUCT"], note: "Direct conditional workbook planning factor for one accessible duct adaptation." },
  ELEC_UNDERCABINET_LAYOUT: { hoursPerUnit: 0.55, sourceKeys: ["CONFIRM_SCOPE", "PROTECT_AREA", "SERVICE:under-cabinet-led-lighting"], note: "Package setup allocation for one continuous run, including layout and work-area preparation." },
  ELEC_UNDERCABINET_CHANNEL_AND_TAPE: { hoursPerUnit: 0.08, sourceKeys: ["INSTALL_LED_CHANNEL_FT", "INSTALL_LED_TAPE_FT"], note: "Sum of the workbook's separate 0.055-hour channel and 0.025-hour tape factors per foot." },
  ELEC_UNDERCABINET_RUN_TERMINATION: { hoursPerUnit: 0.40, sourceKeys: ["MAKEUP_JUNCTION", "ENERGIZE_TEST"], note: "Per-run termination and functional-test allocation." },
  ELEC_INSTALL_LED_DRIVER: { hoursPerUnit: 0.55, sourceKeys: ["INSTALL_LED_DRIVER", "MAKEUP_SOURCE"], note: "Workbook driver mounting plus its prepared source connection." },
  ELEC_REMOVE_LIGHT_FIXTURE: { hoursPerUnit: 0.25, sourceKeys: ["REMOVE_FIXTURE"], note: "Direct workbook removal factor for one existing light fixture." },
  ELEC_INSTALL_LED_DIMMER: { hoursPerUnit: 0.71, sourceKeys: ["TERMINATE_SWITCH", "INSTALL_PLATE", "SERVICE:under-cabinet-led-lighting"], note: "Package allocation for the new dimmer and remaining bounded closeout so the 12-foot standard reconciles to the workbook service total." },
  ELEC_DISHWASHER_DISCONNECT_RECONNECT: { hoursPerUnit: 1.37, sourceKeys: ["SERVICE:dishwasher-electrical"], note: "Workbook complete-service planning total for the electrical-only dishwasher disconnect and reconnect scope." },
  ELEC_DISPOSAL_DISCONNECT_RECONNECT: { hoursPerUnit: 1.37, sourceKeys: ["SERVICE:garbage-disposal-install"], note: "Workbook complete-service planning total for the electrical-only disposal disconnect and reconnect scope." },
  ELEC_REPLACE_OTR_MICROWAVE: { hoursPerUnit: 2.02, sourceKeys: ["SERVICE:otr-microwave-install"], note: "Workbook complete-service planning total for a compatible prepared-location OTR microwave replacement." },
  ELEC_MOUNT_NEW_OTR_MICROWAVE: { hoursPerUnit: 2.02, sourceKeys: ["SERVICE:install-new-microwave", "MOUNT_APPLIANCE"], note: "Workbook prepared-location mount-only total; hood removal and electrical-feed conversion remain conditional separate operations." },
  ELEC_REMOVE_EXISTING_RANGE_HOOD: { hoursPerUnit: 0.25, sourceKeys: ["REMOVE_APPLIANCE"], note: "Direct workbook appliance-removal planning factor." },
  ELEC_ADD_RECEPTACLE_FROM_HOOD_FEED: { hoursPerUnit: 0.65, sourceKeys: ["INSTALL_OLD_WORK_BOX", "TERMINATE_RECEPTACLE", "INSTALL_PLATE"], note: "Conditional boxed-receptacle conversion allocation; circuit diagnosis and new branch routing remain excluded." },
  ELEC_REPLACE_RANGE_HOOD_CLEAN_SWAP: { hoursPerUnit: 2.02, sourceKeys: ["SERVICE:replace-range-hood"], note: "Workbook complete-service planning total for one compatible same-location clean swap." },
  ELEC_BACK_TO_BACK_WALL_PASS: { hoursPerUnit: 0.18, sourceKeys: ["CUT_SINGLE_GANG", "FISH_WALL_DROP"], note: "Bounded short shared-cavity pass allocation; boxes, source connection and exterior penetration remain separate." },
  ELEC_MOUNT_TV_NEW_LOCATION: { hoursPerUnit: 2.20, sourceKeys: ["SERVICE:tv-installation"], note: "Workbook complete-service planning total for the parent new-location TV installation; referenced mount add-ons do not add duplicate labor." },
  ELEC_INSTALL_TILT_TV_MOUNT: { hoursPerUnit: 0.90, sourceKeys: ["SERVICE:tilt-tv-mount", "MOUNT_TV_BRACKET"], note: "Workbook mount-only planning total using canonical workbook naming." },
  ELEC_INSTALL_FULL_MOTION_TV_MOUNT: { hoursPerUnit: 0.90, sourceKeys: ["SERVICE:articulating-tv-mount", "MOUNT_TV_BRACKET"], note: "Workbook mount-only planning total using canonical workbook naming." },
  ELEC_MOUNT_SOUNDBAR: { hoursPerUnit: 1.15, sourceKeys: ["SERVICE:soundbar-installation"], note: "Workbook prepared-location service total; optional concealed cable footage remains separate." },
  ELEC_UTP_CABLE_ACCESSIBLE: { hoursPerUnit: 0.015, sourceKeys: ["RUN_LV_CABLE_FT"], note: "Direct workbook accessible low-voltage cable planning factor; endpoints and testing remain separate." },
  ELEC_COAX_CABLE_ACCESSIBLE: { hoursPerUnit: 0.015, sourceKeys: ["RUN_LV_CABLE_FT"], note: "Workbook accessible low-voltage cable planning factor retained instead of importing the non-comparable published long-run coax unit." },
  ELEC_TERMINATE_RJ45_END: { hoursPerUnit: 0.05, sourceKeys: ["NEE-40", "TERMINATE_TEST_DATA"], note: "Published jack termination unit only; mounting hardware and run certification remain separate." },
  ELEC_TERMINATE_COAX_END: { hoursPerUnit: 0.10, sourceKeys: ["TERMINATE_TEST_COAX"], note: "Per-end allocation from the workbook coax termination and test atom; run testing remains separately visible." },
  ELEC_TEST_DATA_CABLE: { hoursPerUnit: 0.20, sourceKeys: ["ENERGIZE_TEST", "TERMINATE_TEST_DATA", "TERMINATE_TEST_COAX"], note: "Per-run functional test and documentation allocation after endpoint terminations." },
  ELEC_REPLACE_DOORBELL_TRANSFORMER: { hoursPerUnit: 1.10, sourceKeys: ["SERVICE:doorbell-transformer-replacement"], note: "Workbook complete-service planning total for an identified accessible transformer replacement." },
  ELEC_DOORBELL_LOW_VOLTAGE_ROUTE: { hoursPerUnit: 0.015, sourceKeys: ["RUN_LV_CABLE_FT"], note: "Direct workbook low-voltage cable route planning factor; penetrations and equipment remain separate." },
  ELEC_REPLACE_EXTERIOR_FIXTURE_WITH_CAMERA: { hoursPerUnit: 1.07, sourceKeys: ["SERVICE:floodlight-camera-existing", "MOUNT_EXTERIOR_LIGHT"], note: "Physical replacement allocation from the 1.32-hour workbook service total; optional app commissioning remains separate." },
  ELEC_MOUNT_AIM_EXTERIOR_CAMERA: { hoursPerUnit: 1.22, sourceKeys: ["MOUNT_EXTERIOR_LIGHT", "SERVICE:new-exterior-flood-camera"], note: "Prepared-point camera mounting, aiming and remaining bounded endpoint closeout allocation; route, box, test and app commissioning remain separate. This allocation reconciles the complete back-to-back recipe to the workbook service total." },
  ELEC_INSTALL_EXTERIOR_FIXTURE_BOX: { hoursPerUnit: 0.30, sourceKeys: ["INSTALL_WEATHERPROOF_BOX"], note: "Direct workbook factor for one installed and sealed exterior box." },
  ELEC_PENETRATE_EXTERIOR_WALL: { hoursPerUnit: 0.30, sourceKeys: ["DRILL_BLOCKING", "INSTALL_WEATHERPROOF_BOX"], note: "Provisional ordinary siding/sheathing penetration and seal allocation; masonry and finish repair remain excluded." },
  ELEC_REMOVE_REINSTALL_BASEBOARD: { hoursPerUnit: 0.10, sourceKeys: ["RUN_CABLE_FINISHED_FT"], note: "Provisional per-foot access allocation for reusable baseboard removal and reinstallation; finish repair remains excluded." },
  ELEC_TERMINATE_SWITCH: { hoursPerUnit: 0.18, sourceKeys: ["TERMINATE_SWITCH"], note: "Direct workbook planning factor for one prepared wall-switch termination." },
  ELEC_TERMINATE_LIGHTING_LOAD: { hoursPerUnit: 0.18, sourceKeys: ["MAKEUP_JUNCTION"], note: "Direct workbook makeup factor for one prepared lighting load." },
  ELEC_SURFACE_RACEWAY_SETUP: { hoursPerUnit: 0.10, sourceKeys: ["CONFIRM_SCOPE"], note: "One-time route confirmation and layout allocation." },
  ELEC_SURFACE_RACEWAY: { hoursPerUnit: 0.035, sourceKeys: ["RUN_SURFACE_RACEWAY_FT"], note: "Direct workbook raceway base-and-cover planning factor per foot." },
  ELEC_SURFACE_RACEWAY_INSIDE_CORNER: { hoursPerUnit: 0.12, sourceKeys: ["SURFACE_RACEWAY_CORNER"], note: "Direct workbook corner fitting factor." },
  ELEC_SURFACE_RACEWAY_OUTSIDE_CORNER: { hoursPerUnit: 0.12, sourceKeys: ["SURFACE_RACEWAY_CORNER"], note: "Direct workbook corner fitting factor." },
  ELEC_SURFACE_FIXTURE_BOX: { hoursPerUnit: 0.25, sourceKeys: ["INSTALL_FIXTURE_BOX"], note: "Direct workbook fixture-box factor for the selected surface-raceway system." },
  ELEC_TERMINATE_POWERED_FIXTURE_BOX: { hoursPerUnit: 0.18, sourceKeys: ["MAKEUP_JUNCTION"], note: "Direct workbook conductor-makeup factor at one prepared powered fixture box." },
  ELEC_SURFACE_RACEWAY_SUPPORT: { hoursPerUnit: 0.03, sourceKeys: ["RUN_SURFACE_RACEWAY_FT"], note: "Per-support allocation retained separately from raceway footage." },
  ELEC_PULL_SURFACE_RACEWAY_CONDUCTOR: { hoursPerUnit: 0.018, sourceKeys: ["PULL_CONDUCTORS_FT"], note: "Direct workbook conductor-pull planning factor per conductor-foot." },
  ELEC_INSTALL_WHOLE_HOUSE_SPD: { hoursPerUnit: 1.77, sourceKeys: ["SERVICE:whole-house-surge-protection", "INSTALL_SURGE_DEVICE"], note: "Workbook complete-service planning total for one suitable-panel whole-house SPD installation." },
  ELEC_PANEL_REPLACEMENT_SETUP: { hoursPerUnit: 0.50, sourceKeys: ["PANEL_OPEN_CLOSE", "PROTECT_AREA"], note: "Panel replacement safety, protection and setup allocation." },
  ELEC_REMOVE_EXISTING_PANEL: { hoursPerUnit: 1.00, sourceKeys: ["REMOVE_BREAKER", "SERVICE:electrical-panel-replacement"], note: "Existing enclosure and equipment-set removal allocation." },
  ELEC_RECONNECT_SINGLE_POLE_BRANCH: { hoursPerUnit: 0.35, sourceKeys: ["TRANSFER_CIRCUIT"], note: "Direct workbook branch transfer, termination, identification and verification factor." },
  ELEC_RECONNECT_DOUBLE_POLE_BRANCH: { hoursPerUnit: 0.45, sourceKeys: ["TRANSFER_CIRCUIT"], note: "Two-pole branch reconnection allocation retaining the additional ungrounded conductor." },
  ELEC_TERMINATE_MAIN_FEEDER: { hoursPerUnit: 0.50, sourceKeys: ["INSTALL_SERVICE_CONDUCTORS"], note: "Prepared main-feeder termination allocation; conductor routing remains separate." },
  ELEC_PANEL_GROUND_AND_BOND: { hoursPerUnit: 0.60, sourceKeys: ["INSTALL_PANEL", "INSTALL_GROUNDING_ELECTRODES"], note: "Replacement-panel grounding and bonding allocation; grounding-electrode work remains separate." },
  ELEC_PANEL_LABEL_AND_TEST: { hoursPerUnit: 0.70, sourceKeys: ["PANEL_CIRCUIT_DIRECTORY", "ENERGIZE_TEST", "LABEL_DOCUMENT"], note: "Circuit directory, functional verification and closeout allocation." },
  ELEC_REPLACE_METER_SOCKET: { hoursPerUnit: 2.00, sourceKeys: ["INSTALL_METER_SOCKET"], note: "Direct workbook replacement planning factor; utility coordination remains excluded." },
  ELEC_SERVICE_ENTRANCE_CONDUCTOR: { hoursPerUnit: 0.03, sourceKeys: ["INSTALL_SERVICE_CONDUCTORS"], note: "Meter-to-panel feeder route allocation within the workbook's combined 2.50-hour service-conductor task." },
  ELEC_INSTALL_OVERHEAD_SERVICE_MAST: { hoursPerUnit: 0.80, sourceKeys: ["INSTALL_SERVICE_CONDUCTORS"], note: "One-stick same-wall mast allocation separated from the workbook's combined service-conductor task; roof penetration and structural bracing remain excluded." },
  ELEC_INSTALL_SERVICE_WEATHERHEAD: { hoursPerUnit: 0.25, sourceKeys: ["INSTALL_SERVICE_CONDUCTORS"], note: "Weatherhead installation allocation separated from the workbook's combined service-conductor task." },
  ELEC_INSTALL_METER_HUB: { hoursPerUnit: 0.15, sourceKeys: ["INSTALL_SERVICE_CONDUCTORS"], note: "Meter-hub fitting and weather-sealing allocation separated from the workbook's combined service-conductor task." },
  ELEC_INSTALL_SERVICE_MAST_SUPPORT_SET: { hoursPerUnit: 0.10, sourceKeys: ["INSTALL_SERVICE_CONDUCTORS"], note: "Standard two-strap support-set allocation separated from the workbook's combined service-conductor task." },
  ELEC_PULL_OVERHEAD_SERVICE_CONDUCTOR: { hoursPerUnit: 0.02, sourceKeys: ["INSTALL_SERVICE_CONDUCTORS"], note: "Per conductor-foot pull allocation inside the prepared mast; 30 conductor-feet represents the bounded 10-foot three-conductor mast." },
  ELEC_ROUTE_GROUNDING_ELECTRODE_CONDUCTOR: { hoursPerUnit: 0.02, sourceKeys: ["INSTALL_GROUNDING_ELECTRODES"], note: "Per-foot allocation after rods and clamps are separately priced from published units." },
  ELEC_DIFFICULT_GROUNDING_ELECTRODE_INSTALL: { hoursPerUnit: 1.00, sourceKeys: ["INSTALL_GROUNDING_ELECTRODES"], note: "Conditional provisional allowance per separately confirmed difficult electrode; equipment and engineered systems remain excluded." },
  ELEC_INSTALL_GENERATOR_INLET: { hoursPerUnit: 1.35, sourceKeys: ["INSTALL_INTERLOCK_INLET", "SERVICE:generator-inlet-interlock"], note: "Generator-inlet mounting and termination allocation from the workbook package." },
  ELEC_INSTALL_PANEL_INTERLOCK: { hoursPerUnit: 1.76, sourceKeys: ["INSTALL_INTERLOCK_INLET", "SERVICE:generator-inlet-interlock"], note: "Listed interlock installation and verification allocation; inlet, breaker and feeder route remain separate." },
  ELEC_PULL_POWER_CONDUCTORS: { hoursPerUnit: 0.018, sourceKeys: ["PULL_CONDUCTORS_FT"], note: "Direct workbook conductor-foot pull factor through prepared raceway." },
  ELEC_INSTALL_SPA_DISCONNECT: { hoursPerUnit: 0.75, sourceKeys: ["INSTALL_SPA_DISCONNECT"], note: "Direct workbook mounting and termination factor for one selected spa disconnect." },
  ELEC_TERMINATE_OUTDOOR_EQUIPMENT: { hoursPerUnit: 0.35, sourceKeys: ["CONNECT_APPLIANCE"], note: "Prepared outdoor-equipment termination factor; equipment mounting and route remain separate." },
  ELEC_INSTALL_BONDING_CONDUCTOR: { hoursPerUnit: 0.015, sourceKeys: ["SPA_BONDING"], note: "Per-foot allocation of the workbook spa-bonding task; connection count remains separate." },
  ELEC_INSTALL_EQUIPOTENTIAL_BOND: { hoursPerUnit: 0.10, sourceKeys: ["NEE-35", "SPA_BONDING"], note: "Per accessible bonding-point preparation and connection allocation." },
  ELEC_INSTALL_LANDSCAPE_TRANSFORMER: { hoursPerUnit: 0.60, sourceKeys: ["INSTALL_LANDSCAPE_DRIVER"], note: "Direct workbook transformer mounting and connection factor." },
  ELEC_LANDSCAPE_CABLE: { hoursPerUnit: 0.025, sourceKeys: ["RUN_LANDSCAPE_CABLE_FT"], note: "Direct workbook softscape low-voltage cable factor per foot." },
  ELEC_INSTALL_LANDSCAPE_FIXTURE: { hoursPerUnit: 0.25, sourceKeys: ["CONNECT_LANDSCAPE_FIXTURE"], note: "Direct workbook setting, connection, aiming and test factor per fixture." },
  ELEC_INSTALL_NEW_EXTERIOR_LIGHT_POINT: { hoursPerUnit: 0.42, sourceKeys: ["MOUNT_EXTERIOR_LIGHT"], note: "Direct workbook prepared-box exterior fixture mounting, sealing and aiming factor." },
  ELEC_INSTALL_WEATHERPROOF_RECEPTACLE_BOX: { hoursPerUnit: 0.30, sourceKeys: ["INSTALL_WEATHERPROOF_BOX"], note: "Direct workbook weatherproof box installation and sealing factor." },
  ELEC_HEAVY_BRANCH_CABLE_CONCEALED: { hoursPerUnit: 0.06, sourceKeys: ["RUN_CABLE_FINISHED_FT", "NEE-06", "NEE-08"], note: "Provisional larger-cable concealed-route factor; openings, drilling and terminations remain separate." },
};

function publishedBaseline(operation: LaborOperation): ElectricalPlatformLaborBaseline | null {
  if (operation.referenceLaborHours === null || operation.referenceStatus === "DISPUTED") return null;
  return {
    operationKey: operation.key,
    hoursPerUnit: operation.referenceLaborHours,
    status: "PUBLISHED_REFERENCE",
    sourceKeys: operation.evidence.map((item) => item.observationId),
    note: `${operation.referenceStatus} numeric reference from the checked atomic labor evidence.`,
  };
}

export const ELECTRICAL_PLATFORM_LABOR_BASELINES: ElectricalPlatformLaborBaseline[] =
  ELECTRICAL_ATOMIC_LABOR_OPERATIONS.flatMap((operation) => {
    const published = publishedBaseline(operation);
    if (published) return [published];
    const seed = PLANNING_SEEDS[operation.key];
    return seed ? [{ operationKey: operation.key, status: "WORKBOOK_PLANNING_FACTOR" as const, ...seed }] : [];
  });

export const electricalPlatformLaborBaselineByOperation = new Map(
  ELECTRICAL_PLATFORM_LABOR_BASELINES.map((baseline) => [baseline.operationKey, baseline]),
);

export function platformLaborHours(): Record<string, number> {
  return Object.fromEntries(ELECTRICAL_PLATFORM_LABOR_BASELINES.map((baseline) => [baseline.operationKey, baseline.hoursPerUnit]));
}
