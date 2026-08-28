"use client";

import Image from "next/image";
import Link from "next/link";
import ServiceFinder from "@/components/home/ServiceFinder";
import { useStructure } from "@/components/theme/ThemeContext";
import { useStorefront } from "@/components/theme/StorefrontContext";

/**
 * The storefront hero, in two compositions — ADR-015 Phase 3.
 *
 * SPLIT reads as two columns on a dark ground: copy and booking entry on the
 * left, photograph on the right. The eye starts at the headline and travels
 * down one side.
 *
 * CENTERED reads as one column on the light ground, with the booking entry as
 * the focal object rather than one item in a stack, the same-visit rungs as a
 * horizontal strip, and the photograph as a full-bleed band underneath. The
 * eye starts in the middle and moves down the page.
 *
 * They are different pages in greyscale, which is the point. A variant that
 * only changes colour is a skin.
 *
 * The branch is on STRUCTURE, never on which contractor is being rendered.
 *
 * The WORDS are not this component's to choose. "Skip the Estimate. Know Your
 * Price" is a flat-rate promise, and a contractor billing time and materials
 * cannot keep it. Copy arrives from the pricing layer; the hero decides only
 * where it sits and how large it is.
 */
export type HeroProps = {
  base: string;
  ladder: readonly { label: string; price: string; muted?: boolean }[];
  differentiators: readonly string[];
};

export default function Hero(props: HeroProps) {
  const { hero } = useStructure();
  if (hero === "centered") return <CenteredHero {...props} />;
  if (hero === "banner") return <BannerHero {...props} />;
  return <SplitHero {...props} />;
}

function Headline({ children }: { children: React.ReactNode }) {
  const { headline } = useStructure();
  return headline === "light-caps" ? (
    <h1 className="font-display text-3xl font-light uppercase leading-tight tracking-[0.08em] md:text-4xl">
      {children}
    </h1>
  ) : (
    <h1 className="font-display text-4xl font-bold leading-tight md:text-5xl">{children}</h1>
  );
}

/** The same-visit rungs. Stacked inside a card in SPLIT, a strip in CENTERED. */
function Ladder({ ladder, strip }: { ladder: HeroProps["ladder"]; strip: boolean }) {
  if (strip) {
    return (
      <div className="mt-10 grid gap-px overflow-hidden rounded-card bg-line sm:grid-cols-2">
        {ladder.map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-4 bg-surface px-5 py-3">
            <span className="text-sm text-ink">{row.label}</span>
            <span className={`text-sm font-semibold ${row.muted ? "text-positive" : "text-ink"}`}>
              {row.price}
            </span>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-2.5 divide-y divide-line border-t border-line">
      {ladder.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-4 px-5 py-1.5">
          <span className="text-[13px] text-ink">{row.label}</span>
          <span className={`text-[13px] font-semibold ${row.muted ? "text-positive" : "text-ink"}`}>
            {row.price}
          </span>
        </div>
      ))}
    </div>
  );
}

const HERO_IMAGE = {
  src: "/images/hero-kitchen.jpg",
  alt: "An electrician showing a homeowner a quote on a tablet in her kitchen",
};

function SplitHero({ base, ladder, differentiators }: HeroProps) {
  const { heroAside } = useStructure();
  const { copy } = useStorefront();
  return (
    <section className="bg-ink text-accent-ink">
      <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-2 md:items-center">
        <div>
          <Headline>{copy.headline}</Headline>
          <p className="mt-4 text-lg text-muted-soft">{copy.subhead}</p>

          {/* The same-visit callout. Warm card against the dark ground so it
              reads as a distinct object rather than more hero copy — the one
              place on this page where the palette inverts, which is what earns
              it attention without a badge or a starburst. */}
          <div className="mt-6 max-w-[30rem] overflow-hidden rounded-card bg-canvas text-ink shadow-card">
            <div className="px-5 pt-3.5">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
                Add more in the same visit
              </div>
              <p className="mt-1 font-display text-base font-bold leading-snug">
                Additional services use our same-visit pricing.
              </p>
              <p className="mt-1 text-[13px] leading-snug text-muted">{copy.sameVisitBody}</p>
            </div>
            <Ladder ladder={ladder} strip={heroAside === "strip"} />
          </div>

          <div className="mt-6">
            <ServiceFinder tone="dark" />
          </div>

          <div className="mt-6 flex max-w-[30rem] flex-wrap gap-3">
            <Link
              href={`${base}/services`}
              className="ray-accent rounded-pill bg-accent px-7 py-3.5 text-base font-semibold text-accent-ink transition hover:bg-accent-hover"
            >
              {copy.primaryCta}
            </Link>
            <Link
              href={`${base}/troubleshooting`}
              className="rounded-pill border border-accent-ink/30 px-7 py-3.5 text-base font-semibold text-accent-ink transition hover:bg-accent-ink/10"
            >
              I Don&rsquo;t Know What&rsquo;s Wrong
            </Link>
          </div>

          <ul className="mt-8 grid gap-2 text-sm text-muted-soft sm:grid-cols-3">
            {differentiators.map((item) => (
              <li key={item} className="flex items-start gap-2">
                <span className="mt-0.5 text-positive">✓</span>
                {item}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative aspect-[4/3] overflow-hidden rounded-card">
          <Image src={HERO_IMAGE.src} alt={HERO_IMAGE.alt} fill priority
                 className="object-cover" sizes="(min-width: 768px) 50vw, 100vw" />
        </div>
      </div>
    </section>
  );
}

function CenteredHero({ base, ladder, differentiators }: HeroProps) {
  const { heroAside } = useStructure();
  const { copy } = useStorefront();
  return (
    <section className="bg-canvas text-ink">
      <div className="mx-auto max-w-3xl px-6 pb-14 pt-20 text-center">
        <Headline>{copy.headline}</Headline>
        <p className="mx-auto mt-5 max-w-xl text-lg text-muted">{copy.subhead}</p>

        {/* The booking entry is the focal object here rather than one item in
            a stack, so it gets the width and the position the headline would
            otherwise keep to itself — and no container, because a panel would
            make it look like an aside again. */}
        <div className="mx-auto mt-9 max-w-xl">
          <ServiceFinder tone="light" />
        </div>

        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link
            href={`${base}/services`}
            className="rounded-pill bg-accent px-7 py-3.5 text-base font-semibold text-accent-ink transition hover:bg-accent-hover"
          >
            {copy.primaryCta}
          </Link>
          <Link
            href={`${base}/troubleshooting`}
            className="rounded-pill border border-line px-7 py-3.5 text-base font-semibold text-ink transition hover:border-accent hover:text-accent"
          >
            I Don&rsquo;t Know What&rsquo;s Wrong
          </Link>
        </div>

        <ul className="mt-9 flex flex-wrap justify-center gap-x-7 gap-y-2 text-sm text-muted">
          {differentiators.map((item) => (
            <li key={item} className="flex items-center gap-2">
              <span className="text-positive">✓</span>
              {item}
            </li>
          ))}
        </ul>

        <div className="mx-auto max-w-xl">
          <div className="mt-12 text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            Add more in the same visit
          </div>
          <Ladder ladder={ladder} strip={heroAside === "strip"} />
        </div>
      </div>

      {/* Full-bleed band rather than a column-mate. The photograph stops being
          a companion to the copy and becomes the transition into the page. */}
      <div className="relative h-[22rem] w-full overflow-hidden md:h-[26rem]">
        <Image src={HERO_IMAGE.src} alt={HERO_IMAGE.alt} fill priority
               className="object-cover" sizes="100vw" />
      </div>
    </section>
  );
}


/**
 * BANNER leads with the photograph at full bleed and the headline over it, so
 * the page opens on the work rather than on words. The booking entry and the
 * supporting rungs follow underneath on the light ground.
 *
 * Structurally the opposite of SPLIT, where the image is a companion to the
 * copy, and of CENTERED, where there is no image above the fold at all.
 */
function BannerHero({ base, ladder, differentiators }: HeroProps) {
  const { heroAside } = useStructure();
  const { copy } = useStorefront();
  return (
    <section className="bg-canvas text-ink">
      <div className="relative h-[26rem] w-full overflow-hidden md:h-[32rem]">
        <Image src={HERO_IMAGE.src} alt={HERO_IMAGE.alt} fill priority
               className="object-cover" sizes="100vw" />
        {/* A scrim rather than a flat overlay: the headline needs a readable
            ground without hiding the photograph it is sitting on. `ink` is the
            theme's dark, so this darkens toward the palette rather than toward
            an arbitrary black. */}
        <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/45 to-ink/10" />
        <div className="absolute inset-0 flex items-end">
          <div className="mx-auto w-full max-w-6xl px-6 pb-10 text-accent-ink">
            <Headline>{copy.headline}</Headline>
            <p className="mt-3 max-w-xl text-lg text-accent-ink/80">{copy.subhead}</p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_20rem] md:items-start">
          <div>
            <ServiceFinder tone="light" />
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href={`${base}/services`}
                    className="rounded-pill bg-accent px-7 py-3.5 text-base font-semibold text-accent-ink transition hover:bg-accent-hover">
                {copy.primaryCta}
              </Link>
              <Link href={`${base}/troubleshooting`}
                    className="rounded-pill border border-line px-7 py-3.5 text-base font-semibold text-ink transition hover:border-accent hover:text-accent">
                I Don&rsquo;t Know What&rsquo;s Wrong
              </Link>
            </div>
            <ul className="mt-8 flex flex-wrap gap-x-7 gap-y-2 text-sm text-muted">
              {differentiators.map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="text-positive">✓</span>
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <div>
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
              Add more in the same visit
            </div>
            <Ladder ladder={ladder} strip={heroAside === "strip"} />
          </div>
        </div>
      </div>
    </section>
  );
}
