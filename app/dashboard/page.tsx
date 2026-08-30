import Link from "next/link";
import { withAdminContractor } from "@/lib/adminContext";
import { PORTAL_GROUPS, PORTAL_MODULES } from "@/lib/portalModules";
import { findDefinition } from "@/lib/theme/definition";

export const dynamic = "force-dynamic";

/**
 * The contractor control panel.
 *
 * Its organising idea is the handoff's headline, and the page states it rather
 * than implying it:
 *
 *   "Everything your customer sees traces back to something you control."
 *
 * Grouped as a chain — what you sell, when you work, what they see, what
 * happens after — because that is the shape of the product. Not a wall of
 * equal tiles, and not a CRM: there is no Customers card, no Invoices card and
 * no Reports card, because those belong to the software the contractor already
 * runs and Price2Book does not replace it.
 *
 * The counts are real reads, not decoration. A dashboard whose numbers are
 * placeholder is worse than one with none: it teaches the contractor not to
 * trust the screen.
 */
export default async function PortalOverviewPage() {
  const data = await withAdminContractor(async (db, ctx) => {
    // The catalog splits four ways, and the difference matters: a
    // REMOTE_QUOTE service has no published price BY DESIGN, so counting it
    // alongside services that are merely unfinished invents work that does not
    // exist. "52 of 69" said seventeen were outstanding when thirteen were
    // correctly configured quote-only services.
    const QUOTE_ONLY = { bookingType: "REMOTE_QUOTE" as const };
    const [priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow] = await Promise.all([
      db.service.count({ where: { active: true, publishedPriceApprovedAt: { not: null } } }),
      db.service.count({ where: { active: true, ...QUOTE_ONLY } }),
      db.service.count({ where: { active: true, publishedPriceApprovedAt: null, NOT: QUOTE_ONLY } }),
      db.service.count({ where: { active: false } }),
      // Both pre-price states count as "waiting on you": a homeowner cannot
      // tell the difference between submitted and in review, and neither can act.
      db.quote.count({ where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } } }),
      db.contractor.findUniqueOrThrow({
        where: { id: ctx.contractorId },
        select: { themeFamily: true, themeVariant: true, themeVersion: true,
                  pricingStrategy: true, sites: { where: { active: true }, select: { hostedSlug: true }, take: 1 } },
      }),
    ]);
    return { priced, quoteOnly, needsPrice, hidden, awaitingReview, themeRow };
  });

  const design = findDefinition(
    data.themeRow.themeFamily, data.themeRow.themeVariant, data.themeRow.themeVersion);
  const site = data.themeRow.sites[0]?.hostedSlug ?? null;
  const total = data.priced + data.quoteOnly + data.needsPrice + data.hidden;

  return (
    <div>
      <header>
        <h1 className="font-display text-2xl font-bold text-navy">
          Everything your customer sees traces back to something you control.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-slate">
          This is where you set what can be priced and booked online. Keep running your
          business in the software you already use — Price2Book decides only what a homeowner
          can price and book.
        </p>
      </header>

      {/* Facts, not vanity metrics. Each one is something the contractor can act on. */}
      <dl className="mt-8 grid gap-4 sm:grid-cols-3">
        {/* Says what it counts. A contractor seeing "69 services" here and
            "75 services" on the catalog page would rightly wonder which
            screen was broken; the answer is the six they have hidden. */}
        <Stat label="Priced and bookable online" value={String(data.priced)}
              href="/dashboard/services"
              note={
                data.needsPrice > 0
                  ? `${data.needsPrice} more need a price before they can be booked`
                  : `Plus ${data.quoteOnly} quote-only, ${data.hidden} hidden`
              }
              tone={data.needsPrice > 0 ? "attention" : "calm"} />
        <Stat label="Waiting on your review" value={String(data.awaitingReview)}
              href="/dashboard/quotes"
              note={data.awaitingReview ? "Homeowners are waiting on a price" : "Nothing waiting"}
              tone={data.awaitingReview ? "attention" : "calm"} />
        <Stat label="Storefront design" value={design?.label ?? "Original layout"}
              href="/dashboard/design"
              note={site ? `price2book.com/${site}` : "No storefront address yet"} />
      </dl>

      {/* The whole catalog accounted for, so no number on this page is a
          mystery next to a number on another. */}
      <p className="mt-3 text-xs text-slate">
        Your catalog: <strong className="font-semibold text-navy">{total}</strong> services —{" "}
        {data.priced} priced and bookable, {data.quoteOnly} quote-only (a homeowner asks and you
        price it), {data.needsPrice} still needing a price, {data.hidden} hidden from customers.
      </p>

      {PORTAL_GROUPS.map((g) => {
        const mods = PORTAL_MODULES.filter((m) => m.group === g.key);
        if (!mods.length) return null;
        return (
          <section key={g.key} className="mt-10">
            <h2 className="font-display text-lg font-bold text-navy">{g.title}</h2>
            <p className="text-sm text-slate">{g.blurb}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {mods.map((m) => (
                <Link key={m.name} href={m.href}
                      className="rounded-card border border-cardline bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-electric">
                  <div className="font-display text-base font-bold text-navy">{m.name}</div>
                  <p className="mt-1 text-sm text-slate">{m.blurb}</p>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      {/* Stated, not merely implied. The narrow boundary is the sharpest thing
          this product has, and a dashboard is exactly where it erodes. */}
      <p className="mt-12 max-w-2xl border-t border-cardline pt-6 text-sm text-slate">
        Price2Book is pricing and booking software. Customers, invoices, payroll, dispatch and
        reporting stay in the system you already run — we hand the booked work across and get
        out of the way.
      </p>
    </div>
  );
}

function Stat(
  { label, value, note, href, tone = "calm" }:
  { label: string; value: string; note: string; href: string; tone?: "calm" | "attention" },
) {
  return (
    <Link href={href} className="rounded-card border border-cardline bg-white p-5 shadow-card transition hover:border-electric">
      <dt className="text-xs font-bold uppercase tracking-[0.12em] text-slate">{label}</dt>
      <dd className="mt-2 font-display text-2xl font-bold text-navy">{value}</dd>
      <dd className={`mt-1 text-sm ${tone === "attention" ? "text-electric" : "text-slate"}`}>{note}</dd>
    </Link>
  );
}
