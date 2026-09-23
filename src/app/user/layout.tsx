import { UserPanelLayout } from "@/components/shared/user-panel-layout";
import { isOrganizationContextEnabled } from "@/lib/feature-flags";

export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UserPanelLayout
      organizationContextEnabled={isOrganizationContextEnabled()}
    >
      {children}
    </UserPanelLayout>
  );
}
