import { resolvePlatformActor } from "@/lib/platformContext";

export const dynamic = "force-dynamic";

/**
 * The proof page. It states who the platform thinks you are and on what
 * authority, and nothing else. No contractor is selected here and no
 * contractor data is read — the shell is the deliverable in Phase 1, and this
 * page exists so that a person can see the boundary hold from the inside.
 */
export default async function PlatformHome() {
  const actor = await resolvePlatformActor();
  return (
    <section className="rounded-card border border-cardline bg-white p-5 shadow-card">
      <h1 className="font-display text-lg font-bold text-navy">You are platform staff</h1>
      <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
        <dt className="text-slate">Signed in as</dt>
        <dd className="text-navy">{actor.email}</dd>
        <dt className="text-slate">Platform role</dt>
        <dd className="text-navy">{actor.role}</dd>
        <dt className="text-slate">Granted</dt>
        <dd className="text-navy">{actor.grantedAt.toISOString().slice(0, 10)}</dd>
        <dt className="text-slate">Authority</dt>
        <dd className="text-navy">A non-revoked PlatformAccess record for your user id. Nothing else.</dd>
      </dl>
      <p className="mt-5 text-sm text-slate">
        No contractor is selected, and this page reads no contractor data. Entering a
        contractor goes through one guarded door, and that door is not open yet.
      </p>
    </section>
  );
}
