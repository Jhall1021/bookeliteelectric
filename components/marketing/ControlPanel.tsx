import Image from "next/image";
import ScreenshotViewer from "./ScreenshotViewer";

/**
 * "Everything your customer sees traces back to something you control."
 *
 * The approved design leaves eight [screenshot] slots here. Filling them is
 * implementing the design, not replacing it — the handoff's instruction for
 * this section is "show real product screenshots as they become available".
 *
 * TWO DELIBERATE DEVIATIONS, both narrow:
 *
 * 1. The handoff's module list is prefixed "Possible modules", and one of the
 *    eight — While We're There™ — has no dedicated dashboard surface to
 *    photograph, while Storefront Design is a real, finished one. Showing the
 *    modules the product actually has is the more honest reading of a section
 *    whose entire claim is that the customer's experience traces back to a
 *    control. While We're There™ keeps its own full section above.
 *
 * 2. The storefront strip. The headline says "everything your customer sees",
 *    and the storefront IS that; the grid below is the controls behind it.
 *
 * Every screenshot is of a fictional demo contractor, never a real one. See
 * scripts/demo-contractor.ts for why that is a hard rule and not a preference.
 */

export type Shot = { src: string; alt: string; w: number; h: number } | null;

export type ControlPanelShots = {
  storefront: Shot;
  modules: Record<string, Shot>;
};

const MODULES = [
  "Services & Pricing",
  "Guided Pricing",
  "Storefront Design",
  "Hours & Availability",
  "Service Area",
  "Crew Eligibility",
  "Integrations",
  "Photo Review",
] as const;

export default function ControlPanel({ shots }: { shots: ControlPanelShots }) {
  return (
    <section className="border-t border-p2b-line bg-p2b-canvas-alt py-16 lg:py-20">
      <div className="mx-auto max-w-[1440px] px-5 lg:px-[88px]">
        <h2 className="max-w-[28ch] text-[28px] font-bold leading-[1.2] tracking-[-0.022em] lg:text-[38px]">
          Everything your customer sees traces back to something you control.
        </h2>

        {shots.storefront && (
          <figure className="mt-9 lg:mt-11">
            <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
              <Image
                src={shots.storefront.src}
                alt={shots.storefront.alt}
                width={shots.storefront.w}
                height={shots.storefront.h}
                sizes="(min-width: 1024px) 1264px, 100vw"
                priority={false}
                className="w-full"
              />
            </div>
            <figcaption className="mt-3 text-sm text-p2b-muted">
              A contractor’s storefront — the prices, services and design are theirs. Shown with a
              demonstration contractor.
            </figcaption>
          </figure>
        )}

        <ScreenshotViewer modules={MODULES} shots={shots.modules} />

      </div>
    </section>
  );
}
