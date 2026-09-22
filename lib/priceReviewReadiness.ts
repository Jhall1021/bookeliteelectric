export type FlatPriceFoundationInput = {
  materialCostResolved: boolean;
  unresolvedMaterialKeys: string[];
  unresolvedPolicyKeys: string[];
};

export type FlatPriceFoundationReadiness =
  | { ready: true }
  | { ready: false; code: "MATERIALS_UNRESOLVED" | "POLICY_UNRESOLVED"; message: string };

/**
 * Per-service prerequisites for calculating and approving a flat price.
 *
 * Setup may contain many selected services at different stages. One unfinished
 * service must not hide a valid suggestion for a different, complete service,
 * but an incomplete service must never be calculated as though missing
 * materials were free or unresolved policy wording were final.
 */
export function flatPriceFoundationReadiness(
  service: FlatPriceFoundationInput,
): FlatPriceFoundationReadiness {
  if (!service.materialCostResolved) {
    const keys = service.unresolvedMaterialKeys;
    return {
      ready: false,
      code: "MATERIALS_UNRESOLVED",
      message: keys.length > 0
        ? `${keys.join(", ")} still ${keys.length === 1 ? "needs" : "need"} material setup`
        : "Material setup is incomplete",
    };
  }

  if (service.unresolvedPolicyKeys.length > 0) {
    return {
      ready: false,
      code: "POLICY_UNRESOLVED",
      message: `${service.unresolvedPolicyKeys.join(", ")} still ${service.unresolvedPolicyKeys.length === 1 ? "needs" : "need"} a pricing decision`,
    };
  }

  return { ready: true };
}
