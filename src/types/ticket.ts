export interface Attachment {
  id?: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  fileUrl: string;
}

export interface Reply {
  id: string;
  senderType: "USER" | "ADMIN";
  senderName: string;
  message: string;
  rating?: number;
  createdAt: string;
  attachments: Attachment[];
}

export interface TicketDepartment {
  id: number;
  name: string;
  subDepartment?: {
    id: number;
    name: string;
  };
}

export interface Ticket {
  id: string;
  ticketId: string;
  subject: string;
  message: string;
  status: "OPEN" | "IN_PROGRESS" | "CLOSED";
  userName: string;
  rating?: number;
  closedBy?: "USER" | "ADMIN";
  closedReason?: string;
  closedAt?: string;
  createdAt: string;
  department: TicketDepartment;
  subDepartment?: TicketDepartment;
  departmentId?: number;
  subDepartmentId?: number;
  replies: Reply[];
  attachments: Attachment[];
  _count?: { replies: number };
}

export interface Department {
  id: number;
  name: string;
}

export interface SubDepartment {
  id: number;
  name: string;
}

export interface PredefinedMessage {
  id: string;
  title: string;
  content: string;
  shortCode: string;
  subDepartmentId: number;
  subDepartment: {
    id: number;
    name: string;
  };
}

export const STATUS_MAP = {
  OPEN: { label: "باز", variant: "open" as const },
  IN_PROGRESS: { label: "در حال بررسی", variant: "in-progress" as const },
  CLOSED: { label: "بسته شده", variant: "closed" as const },
} as const;
