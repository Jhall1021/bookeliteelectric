import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Compatibility route. `/sign-in` is canonical — see app/sign-in/page.tsx.
 *
 * Magic-link emails already sent carry `/admin` as their callback, and a
 * contractor who bookmarked this path should not meet a 404 because we renamed
 * a URL. Temporary (307) for the same reason as /why-elite: a permanent
 * redirect is cached indefinitely and is the hard one to walk back.
 */
export default function AdminLoginCompatPage() {
  redirect("/sign-in");
}
