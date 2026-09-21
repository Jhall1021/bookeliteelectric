import {
  computeMaterialTakeoff,
  type MaterialTakeoff,
  type ProductSelection,
  type RequiredClass,
} from "./materialTakeoff";

export function computeRecessedLightingMaterialTakeoff(args: {
  lightCount: number | null;
  installedCablePathFeet: number | null;
  totalCableSlackFeet: number | null;
  nmCableSupportCount: number | null;
  selections: ProductSelection[];
}): MaterialTakeoff {
  const countReady = args.lightCount !== null && Number.isInteger(args.lightCount) && args.lightCount > 0;
  const pathReady = args.installedCablePathFeet !== null && Number.isFinite(args.installedCablePathFeet) && args.installedCablePathFeet >= 0;
  const slackReady = args.totalCableSlackFeet !== null && Number.isFinite(args.totalCableSlackFeet) && args.totalCableSlackFeet >= 0;
  const cableFeet = pathReady && slackReady
    ? (args.installedCablePathFeet as number) + (args.totalCableSlackFeet as number)
    : null;
  const supportReady = args.nmCableSupportCount !== null && Number.isInteger(args.nmCableSupportCount) && args.nmCableSupportCount >= 0;

  const requiredClasses: RequiredClass[] = [
    countReady
      ? { classKey: "RECESSED_WAFERS", roles: ["RECESSED_WAFER"], because: "Each requested light physically requires one wafer/driver assembly." }
      : { classKey: "RECESSED_WAFERS", roles: ["RECESSED_WAFER"], because: "Each requested light requires one wafer.", unquantifiable: { code: "LIGHTING_LAYOUT_NOT_ESTABLISHED", reason: "The requested recessed-light count is not established." } },
    cableFeet !== null
      ? { classKey: "LIGHTING_CABLE", roles: ["WIRE_14_2"], because: "The measured layout path plus the declared total slack establishes cable purchase footage." }
      : { classKey: "LIGHTING_CABLE", roles: ["WIRE_14_2"], because: "The lighting layout requires branch cable.", unquantifiable: { code: pathReady ? "LIGHTING_CABLE_ALLOWANCE_NOT_ESTABLISHED" : "LIGHTING_LAYOUT_NOT_ESTABLISHED", reason: pathReady ? "The total cable slack for this layout is not established." : "The installed cable path for this layout is not established." } },
    { classKey: "LIGHTING_CONSUMABLES", roles: ["CONSUMABLES_SMALL"], because: "One bounded lighting job uses the contractor's small electrical consumables package once, not once per light." },
    args.nmCableSupportCount === 0
      ? null
      : supportReady
      ? { classKey: "LIGHTING_CABLE_SUPPORTS", roles: ["NM_CABLE_SUPPORT"], because: "The accessible cable path requires the support count derived from measured footage and contractor policy." }
      : { classKey: "LIGHTING_CABLE_SUPPORTS", roles: ["NM_CABLE_SUPPORT"], because: "The accessible cable path requires policy-derived supports.", unquantifiable: { code: "SUPPORT_SPACING_NOT_ESTABLISHED", reason: "The accessible cable support count is not established." } },
  ].filter((requiredClass): requiredClass is RequiredClass => requiredClass !== null);
  const recipes = [
    ...(countReady ? [{ componentKey: "RECESSED_LIGHTING_LAYOUT", role: "RECESSED_WAFER", perUnit: args.lightCount as number, unit: "each" }] : []),
    ...(cableFeet !== null ? [{ componentKey: "RECESSED_LIGHTING_LAYOUT", role: "WIRE_14_2", perUnit: cableFeet, unit: "ft" }] : []),
    { componentKey: "RECESSED_LIGHTING_LAYOUT", role: "CONSUMABLES_SMALL", perUnit: 1, unit: "job" },
    ...(supportReady && (args.nmCableSupportCount as number) > 0 ? [{ componentKey: "RECESSED_LIGHTING_LAYOUT", role: "NM_CABLE_SUPPORT", perUnit: args.nmCableSupportCount as number, unit: "each" }] : []),
  ];

  return computeMaterialTakeoff({
    components: [{ key: "RECESSED_LIGHTING_LAYOUT", quantity: 1 }],
    recipes,
    selections: args.selections,
    shape: { turnCount: 0 },
    divisibility: [
      { role: "RECESSED_WAFER", divisibility: "DISCRETE" },
      { role: "WIRE_14_2", divisibility: "CONTINUOUS" },
      { role: "CONSUMABLES_SMALL", divisibility: "DISCRETE" },
      { role: "NM_CABLE_SUPPORT", divisibility: "DISCRETE" },
    ],
    requiredClasses,
    segmentation: { notApplicable: true, because: "NM cable is purchased continuously; layout segment count does not create a separate coupling material." },
    conductors: { known: true, functions: [], footPerConductor: 0 },
    derivedRequirements: [],
  });
}
