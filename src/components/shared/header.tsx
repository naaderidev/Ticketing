"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";
import { MobileSidebar } from "./mobile-sidebar";
import { LogOut, LayoutDashboard } from "lucide-react";
import Image from "next/image";
import { buttons } from "@/lib/strings";
import { useUser } from "@/contexts/user-context";

interface HeaderProps {
  showBack?: boolean;
  backHref?: string;
  recipientType?: "USER" | "ADMIN";
  panelType?: "user" | "admin";
}

export function Header({
  showBack = false,
  backHref = "/",
  recipientType,
  panelType,
}: Readonly<HeaderProps>) {
  const pathname = usePathname();
  const isLoginPage = pathname === "/user/login" || pathname === "/user/login/";
  const dashboardHref = panelType === "admin" ? "/admin" : "/user";
  const { logout } = useUser();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/60">
      <div className="container flex h-14 items-center justify-between">
        <div className="flex items-center gap-2">
          {panelType && <MobileSidebar type={panelType} />}
          {showBack && (
            <Link href={backHref}>
              <Image
                src="/logo.png"
                alt="تیکتِ‌تو"
                className="h-12 w-auto"
                width={100}
                height={100}
              />
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2">
          {!isLoginPage && recipientType && (
            <Link href={dashboardHref}>
              <Button variant="ghost" size="sm">
                <LayoutDashboard className="ml-1 h-4 w-4" />
                {buttons.GO_TO_DASHBOARD}
              </Button>
            </Link>
          )}
          {!isLoginPage && recipientType && (
            <NotificationBell recipientType={recipientType} />
          )}
          {showBack && (
            <Button variant="ghost" size="sm" onClick={logout}>
              <LogOut className="ml-1 h-4 w-4" />
              خروج
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}
