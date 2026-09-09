import { PlugIcon, SwitchIcon, ShieldIcon, TagIcon } from "./icons";
import type { SVGProps } from "react";

/**
 * A recognizable glyph for one of a contractor's own services — gated on
 * the service's own `templateKey`, never on the contractor's trade as a
 * whole. Electrical is the only catalog with templated services today, so
 * every specific case here is an electrical outcome; a plumbing (or any
 * hand-built) service simply falls through to the generic tag, which is
 * the point — this file adds a look PER OUTCOME as trades gain templates,
 * it does not assume electrical everywhere.
 */
export function ServiceIcon({ templateKey, ...props }: { templateKey: string | null } & SVGProps<SVGSVGElement>) {
  const key = templateKey ?? "";
  if (/outlet/i.test(key) && !/gfci/i.test(key)) return <PlugIcon {...props} />;
  if (/switch/i.test(key)) return <SwitchIcon {...props} />;
  if (/gfci/i.test(key)) return <ShieldIcon {...props} />;
  return <TagIcon {...props} />;
}
