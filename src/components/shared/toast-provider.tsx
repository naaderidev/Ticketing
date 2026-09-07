"use client";

import { Toaster } from "sonner";

export function ToastProvider() {
  return (
    <Toaster
      position="top-center"
      dir="rtl"
      toastOptions={{
        duration: 4000,
        style: {
          background: "#FFFFFF",
          color: "#0F172A",
          border: "1px solid #E2E8F0",
          fontFamily: "var(--font-vazirmatn), sans-serif",
          fontSize: "14px",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)",
          opacity: 1,
        },
      }}
    />
  );
}
