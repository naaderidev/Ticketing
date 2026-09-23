import type {
  WorkspaceTicketPriority,
  WorkspaceTicketStatus,
} from "@/types/workspace-ticket-v2";

export const WORKSPACE_STATUS_LABELS: Record<WorkspaceTicketStatus, string> = {
  NEW: "جدید",
  UNASSIGNED: "بدون تخصیص",
  IN_PROGRESS: "در حال بررسی",
  INTERNAL_REFERRAL: "ارجاع داخلی",
  WAITING_INTERNAL: "منتظر پاسخ داخلی",
  WAITING_USER: "منتظر پاسخ مشتری",
  RESOLVED: "حل‌شده؛ منتظر تأیید",
  CLOSED: "بسته‌شده",
  REOPENED: "بازگشایی‌شده",
  CLOSED_LEGACY: "بسته‌شده قدیمی",
};

export const WORKSPACE_PRIORITY_LABELS: Record<WorkspaceTicketPriority, string> = {
  CRITICAL: "بحرانی",
  HIGH: "بالا",
  NORMAL: "عادی",
  LOW: "کم",
};

export const SLA_STATE_LABELS: Record<string, string> = {
  PENDING: "در جریان",
  PAUSED: "متوقف (انتظار مشتری)",
  MET: "رعایت‌شده",
  BREACHED: "نقض‌شده",
  NOT_APPLICABLE: "مشمول نیست",
};

export const WORK_ITEM_STATUS_LABELS: Record<string, string> = {
  OPEN: "باز",
  COMPLETED: "تکمیل‌شده",
  CANCELLED: "لغوشده",
};

export const MESSAGE_AUTHOR_LABELS: Record<string, string> = {
  CUSTOMER: "مشتری",
  STAFF: "کارشناس پشتیبانی",
  SYSTEM: "سیستم",
};
