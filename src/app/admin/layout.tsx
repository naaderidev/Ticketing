import { Header } from "@/components/shared/header";
import { Sidebar } from "@/components/shared/sidebar";

export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header showBack backHref="/" recipientType="ADMIN" panelType="admin" />
      <div className="flex flex-1">
        <Sidebar type="admin" />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
