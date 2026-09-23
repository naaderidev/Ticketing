export interface UserData {
  id: number;
  firstName: string;
  lastName: string;
  mobile: string;
  nationalCode?: string;
  email?: string;
  birthday?: string;
  role: "USER" | "ADMIN";
  access?: {
    roleLabels: string[];
    staffRoleKeys: string[];
    organizationRoleKeys: Array<"MANAGER" | "REPRESENTATIVE">;
  };
}

export interface DepartmentWithCount {
  id: number;
  name: string;
  _count: { tickets: number; subDepartments: number };
}

export interface SubDepartmentWithCount {
  id: number;
  name: string;
  departmentId: number;
  _count: { tickets: number; faqs: number };
}

export interface FAQItem {
  id: number;
  question: string;
  answer: string;
  priority: number;
  departmentId: number;
  subDepartmentId: number | null;
  department: { name: string };
  subDepartment: { name: string } | null;
}

export interface Attachment {
  uploadId: string;
  fileName: string;
  fileSize: number;
  fileType: string;
  expiresAt: string;
}

export interface NotificationItem {
  id: number;
  message: string;
  isRead: boolean;
  ticketId: string;
  recipientType: "USER" | "ADMIN";
  userId: number | null;
  createdAt: string;
}
