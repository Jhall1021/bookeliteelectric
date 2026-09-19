export type ServiceWorkspaceTab = "overview" | "pricing" | "materials" | "questions";

const SERVICE_WORKSPACE_TABS = new Set<ServiceWorkspaceTab>([
  "overview",
  "pricing",
  "materials",
  "questions",
]);

export function serviceWorkspaceTab(value: string | undefined): ServiceWorkspaceTab {
  return value && SERVICE_WORKSPACE_TABS.has(value as ServiceWorkspaceTab)
    ? (value as ServiceWorkspaceTab)
    : "overview";
}
