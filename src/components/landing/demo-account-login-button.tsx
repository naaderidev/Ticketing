"use client";

import { useState } from "react";
import { ArrowLeft, LoaderCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

interface DemoAccountLoginButtonProps {
  accountKey: string;
  displayName: string;
}

interface DemoLoginResponse {
  error?: string;
  redirectTo?: string;
}

export function DemoAccountLoginButton({
  accountKey,
  displayName,
}: DemoAccountLoginButtonProps) {
  const [isLoading, setIsLoading] = useState(false);

  async function loginWithDemoAccount() {
    if (isLoading) return;
    setIsLoading(true);

    try {
      const response = await fetch("/api/users/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountKey }),
      });
      const result = (await response.json()) as DemoLoginResponse;

      if (!response.ok || !result.redirectTo) {
        throw new Error(result.error || "ورود به حساب دمو ناموفق بود");
      }

      window.location.replace(result.redirectTo);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "ورود به حساب دمو ناموفق بود",
      );
      setIsLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size="sm"
      className="mt-auto w-full justify-between rounded-lg bg-[#171717] px-3 text-xs font-bold text-white shadow-sm hover:bg-[#262626]"
      variant="default"
      disabled={isLoading}
      onClick={loginWithDemoAccount}
      aria-label={`ورود مستقیم با حساب ${displayName}`}
    >
      {isLoading ? (
        <span className="flex w-full items-center justify-center gap-2">
          <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          در حال ورود...
        </span>
      ) : (
        <>
          <span>ورود با این حساب</span>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </>
      )}
    </Button>
  );
}
