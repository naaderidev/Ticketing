import { Header } from "@/components/shared/header";
import { Sidebar } from "@/components/shared/sidebar";
import { getCurrentUser } from "@/lib/current-user";
import { redirect } from "next/navigation";
import {
  isAgentWorkspaceV2Enabled,
  isOrganizationContextEnabled,
  isReportingApiEnabled,
} from "@/lib/feature-flags";
import { resolveReportingAccessScope } from "@/modules/reporting/application/reporting-authorization";
import { isReportingActorAllowedInRollout } from "@/lib/reporting-rollout-config";
import { getFrontendAccessProfile } from "@/lib/frontend-access";

export default async function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getCurrentUser();
  if (!user) redirect("/user/login?redirect=/admin");
  if (user.role !== "ADMIN") redirect("/forbidden");
  const access = await getFrontendAccessProfile(user.id);
  if (!access.isStaff) redirect("/forbidden");
  const organizationContextEnabled = isOrganizationContextEnabled();
  const agentWorkspaceEnabled = isAgentWorkspaceV2Enabled();
  const workspaceEnabled = agentWorkspaceEnabled && access.capabilities.workspace;
  const supportCatalogEnabled =
    agentWorkspaceEnabled && access.capabilities.supportCatalog;
  const reportingAccess =
    isReportingApiEnabled() && isReportingActorAllowedInRollout(user.id)
    ? await resolveReportingAccessScope(user.id)
    : null;
  const reportingEnabled =
    access.capabilities.reporting && reportingAccess !== null;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        showBack
        backHref="/"
        recipientType="ADMIN"
        panelType="admin"
        organizationContextEnabled={organizationContextEnabled}
        workspaceEnabled={workspaceEnabled}
        supportCatalogEnabled={supportCatalogEnabled}
        reportingEnabled={reportingEnabled}
        organizationManagementEnabled={
          organizationContextEnabled && access.capabilities.organizations
        }
        knowledgeEnabled={access.capabilities.knowledge}
        userManagementEnabled={access.capabilities.users}
        roleLabels={access.roleLabels}
      />
      <div className="flex flex-1">
        <Sidebar
          type="admin"
          organizationContextEnabled={organizationContextEnabled}
          workspaceEnabled={workspaceEnabled}
          supportCatalogEnabled={supportCatalogEnabled}
          reportingEnabled={reportingEnabled}
          organizationManagementEnabled={
            organizationContextEnabled && access.capabilities.organizations
          }
          knowledgeEnabled={access.capabilities.knowledge}
          userManagementEnabled={access.capabilities.users}
          roleLabels={access.roleLabels}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
