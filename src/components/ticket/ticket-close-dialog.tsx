"use client";

import React, { useState, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star, XCircle } from "lucide-react";
import { Ticket } from "@/types/ticket";
import {
  labels,
  titles,
  descriptions,
  buttons,
  placeholders,
  errors,
  misc,
} from "@/lib/strings";
import { UseMutationResult } from "@tanstack/react-query";

interface TicketUpdateData {
  status?: "OPEN" | "IN_PROGRESS" | "CLOSED";
  closedReason?: string;
  closedBy?: "USER" | "ADMIN";
  departmentId?: number;
  subDepartmentId?: number;
}

interface TicketCloseDialogProps {
  ticket: Ticket;
  isAdmin: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  closeMutation: UseMutationResult<
    unknown,
    Error,
    { ticketId: string; data: TicketUpdateData },
    unknown
  >;
  onClose: (reason?: string, rating?: number) => void;
}

export const TicketCloseDialog = React.memo(function TicketCloseDialog({
  ticket,
  isAdmin,
  open,
  onOpenChange,
  closeMutation,
  onClose,
}: TicketCloseDialogProps) {
  const [closeReason, setCloseReason] = useState("");
  const [selectedRating, setSelectedRating] = useState<number | null>(null);

  const handleClose = useCallback(() => {
    if (isAdmin) {
      onClose(closeReason);
    } else {
      onClose(undefined, selectedRating || undefined);
    }
  }, [isAdmin, closeReason, selectedRating, onClose]);

  const handleCancel = useCallback(() => {
    onOpenChange(false);
    setSelectedRating(null);
  }, [onOpenChange]);

  const handleRatingClick = useCallback((rating: number) => {
    setSelectedRating(rating);
  }, []);

  const handleReasonChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setCloseReason(e.target.value);
    },
    [],
  );

  const handleCloseFromAdmin = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // User close dialog with rating
  if (!isAdmin) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogTrigger asChild>
          <Button variant="destructive" size="sm">
            <XCircle className="ml-1 h-4 w-4" />
            {buttons.CLOSE_TICKET}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{titles.DIALOG_TICKET_DETAIL}</DialogTitle>
            <DialogDescription>
              {descriptions.CLOSE_DESCRIPTION}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">
                {labels.RATING_QUESTION}
              </p>
              <div className="flex justify-center gap-2">
                {Array.from({ length: 5 }, (_, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="icon"
                    className={`h-12 w-12 ${
                      selectedRating && i < selectedRating
                        ? "bg-amber-50 border-amber-300 dark:bg-amber-50"
                        : ""
                    }`}
                    onClick={() => handleRatingClick(i + 1)}
                  >
                    <Star
                      className={`h-6 w-6 ${
                        selectedRating && i < selectedRating
                          ? "fill-amber-400 text-amber-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  </Button>
                ))}
              </div>
              {selectedRating && (
                <p className="text-sm font-medium text-amber-600">
                  {labels.RATING_LABEL}{" "}
                  {selectedRating?.toLocaleString("fa-IR")}{" "}
                  {labels.RATING_OUT_OF.replace("{rating}", "")}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleCancel}>
              {buttons.CANCEL}
            </Button>
            <Button
              variant="destructive"
              onClick={handleClose}
              disabled={closeMutation.isPending || !selectedRating}
            >
              {closeMutation.isPending ? misc.LOADING : buttons.RATE_TICKET}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // Admin close dialog with reason
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{buttons.CLOSE_TICKET}</DialogTitle>
          <DialogDescription>{errors.TICKET_CLOSED}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{labels.TICKET_CLOSE_REASON}</Label>
            <Textarea
              placeholder={placeholders.TICKET_CLOSE_REASON}
              value={closeReason}
              onChange={handleReasonChange}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={handleCloseFromAdmin}>
            {buttons.CANCEL}
          </Button>
          <Button
            variant="destructive"
            onClick={handleClose}
            disabled={closeMutation.isPending || !closeReason.trim()}
          >
            {closeMutation.isPending ? misc.LOADING : buttons.CLOSE_TICKET}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
