export const OUTLET_WIRING_METHOD_COMPARISON_KEY = "outlet_install_method_help";
export const CEILING_FAN_WIRING_METHOD_COMPARISON_KEY = "fan_install_method_help";

export function isWiringMethodComparisonQuestion(questionKey: string) {
  return questionKey === OUTLET_WIRING_METHOD_COMPARISON_KEY ||
    questionKey === CEILING_FAN_WIRING_METHOD_COMPARISON_KEY;
}

export const OUTLET_WIRING_METHOD_COMPARISON_IMAGE =
  "/images/guides/concealed-vs-wiremold.png";

export const OUTLET_WIRING_METHOD_COMPARISON_ALT =
  "Side-by-side comparison of concealed wiring through two small drywall openings and visible Wiremold routed along the top of the baseboard";
