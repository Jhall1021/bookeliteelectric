"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AnswerOptionDTO, QuestionDTO } from "@/lib/flow-types";
import { formatCents } from "@/lib/flow-types";
import QuestionStep from "@/components/guided-flow/QuestionStep";
import PriceConfirmationCard from "@/components/guided-flow/PriceConfirmationCard";
import ServiceIntro from "@/components/guided-flow/ServiceIntro";
import StorefrontIsland from "./StorefrontIsland";
import { HERO_FLOW } from "./heroFlow";

/**
 * The hero walkthrough: a homeowner priced and booked, in about twenty
 * seconds, using the real product.
 *
 * WHAT IS REAL HERE, AND WHAT IS NOT
 *
 * Real: every question, its wording, its help text, its answer labels, their
 * order, the routing behind them, the $280, the $260/$95 pair, the $375 total
 * and the arrival windows. All captured read-only from a live contractor
 * catalog by scripts/capture-hero-flow.ts, and asserted still-current by
 * `--check` in the deploy gate.
 *
 * Also real: the components, from the first visible frame. Both service cards
 * are the storefront's own ServiceIntro — the second in its isAddOn mode, so
 * the $95-against-$260 moment is the product's rendering of it rather than a
 * marketing drawing. The seven questions are QuestionStep and the price is
 * PriceConfirmationCard, all fed the exact DTO the storefront API serves. If a
 * question grows an illustration or the price card changes its wording, this
 * hero changes with it.
 *
 * Not real: the identity, which is a demonstration contractor's; the cursor;
 * and the cart, schedule and confirmation frames, which are composed here in
 * the island's theme because those surfaces are pages rather than extractable
 * components. Their numbers still come from the fixture.
 *
 * THE PATH IS THE SHORTEST ONE THAT REACHES A FIXED PRICE, and it is computed
 * by the capture rather than chosen here — five questions to the price and two
 * more for the same-visit work, because that is what the live trees ask. An earlier storyboard
 * assumed three; the extra two are `outlet_power_source` and
 * `device_on_exterior_wall`, and dropping them to shorten the animation would
 * have made this a demo of a product that does not exist.
 *
 * AUTOPLAY AND ASSISTIVE TECH. The frame is aria-hidden and paired with a
 * static summary, because a surface that rewrites itself every two seconds is
 * hostile to a screen reader. Reduced-motion users get the finished state and
 * a control to play it deliberately.
 */

type Flow = "primary" | "addOn";
type Scene =
  | { kind: "intro" }
  | { kind: "question"; flow: Flow; index: number }
  | { kind: "price" }
  | { kind: "offer" }
  | { kind: "cart" }
  | { kind: "schedule" }
  | { kind: "confirm" };

/**
 * How long each scene holds before the cursor moves on.
 *
 * PACED, NOT COMPRESSED. The walk is seven questions long because the live
 * tree is seven questions long, and the loop was never going to be twenty
 * seconds without dropping one of them — which would make this a demo of a
 * product that does not exist. So the questions move briskly, where the cursor
 * and the selection carry the meaning without needing to be read, and the time
 * is spent on the frames a contractor is actually being asked to believe:
 *
 *   price     a fixed price appeared, from five ordinary answers
 *   offer     $95 against $260, on a visit already booked
 *   cart      $280 became $375 without anyone making a phone call
 *   confirm   it finished — this is a booking, not a lead form
 *
 * Total ≈ 26s.
 */
const DWELL: Record<Scene["kind"], number> = {
  intro: 2400,
  question: 1300,
  price: 2900,
  offer: 2900,
  cart: 2900,
  schedule: 2100,
  confirm: 3700,
};

/**
 * The captured DTO, typed as the components need it.
 *
 * A cast rather than a schema: the fixture IS a ServiceFlowDTO — it came out
 * of the route handler that builds them — and `as const` on generated JSON
 * gives it literal types that no longer assign to the real DTO's wider ones.
 */
type IntroFields = {
  name: string;
  shortDescription: string | null;
  basePrice: number | null;
  startingPriceLabel: string | null;
  icon: string | null;
  ctaLabel: string | null;
  disclaimer: string | null;
  questions: QuestionDTO[];
};
const primaryDto = HERO_FLOW.primary.dto as unknown as IntroFields;
const addOnDto = HERO_FLOW.addOn.dto as unknown as IntroFields;

const questionsFor = (flow: Flow) => (flow === "primary" ? primaryDto.questions : addOnDto.questions);
const pathFor = (flow: Flow) => (flow === "primary" ? HERO_FLOW.primary.path : HERO_FLOW.addOn.path);

/** The scene list, derived from the captured path rather than written out. */
const SCENES: Scene[] = [
  { kind: "intro" },
  ...HERO_FLOW.primary.path.map((_, index) => ({ kind: "question" as const, flow: "primary" as Flow, index })),
  { kind: "price" },
  { kind: "offer" },
  ...HERO_FLOW.addOn.path.map((_, index) => ({ kind: "question" as const, flow: "addOn" as Flow, index })),
  { kind: "cart" },
  { kind: "schedule" },
  { kind: "confirm" },
];

const WINDOWS = HERO_FLOW.schedule.windows;
/** The window the demo picks: the first one, as a homeowner usually would. */
const CHOSEN_WINDOW = WINDOWS[0];

/**
 * The size the island is rendered at before it is scaled to fit.
 *
 * A real storefront page, not a hero-sized one: the components lay out for a
 * page and their proportions are part of what makes the frame read as the
 * product rather than as a widget.
 */
const PAGE_WIDTH = 820;
const PAGE_HEIGHT = 640;

/**
 * When the page is taller than the viewport, scroll it — do not shrink it.
 *
 * ServiceIntro carries a bespoke lifestyle photograph, so the real service
 * card is about 1,150px tall and its price and button sit below a 640px fold.
 * Every way of forcing that into the frame is a lie of a different size:
 * cropping hides the button, scaling down further makes the product look like
 * a widget, and dropping the image renders a component the storefront does not
 * render. A homeowner meeting that page scrolls, so the walkthrough scrolls,
 * and the photo and the CTA both get their moment.
 */
const SCROLL_START = 420;
const SCROLL_MS = 850;

export default function HeroWalkthrough() {
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [reduced, setReduced] = useState(false);
  const frameRef = useRef<HTMLDivElement | null>(null);
  const scalerRef = useRef<HTMLDivElement | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.6);
  const [scrolled, setScrolled] = useState(0);
  const [cursor, setCursor] = useState<{ x: number; y: number; pressed: boolean } | null>(null);

  /** Fit the page to whatever width the hero column actually has. */
  useEffect(() => {
    const el = scalerRef.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / PAGE_WIDTH);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const scene = SCENES[Math.min(step, SCENES.length - 1)];

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) {
        setPlaying(false);
        setStep(SCENES.length - 1);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const advance = useCallback(() => {
    setStep((s) => (s + 1 >= SCENES.length ? 0 : s + 1));
  }, []);

  /** Auto-advance. One timer per scene, cleared on every change. */
  useEffect(() => {
    if (!playing) return;
    const t = setTimeout(advance, DWELL[scene.kind]);
    return () => clearTimeout(t);
  }, [playing, scene, step, advance]);

  /**
   * Scroll this scene, if it is taller than the frame.
   *
   * Measured rather than configured: whatever the component renders decides
   * how far the page moves, so a service that gains or loses its photograph
   * needs no change here.
   */
  useEffect(() => {
    setScrolled(0);
    const page = pageRef.current;
    if (!page || reduced) return;
    const overflow = Math.max(0, page.scrollHeight - PAGE_HEIGHT);
    if (!overflow) return;
    const t = setTimeout(() => setScrolled(overflow), SCROLL_START);
    return () => clearTimeout(t);
  }, [scene, step, reduced]);

  /**
   * Move the pointer to whatever this scene is about to choose.
   *
   * The target is found by its rendered label rather than by a hook into the
   * component, because QuestionStep is the storefront's and this file does not
   * get to change it. That has a useful side effect: if the live label ever
   * stops matching the fixture, the cursor stops finding its target, and the
   * page looks wrong in the same breath that the drift check fails.
   */
  useEffect(() => {
    if (!playing || reduced) { setCursor(null); return; }
    const frame = frameRef.current;
    if (!frame) return;

    const label =
      scene.kind === "question" ? pathFor(scene.flow)[scene.index].optionLabel
      : scene.kind === "intro" ? "__cta"
      : scene.kind === "price" ? "__cta"
      : scene.kind === "offer" ? "__cta"
      : scene.kind === "cart" ? "__cta"
      : scene.kind === "schedule" ? CHOSEN_WINDOW.start
      : null;
    if (!label) { setCursor(null); return; }

    const place = () => {
      const box = frame.getBoundingClientRect();
      const nodes = Array.from(frame.querySelectorAll<HTMLElement>("button, [data-hero-target]"));
      const target =
        label === "__cta"
          ? nodes.find((n) => n.dataset.heroTarget === "cta") ?? nodes[nodes.length - 1]
          : nodes.find((n) => (n.textContent ?? "").includes(label));
      if (!target) { setCursor(null); return; }
      const t = target.getBoundingClientRect();
      setCursor({
        x: t.left - box.left + Math.min(t.width - 26, 84),
        y: t.top - box.top + t.height / 2,
        pressed: false,
      });
      // The press lands late in the dwell, so the pointer is seen travelling
      // first and clicking second.
      const press = setTimeout(() => setCursor((c) => (c ? { ...c, pressed: true } : c)), 380);
      return () => clearTimeout(press);
    };
    // Placed after the scroll settles: on a scene that moves, a pointer
    // measured at frame zero would aim at where the button used to be.
    const page = pageRef.current;
    const willScroll = !!page && page.scrollHeight - PAGE_HEIGHT > 1;
    let cancelPress: (() => void) | undefined;
    const t = setTimeout(() => { cancelPress = place(); },
                         willScroll ? SCROLL_START + SCROLL_MS + 60 : 60);
    return () => { clearTimeout(t); cancelPress?.(); };
  }, [scene, playing, reduced, step]);

  const answersSoFar = useMemo(() => {
    if (scene.kind !== "question") return {};
    const acc: Record<string, string> = {};
    for (let i = 0; i < scene.index; i++) {
      const s = pathFor(scene.flow)[i];
      acc[s.questionKey] = s.optionValue;
    }
    return acc;
  }, [scene]);

  /** The access class established by earlier answers, as the storefront does it. */
  const accessClass = useMemo(() => {
    if (scene.kind !== "question") return null;
    let cls: "ACCESSIBLE" | "FINISHED" | "UNKNOWN" | null = null;
    const qs = questionsFor(scene.flow);
    for (let i = 0; i < scene.index; i++) {
      const s = pathFor(scene.flow)[i];
      const q = qs.find((x) => x.key === s.questionKey);
      const o = q?.options.find((x) => x.value === s.optionValue) as AnswerOptionDTO | undefined;
      if (o?.accessClassification) cls = o.accessClassification;
    }
    return cls;
  }, [scene]);

  const currentQuestion = useMemo(() => {
    if (scene.kind !== "question") return null;
    const s = pathFor(scene.flow)[scene.index];
    return questionsFor(scene.flow).find((q) => q.key === s.questionKey) ?? null;
  }, [scene]);

  const restart = () => { setStep(0); setPlaying(true); };

  const primaryCents = HERO_FLOW.primary.priceCents;
  const sameVisitCents = HERO_FLOW.addOn.sameVisitCents ?? 0;
  const standaloneCents = HERO_FLOW.addOn.standaloneCents ?? 0;

  return (
    <div>
      <div
        ref={frameRef}
        aria-hidden="true"
        className="relative overflow-hidden rounded-[4px] border border-p2b-line bg-white shadow-[0_2px_6px_rgba(20,24,31,.05),0_18px_48px_rgba(20,24,31,.10)]"
      >
        {/* Price2Book's frame. The contractor's page, not Price2Book's. */}
        <div className="flex items-center gap-2.5 border-b border-[#EEEAE1] bg-p2b-surface-warm px-3.5 py-2.5">
          <span className="flex gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#DCD7CC]" />
            <span className="h-2 w-2 rounded-full bg-[#DCD7CC]" />
            <span className="h-2 w-2 rounded-full bg-[#DCD7CC]" />
          </span>
          <span className="flex-1 truncate rounded-sm bg-white px-2.5 py-1 text-[12px] text-p2b-muted">
            yourcompany.com/pricing
          </span>
        </div>

        {/* The island renders at a real page width and is then scaled to fit,
            exactly as a browser zoomed out would show it.
            The alternative — restyling the storefront components smaller — is
            the one thing this hero must not do: a shrunken copy is a copy, and
            it drifts. Scaling keeps the components untouched and keeps their
            proportions honest, and a clipped bottom edge reads as the page
            fold it actually is. */}
        <div ref={scalerRef} className="relative overflow-hidden" style={{ height: PAGE_HEIGHT * scale }}>
          <div
            className="origin-top-left"
            style={{ width: PAGE_WIDTH, height: PAGE_HEIGHT, transform: `scale(${scale})` }}
          >
            <div
              ref={pageRef}
              className="h-full transition-transform ease-in-out"
              style={{ transform: `translateY(${-scrolled}px)`, transitionDuration: `${SCROLL_MS}ms` }}
            >
        <StorefrontIsland>
          <div className="h-full bg-canvas px-5 py-5 sm:px-6">
            {/* The contractor's own header, small — the homeowner is on their
                site, not on Price2Book's. */}
            <div className="mb-4 flex items-center justify-between border-b border-cardline pb-3">
              <span className="text-[15px] font-semibold text-navy">{HERO_FLOW.identity.name}</span>
              <span className="text-[12px] text-slate">
                {step > SCENES.findIndex((s) => s.kind === "price") ? "1 service in your visit" : " "}
              </span>
            </div>

            {scene.kind === "intro" && (
              /* The storefront's own service card, from the first frame. It
                 brings the bespoke service photograph, the "Starting at"
                 handling, and the caveat that this service may not qualify for
                 an online price — which is derived from the live tree by the
                 capture (8 of 25 paths price) rather than asserted here. */
              <ServiceIntro
                name={primaryDto.name}
                description={primaryDto.shortDescription}
                basePrice={primaryDto.basePrice}
                startingPriceLabel={primaryDto.startingPriceLabel}
                icon={primaryDto.icon}
                serviceSlug={HERO_FLOW.primary.slug}
                directBook={false}
                mayNotQualify={HERO_FLOW.primary.mayNotQualify}
                ctaLabel={primaryDto.ctaLabel}
                disclaimer={primaryDto.disclaimer}
                isAddOn={false}
                standalonePrice={null}
                onContinue={advance}
              />
            )}

            {scene.kind === "question" && currentQuestion && (
              <QuestionStep
                key={`${scene.flow}-${currentQuestion.key}`}
                question={currentQuestion}
                answers={answersSoFar}
                accessClass={accessClass}
                onAnswer={() => advance()}
              />
            )}

            {scene.kind === "price" && (
              <PriceConfirmationCard
                serviceName={primaryDto.name}
                priceCents={primaryCents}
                disclaimer={null}
                onAddToVisit={() => advance()}
              />
            )}

            {scene.kind === "offer" && (
              <div>
                <h3 className="text-[19px] font-bold leading-[1.25] text-navy">
                  Anything else we can take care of while we&rsquo;re there?
                </h3>
                <p className="mt-1.5 text-[13px] text-slate">
                  Added to a visit already booked, so it costs less than its own trip.
                </p>
                {/* The same component again, in the mode it was built for:
                    isAddOn puts the same-visit price forward and strikes the
                    standalone one through beside it. The $95-against-$260
                    moment is the product's own rendering of it, not a
                    marketing drawing of it. */}
                <div className="mt-4">
                  <ServiceIntro
                    name={addOnDto.name}
                    description={addOnDto.shortDescription}
                    basePrice={sameVisitCents}
                    startingPriceLabel={addOnDto.startingPriceLabel}
                    icon={addOnDto.icon}
                    serviceSlug={HERO_FLOW.addOn.slug}
                    directBook={false}
                    mayNotQualify={HERO_FLOW.addOn.mayNotQualify}
                    ctaLabel={addOnDto.ctaLabel}
                    disclaimer={addOnDto.disclaimer}
                    isAddOn
                    standalonePrice={standaloneCents}
                    onContinue={advance}
                  />
                </div>
              </div>
            )}

            {scene.kind === "cart" && (
              <div>
                <h3 className="text-[19px] font-bold text-navy">Your visit</h3>
                <div className="mt-4 rounded-card border border-cardline bg-white">
                  <div className="flex items-center justify-between border-b border-cardline px-4 py-3">
                    <span className="text-[14px] text-navy">{primaryDto.name}</span>
                    <span className="text-[15px] font-semibold text-navy">{formatCents(primaryCents)}</span>
                  </div>
                  <div className="flex items-center justify-between border-b border-cardline px-4 py-3">
                    <div>
                      <div className="text-[14px] text-navy">{addOnDto.name}</div>
                      <div className="text-[12px] text-success">While We&rsquo;re There</div>
                    </div>
                    <span className="text-[15px] font-semibold text-success">{formatCents(sameVisitCents)}</span>
                  </div>
                  <div className="flex items-center justify-between px-4 py-3">
                    <span className="text-[14px] font-semibold text-navy">Total</span>
                    <span className="text-[20px] font-bold text-navy">{formatCents(HERO_FLOW.totalCents)}</span>
                  </div>
                </div>
                <button data-hero-target="cta"
                        className="mt-4 w-full rounded-pill bg-electric px-6 py-3 text-[15px] font-semibold text-white">
                  Continue to booking
                </button>
              </div>
            )}

            {scene.kind === "schedule" && (
              <div>
                <h3 className="text-[19px] font-bold text-navy">Choose a time that works for you</h3>
                <p className="mt-1.5 text-[13px] text-slate">Wednesday</p>
                <div className="mt-4 grid gap-2.5 sm:grid-cols-3">
                  {WINDOWS.map((w, i) => (
                    <div key={w.start}
                         className={`rounded-card border p-3 text-center ${
                           i === 0 ? "border-electric bg-white" : "border-cardline bg-white"}`}>
                      <div className="text-[14px] font-semibold text-navy">
                        {w.start.replace(":00", "").replace(" AM", "").replace(" PM", "")}–
                        {w.end.replace(":00", "").replace(" AM", "").replace(" PM", "")}
                      </div>
                      <div className="mt-1 text-[12px] text-slate">available</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {scene.kind === "confirm" && (
              <div className="py-2">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-success/10 text-xl text-success">
                  ✓
                </div>
                <h3 className="mt-3 text-[22px] font-bold text-navy">You&rsquo;re booked.</h3>
                <p className="mt-1.5 text-[14px] text-slate">
                  Wednesday, {CHOSEN_WINDOW.start} – {CHOSEN_WINDOW.end}
                </p>
                <div className="mt-4 rounded-card border border-cardline bg-white px-4 py-3">
                  <div className="text-[12px] font-semibold uppercase tracking-[0.07em] text-slate">
                    Your services
                  </div>
                  <div className="mt-2 flex items-center justify-between text-[14px] text-navy">
                    <span>{primaryDto.name}</span><span>{formatCents(primaryCents)}</span>
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[14px] text-navy">
                    <span>{addOnDto.name}</span><span>{formatCents(sameVisitCents)}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-cardline pt-2.5">
                    <span className="text-[14px] font-semibold text-navy">Total</span>
                    <span className="text-[17px] font-bold text-navy">{formatCents(HERO_FLOW.totalCents)}</span>
                  </div>
                </div>
                <p className="mt-3 text-[12px] text-slate">Confirmation sent.</p>
              </div>
            )}
          </div>
        </StorefrontIsland>
            </div>
          </div>
          {/* The fold. A page that ends mid-option is what a viewport does. */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-6 bg-gradient-to-t from-black/5 to-transparent" />
        </div>

        {/* The pointer. Decorative, and the only thing on screen that a
            homeowner would not see. */}
        {cursor && (
          <span
            className="pointer-events-none absolute z-10 transition-all duration-500 ease-out"
            style={{ left: cursor.x, top: cursor.y, transform: cursor.pressed ? "scale(.86)" : "scale(1)" }}
          >
            <svg width="20" height="22" viewBox="0 0 20 22" fill="none" aria-hidden="true">
              <path d="M2 1.6 17.2 10.4l-6.5 1.3 3 6.6-2.9 1.3-3-6.6-4.6 4.2z"
                    fill="#14181F" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
          </span>
        )}
      </div>

      {/* The attribution the storyboard closes on, and the controls. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <span className="text-[12px] text-p2b-muted-soft">
          Pricing &amp; booking powered by <span className="font-semibold text-p2b-muted">Price2Book</span>
        </span>
        <div className="flex items-center gap-3 text-[13px]">
          <button onClick={() => setPlaying((p) => !p)}
                  className="font-medium text-p2b-accent hover:text-p2b-accent-hover">
            {playing ? "Pause" : "Play"}
          </button>
          <button onClick={restart} className="font-medium text-p2b-muted hover:text-p2b-ink">
            Replay
          </button>
        </div>
      </div>

      {/* What the animation shows, for anyone it does not show it to. */}
      <p className="sr-only">
        A homeowner on {HERO_FLOW.identity.name}&rsquo;s own website answers{" "}
        {HERO_FLOW.primary.path.length} questions about a {primaryDto.name} — {" "}
        {HERO_FLOW.primary.path.map((s) => `${s.prompt} ${s.optionLabel}.`).join(" ")} — and is shown{" "}
        {formatCents(primaryCents)}. They add {addOnDto.name} at the same-visit price of{" "}
        {formatCents(sameVisitCents)} instead of {formatCents(standaloneCents)}, bringing the visit to{" "}
        {formatCents(HERO_FLOW.totalCents)}, and book the {CHOSEN_WINDOW.start} to {CHOSEN_WINDOW.end}{" "}
        arrival window. Every question and price shown is captured from a live contractor catalog.
      </p>
    </div>
  );
}
