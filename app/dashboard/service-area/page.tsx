import { prisma } from "@/lib/prisma";
import ServiceAreaForm from "@/components/admin/ServiceAreaForm";
import { withAdminContractor } from "@/lib/adminContext";

export const dynamic = "force-dynamic";

export default async function ServiceAreaPage() {
  // Service areas are this contractor's coverage. ZipCode is platform
  // reference data — the same US ZIP list for everyone — so it stays on the
  // unguarded client where the guard passes it through anyway.
  const areas = await withAdminContractor((db) =>
    db.serviceArea.findMany({ orderBy: { name: "asc" } })
  );
  const [zips] = await Promise.all([
    prisma.zipCode.findMany({
      select: { zip: true, state: true, county: true, type: true, population: true },
    }),
  ]);

  // Counties available to choose from, with how many ZIPs in each someone
  // could actually live at — and how many are currently selected.
  //
  // `selected` is computed HERE rather than in the browser because the
  // browser only knows a county's ZIPs after the drill-down is opened. The
  // first version left the checkbox unticked until you expanded the county,
  // which made a selected county look unselected.
  // The single territory's ZIPs. Not flattened across every record — Elite
  // has one territory, and counting a second one's ZIPs here would tick
  // counties that checkout doesn't actually honor.
  const chosen = new Set(areas[0]?.zipCodes ?? []);
  const map = new Map<
    string,
    { state: string; county: string; total: number; usable: number; selected: number }
  >();
  for (const z of zips) {
    const key = `${z.state}/${z.county}`;
    const c = map.get(key) ?? {
      state: z.state, county: z.county, total: 0, usable: 0, selected: 0,
    };
    c.total++;
    if (z.type === "STANDARD" && (z.population ?? 0) > 0) c.usable++;
    if (chosen.has(z.zip)) c.selected++;
    map.set(key, c);
  }
  const counties = [...map.values()].sort(
    (a, b) => a.state.localeCompare(b.state) || a.county.localeCompare(b.county)
  );

  const totalSelected = areas[0]?.active ? areas[0].zipCodes.length : 0;
  const selectedCounties = counties.filter((c) => c.selected > 0).length;

  return (
    <div className="mx-auto w-full max-w-5xl">
      <header className="border-b border-cardline pb-6">
        <p className="text-xs font-bold uppercase tracking-[0.12em] text-electric">Booking coverage</p>
        <h1 className="mt-1 font-display text-2xl font-bold text-navy">Service Area</h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-slate">
          Choose where you are willing to take online bookings. Price2Book checks the customer&rsquo;s ZIP code at checkout and only allows work inside this area.
        </p>
      </header>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Selected ZIP codes</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy">{totalSelected}</p>
          <p className="mt-1 text-xs text-slate">ZIP codes currently accepted at checkout.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Counties covered</p>
          <p className="mt-1 font-display text-2xl font-bold text-navy">{selectedCounties}</p>
          <p className="mt-1 text-xs text-slate">Counties with at least one selected ZIP code.</p>
        </div>
        <div className="rounded-card border border-cardline bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate">Checkout rule</p>
          <p className="mt-1 text-sm font-semibold text-navy">Outside area = no booking</p>
          <p className="mt-1 text-xs leading-5 text-slate">Price2Book fails closed instead of quietly accepting work outside your territory.</p>
        </div>
      </div>

      {totalSelected === 0 && zips.length > 0 && (
        <div className="mt-6 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Your online service area is empty.</p>
          <p className="mt-1 leading-6">Nobody can complete a booking until at least one county or ZIP code is selected below.</p>
        </div>
      )}

      <section className="mt-6 overflow-hidden rounded-card border border-cardline bg-white shadow-card">
        <div className="border-b border-cardline bg-warmwhite px-5 py-4 sm:px-6">
          <h2 className="font-display text-lg font-bold text-navy">Coverage by county</h2>
          <p className="mt-1 text-sm text-slate">Select the counties you serve, then fine-tune individual ZIP codes when needed.</p>
        </div>
        <div className="p-5 sm:p-6">
          <ServiceAreaForm areas={areas} counties={counties} referenceLoaded={zips.length} />
        </div>
      </section>
    </div>
  );
}
