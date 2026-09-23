"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Building2, LoaderCircle, UserRound } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  usePartyContexts,
  useSwitchPartyContext,
  type PartyContext,
} from "@/hooks/organization-contexts";

export function isContextSensitiveCustomerPath(pathname: string): boolean {
  return pathname.startsWith("/user/tickets/");
}

export function PartyContextSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const contextsQuery = usePartyContexts();
  const switchContext = useSwitchPartyContext();
  const [pendingContext, setPendingContext] = useState<PartyContext | null>(null);
  const [switchingTo, setSwitchingTo] = useState<PartyContext | null>(null);
  const snapshot = contextsQuery.data;

  useEffect(() => {
    if (
      switchingTo &&
      snapshot?.activePartyId === switchingTo.partyId &&
      !isContextSensitiveCustomerPath(pathname)
    ) {
      setSwitchingTo(null);
    }
  }, [pathname, snapshot?.activePartyId, switchingTo]);

  if (!snapshot || snapshot.contexts.length <= 1) return null;

  const switchToContext = (context: PartyContext) => {
    setSwitchingTo(context);
    switchContext.mutate(context.partyId, {
      onSuccess: (selectedContext) => {
        toast.success(`حساب فعال به «${selectedContext.displayName}» تغییر کرد`);
        if (isContextSensitiveCustomerPath(pathname)) {
          router.replace("/user/tickets");
        } else {
          router.refresh();
        }
      },
      onError: (error) => {
        setSwitchingTo(null);
        toast.error(error.message || "خطا در تغییر حساب فعال");
      },
    });
  };

  const handleChange = (value: string) => {
    const partyId = Number(value);
    if (!Number.isSafeInteger(partyId)) return;
    if (partyId === snapshot.activePartyId) return;

    const selectedContext = snapshot.contexts.find(
      (context) => context.partyId === partyId
    );
    if (!selectedContext) return;

    if (isContextSensitiveCustomerPath(pathname)) {
      setPendingContext(selectedContext);
      return;
    }

    switchToContext(selectedContext);
  };

  return (
    <>
      <Select
        value={String(snapshot.activePartyId)}
        onValueChange={handleChange}
        disabled={switchContext.isPending || switchingTo !== null}
      >
        <SelectTrigger
          className="h-9 w-[190px]"
          aria-label="انتخاب حساب فردی یا سازمانی"
        >
          <SelectValue placeholder="انتخاب حساب" />
        </SelectTrigger>
        <SelectContent>
          {snapshot.contexts.map((context) => (
            <SelectItem key={context.partyId} value={String(context.partyId)}>
              <span className="flex items-center gap-2">
                {context.type === "ORGANIZATION" ? (
                  <Building2 className="h-4 w-4" />
                ) : (
                  <UserRound className="h-4 w-4" />
                )}
                <span className="truncate">{context.displayName}</span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <AlertDialog
        open={pendingContext !== null}
        onOpenChange={(open) => {
          if (!open) setPendingContext(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تغییر حساب فعال؟</AlertDialogTitle>
            <AlertDialogDescription>
              با تغییر حساب به «{pendingContext?.displayName}» از این صفحه خارج
              می‌شوید و درخواست‌های همان حساب نمایش داده می‌شوند. اگر متنی وارد
              کرده‌اید، آن متن ذخیره نخواهد شد.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingContext) switchToContext(pendingContext);
                setPendingContext(null);
              }}
            >
              تغییر حساب
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {switchingTo && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 p-6 backdrop-blur-sm"
          role="status"
          aria-live="assertive"
        >
          <div className="flex items-center gap-3 rounded-xl border bg-card px-5 py-4 shadow-lg">
            <LoaderCircle className="h-5 w-5 animate-spin text-primary" />
            <p className="font-medium">
              در حال تغییر حساب به «{switchingTo.displayName}»…
            </p>
          </div>
        </div>
      )}
    </>
  );
}
