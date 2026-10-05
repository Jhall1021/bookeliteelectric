/** Existing-device jobs that can reuse one completed answer set for several
 * matching items. Every copy remains a separate visit line item. */
const REPEAT_SAME_SCOPE = new Map<string, string>([
  ["replace-standard-outlet", "outlet"],
  ["replace-gfci-outlet", "GFCI outlet"],
  ["replace-standard-switch", "switch"],
  ["replace-3-way-switch", "3-way switch"],
  ["replace-led-dimmer", "dimmer"],
  ["customer-supplied-smart-switch", "smart switch"],
  ["smart-switch-upgrade", "smart switch"],
  ["customer-supplied-non-smart-outlet", "outlet"],
  ["usb-outlet-upgrade", "USB outlet"],
  ["smart-outlet-upgrade", "smart outlet"],
  ["occupancy-motion-switch", "motion-sensor switch"],
  ["timer-switch-install", "timer switch"],
  ["replace-interior-light-fixture", "interior light fixture"],
  ["replace-exterior-light-fixture", "exterior light fixture"],
  ["replace-motion-flood-light", "motion or flood light"],
  ["replace-wall-sconce", "wall sconce"],
  ["replace-ceiling-fan", "ceiling fan"],
  ["fan-replacing-light", "ceiling fan"],
]);

export const MAX_SAME_SCOPE_QUANTITY = 20;

export function repeatSameScopeLabel(serviceSlug: string): string | null {
  return REPEAT_SAME_SCOPE.get(serviceSlug) ?? null;
}
