/**
 * This storefront's diagnostic service.
 *
 * The guided flow used to reach the diagnostic by hard-coded slug —
 * `/api/services/electrical-troubleshooting` for the price, and a hard-coded
 * `panels-troubleshooting/electrical-troubleshooting` URL for the button. Both
 * are Elite's names for it. A second contractor whose diagnostic is called
 * anything else got a working price lookup for a service they may not have and
 * a button that 404s.
 *
 * More importantly, that was a SECOND way of answering a question the server
 * already answers during route resolution. This route and `routeResolver` now
 * call the same `findTroubleshootingService`, so the destination the customer
 * is shown and the destination `/api/visit` would send them to cannot disagree.
 */

import { NextResponse } from "next/server";
import { requireSiteFromRequest, withSite } from "@/lib/siteRouting";
import { findTroubleshootingService } from "@/lib/troubleshooting";

export async function GET(req: Request) {
  // ADR §2.2. The site identifier the caller carries decides the tenant —
  // never the resource being asked for.
  let site;
  try {
    site = await requireSiteFromRequest(req);
  } catch {
    return NextResponse.json({ error: "Unknown storefront." }, { status: 404 });
  }

  const found = await withSite(site, (db) =>
    findTroubleshootingService(db, site.contractorId)
  );

  if (!found.ok) {
    // The customer is not told which of the two it was, and neither is the
    // client — "this contractor has two diagnostic services" is an operator's
    // problem. It is logged where an operator will see it.
    console.error(
      `[troubleshooting] ${site.hostedSlug}: ${found.problem}`
    );
    return NextResponse.json(
      { error: "No diagnostic service." },
      { status: 404 }
    );
  }

  // A finished destination, not the parts to build one from.
  //
  // The customer-facing flow has no business assembling a URL out of a slug
  // and a category — that is identity-shaped data in a component whose whole
  // design rule is not to know whose storefront it is rendering. It gets a
  // path relative to the storefront root and a price to show.
  return NextResponse.json({
    id: found.service.id,
    name: found.service.name,
    basePrice: found.service.basePrice,
    path: `services/${found.service.categorySlug ?? "services"}/${found.service.slug}`,
  });
}
