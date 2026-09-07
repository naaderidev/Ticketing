"use client"

import { Suspense } from "react"
import { FAQManager } from "@/components/shared/faq-manager"

export default function AdminFAQPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      }
    >
      <FAQManager />
    </Suspense>
  )
}
