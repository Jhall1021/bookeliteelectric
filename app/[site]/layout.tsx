import { requireHostedSite } from "@/lib/siteRouting";
import { SiteProvider } from "@/components/site/SiteContext";

/**
 * The storefront boundary — ADR §2.2.
 *
 * Resolves the site once, for every page beneath it, and renders nothing if it
 * does not resolve. `requireHostedSite` calls `notFound()`, so an unknown,
 * inactive or misspelled storefront is indistinguishable from a URL that never
 * existed.
 *
 * Pages still resolve the site themselves rather than relying on this. A
 * layout runs before its children, but nothing in the type system says a page
 * may not be rendered another way, and "the layout already checked" is the
 * kind of assumption that is true until someone adds a route. This is the
 * boundary for the CLIENT half: it provides the identifier that customer-facing
 * fetches attach.
 */
export default async function SiteLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { site: string };
}) {
  const site = await requireHostedSite(params.site);
  return (
    <SiteProvider publicId={site.publicId} hostedSlug={site.hostedSlug}>
      {children}
    </SiteProvider>
  );
}
