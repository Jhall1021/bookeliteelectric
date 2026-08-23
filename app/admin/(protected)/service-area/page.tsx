import { prisma } from "@/lib/prisma";
import ServiceAreaForm from "@/components/admin/ServiceAreaForm";

export const dynamic = "force-dynamic";

export default async function ServiceAreaPage() {
  const [areas, zips] = await Promise.all([
    prisma.serviceArea.findMany({ orderBy: { name: "asc" } }),
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
  // counties that checkout doesn't actually honour.
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

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-navy">Service Area</h1>
      <p className="mt-1 text-sm text-slate">
        Where you&rsquo;ll travel. Checkout turns away any booking whose ZIP code
        isn&rsquo;t selected here.
      </p>

      {/* Worth saying plainly: this page can stop the business taking work.
          Checkout used to accept any ZIP because it created an empty service
          area on the fly to satisfy its own check. Now the list is real, which
          also makes an empty one a closed door. */}
      {totalSelected === 0 && zips.length > 0 && (
        <p className="mt-4 rounded-card border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Nothing selected.</strong> Nobody can book online until at least one
          county is ticked — checkout fails closed rather than accepting bookings from
          anywhere.
        </p>
      )}

      <ServiceAreaForm areas={areas} counties={counties} referenceLoaded={zips.length} />
    </div>
  );
}
