import type { Metadata } from "next";
import { Vazirmatn } from "next/font/google";
import "./globals.css";
import { QueryProvider } from "./providers";
import { ToastProvider } from "@/components/shared/toast-provider";

const vazirmatn = Vazirmatn({
  variable: "--font-vazirmatn",
  subsets: ["arabic"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "تیکتِ‌تو",
  description: "سیستم پشتیبانی و مدیریت تیکت تیکتِ‌تو",
  icons: {
    icon: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <QueryProvider>
          {children}
          <ToastProvider />
        </QueryProvider>
      </body>
    </html>
  );
}
