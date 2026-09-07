"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Department, SubDepartment } from "@/types/ticket";
import { labels, buttons, misc } from "@/lib/strings";
import { UseMutationResult } from "@tanstack/react-query";
import React from "react";

interface TicketUpdateData {
  status?: "OPEN" | "IN_PROGRESS" | "CLOSED";
  closedReason?: string;
  closedBy?: "USER" | "ADMIN";
  departmentId?: number;
  subDepartmentId?: number;
}

interface TicketTransferDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  departmentId: string;
  subDepartmentId: string;
  onDepartmentChange: (id: string) => void;
  onSubDepartmentChange: (id: string) => void;
  departments: Department[];
  subDepartments: SubDepartment[];
  transferMutation: UseMutationResult<unknown, Error, { ticketId: string; data: TicketUpdateData }, unknown>;
  onTransfer: () => void;
}

export const TicketTransferDialog = React.memo(function TicketTransferDialog({
  open,
  onOpenChange,
  departmentId,
  subDepartmentId,
  onDepartmentChange,
  onSubDepartmentChange,
  departments,
  subDepartments,
  transferMutation,
  onTransfer,
}: TicketTransferDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{buttons.TRANSFER_TICKET}</DialogTitle>
          <DialogDescription>
            {labels.TRANSFER_DESCRIPTION}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{labels.TICKET_NEW_DEPARTMENT}</Label>
            <Select value={departmentId} onValueChange={onDepartmentChange}>
              <SelectTrigger>
                <SelectValue placeholder={labels.SELECT_DEPARTMENT} />
              </SelectTrigger>
              <SelectContent>
                {departments.map((dept) => (
                  <SelectItem key={dept.id} value={dept.id.toString()}>
                    {dept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>{labels.TICKET_NEW_SUB_DEPARTMENT}</Label>
            <Select
              value={subDepartmentId}
              onValueChange={onSubDepartmentChange}
              disabled={!departmentId}
            >
              <SelectTrigger>
                <SelectValue placeholder={labels.SELECT_SUB_DEPARTMENT} />
              </SelectTrigger>
              <SelectContent>
                {subDepartments.map((subDept) => (
                  <SelectItem key={subDept.id} value={subDept.id.toString()}>
                    {subDept.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {buttons.CANCEL}
          </Button>
          <Button
            onClick={onTransfer}
            disabled={
              transferMutation.isPending || !departmentId || !subDepartmentId
            }
          >
            {transferMutation.isPending ? misc.LOADING : buttons.TRANSFER_TICKET}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
});
