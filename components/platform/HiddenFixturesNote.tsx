/**
 * "N temporary verifier contractors hidden." Shown wherever a platform page
 * lists contractors, so a probe a verification run is using is never taken
 * for a business — and so the count is never silently wrong. Renders nothing
 * when nothing was hidden.
 */
export function HiddenFixturesNote({ hidden }: { hidden: number }) {
  if (hidden <= 0) return null;
  const many = hidden !== 1;
  return (
    <p className="mt-3 rounded-md border border-p2b-line bg-warmwhite px-3 py-2 text-xs text-slate">
      {hidden} temporary verifier contractor{many ? "s" : ""} hidden from this page — {many ? "they are" : "it is"} being used by a
      verification run and {many ? "remove themselves" : "removes itself"} when it finishes. Not {many ? "businesses" : "a business"} to onboard.
    </p>
  );
}
