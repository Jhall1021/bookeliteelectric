import type { PrismaClient } from "@prisma/client";
import {
  computeMaterialTakeoff,
  type ProductSelection,
  type RecipeLine,
  type RequiredClass,
  type SelectedComponent,
} from "./materialTakeoff";

export const GARAGE_EMT_ROLES = {
  conduit: "EMT_1_2",
  coupling: "EMT_COUPLING_1_2",
  connector: "EMT_CONNECTOR_1_2",
  strap: "EMT_STRAP_1_2",
  line: "CONDUCTOR_THHN_12_UNGROUNDED",
  neutral: "CONDUCTOR_THHN_12_GROUNDED",
  ground: "CONDUCTOR_THHN_12_EQUIPMENT_GROUND",
  box: "BOX_SURFACE_4S",
  cover: "COVER_RAISED_4S_DUPLEX",
  receptacle: "RECEPTACLE_STANDARD",
} as const;

const quantity = (components: SelectedComponent[], key: string) =>
  components.filter((component) => component.key === key).reduce((sum, component) => sum + component.quantity, 0);

export async function loadGarageEmtTakeoff(
  db: PrismaClient,
  contractorId: string,
  components: SelectedComponent[],
) {
  const routeFeet = quantity(components, "GARAGE_EMT_ROUTE_FT");
  const couplingCount = Math.max(0, Math.ceil(routeFeet / 10) - 1);
  // Support within 3 feet of both terminations and at no more than 10-foot
  // intervals. This conservative count stays code-driven, not a contractor
  // preference or a homeowner question.
  const strapCount = routeFeet > 0 ? Math.max(2, Math.ceil(routeFeet / 10) + 1) : 0;
  const connectorCount = routeFeet > 0 ? 2 : 0;
  const conductorFeet = routeFeet > 0 ? routeFeet + 4 : 0; // two feet of makeup at each end

  const roleKeys = Object.values(GARAGE_EMT_ROLES);
  const materialRows = await db.contractorMaterial.findMany({
    where: { contractorId, canonicalMaterial: { key: { in: roleKeys } } },
    select: {
      unitCostCents: true,
      packageQuantity: true,
      packageUnit: true,
      packagePriceCents: true,
      nameOverride: true,
      canonicalMaterial: { select: { key: true, unit: true } },
    },
  });
  const selections: ProductSelection[] = materialRows.map((material) => ({
    role: material.canonicalMaterial.key,
    packageQuantity: material.packageQuantity ?? 1,
    packageUnit: material.packageUnit ?? material.canonicalMaterial.unit,
    packagePriceCents: material.packagePriceCents ?? material.unitCostCents,
    productLabel: material.nameOverride,
  }));

  const recipes: RecipeLine[] = [
    { componentKey: "GARAGE_EMT_ROUTE_FT", role: GARAGE_EMT_ROLES.conduit, perUnit: 1, unit: "ft" },
    { componentKey: "GARAGE_EMT_DEVICE_BOX_OUTLET", role: GARAGE_EMT_ROLES.box, perUnit: 1, unit: "each" },
    { componentKey: "GARAGE_EMT_DEVICE_BOX_OUTLET", role: GARAGE_EMT_ROLES.cover, perUnit: 1, unit: "each" },
    { componentKey: "GARAGE_EMT_DEVICE_BOX_OUTLET", role: GARAGE_EMT_ROLES.receptacle, perUnit: 1, unit: "each" },
  ];
  const requiredClasses: RequiredClass[] = [
    { classKey: "GARAGE_EMT", roles: [GARAGE_EMT_ROLES.conduit], because: "The selected garage route uses exposed 1/2-inch EMT." },
    { classKey: "GARAGE_EMT_FITTINGS", roles: [GARAGE_EMT_ROLES.coupling, GARAGE_EMT_ROLES.connector], because: "Stock lengths must join and both ends terminate into boxes or enclosures." },
    { classKey: "GARAGE_EMT_SUPPORT", roles: [GARAGE_EMT_ROLES.strap], because: "The exposed EMT route requires one-hole supports." },
    { classKey: "GARAGE_CONDUCTORS", roles: [GARAGE_EMT_ROLES.line, GARAGE_EMT_ROLES.neutral, GARAGE_EMT_ROLES.ground], because: "The branch extension needs line, neutral and equipment-grounding conductors." },
    { classKey: "GARAGE_OUTLET_ASSEMBLY", roles: [GARAGE_EMT_ROLES.box, GARAGE_EMT_ROLES.cover, GARAGE_EMT_ROLES.receptacle], because: "The opener outlet needs a metal box, raised duplex cover and receptacle." },
  ];
  const discrete = [GARAGE_EMT_ROLES.coupling, GARAGE_EMT_ROLES.connector, GARAGE_EMT_ROLES.strap, GARAGE_EMT_ROLES.box, GARAGE_EMT_ROLES.cover, GARAGE_EMT_ROLES.receptacle];

  return computeMaterialTakeoff({
    components,
    recipes,
    selections,
    shape: { turnCount: 0 },
    divisibility: [
      { role: GARAGE_EMT_ROLES.conduit, divisibility: "CONTINUOUS" },
      { role: GARAGE_EMT_ROLES.line, divisibility: "CONTINUOUS" },
      { role: GARAGE_EMT_ROLES.neutral, divisibility: "CONTINUOUS" },
      { role: GARAGE_EMT_ROLES.ground, divisibility: "CONTINUOUS" },
      ...discrete.map((role) => ({ role, divisibility: "DISCRETE" as const })),
    ],
    requiredClasses,
    segmentation: { notApplicable: true, because: "The garage EMT coupling count is derived explicitly from 10-foot sticks." },
    conductors: {
      known: true,
      functions: [
        { function: "ungrounded", role: GARAGE_EMT_ROLES.line },
        { function: "grounded", role: GARAGE_EMT_ROLES.neutral },
        { function: "equipment ground", role: GARAGE_EMT_ROLES.ground },
      ],
      footPerConductor: conductorFeet,
    },
    derivedRequirements: [
      { role: GARAGE_EMT_ROLES.coupling, quantity: couplingCount, unit: "each", fromComponent: "10-foot EMT stick segmentation" },
      { role: GARAGE_EMT_ROLES.connector, quantity: connectorCount, unit: "each", fromComponent: "two EMT terminations" },
      { role: GARAGE_EMT_ROLES.strap, quantity: strapCount, unit: "each", fromComponent: "10-foot support spacing plus both terminations" },
    ],
  });
}
