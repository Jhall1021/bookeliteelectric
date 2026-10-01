import Link from "next/link";

type Props = {
  browseHref?: string;
  variant?: "service" | "list" | "directory";
};

/**
 * One explanation everywhere a homeowner first encounters standalone pricing.
 * Whether it is shown is decided by the caller from the current visit and the
 * contractor's live same-visit capability; this component owns only the copy.
 */
export default function FirstServicePricingNotice({
  browseHref,
  variant = "service",
}: Props) {
  const message = variant === "directory"
    ? "Your first selection establishes the visit price. After you add a service to My Visit, eligible additional work will show lower While We’re There pricing."
    : variant === "list"
      ? "Prices shown below are first-service prices. Add a service to My Visit to see lower While We’re There pricing on eligible additional work."
      : "Any price shown below includes making this the first service of your visit. Add a service to My Visit to see lower While We’re There pricing on eligible additional work.";

  return (
    <aside className="border-b border-blue-200 bg-blue-50 px-6 py-4 sm:px-8" role="note">
      <p className="font-display text-sm font-bold text-navy">First service pricing</p>
      <p className="mt-1 text-sm leading-6 text-slate">{message}</p>
      {browseHref && (
        <Link
          href={browseHref}
          className="mt-2 inline-flex text-sm font-semibold text-electric hover:underline"
        >
          Browse services
        </Link>
      )}
    </aside>
  );
}
