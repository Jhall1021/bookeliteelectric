import { Badge } from "./Badge";

/**
 * The one status badge for a service, shared by the dashboard's "Your
 * services" card and the Services & Pricing catalog/editor — one place
 * decides what "Live", "Approved", "Priced" and "Selected" mean, so the two
 * surfaces can never quietly disagree about the same service's state.
 *
 * "Live" alone would say the same thing for a healthy service and one with
 * an open blocker — exactly the contradiction the dashboard's "Your next
 * steps" card once produced by showing them side by side with no way to
 * tell them apart. A live service that still has a real finding gets its
 * own amber variant instead of a plain, all-clear "Live".
 */
export function ServiceStatusBadge({
  active, approved, priced, needsAttention,
}: { active: boolean; approved: boolean; priced: boolean; needsAttention: boolean }) {
  if (active && needsAttention) return <Badge tone="attention">Live · needs attention</Badge>;
  if (active) return <Badge tone="success">Live</Badge>;
  if (approved) return <Badge tone="info">Approved</Badge>;
  if (priced) return <Badge tone="neutral">Priced</Badge>;
  return <Badge tone="neutral">Selected</Badge>;
}
