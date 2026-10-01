export const BIDET_OUTLET_LOAD_VALUE = "bidet";

export type OutletEndpointMaterialRole = "GFCI_INTERIOR";

/**
 * A bidet seat or smart toilet is still an ordinary branch extension. The
 * customer stays in the normal new-outlet service; only the bathroom endpoint
 * changes from a standard receptacle to an interior GFCI receptacle.
 */
export function outletEndpointMaterialRole(
  answers: Record<string, string>,
): OutletEndpointMaterialRole | undefined {
  return answers.outlet_load_type === BIDET_OUTLET_LOAD_VALUE
    ? "GFCI_INTERIOR"
    : undefined;
}
