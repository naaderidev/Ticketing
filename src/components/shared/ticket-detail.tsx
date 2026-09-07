"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { LoadingSpinner } from "@/components/shared/loading-spinner";
import { buttons, errors } from "@/lib/strings";
import {
  useTicket,
  useUpdateTicket,
  useAddReply,
  useRateTicket,
  useDepartments,
  useSubDepartments,
  useMessages,
} from "@/hooks";
import { toast } from "sonner";
import { ErrorBoundary } from "@/components/shared/error-boundary";
import {
  TicketHeader,
  TicketInfo,
  TicketStatusNotice,
  TicketMessages,
  TicketReplyForm,
  TicketTransferDialog,
  TicketCloseDialog,
} from "@/components/ticket";

interface TicketDetailProps {
  mode: "user" | "admin";
}

export function TicketDetail({ mode }: Readonly<TicketDetailProps>) {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.ticketId as string;
  const isAdmin = mode === "admin";

  // Transfer state
  const [isTransferDialogOpen, setIsTransferDialogOpen] = useState(false);
  const [transferDepartmentId, setTransferDepartmentId] = useState("");
  const [transferSubDepartmentId, setTransferSubDepartmentId] = useState("");

  // Close dialog state
  const [isCloseDialogOpen, setIsCloseDialogOpen] = useState(false);

  const backHref = isAdmin ? "/admin/tickets" : "/user/tickets";

  // React Query hooks
  const {
    data: ticket,
    isLoading: isLoadingTicket,
    error: ticketError,
  } = useTicket(ticketId);
  const updateTicketMutation = useUpdateTicket();
  const addReplyMutation = useAddReply();
  const rateTicketMutation = useRateTicket();
  const { data: departments = [] } = useDepartments();
  const { data: messages = [] } = useMessages();

  // Get sub-departments for transfer department
  const { data: subDepartments = [] } = useSubDepartments(
    isAdmin && transferDepartmentId ? Number.parseInt(transferDepartmentId) : 0,
  );

  // Initialize transfer department IDs when ticket loads
  useEffect(() => {
    if (ticket && isAdmin) {
      if (ticket.departmentId !== undefined) {
        setTransferDepartmentId(ticket.departmentId.toString());
      }
      if (ticket.subDepartmentId !== undefined) {
        setTransferSubDepartmentId(ticket.subDepartmentId.toString());
      }
    }
  }, [ticket, isAdmin]);

  // Redirect on ticket not found
  useEffect(() => {
    if (ticketError) {
      router.push(backHref);
    }
  }, [ticketError, router, backHref]);

  const handleCloseTicket = (reason?: string, rating?: number) => {
    if (isAdmin) {
      if (!reason) return;
      updateTicketMutation.mutate(
        {
          ticketId,
          data: {
            status: "CLOSED",
            closedReason: reason,
          },
        },
        {
          onSuccess: () => {
            setIsCloseDialogOpen(false);
            toast.success("تیکت با موفقیت بسته شد");
          },
          onError: () => {
            toast.error("خطا در بستن تیکت");
          },
        },
      );
    } else {
      if (!rating) return;

      if (!ticket?.rating) {
        rateTicketMutation.mutate(
          { ticketId, rating },
          {
            onSuccess: () => {
              updateTicketMutation.mutate(
                {
                  ticketId,
                  data: {
                    status: "CLOSED",
                    closedReason: "امتیازدهی توسط کاربر",
                    closedBy: "USER",
                  },
                },
                {
                  onSuccess: () => {
                    setIsCloseDialogOpen(false);
                    toast.success("تیکت با موفقیت بسته شد");
                  },
                  onError: () => {
                    toast.error("خطا در بستن تیکت");
                  },
                },
              );
            },
            onError: () => {
              toast.error("خطا در ثبت امتیاز");
            },
          },
        );
      } else {
        updateTicketMutation.mutate(
          {
            ticketId,
            data: {
              status: "CLOSED",
              closedReason: "امتیازدهی توسط کاربر",
              closedBy: "USER",
            },
          },
          {
            onSuccess: () => {
              setIsCloseDialogOpen(false);
              toast.success("تیکت با موفقیت بسته شد");
            },
            onError: () => {
              toast.error("خطا در بستن تیکت");
            },
          },
        );
      }
    }
  };

  const handleTransfer = () => {
    if (!transferDepartmentId || !transferSubDepartmentId) return;

    updateTicketMutation.mutate(
      {
        ticketId,
        data: {
          departmentId: Number.parseInt(transferDepartmentId),
          subDepartmentId: Number.parseInt(transferSubDepartmentId),
        },
      },
      {
        onSuccess: () => {
          setIsTransferDialogOpen(false);
          toast.success("تیکت با موفقیت منتقل شد");
        },
        onError: () => {
          toast.error("خطا در انتقال تیکت");
        },
      },
    );
  };

  if (isLoadingTicket) {
    return <LoadingSpinner />;
  }

  if (!ticket) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">{errors.TICKET_NOT_FOUND}</p>
        <Link href={backHref}>
          <Button variant="link">{buttons.BACK}</Button>
        </Link>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="space-y-6">
        <TicketHeader
          ticket={ticket}
          isAdmin={isAdmin}
          onOpenTransfer={() => setIsTransferDialogOpen(true)}
          onOpenClose={() => setIsCloseDialogOpen(true)}
        />

        <TicketInfo ticket={ticket} isAdmin={isAdmin} />

        <TicketStatusNotice ticket={ticket} />

        <div
          className={`grid gap-6 ${
            ticket.status !== "CLOSED" ? "grid-cols-1 lg:grid-cols-2" : ""
          }`}
        >
          <TicketMessages ticket={ticket} mode={mode} />

          {ticket.status !== "CLOSED" && (
            <TicketReplyForm
              ticketId={ticketId}
              isAdmin={isAdmin}
              messages={messages}
              addReplyMutation={addReplyMutation}
            />
          )}
        </div>

        {/* User Close Dialog */}
        {!isAdmin && ticket.status !== "CLOSED" && (
          <TicketCloseDialog
            ticket={ticket}
            isAdmin={false}
            open={isCloseDialogOpen}
            onOpenChange={setIsCloseDialogOpen}
            closeMutation={updateTicketMutation}
            onClose={handleCloseTicket}
          />
        )}

        {/* Admin Transfer Dialog */}
        {isAdmin && (
          <TicketTransferDialog
            open={isTransferDialogOpen}
            onOpenChange={setIsTransferDialogOpen}
            departmentId={transferDepartmentId}
            subDepartmentId={transferSubDepartmentId}
            onDepartmentChange={setTransferDepartmentId}
            onSubDepartmentChange={setTransferSubDepartmentId}
            departments={departments}
            subDepartments={subDepartments}
            transferMutation={updateTicketMutation}
            onTransfer={handleTransfer}
          />
        )}

        {/* Admin Close Dialog */}
        {isAdmin && (
          <TicketCloseDialog
            ticket={ticket}
            isAdmin={true}
            open={isCloseDialogOpen}
            onOpenChange={setIsCloseDialogOpen}
            closeMutation={updateTicketMutation}
            onClose={handleCloseTicket}
          />
        )}
      </div>
    </ErrorBoundary>
  );
}
