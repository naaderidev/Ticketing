"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Ticket,
  Plus,
  MessageSquare,
  Bell,
  Users,
  User,
  Smartphone,
  MessageSquareText,
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

interface SidebarProps {
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

export function Sidebar({
  type,
  organizationContextEnabled = false,
  workspaceEnabled = false,
  supportCatalogEnabled = false,
  reportingEnabled = false,
  organizationManagementEnabled = false,
  knowledgeEnabled = false,
  userManagementEnabled = false,
  roleLabels = [],
}: Readonly<SidebarProps>) {
  const pathname = usePathname();
  const { user } = useUser();
  const effectiveRoleLabels =
    type === "admin" ? roleLabels : (user?.access?.roleLabels ?? ["کاربر فردی"]);

  const userLinks = [
    { href: "/user", label: "مرکز پشتیبانی", icon: LayoutDashboard },
    ...(organizationContextEnabled
      ? [{ href: "/user/company-support", label: "پشتیبانی شرکت", icon: Building2 }]
      : []),
    { href: "/user/tickets", label: labels.NAV_MY_TICKETS, icon: Ticket },
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
          { href: "/admin/messages", label: labels.NAV_MESSAGES, icon: MessageSquareText },
        ]
      : []),
    {
      href: "/admin/notifications",
      label: labels.NAV_NOTIFICATIONS,
      icon: Bell,
    },
    ...(userManagementEnabled
      ? [{ href: "/admin/users", label: labels.NAV_USERS, icon: Users }]
      : []),
  ];

  const links = type === "user" ? userLinks : adminLinks;

  return (
    <aside className="hidden w-64 border-l bg-muted/40 lg:block">
      {user && (
        <div className="border-b p-4">
          <div className="flex items-center gap-3">
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
        </div>
      )}
      <nav className="flex flex-col gap-2 p-4">
        {links.map((link) => {
          const Icon = link.icon;
          const isActive =
            pathname === link.href ||
            (link.href !== "/user" && pathname.startsWith(link.href + "/"));

          return (
            <Link
              key={link.href}
              href={link.href}
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
    </aside>
  );
}
