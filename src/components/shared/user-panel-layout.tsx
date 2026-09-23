"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/shared/header";
import { Sidebar } from "@/components/shared/sidebar";

export function UserPanelLayout({
  children,
  organizationContextEnabled,
}: Readonly<{
  children: React.ReactNode;
  organizationContextEnabled: boolean;
}>) {
  const pathname = usePathname();
  const isPublicAuthPage =
    pathname.startsWith("/user/login") || pathname.startsWith("/user/signup");

  if (isPublicAuthPage) return <>{children}</>;

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        showBack
        backHref="/"
        recipientType="USER"
        panelType="user"
        organizationContextEnabled={organizationContextEnabled}
      />
      <div className="flex flex-1">
        <Sidebar
          type="user"
          organizationContextEnabled={organizationContextEnabled}
        />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
