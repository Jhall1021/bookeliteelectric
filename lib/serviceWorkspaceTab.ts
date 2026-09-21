export type ServiceWorkspaceTab = "recipe" | "overview" | "pricing" | "materials" | "questions";

const SERVICE_WORKSPACE_TABS = new Set<ServiceWorkspaceTab>([
  "recipe",
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
