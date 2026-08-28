import { redirect } from "next/navigation";

/**
 * Compatibility route — ADR-016.
 *
 * This path was the canonical one while Elite was the only tenant. It is a
 * live URL with real links and bookmarks pointing at it, so it keeps
 * resolving; the canonical route is now /why-us.
 *
 * The redirect is unconditional. It does NOT check whether this storefront
 * belongs to Elite: a route that behaved one way for one contractor and
 * another way for everyone else is exactly the branching the storefront is
 * built to avoid, and "only Elite has old links" is an assumption that stops
 * being true the first time anyone else's URL changes.
 *
 * TEMPORARY (307) on purpose, for now. A 308 is cached by browsers
 * indefinitely and is the hard one to walk back, so it waits until external
 * links are observed behaving — search results, the Google Business profile,
 * anything printed. Promoting it is one import and one call:
 * `permanentRedirect` in place of `redirect`.
 */
export default function WhyElitePage({ params }: { params: { site: string } }) {
  redirect(`/${params.site}/why-us`);
}
