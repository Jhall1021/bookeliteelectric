/**
 * A small, consistent line-icon set for the admin shell — chrome only.
 * Trade-neutral by construction: nothing here depicts a specific trade's
 * tools. Service-specific icons (an outlet, a switch) live in
 * ServiceIcon.tsx instead, gated on the service's own canonical key, so a
 * plumbing catalog never inherits an electrical glyph by accident.
 *
 * Plain stroked SVG, no icon library — one more dependency for a dozen
 * glyphs isn't worth it, and every icon here is simple enough to hand-draw.
 */
import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;
// Decorative — every call site pairs one of these with its own visible
// label (a nav item's text, a button's own wording) or an aria-label on
// the interactive element it sits inside (the header bell).
const base = (props: IconProps) => ({
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "aria-hidden": true,
  strokeWidth: 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  ...props,
});

export function LogoMark(props: IconProps) {
  return (
    <svg {...base(props)} fill="currentColor" stroke="none">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" />
    </svg>
  );
}
export function HomeIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9" /><path d="M9.5 20v-6h5v6" /></svg>;
}
export function ChecklistIcon(props: IconProps) {
  return <svg {...base(props)}><rect x="4" y="3.5" width="16" height="17" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
}
export function WrenchIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2-2z" /></svg>;
}
export function CameraIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" /><circle cx="12" cy="13" r="3.5" /></svg>;
}
export function CalendarIcon(props: IconProps) {
  return <svg {...base(props)}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M8 3v4M16 3v4M3.5 10h17" /></svg>;
}
export function StorefrontIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M4 9.5 5 4h14l1 5.5" /><path d="M4 9.5a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0" /><path d="M5.5 10.5V20h13v-9.5" /><path d="M10 20v-5h4v5" /></svg>;
}
export function SettingsIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="12" cy="12" r="3" /><path d="M19.4 13.5a1.65 1.65 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.65 1.65 0 0 0-1.8-.3 1.65 1.65 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.65 1.65 0 0 0-1.1-1.5 1.65 1.65 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.65 1.65 0 0 0 .3-1.8 1.65 1.65 0 0 0-1.5-1H4a2 2 0 1 1 0-4h.1a1.65 1.65 0 0 0 1.5-1.1 1.65 1.65 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.65 1.65 0 0 0 1.8.3H10a1.65 1.65 0 0 0 1-1.5V4a2 2 0 1 1 4 0v.1a1.65 1.65 0 0 0 1 1.5 1.65 1.65 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.65 1.65 0 0 0-.3 1.8V10a1.65 1.65 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.65 1.65 0 0 0-1.5 1z" /></svg>;
}
export function HelpIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="12" cy="12" r="9" /><path d="M9.5 9.2a2.5 2.5 0 1 1 3.6 2.3c-.9.5-1.1 1-1.1 1.9" /><path d="M12 17h.01" /></svg>;
}
export function BellIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 13 6 9z" /><path d="M10 19a2 2 0 0 0 4 0" /></svg>;
}
export function SearchIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>;
}
export function ChevronDownIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M6 9l6 6 6-6" /></svg>;
}
export function UsersIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="9" cy="8" r="3" /><path d="M3.5 19a5.5 5.5 0 0 1 11 0" /><path d="M16 8.5a3 3 0 1 1 3.5 3" /><path d="M15 13.5c2.8.3 5 2.3 5.5 5.5" /></svg>;
}
export function ClipboardIcon(props: IconProps) {
  return <svg {...base(props)}><rect x="6" y="4" width="12" height="17" rx="2" /><rect x="9" y="2.5" width="6" height="3" rx="1" /><path d="M9 11h6M9 15h6" /></svg>;
}
export function AlertTriangleIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M12 4 3 20h18L12 4z" /><path d="M12 10.5v4M12 17h.01" /></svg>;
}
export function CheckCircleIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="12" cy="12" r="9" /><path d="M8.5 12.3l2.3 2.3 4.7-5.2" /></svg>;
}
export function ClockIcon(props: IconProps) {
  return <svg {...base(props)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5.5l3.5 2" /></svg>;
}
export function ArrowRightIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M4 12h16M13 5l7 7-7 7" /></svg>;
}
export function TagIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M11.5 3.5 20 12l-8.5 8.5L3 12V4.5A1 1 0 0 1 4 3.5h7.5z" /><circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" /></svg>;
}
export function PlugIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M9 2v6M15 2v6" /><rect x="6" y="8" width="12" height="7" rx="2" /><path d="M12 15v3a4 4 0 0 1-4 4H7" /></svg>;
}
export function SwitchIcon(props: IconProps) {
  return <svg {...base(props)}><rect x="7" y="3" width="10" height="18" rx="2" /><path d="M12 8v3" /><circle cx="12" cy="14" r="1" fill="currentColor" stroke="none" /></svg>;
}
export function ShieldIcon(props: IconProps) {
  return <svg {...base(props)}><path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" /><path d="M9 12l2 2 4-4.5" /></svg>;
}

/**
 * A component reference can't cross the server→client prop boundary — a
 * server layout that builds a NavItem[] with `icon: HomeIcon` throws at
 * render ("Functions cannot be passed directly to Client Components").
 * Server code passes the KEY instead; SidebarShell (a client component)
 * resolves it against this map, which never leaves the client.
 */
export const NAV_ICONS = {
  home: HomeIcon, checklist: ChecklistIcon, wrench: WrenchIcon, camera: CameraIcon,
  calendar: CalendarIcon, storefront: StorefrontIcon, settings: SettingsIcon,
  users: UsersIcon, clipboard: ClipboardIcon, attention: AlertTriangleIcon,
} as const;
export type NavIconKey = keyof typeof NAV_ICONS;
