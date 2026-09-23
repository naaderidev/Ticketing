"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  Ticket,
  Plus,
  LayoutList,
  MessageSquare,
  Settings,
  Menu,
  Bell,
  User,
  Smartphone,
  Network,
  Headset,
  LayoutDashboard,
  ChartNoAxesCombined,
  Building2,
  TriangleAlert,
  BookOpenCheck,
} from "lucide-react";
import { labels } from "@/lib/strings";
import { useUser } from "@/contexts/user-context";

interface MobileSidebarProps {
  type: "user" | "admin";
  organizationContextEnabled?: boolean;
  workspaceEnabled?: boolean;
  supportCatalogEnabled?: boolean;
  reportingEnabled?: boolean;
  organizationManagementEnabled?: boolean;
  knowledgeEnabled?: boolean;
  userManagementEnabled?: boolean;
  roleLabels?: string[];
}

export function MobileSidebar({
  type,
  organizationContextEnabled = false,
  workspaceEnabled = false,
  supportCatalogEnabled = false,
  reportingEnabled = false,
  organizationManagementEnabled = false,
  knowledgeEnabled = false,
  userManagementEnabled = false,
  roleLabels = [],
}: Readonly<MobileSidebarProps>) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { user } = useUser();
  const effectiveRoleLabels =
    type === "admin" ? roleLabels : (user?.access?.roleLabels ?? ["کاربر فردی"]);

  const userLinks = [
    { href: "/user", label: "مرکز پشتیبانی", icon: LayoutDashboard },
    ...(organizationContextEnabled
      ? [{ href: "/user/company-support", label: "پشتیبانی شرکت", icon: Building2 }]
      : []),
    { href: "/user/tickets", label: labels.NAV_MY_TICKETS, icon: LayoutList },
    { href: "/user/tickets/new", label: labels.NAV_NEW_TICKET, icon: Plus },
  ];

  const adminLinks = [
    ...(workspaceEnabled
      ? [{ href: "/admin/workspace", label: "داشبورد پشتیبانی", icon: LayoutDashboard }]
      : []),
    ...(reportingEnabled
      ? [{ href: "/admin/reporting", label: "داشبورد مدیریتی", icon: ChartNoAxesCombined }]
      : []),
    ...(workspaceEnabled
      ? [
          { href: "/admin/tickets", label: labels.NAV_TICKETS, icon: Ticket },
          { href: "/admin/incidents", label: "رخدادهای عمومی", icon: TriangleAlert },
        ]
      : []),
    ...(supportCatalogEnabled
      ? [{ href: "/admin/support-catalog", label: "ساختار پشتیبانی", icon: Headset }]
      : []),
    ...(organizationContextEnabled && organizationManagementEnabled
      ? [{ href: "/admin/organizations", label: "سازمان‌ها و دسترسی", icon: Network }]
      : []),
    ...(knowledgeEnabled
      ? [
          { href: "/admin/knowledge", label: "مدیریت دانش", icon: BookOpenCheck },
          { href: "/admin/faq", label: labels.NAV_FAQ, icon: MessageSquare },
          { href: "/admin/messages", label: labels.NAV_MESSAGES, icon: Settings },
        ]
      : []),
    { href: "/admin/notifications", label: labels.NAV_NOTIFICATIONS, icon: Bell },
    ...(userManagementEnabled
      ? [{ href: "/admin/users", label: labels.NAV_USERS, icon: User }]
      : []),
  ];

  const links = type === "user" ? userLinks : adminLinks;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-64 p-0">
        <nav className="flex flex-col gap-2 p-4">
          <div className="mb-4 border-b pb-4">
            <div className="flex items-center gap-2">
              <Ticket className="h-6 w-6 text-primary" />
              <span className="font-bold">
                {type === "user" ? labels.SIDEBAR_USER_PANEL : labels.SIDEBAR_ADMIN_PANEL}
              </span>
            </div>
            {user && (
              <div className="mt-3 flex items-center gap-3 rounded-lg bg-muted/50 p-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {user.firstName} {user.lastName}
                  </p>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Smartphone className="h-3 w-3" />
                    <span className="truncate">{user.mobile}</span>
                  </div>
                  {effectiveRoleLabels.length > 0 && (
                    <p className="mt-1 truncate text-xs font-medium text-primary">
                      {effectiveRoleLabels.join("، ")}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
          {links.map((link) => {
            const Icon = link.icon;
            const isActive =
              pathname === link.href ||
              (link.href !== "/user" && pathname.startsWith(link.href + "/"));

            return (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer",
                  isActive && "bg-accent text-accent-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
