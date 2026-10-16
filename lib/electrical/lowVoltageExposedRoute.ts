import { PRIMARY_SLOT } from "../accessSlots";
import type { AnswerOptionDTO, QuestionDTO, ServiceFlowDTO } from "../flow-types";

export const LOW_VOLTAGE_EXPOSED_ROUTE_DISCLAIMER =
  "The cable will remain visible. This price assumes an unobstructed route on ordinary paint-grade baseboard or adjacent drywall using listed low-voltage clips. Masonry, tile, metal and specialty finishes need review.";

export function lowVoltageExposedRouteKeys(serviceSlug: string): {
  accessKey: string;
  distanceKey: string;
} | null {
  if (serviceSlug !== "new-coax-line" && serviceSlug !== "new-ethernet-line") return null;
  return {
    accessKey: `${serviceSlug}_route_access`,
    distanceKey: `${serviceSlug}_exposed_route_feet`,
  };
}

/**
 * Older installed low-voltage catalogs can still contain the exposed-route
 * measurement and pricing recipe while missing the single access option that
 * reaches it. Keep the storefront complete while the idempotent catalog
 * repair brings those rows back into alignment.
 */
export function ensureLowVoltageExposedRouteOption(flow: ServiceFlowDTO): ServiceFlowDTO {
  const keys = lowVoltageExposedRouteKeys(flow.slug);
  if (!keys) return flow;

  const accessQuestion = flow.questions.find((question) => question.key === keys.accessKey);
  if (!accessQuestion) return flow;

  const optionBase = (id: string): AnswerOptionDTO => ({
    id,
    label: "",
    value: "",
    priceModifierCents: 0,
    nextQuestionId: null,
    routeAction: "PHOTO_REVIEW",
    numberAtLeast: null,
    numberAtMost: null,
    rerouteServiceId: null,
    requiredPhotoLabels: [],
    illustrationUrls: [],
    photoSafetyNotes: [],
    disclaimer: null,
    photosBlockBooking: true,
    overrideEstimatedMinutes: null,
    overrideTechCount: null,
    overrideFieldLaborHours: null,
    approvedComponentPriceCents: null,
    accessClassification: null,
    accessSlot: PRIMARY_SLOT,
    accessFinishedDisclaimer: null,
    conditionalDisclaimers: [],
    components: [],
  });
  const sourceLabel = flow.slug === "new-coax-line" ? "router or existing coax source" : "router or network source";
  const targetLabel = flow.slug === "new-coax-line" ? "new coax wall plate" : "new Ethernet wall plate";
  const sourcePhotos = [`Where the ${sourceLabel} is`, `Where you'd like the ${targetLabel}`];
  const reviewPhotos = [...sourcePhotos, "The complete visible route between the two points"];
  const existingDistanceQuestion = flow.questions.find((question) => question.key === keys.distanceKey);
  const distanceQuestion: QuestionDTO = existingDistanceQuestion ?? {
    id: `compat:${flow.slug}:exposed_route_feet`,
    key: keys.distanceKey,
    prompt: `How many feet will the visible ${flow.slug === "new-coax-line" ? "coax" : "Ethernet"} cable run along the baseboard?`,
    helpText: `Measure from the ${sourceLabel} to the ${targetLabel}, following the baseboard and every corner.`,
    inputType: "NUMBER",
    numberAllowsDecimal: true,
    numberMin: 1,
    numberMax: 200,
    conditionalHelp: [],
    order: accessQuestion.order + 1,
    options: [
      {
        ...optionBase(`compat:${flow.slug}:exposed_measured`),
        label: "1 to 75 feet",
        value: "measured_exposed_route",
        routeAction: "RESOLVE_ADJUSTED",
        numberAtLeast: 1,
        numberAtMost: 75,
        requiredPhotoLabels: sourcePhotos,
        photosBlockBooking: false,
        approvedComponentPriceCents: 0,
      },
      {
        ...optionBase(`compat:${flow.slug}:exposed_over_75`),
        label: "More than 75 feet",
        value: "over_75",
        numberAtLeast: 75,
        numberAtLeastExclusive: true,
        numberAtMost: 200,
        requiredPhotoLabels: reviewPhotos,
      },
      {
        ...optionBase(`compat:${flow.slug}:exposed_unknown`),
        label: "I'm not sure",
        value: "__unknown__",
        requiredPhotoLabels: reviewPhotos,
      },
    ],
  };

  const option: AnswerOptionDTO = {
    id: `compat:${flow.slug}:exposed_baseboard`,
    label: "Run it exposed and neatly fastened along the baseboard",
    value: "exposed_baseboard",
    priceModifierCents: 0,
    nextQuestionId: distanceQuestion.id,
    routeAction: "CONTINUE",
    numberAtLeast: null,
    numberAtMost: null,
    rerouteServiceId: null,
    requiredPhotoLabels: [],
    illustrationUrls: [],
    photoSafetyNotes: [],
    disclaimer: LOW_VOLTAGE_EXPOSED_ROUTE_DISCLAIMER,
    photosBlockBooking: false,
    overrideEstimatedMinutes: null,
    overrideTechCount: null,
    overrideFieldLaborHours: null,
    approvedComponentPriceCents: 0,
    accessClassification: null,
    accessSlot: PRIMARY_SLOT,
    accessFinishedDisclaimer: null,
    conditionalDisclaimers: [],
    components: [],
  };
  const unsureIndex = accessQuestion.options.findIndex((candidate) => candidate.value === "unsure");
  const options = [...accessQuestion.options];
  const existingExposedIndex = options.findIndex((candidate) => candidate.value === "exposed_baseboard");
  if (existingExposedIndex >= 0) {
    options[existingExposedIndex] = { ...options[existingExposedIndex], nextQuestionId: distanceQuestion.id };
  } else {
    options.splice(unsureIndex >= 0 ? unsureIndex : options.length, 0, option);
  }

  return {
    ...flow,
    questions: [
      ...flow.questions.map((question) =>
        question.id === accessQuestion.id ? { ...question, options } : question
      ),
      ...(existingDistanceQuestion ? [] : [distanceQuestion]),
    ],
  };
}
