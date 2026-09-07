"use client";

import { usePathname } from "next/navigation";
import { Header } from "@/components/shared/header";
import { Sidebar } from "@/components/shared/sidebar";

export default function UserLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const pathname = usePathname();
  const isLoginPage = pathname?.startsWith("/user/login");
  const isSignupPage = pathname?.startsWith("/user/signup");

  if (isLoginPage || isSignupPage) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header showBack backHref="/" recipientType="USER" panelType="user" />
      <div className="flex flex-1">
        <Sidebar type="user" />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
