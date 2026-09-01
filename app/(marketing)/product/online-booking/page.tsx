import type { Metadata } from "next";
import Link from "next/link";
import { HERO_FLOW } from "@/components/marketing/heroFlow";
import { INTEGRATIONS } from "@/components/marketing/content";

/**
 * /product/online-booking — SITEMAP.md.
 *
 * ITS NARROW JOB: prove Price2Book does not expose a calendar. It turns the
 * work actually being booked into appointment choices that respect the
 * contractor's hours and operating rules.
 *
 * EVERY CLAIM HERE WAS READ OUT OF THE SCHEDULER FIRST, and one intended claim
 * was dropped because the code does not support it — see
 * docs/debt/crew-size-not-in-availability-2026-09-01.md. What survived:
 *
 *   the whole visit    app/[site]/checkout/schedule sums estimatedMinutes
 *                      across EVERY line item, primary and same-visit alike
 *   the real minutes   lib/pricing adds branch.addScheduleMinutes and
 *                      component.addScheduleMinutes × quantity, so an answer
 *                      that lengthens the job lengthens the appointment
 *   fails closed       a line item with no estimate yields no duration at all
 *                      rather than an optimistic one
 *   ends in the day    fitsInTheDay refuses a window the visit would outlast
 *   two authorities    EXTERNAL asks the provider; NATIVE counts the
 *                      contractor's declared concurrent-job capacity
 *   never invents      an undeclared or unconfigured contractor raises rather
 *                      than showing an empty day or a hopeful one
 *
 * NOT CLAIMED: that the crew a visit needs is an input to availability. It
 * isn't, and the marketing site does not get to paper over that.
 */
export const metadata: Metadata = {
  title: "Online booking — appointment times that fit the work being booked",
  description:
    "Price2Book doesn’t publish your calendar. It works out how long the visit will actually take, including anything added to it, and offers only the arrival windows that can hold it inside the hours you opened.",
  alternates: { canonical: "/product/online-booking" },
};

export const dynamic = "force-dynamic";

const SHELL = "mx-auto max-w-[1440px] px-5 lg:px-[88px]";

const S = HERO_FLOW.schedule;
const PRIMARY = HERO_FLOW.primary;
const ADD_ON = HERO_FLOW.addOn;

/** "80" → "1 hr 20 min", the way a contractor says it. */
const duration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return [h ? `${h} hr` : null, m ? `${m} min` : null].filter(Boolean).join(" ");
};

const INTEGRATION_NOTE = INTEGRATIONS.find((i) => i.status === "Available");

export default function OnlineBookingPage() {
  return (
    <main>
      <section className={`${SHELL} pb-10 pt-12 lg:pb-12 lg:pt-[76px]`}>
        <div className="mb-5 flex items-center gap-2.5">
          <div className="h-0.5 w-[26px] bg-p2b-accent" />
          <span className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-accent lg:text-xs">
            Online booking
          </span>
        </div>
        <h1 className="max-w-[19ch] text-[40px] font-bold leading-[1.04] tracking-[-0.022em] lg:text-[64px]">
          Not your calendar. The times that fit the work.
        </h1>
        <p className="mt-6 max-w-[68ch] text-[17px] leading-[1.55] text-p2b-ink-warm lg:text-xl">
          Price2Book doesn’t publish your schedule and let people pick from it. It works out how
          long this particular visit will take — including anything added to it — and offers only
          the arrival windows that can actually hold it.
        </p>
      </section>

      {/* The arithmetic, on the real visit the demo builds. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              More work means more time.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              The visit’s length is the sum of everything on it — the job they came for and every
              same-visit addition they accepted. Add work and the appointment grows; the windows on
              offer change with it.
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-p2b-muted">
              Answers count too. A question whose answer means a longer run, or a quantity of two
              instead of one, lengthens the appointment the same way — because the minutes come from
              the same place the price does.
            </p>
          </div>
          <div className="lg:col-span-7">
            <div className="overflow-hidden rounded-[3px] border border-p2b-line bg-white">
              <div className="flex items-center justify-between gap-4 border-b border-p2b-line-soft px-6 py-4">
                <span className="text-[15px]">{PRIMARY.name}</span>
                <span className="text-[15px] font-semibold">{duration(PRIMARY.estimatedMinutes ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 border-b border-p2b-line-soft px-6 py-4">
                <div>
                  <div className="text-[15px]">{ADD_ON.name}</div>
                  <div className="text-[12px] text-p2b-green-deep">Added While We’re There™</div>
                </div>
                <span className="text-[15px] font-semibold">{duration(ADD_ON.estimatedMinutes ?? 0)}</span>
              </div>
              <div className="flex items-center justify-between gap-4 bg-p2b-accent-tint px-6 py-4">
                <span className="text-[15px] font-semibold text-p2b-accent">This visit needs</span>
                <span className="text-[20px] font-bold text-p2b-accent">{duration(S.visitMinutes)}</span>
              </div>
            </div>
            <div className="mt-4 rounded-[3px] border border-p2b-line bg-white px-6 py-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.09em] text-p2b-muted-soft">
                Windows on a working day · {S.hours.dayStart}–{S.hours.dayEnd}
              </div>
              <div className="mt-3.5 grid gap-2.5 sm:grid-cols-3">
                {S.windows.map((w) => (
                  <div key={w.start} className="rounded-sm border border-[#CFE3D8] bg-[#F3F9F5] p-3 text-center">
                    <div className="text-[14px] font-semibold">
                      {w.start.replace(":00", "")}–{w.end.replace(":00", "")}
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3.5 text-[14px] leading-[1.55] text-p2b-muted">
                A window is only offered when the visit can finish inside the working day. Nobody
                can book a job that would run past the time your crews go home.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How the window is decided — the chain, in order. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <h2 className="max-w-[26ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
          How Price2Book decides what to offer.
        </h2>
        <p className="mt-4 max-w-[78ch] text-[16px] leading-[1.6] text-p2b-muted lg:text-[17px]">
          In this order, every time. The homeowner chooses a time last, which is why nothing has to
          be reserved or held while they are still deciding what work they want.
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:mt-10 lg:grid-cols-4">
          {[
            { n: "01", t: "What is on the visit", b: "The job they came for, plus every same-visit addition they accepted." },
            { n: "02", t: "How long that takes", b: "Each service’s own minutes, adjusted by the answers they gave and the quantities they chose." },
            { n: "03", t: "Which windows can hold it", b: "Your arrival windows, filtered to the ones the visit can finish inside — measured against the end of your working day." },
            { n: "04", t: "Whether you have room", b: "Your provider’s calendar, or the concurrent-job capacity you declared. Checked again at checkout, in case the day filled up while they typed." },
          ].map((s) => (
            <div key={s.n} className="rounded-[3px] border border-p2b-line bg-white px-5 py-5">
              <div className="text-[13px] font-bold text-p2b-accent">{s.n}</div>
              <div className="mt-2.5 text-[17px] font-semibold leading-[1.25]">{s.t}</div>
              <p className="mt-2 text-[15px] leading-[1.5] text-p2b-muted">{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Whose calendar is authoritative. */}
      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-10 lg:grid-cols-12 lg:gap-12`}>
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              Keep your scheduling system, or use ours.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              One of the two is always authoritative, and Price2Book never guesses which. A
              contractor who hasn’t said gets an error, not an empty day and not a hopeful one.
            </p>
            {INTEGRATION_NOTE && (
              <Link href="/#integrations"
                    className="mt-6 inline-block text-[15px] font-semibold text-p2b-accent hover:text-p2b-accent-hover">
                What connects today <span aria-hidden="true">→</span>
              </Link>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-7">
            <div className="rounded-[3px] border border-p2b-line border-t-[3px] border-t-p2b-accent bg-white px-6 py-5">
              <div className="text-[17px] font-bold text-p2b-accent">Your platform decides</div>
              <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-ink-warm">
                Availability reads your real calendar — your crews, your jobs, your time off. Booked
                work lands back in the system you already run.
              </p>
              <p className="mt-3 text-[14px] leading-[1.5] text-p2b-muted">
                If nobody is marked bookable from the website, Price2Book refuses to offer windows
                at all rather than offering every one of them.
              </p>
            </div>
            <div className="rounded-[3px] border border-p2b-line border-t-[3px] border-t-p2b-green bg-white px-6 py-5">
              <div className="text-[17px] font-bold text-p2b-green">Price2Book decides</div>
              <p className="mt-2.5 text-[15px] leading-[1.55] text-p2b-ink-warm">
                No field-service platform? Tell us how many jobs you can run at once and that is the
                whole answer, counted against the bookings we already hold.
              </p>
              <p className="mt-3 text-[14px] leading-[1.5] text-p2b-muted">
                It assigns nobody and holds no roster. Who goes is still your call — the same way it
                was before Price2Book existed.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Contractor control, and the honest failure mode. */}
      <section className={`${SHELL} py-14 lg:py-[72px]`}>
        <div className="grid gap-10 lg:grid-cols-12 lg:gap-12">
          <div className="lg:col-span-5">
            <h2 className="max-w-[22ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[38px]">
              You decide what can be booked.
            </h2>
            <p className="mt-5 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Which days you work, when crews start and finish, how wide an arrival window you are
              willing to promise. Windows are generated from those answers — they are not a
              calendar anyone browses.
            </p>
          </div>
          <div className="flex flex-col gap-3.5 lg:col-span-7">
            {[
              {
                t: "Your hours make the windows",
                b: `Crews start and finish when you say. A ${duration(S.hours.windowMinutes)} arrival window is a promise you chose to make, not a default.`,
              },
              {
                t: "A day with no room shows no windows",
                b: "Not a full-looking calendar with everything grayed out, and never a window Price2Book cannot honor. If there is nothing to offer, there is nothing to click.",
              },
              {
                t: "The last check happens at checkout",
                b: "The window is confirmed again the moment they book, because a day can fill while somebody is typing their address.",
              },
              {
                t: "Out of your area, out of the question",
                b: "Checkout turns away a booking whose ZIP code isn’t in the area you selected. An area you haven’t configured takes no bookings rather than all of them.",
              },
            ].map((c) => (
              <div key={c.t} className="rounded-[3px] border border-p2b-line border-l-[3px] border-l-p2b-accent bg-white px-6 py-5">
                <div className="text-[17px] font-semibold">{c.t}</div>
                <p className="mt-2 text-[15px] leading-[1.55] text-p2b-muted lg:text-base">{c.b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-p2b-line bg-p2b-canvas-alt py-14 lg:py-[72px]">
        <div className={`${SHELL} grid gap-8 lg:grid-cols-12 lg:items-center lg:gap-12`}>
          <div className="lg:col-span-6">
            <h2 className="max-w-[20ch] text-[28px] font-bold leading-[1.15] tracking-[-0.022em] lg:text-[36px]">
              See the whole path.
            </h2>
            <p className="mt-4 text-[17px] leading-[1.6] text-p2b-ink-warm">
              Pricing decides what belongs on the visit. Booking decides when that visit can happen.
              The demonstration runs both, end to end.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:col-span-6">
            <Link href="/#demo"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                Try it as a homeowner <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                Price a real service, add same-visit work, and pick a window.
              </p>
            </Link>
            <Link href="/product/while-were-there"
                  className="group rounded-[3px] border border-p2b-line bg-white px-6 py-5 hover:border-p2b-accent">
              <div className="text-[17px] font-semibold group-hover:text-p2b-accent">
                While We’re There™ <span aria-hidden="true">→</span>
              </div>
              <p className="mt-1.5 text-[15px] leading-[1.5] text-p2b-muted">
                What can be added to a visit, and the price that applies when it is.
              </p>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
