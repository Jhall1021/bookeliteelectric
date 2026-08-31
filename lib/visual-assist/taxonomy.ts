/**
 * The vocabularies Visual Assist is allowed to speak.
 *
 * These are the ONLY strings a provider may return for an enum field.
 * Anything else is rejected by `parseObservation` rather than passed along,
 * which is what stops a model inventing `"SUBPANEL"` or `"NEEDS_UPGRADE"` and
 * having it land in an audit row that reads like an observation.
 *
 * WHY THESE ARE SCREAMING_SNAKE AND PRICE2BOOK'S ANSWERS ARE NOT
 *
 * The live catalog stores answers as lowercase snake_case on AnswerOption
 * rows — `has_access`, `finished_both_sides`, `20a_120v`. Visual Assist
 * deliberately does NOT reuse that vocabulary. The provider speaks a
 * platform-owned taxonomy that means nothing to the pricing engine, and
 * bindings.ts translates. Two vocabularies with an explicit map between them
 * is the mechanism that makes "the provider cannot name a Price2Book answer"
 * structurally true instead of a rule someone has to remember.
 *
 * EVERY ENUM CARRIES UNKNOWN, AND MOST CARRY OTHER
 *
 * UNKNOWN means "I could not tell". OTHER means "I could tell, and it is not
 * on your list". Collapsing them would lose the more useful signal of the
 * two: a rising OTHER rate says the taxonomy is missing a real category,
 * while a rising UNKNOWN rate says the capture instructions are wrong. Both
 * are unbindable, so neither costs anything downstream.
 */

// ---------------------------------------------------------------------------
// Plumbing — water heater
// ---------------------------------------------------------------------------

/**
 * Gas is not two categories.
 *
 * The handoff's first draft offered atmospheric or power vent, and a direct
 * vent heater is neither — it is a sealed-combustion unit with a concentric
 * or two-pipe wall termination that looks nothing like either. Forcing it
 * into the nearer of two wrong answers is exactly the confident-and-wrong
 * failure this design is built to avoid, so it gets its own member.
 */
export const WATER_HEATER_CONFIGURATIONS = [
  "GAS_TANK_ATMOSPHERIC",
  "GAS_TANK_POWER_VENT",
  "GAS_TANK_DIRECT_VENT",
  "ELECTRIC_TANK_STANDARD",
  "ELECTRIC_TANK_HYBRID_HEAT_PUMP",
  "GAS_TANKLESS",
  "ELECTRIC_TANKLESS",
  "OTHER",
  "UNKNOWN",
] as const;
export type WaterHeaterConfiguration = (typeof WATER_HEATER_CONFIGURATIONS)[number];

/**
 * Tank sizes that are actually sold.
 *
 * A validator, not a taxonomy — capacity is a number read off a label. Its
 * job is to catch the failure mode where a model reports "43" because the
 * label was half legible: no manufacturer makes a 43-gallon tank, so the
 * reading is wrong even though the number is plausible. A misread capacity is
 * worse than none, because none asks the homeowner and a misread does not.
 */
export const STANDARD_TANK_GALLONS = [20, 30, 38, 40, 50, 55, 65, 66, 75, 80, 100, 119] as const;

// ---------------------------------------------------------------------------
// Electrical — panel
// ---------------------------------------------------------------------------

/**
 * What the enclosure IS, by sight. Not what it does electrically.
 *
 * SUBPANEL is deliberately absent — §8. Whether a load center functions as a
 * subpanel depends on whether the neutral and ground are bonded inside it and
 * where its supply comes from, neither of which is a photograph. A model
 * asked for it would answer from enclosure size and breaker count, and a
 * wrong answer there is the beginning of a code-compliance opinion, which is
 * the one thing Visual Assist may never form.
 */
export const ELECTRICAL_PANEL_VISIBLE_TYPES = [
  "BREAKER_LOAD_CENTER",
  "FUSE_PANEL",
  "METER_MAIN_COMBINATION",
  "OTHER",
  "UNKNOWN",
] as const;
export type ElectricalPanelVisibleType = (typeof ELECTRICAL_PANEL_VISIBLE_TYPES)[number];

/**
 * Main breaker ratings that exist on residential equipment.
 *
 * Same reasoning as tank sizes and it matters more here. A breaker handle is
 * stamped with its rating and nothing else, so a correct reading is always
 * one of these. "175" is not a residential main; reporting it means the
 * characters were not actually read, whatever confidence came back with it.
 */
export const STANDARD_MAIN_BREAKER_AMPS = [60, 70, 100, 125, 150, 175, 200, 225, 300, 320, 400] as const;

// ---------------------------------------------------------------------------
// Electrical — receptacle
// ---------------------------------------------------------------------------

/**
 * Face geometry, and the word STYLE is load-bearing.
 *
 * `T_SLOT_20A_STYLE` says the face has the T-shaped neutral slot of a 20A
 * receptacle. It does NOT say the circuit is 20A — that depends on the
 * breaker and the conductor, and a 20A face on a 15A circuit is a real thing
 * that exists in real houses. The suffix is there so nobody reading a stored
 * value later mistakes the observation for the circuit.
 *
 * GFCI_STYLE likewise means "has the buttons", not "is protected": a
 * downstream receptacle on a GFCI's load side is protected without buttons,
 * and a dead GFCI has buttons without protection.
 */
export const RECEPTACLE_VISIBLE_CONFIGURATIONS = [
  "STANDARD_DUPLEX_15A_STYLE",
  "T_SLOT_20A_STYLE",
  "GFCI_STYLE",
  "USB_COMBINATION",
  "SINGLE_RECEPTACLE",
  "OTHER",
  "UNKNOWN",
] as const;
export type ReceptacleVisibleConfiguration = (typeof RECEPTACLE_VISIBLE_CONFIGURATIONS)[number];

// ---------------------------------------------------------------------------
// Electrical — EV equipment
// ---------------------------------------------------------------------------

export const EV_CONNECTION_TYPES = ["HARDWIRED", "RECEPTACLE_CONNECTED", "UNKNOWN"] as const;
export type EvConnectionType = (typeof EV_CONNECTION_TYPES)[number];

/**
 * The four EV receptacle faces worth naming, and no others.
 *
 * §9 allows exact NEMA designations only where the geometry is distinctive
 * enough to carry them. These four are: the blade patterns differ visibly and
 * unmistakably, and they are the ones an EV install actually meets. Anything
 * else is OTHER rather than a fifth guess.
 */
export const EV_RECEPTACLE_TYPES = [
  "NEMA_14_50R",
  "NEMA_6_50R",
  "NEMA_14_30R",
  "NEMA_6_30R",
  "OTHER",
  "UNKNOWN",
] as const;
export type EvReceptacleType = (typeof EV_RECEPTACLE_TYPES)[number];

// ---------------------------------------------------------------------------
// Electrical — switch / gang configuration
// ---------------------------------------------------------------------------

/**
 * What is behind the plate, by its face.
 *
 * No THREE_WAY member, and that is the point of §11. A three-way switch has
 * no markings and no travellers visible from the front; a toggle with no
 * ON/OFF printed on it is a hint and not much of one. Three-way is
 * established by asking the homeowner whether the light has another switch
 * somewhere — a question they can answer perfectly — and never from a photo.
 */
export const SWITCH_DEVICE_TYPES = [
  "TOGGLE",
  "PADDLE_DECORA",
  "DIMMER",
  "TIMER",
  "OCCUPANCY_SENSOR",
  "SMART_CONTROL_VISIBLE",
  "OTHER",
  "UNKNOWN",
] as const;
export type SwitchDeviceType = (typeof SWITCH_DEVICE_TYPES)[number];

/** Past this many gangs in one plate the count is not reliably readable. */
export const MAX_GANG_COUNT = 8;

// ---------------------------------------------------------------------------
// Electrical — lighting fixture
// ---------------------------------------------------------------------------

/**
 * The fixture taxonomy, and the one that carries money.
 *
 * `CHANDELIER_DECORATIVE` versus `STANDARD_CEILING_FIXTURE` is the boundary
 * §42 says to measure separately, because in this catalog it does not select
 * an answer — it selects a different SERVICE. See bindings.ts.
 *
 * PENDANT IS ITS OWN MEMBER ON PURPOSE
 *
 * A pendant is not a small chandelier. Collapsing them would let a single
 * drum pendant over an island route to the chandelier service, and the whole
 * reason serviceMatch exists is that a homeowner describing a chandelier and
 * landing on the standard fixture gets quoted the wrong number. Keeping
 * pendant distinct means the mapping decides what a pendant costs, not the
 * model's sense of how decorative something looks.
 */
export const LIGHTING_FIXTURE_TYPES = [
  "STANDARD_CEILING_FIXTURE",
  "FLUSH_MOUNT",
  "SEMI_FLUSH_MOUNT",
  "PENDANT",
  "CHANDELIER_DECORATIVE",
  "WALL_SCONCE",
  "VANITY",
  "RECESSED",
  "TRACK_LIGHTING",
  "UNDER_CABINET",
  "EXTERIOR_WALL",
  "FLOOD_LIGHT",
  "CEILING_FAN_WITH_LIGHT",
  "OTHER",
  "UNKNOWN",
] as const;
export type LightingFixtureType = (typeof LIGHTING_FIXTURE_TYPES)[number];

export const LIGHTING_MOUNTING_STYLES = [
  "CEILING_SURFACE",
  "SUSPENDED",
  "WALL",
  "RECESSED",
  "UNKNOWN",
] as const;
export type LightingMountingStyle = (typeof LIGHTING_MOUNTING_STYLES)[number];

/**
 * How many pieces it looks like it comes in.
 *
 * An observation about appearance, and nothing more. It does not say how long
 * assembly takes, how many people it needs, or what it costs — those are
 * scope questions the deterministic tree owns. It exists because "is this one
 * moulded piece or a frame with parts hung on it" is genuinely visible, and
 * genuinely useful to the tier that Price2Book (not this file) selects.
 */
export const LIGHTING_ASSEMBLY_COMPLEXITIES = [
  "SIMPLE",
  "MULTI_PART_DECORATIVE",
  "UNKNOWN",
] as const;
export type LightingAssemblyComplexity = (typeof LIGHTING_ASSEMBLY_COMPLEXITIES)[number];

/**
 * Fixture weight is NOT here, and must not be added as an observation.
 *
 * §14 and §15. Weight is the input that most changes what a fixture install
 * involves, and it is the one a photograph cannot supply — apparent size
 * correlates with weight badly enough that a confident visual estimate is
 * worse than no estimate, because the homeowner confirms it and it becomes a
 * fact. The route to a real weight is a manufacturer label read as text, in a
 * later task, gated on VISIBLE_TEXT. Until then the ceiling-height and
 * large-or-heavy questions stay where they are: in the deterministic tree,
 * asked of the person standing in the room.
 *
 * invariants.ts enforces this by name so a future field cannot reintroduce it
 * quietly.
 */
export const FORBIDDEN_LIGHTING_FIELD = "weight";
