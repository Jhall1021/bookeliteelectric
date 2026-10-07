"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

import type { AnswerOptionDTO, QuestionDTO } from "@/lib/flow-types";
import { selectNumericOption, isNumericUnknownOption } from "@/lib/numericRouteRanges";
import { formatCents } from "@/lib/flow-types";
import { answerPriceDelta, resolveReferencedServicePriceCents } from "@/lib/pricing";
import { PRIMARY_SLOT, type AccessBySlot } from "@/lib/accessSlots";
import { usePricingCopy } from "@/components/theme/StorefrontContext";
import MeasurementGuide from "@/components/guided-flow/MeasurementGuide";
import { doorwayAnswerKey, measurementCanCrossDoorway } from "@/lib/electrical/doorwayRouting";
import {
  FINISHED_WALL_METHOD_DISCLOSURE,
  isFinishedWallDisclosureQuestion,
} from "@/lib/electrical/finishedWallDisclosure";
import {
  OUTLET_WIRING_METHOD_COMPARISON_ALT,
  OUTLET_WIRING_METHOD_COMPARISON_IMAGE,
  isWiringMethodComparisonQuestion,
} from "@/lib/electrical/wiringMethodComparison";
import { isDedicatedCircuitAccessibleRoute, isDedicatedCircuitFinishedRoute } from "@/lib/electrical/dedicatedCircuitAccess";
import {
  parseMixedRouteSections,
  routeEndExteriorAnswerKey,
  routeExteriorAnswerKey,
  routeSectionsAnswerKey,
  routeStartExteriorAnswerKey,
  type RouteAccess,
} from "@/lib/electrical/mixedRouteSections";

type RouteSection = { id: number; feet: string; access: RouteAccess; doorways: number };
type RouteExterior = "" | "no" | "yes" | "unsure";

const SEGMENTED_ROUTE_QUESTION_KEYS = new Set([
  "dedicated_distance",
  "new-coax-line_distance",
  "new-ethernet-line_distance",
]);

const initialRouteSections = (access: RouteAccess): RouteSection[] => [{ id: 1, feet: "", access, doorways: 0 }];

type Props = {
  question: QuestionDTO;
  /**
   * Answers collected so far. Needed because a conditional component's price
   * depends on an earlier answer — the same option costs $220 with attic
   * access and $360 through finished space.
   */
  answers: Record<string, string>;
  /**
   * Access classification established earlier. A switch-leg answer costs $300
   * through an attic and $435 through finished walls — the label has to know
   * which before the customer picks it.
   */
  accessBySlot: AccessBySlot;
  /**
   * Whether this visit is an add-on (has an existing primary service already)
   * — decides which of a referenced-service answer's two prices
   * (`referencedServicePrimaryCents`/`referencedServiceAddOnCents`) this
   * preview shows, the same way it decides which anchor price the resolved
   * total uses. Without this, the live "+$125" badge next to a mount option
   * could show the standalone price while the customer is actually booking
   * an add-on visit the server would charge differently for.
   */
  isAddOn: boolean;
  pricingMethod?: string;
  serviceSlug?: string;
  onAnswer: (option: AnswerOptionDTO, supplementalAnswers?: Record<string, string | null>) => void;
};

export default function QuestionStep({ question, answers, accessBySlot, isAddOn, pricingMethod, serviceSlug = "", onAnswer }: Props) {
  const pcopy = usePricingCopy();
  const [text, setText] = useState("");
  const [doorwayChecked, setDoorwayChecked] = useState(false);
  const [routeSections, setRouteSections] = useState<RouteSection[]>(initialRouteSections("accessible"));
  const [routeBuildingComplete, setRouteBuildingComplete] = useState(false);
  const [routeExterior, setRouteExterior] = useState<RouteExterior>("");
  const primaryAccessClass = accessBySlot[PRIMARY_SLOT];

  // This component is reused as the guided flow advances. A numeric answer
  // belongs only to the question that collected it; carrying route footage
  // into the next count question (for example, inside corners) can silently
  // inflate the calculated price.
  useEffect(() => {
    setText("");
    const selected = question.key === "dedicated_distance"
      ? answers.dedicated_route_access
      : answers[question.key.replace(/_distance$/, "_route_access")];
    const initialAccess: RouteAccess = question.key === "dedicated_distance"
      ? isDedicatedCircuitFinishedRoute(selected) ? "finished" : "accessible"
      : selected === "finished" ? "finished" : "accessible";
    const storedSections = parseMixedRouteSections(answers[routeSectionsAnswerKey(question.key)]);
    setRouteSections(storedSections?.map((section) => ({
      ...section,
      feet: String(section.feet),
    })) ?? initialRouteSections(initialAccess));
    setRouteBuildingComplete(false);
    const storedExterior = answers[routeExteriorAnswerKey(question.key)];
    const legacyExteriorWasAnswered = answers[routeStartExteriorAnswerKey(question.key)] !== undefined
      || answers[routeEndExteriorAnswerKey(question.key)] !== undefined;
    setRouteExterior(storedExterior === "no" || storedExterior === "yes" || storedExterior === "unsure"
      ? storedExterior
      : answers[routeStartExteriorAnswerKey(question.key)] === "yes" || answers[routeEndExteriorAnswerKey(question.key)] === "yes"
        ? "yes"
        : legacyExteriorWasAnswered ? "no" : "");
    setDoorwayChecked(
      primaryAccessClass !== "ACCESSIBLE" &&
      answers[doorwayAnswerKey(question.key)] === "yes"
    );
  }, [answers, primaryAccessClass, question.id, question.key]);

  // Help text that only holds on some routes. A `replaces` entry swaps the
  // default out — the distance question's default mentions the basement or
  // attic, which is nonsense once the customer has told us there isn't one.
  const applicableHelp = (question.conditionalHelp ?? []).filter(
    (h) => h.accessClass === null || h.accessClass === accessBySlot[h.accessSlot]
  );
  const replacement = applicableHelp.find((h) => h.replaces);
  const authoredHelpText = replacement ? replacement.text : question.helpText;
  const selectedRouteAccess = question.key === "dedicated_distance"
    ? answers.dedicated_route_access
    : question.key === "new-coax-line_distance"
      ? answers["new-coax-line_route_access"]
      : question.key === "new-ethernet-line_distance"
        ? answers["new-ethernet-line_route_access"]
        : undefined;
  const measurementAccessClass = (question.key === "dedicated_distance" ? isDedicatedCircuitFinishedRoute(selectedRouteAccess) : selectedRouteAccess === "finished")
    ? "FINISHED"
    : (question.key === "dedicated_distance" ? isDedicatedCircuitAccessibleRoute(selectedRouteAccess) : selectedRouteAccess === "accessible")
      ? "ACCESSIBLE"
      : primaryAccessClass;
  const coaxDistanceHelpText = question.key === "new-coax-line_distance"
    ? measurementAccessClass === "FINISHED"
      ? "Measure from the router or existing coax source, following the finished walls and ceiling to the new wall plate—not straight across the room."
      : measurementAccessClass === "ACCESSIBLE"
        ? "Measure the cable's actual path through the attic, basement, or crawlspace—not a straight line through the room."
        : authoredHelpText
    : null;
  const mixedRouteHelpText = SEGMENTED_ROUTE_QUESTION_KEYS.has(question.key)
    ? "Build the wire’s path one simple part at a time. We’ll add everything together for you."
    : null;
  // Older installed lighting trees carried the pre-allowance instruction to
  // include every inter-light leg in the typed distance. The live calculation
  // now owns a fixed ten-foot allowance per additional recessed light, so the
  // browser must not ask those already-installed trees to count it twice.
  const helpText = mixedRouteHelpText ?? (isFinishedWallDisclosureQuestion(question.key)
    ? FINISHED_WALL_METHOD_DISCLOSURE
    : coaxDistanceHelpText
    ? coaxDistanceHelpText
    : question.inputType === "NUMBER" && /first recessed light/i.test(question.prompt)
    ? `${authoredHelpText?.replace(/\s*(?:Include the wiring that will continue from the first light to the remaining recessed lights\.?|Measure only to the first recessed light\. We automatically add 10 feet of wire for each additional light\.)/gi, "") ?? "Measure along the wiring route."} Measure only to the first recessed light. We automatically add 10 feet of wire for each additional light.`
    : authoredHelpText);
  const extraHelp = applicableHelp.filter((h) => !h.replaces);

  // A TEXT question has one option carrying the routing; what the customer
  // types becomes its value. The schema has supported TEXT and NUMBER since
  // the beginning but nothing rendered them, which is why the bathroom-fan
  // housing measurements and the smart-switch make/model both got deferred.
  if (question.inputType === "TEXT" || question.inputType === "NUMBER") {
    const usesRouteSections = question.inputType === "NUMBER" && SEGMENTED_ROUTE_QUESTION_KEYS.has(question.key);
    const allRouteSectionsMeasured = routeSections.every((section) => {
      const feet = Number(section.feet);
      return Number.isFinite(feet) && feet > 0;
    });
    const measuredRouteFeet = routeSections.reduce((total, section) => {
      const feet = Number(section.feet);
      return total + (Number.isFinite(feet) && feet > 0 ? feet : 0);
    }, 0);
    const routeDoorwayCount = routeSections.reduce((total, section) => total + (section.access === "finished" ? section.doorways : 0), 0);
    const typed = usesRouteSections
      ? allRouteSectionsMeasured && measuredRouteFeet > 0 ? String(measuredRouteFeet) : ""
      : text.trim();

    // Browser navigation and the server use the same numeric selector.
    // Explicit decimal domains may use an open lower edge (over 20 feet).
    // Bounded single-option questions validate too; only legacy unbounded
    // dimensions preserve free text such as "8 x 8".
    const choice =
      question.inputType === "NUMBER" ? selectNumericOption(question, typed) : null;
    const route =
      question.inputType === "NUMBER"
        ? choice?.kind === "option"
          ? choice.option
          : null
        : question.options[0];

    // Convenience, never authority. The server validates this answer again and
    // refuses it independently; this only spares the customer a round trip.
    const refusal =
      question.inputType === "NUMBER" && typed.length > 0 && choice?.kind !== "option"
        ? choice?.reason ?? null
        : null;

    // Read from the authored options, not from `route` — which is null until a
    // NUMBER answer is valid.
    const first = question.options.find(o => !isNumericUnknownOption(o));
    const unknown = question.inputType === "NUMBER" ? question.options.find(isNumericUnknownOption) : undefined;
    const required = question.options.length > 0 && !first?.value?.startsWith("optional");
    const doorwaySupported = question.inputType === "NUMBER" && measurementCanCrossDoorway({
      questionKey: question.key,
      prompt: question.prompt,
      serviceSlug,
    });
    const collectsDoorway = doorwaySupported && measurementCanCrossDoorway({
      questionKey: question.key,
      prompt: question.prompt,
      serviceSlug,
      accessClass: measurementAccessClass,
    });
    const doorwayAnswers = doorwaySupported
      ? {
          [doorwayAnswerKey(question.key)]: collectsDoorway
            ? usesRouteSections
              ? routeDoorwayCount > 0 ? String(routeDoorwayCount) : "no"
              : doorwayChecked ? "yes" : "no"
            : null,
          ...(question.key === "concealed_route_feet" && collectsDoorway && doorwayChecked
            ? { concealed_route_obstacles: "doorway" }
            : question.key === "concealed_route_feet"
              ? { concealed_route_obstacles: null }
              : {}),
          ...(usesRouteSections ? {
            [routeSectionsAnswerKey(question.key)]: JSON.stringify(routeSections.map((section) => ({
              id: section.id,
              feet: Number(section.feet),
              access: section.access,
              doorways: section.access === "finished" ? section.doorways : 0,
            }))),
            [routeExteriorAnswerKey(question.key)]: routeExterior,
            // Retain the legacy endpoint keys so older saved visits and server
            // versions keep the same conservative exterior-wall behavior.
            [routeStartExteriorAnswerKey(question.key)]: routeExterior === "yes" || routeExterior === "unsure" ? "yes" : "no",
            [routeEndExteriorAnswerKey(question.key)]: "no",
          } : {}),
        }
      : undefined;
    return (
      <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
        <h2 className="font-display text-xl font-bold text-navy">{question.prompt}</h2>
        {helpText && <p className="mt-1 text-sm text-slate">{helpText}</p>}
        {extraHelp.map((h, i) => (
          <p key={i} className="mt-1 text-sm text-slate">
            {h.text}
          </p>
        ))}

        {question.inputType === "NUMBER" && (
          <MeasurementGuide
            questionKey={question.key}
            prompt={question.prompt}
            serviceSlug={serviceSlug}
            accessClass={measurementAccessClass}
            doorwayChecked={doorwayChecked}
            onDoorwayChange={collectsDoorway ? setDoorwayChecked : undefined}
            routeSections={usesRouteSections ? routeSections : undefined}
            routeBuildingComplete={routeBuildingComplete}
            onRouteBuildingCompleteChange={usesRouteSections ? setRouteBuildingComplete : undefined}
            routeExterior={routeExterior}
            onRouteExteriorChange={usesRouteSections ? setRouteExterior : undefined}
            onRouteSectionFeetChange={usesRouteSections ? (id, feet) => {
              setRouteSections((sections) => sections.map((section) => section.id === id ? { ...section, feet } : section));
            } : undefined}
            onRouteSectionDoorwaysChange={usesRouteSections && doorwaySupported ? (id, doorways) => {
              setRouteSections((sections) => sections.map((section) => section.id === id ? { ...section, doorways } : section));
            } : undefined}
            onRouteSectionAccessChange={usesRouteSections ? (id, access) => {
              setRouteSections((sections) => sections.map((section) => section.id === id
                ? { ...section, access, doorways: access === "accessible" ? 0 : section.doorways }
                : section));
            } : undefined}
            onAddRouteSection={usesRouteSections ? () => {
              setRouteSections((sections) => sections.length >= 6
                ? sections
                : [...sections, { id: Math.max(...sections.map((section) => section.id)) + 1, feet: "", access: sections.at(-1)?.access ?? "accessible", doorways: 0 }]);
            } : undefined}
            onRemoveRouteSection={usesRouteSections ? (id) => {
              setRouteSections((sections) => sections.length === 1 ? sections : sections.filter((section) => section.id !== id));
            } : undefined}
          />
        )}

        {!usesRouteSections ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            aria-label={question.prompt}
            inputMode={question.inputType === "NUMBER" && question.numberMin != null
              ? question.numberAllowsDecimal ? "decimal" : "numeric" : undefined}
            rows={question.inputType === "NUMBER" ? 2 : 4}
            className="mt-4 w-full rounded-card border border-cardline px-4 py-3 text-sm focus:border-electric"
            placeholder={question.inputType === "NUMBER"
              ? question.numberMin != null ? question.numberAllowsDecimal ? "e.g. 14.625" : "e.g. 2" : "e.g. 8 x 8"
              : "Type your answer here"}
          />
        ) : null}

        {refusal && (
          <p className="mt-2 text-sm text-rust" role="alert">
            {refusal}
          </p>
        )}

        <button
          onClick={() => route && onAnswer({ ...route, value: typed || route.value }, doorwayAnswers)}
          disabled={!route || (required && typed.length === 0) || (usesRouteSections && (!routeBuildingComplete || routeExterior === ""))}
          className="mt-4 w-full rounded-pill bg-electric py-3 font-semibold text-white transition hover:bg-electric-hover disabled:opacity-40"
        >
          Continue
        </button>
        {unknown && (
          <button type="button" onClick={() => onAnswer(unknown)}
            className="mt-2 w-full text-center text-sm text-slate hover:text-navy">
            {unknown.label}
          </button>
        )}
        {!required && (
          <button
            onClick={() => route && onAnswer(route, doorwayAnswers)}
            className="mt-2 w-full text-center text-sm text-slate hover:text-navy"
          >
            Skip this
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-card border border-cardline bg-white p-6 shadow-card">
      <h2 className="font-display text-xl font-bold text-navy">{question.prompt}</h2>
      {helpText && <p className="mt-1 text-sm text-slate">{helpText}</p>}
      {extraHelp.map((h, i) => (
        <p key={i} className="mt-1 text-sm text-slate">
          {h.text}
        </p>
      ))}

      {isWiringMethodComparisonQuestion(question.key) && (
        <div className="mt-5 overflow-hidden rounded-card border border-cardline bg-warmwhite">
          <Image
            src={OUTLET_WIRING_METHOD_COMPARISON_IMAGE}
            alt={OUTLET_WIRING_METHOD_COMPARISON_ALT}
            width={1525}
            height={1031}
            sizes="(min-width: 640px) 640px, calc(100vw - 3rem)"
            className="h-auto w-full"
          />
        </div>
      )}

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {question.options.map((option) => {
          const delta = answerPriceDelta(
            { ...option, referencedServicePriceCents: resolveReferencedServicePriceCents(option, isAddOn) },
            answers,
            accessBySlot
          );
          // Only an answer that SETTLES something can promise a price. A
          // CONTINUE answer carrying no charge of its own says nothing —
          // what the customer pays still depends on later questions, so
          // "No extra charge" there is a promise it can't keep.
          const resolvesImmediately =
            option.routeAction === "RESOLVE_INSTANT" ||
            option.routeAction === "RESOLVE_ADJUSTED";
          const settles =
            resolvesImmediately ||
            (option.routeAction === "PHOTO_REVIEW" && !option.photosBlockBooking);
          // Derived scope prices include route length, materials and labor
          // calculated only after the final answer. A zero option adjustment
          // does not mean the selected route has no additional cost.
          const derivedScope = pricingMethod === "DERIVED_RESOLVED_SCOPE";
          const showsFree = !derivedScope && settles && delta.cents === 0;
          return (
            <button
              key={option.id}
              onClick={() => onAnswer(option)}
              className="rounded-card border border-cardline bg-warmwhite p-4 text-left text-sm font-medium text-navy transition hover:border-electric hover:bg-white"
            >
              <span className="block">{option.label}</span>

              {/* Pictures before prose. On a question like "is this a
                  standard chandelier", the photographs ARE the definition —
                  the words underneath only confirm what the customer has
                  already decided by looking. */}
              {option.illustrationUrls && option.illustrationUrls.length > 0 && (
                <span className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {option.illustrationUrls.map((src) => (
                    <span
                      key={src}
                      className="block overflow-hidden rounded-card border border-cardline bg-white"
                    >
                      {/* Plain img rather than next/image: these are option
                          illustrations sized by the grid, and the layout
                          shift next/image guards against doesn't apply. */}
                      <img
                        src={src}
                        alt=""
                        loading="lazy"
                        className="aspect-[4/3] w-full object-cover"
                      />
                    </span>
                  ))}
                </span>
              )}

              {/* A disclaimer on an answer describes what picking it MEANS —
                  that the new light shares a switch, that we'll open the
                  ceiling at the existing fixture. It has to be readable
                  before the choice, not after. Answers that settle a price
                  also show it on the confirmation screen; answers that
                  continue to another question used to show it nowhere at
                  all. */}
              {/* Conditions are evaluated against what the flow has already
                  established. A disclaimer with no accessClass always
                  applies; one that names a class applies only when it
                  matches. That's what keeps an attic customer from being
                  told we'll cut their ceiling. */}
              {(() => {
                const conditional = (option.conditionalDisclaimers ?? []).filter(
                  (d) =>
                    d.accessClass === null ||
                    d.accessClass === accessBySlot[d.accessSlot] ||
                    (
                      option.accessClassification === d.accessClass &&
                      option.accessSlot === d.accessSlot
                    )
                );
                // LEGACY, and PRIMARY-ONLY by definition — G1.
                //
                // accessFinishedDisclaimer predates scoped access, so the only
                // route it can have meant is the one PRIMARY names. Read
                // explicitly rather than against "whichever slot was answered
                // last", which would be the overwrite bug reintroduced in the
                // one place still using the old shape. Its retirement is
                // separate cleanup with its own proof.
                const legacyFinished =
                  option.accessFinishedDisclaimer &&
                  accessBySlot[PRIMARY_SLOT] === "FINISHED"
                    ? option.accessFinishedDisclaimer
                    : null;
                const finishedWallDisclosure =
                  option.accessClassification === "FINISHED"
                    ? FINISHED_WALL_METHOD_DISCLOSURE
                    : null;
                const statements = [
                  option.disclaimer,
                  legacyFinished,
                  ...conditional.map((disclaimer) => disclaimer.text),
                  finishedWallDisclosure,
                ].filter((statement): statement is string => !!statement?.trim());
                const uniqueStatements = [...new Set(statements)].filter((statement) =>
                  !finishedWallDisclosure ||
                  statement === finishedWallDisclosure ||
                  !(
                    statement.includes("small access openings in drywall") &&
                    statement.includes("reusable baseboard")
                  )
                );
                if (uniqueStatements.length === 0) {
                  return null;
                }
                return (
                  <span className="mt-1.5 block text-xs font-normal leading-relaxed text-slate">
                    {uniqueStatements.map((statement, index) => (
                      <span key={statement}>{index > 0 ? " " : ""}{statement}</span>
                    ))}
                  </span>
                );
              })()}
              {/* Price the answer before it's chosen. Anything that costs
                  extra says so up front; anything we can't price up front
                  says that instead of showing a number that might move. */}
              {derivedScope ? null : delta.needsReview ? (
                <span className="mt-1 block text-xs font-normal text-slate">
                  {resolvesImmediately
                    ? pcopy.calculateNowNotice
                    : pcopy.confirmAfterLookNotice}
                </span>
              ) : delta.cents && delta.cents > 0 ? (
                <>
                  <span className="mt-1 block text-xs font-semibold text-success">
                    + {formatCents(delta.cents)}
                  </span>
                  {/* The point of a per-unit rate is that it's lower than the
                      first one. Stated plainly rather than sold — a number the
                      customer can check beats an exclamation mark. */}
                  {delta.perUnitCents ? (
                    <span className="mt-0.5 block text-xs font-normal text-slate">
                      {formatCents(delta.perUnitCents)} each
                    </span>
                  ) : null}
                </>
              ) : delta.cents && delta.cents < 0 ? (
                <span className="mt-1 block text-xs font-semibold text-success">
                  − {formatCents(Math.abs(delta.cents))}
                </span>
              ) : showsFree ? (
                <span className="mt-1 block text-xs font-normal text-slate">
                  No extra charge
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
