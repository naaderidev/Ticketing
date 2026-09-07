import { prisma } from "@/lib/prisma";
import { jalaliToGregorian } from "@/lib/date-utils";
import { Prisma, TicketStatus } from "@prisma/client";
import { errors } from "@/lib/strings";

function generateTicketId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(16).slice(2, 10).toUpperCase();
  return `TK-${timestamp}-${random}`;
}

interface TicketFilters {
  search?: string;
  status?: string;
  departmentId?: string;
  subDepartmentId?: string;
  userName?: string;
  userId?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
}

export async function getTickets(filters: TicketFilters) {
  const {
    search,
    status,
    departmentId,
    subDepartmentId,
    userName,
    userId,
    dateFrom,
    dateTo,
    page = 1,
    limit = 10,
  } = filters;

  const where: Prisma.TicketWhereInput = {};

  if (search) {
    where.OR = [
      { ticketId: { contains: search } },
      { subject: { contains: search } },
      { message: { contains: search } },
    ];
  }

  if (status && status !== "all") {
    where.status = status as TicketStatus;
  }

  if (departmentId) {
    where.departmentId = parseInt(departmentId);
  }

  if (subDepartmentId) {
    where.subDepartmentId = parseInt(subDepartmentId);
  }

  if (userName) {
    where.userName = { contains: userName };
  }

  if (userId) {
    where.userId = parseInt(userId);
  }

  if (dateFrom) {
    const gregorianFrom = jalaliToGregorian(dateFrom);
    if (gregorianFrom) {
      where.createdAt = { gte: gregorianFrom };
    }
  }

  if (dateTo) {
    const gregorianTo = jalaliToGregorian(dateTo);
    if (gregorianTo) {
      gregorianTo.setHours(23, 59, 59, 999);
      where.createdAt = { ...(where.createdAt as object || {}), lte: gregorianTo };
    }
  }

  const skip = (page - 1) * limit;

  const [tickets, total] = await Promise.all([
    prisma.ticket.findMany({
      where,
      include: {
        department: true,
        subDepartment: true,
        user: true,
        _count: { select: { replies: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.ticket.count({ where }),
  ]);

  return {
    tickets,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

export async function getTicketByTicketId(ticketId: string) {
  return prisma.ticket.findUnique({
    where: { ticketId },
    include: {
      department: true,
      subDepartment: true,
      replies: {
        orderBy: { createdAt: "asc" },
        include: { attachments: true },
      },
      attachments: true,
    },
  });
}

interface CreateTicketData {
  subject: string;
  message: string;
  userName: string;
  departmentId: string;
  subDepartmentId: string;
  attachments?: Array<{
    fileName: string;
    fileSize: number;
    fileType: string;
    fileUrl: string;
  }>;
  userId?: number;
}

export async function createTicket(data: CreateTicketData) {
  const { subject, message, userName, departmentId, subDepartmentId, attachments, userId } = data;

  if (!subject || !message || !userName || !departmentId || !subDepartmentId) {
    throw new Error(errors.ALL_FIELDS_REQUIRED);
  }

  const deptId = parseInt(departmentId);
  const subDeptId = parseInt(subDepartmentId);

  const [department, subDepartment] = await Promise.all([
    prisma.department.findUnique({ where: { id: deptId } }),
    prisma.subDepartment.findUnique({ where: { id: subDeptId } }),
  ]);

  if (!department) throw new Error(errors.DEPARTMENT_NOT_FOUND);
  if (!subDepartment) throw new Error(errors.SUB_DEPARTMENT_NOT_FOUND);
  if (subDepartment.departmentId !== deptId) {
    throw new Error(errors.SUB_DEPARTMENT_DEPARTMENT_MISMATCH);
  }

  const ticketId = generateTicketId();

  const ticket = await prisma.ticket.create({
    data: {
      ticketId,
      subject,
      message,
      userName,
      departmentId: deptId,
      subDepartmentId: subDeptId,
      userId: userId || null,
      attachments: attachments
        ? {
            create: attachments.map((att) => ({
              fileName: att.fileName,
              fileSize: att.fileSize,
              fileType: att.fileType,
              fileUrl: att.fileUrl,
            })),
          }
        : undefined,
    },
    include: {
      department: true,
      subDepartment: true,
      user: true,
    },
  });

  await prisma.notification.create({
    data: {
      ticket: { connect: { id: ticket.id } },
      recipientType: "ADMIN",
      message: `تیکت جدید ${ticket.ticketId} توسط ${ticket.userName} برای دپارتمان ${ticket.department.name} ایجاد شد`,
    },
  });

  if (userId) {
    await prisma.notification.create({
      data: {
        ticket: { connect: { id: ticket.id } },
        user: { connect: { id: userId } },
        recipientType: "USER",
        message: `تیکت جدید ${ticket.ticketId} توسط ${ticket.userName} برای دپارتمان ${ticket.department.name} ایجاد شد`,
      },
    });
  }

  return ticket;
}

interface UpdateTicketData {
  status?: TicketStatus;
  departmentId?: number;
  subDepartmentId?: number;
  closedReason?: string;
  closedBy?: string;
}

export async function updateTicket(ticketId: string, data: UpdateTicketData) {
  const ticket = await prisma.ticket.findUnique({ where: { ticketId } });
  if (!ticket) throw new Error(errors.TICKET_NOT_FOUND);

  const updateData: Prisma.TicketUpdateInput = {};

  if (data.status) {
    updateData.status = data.status;
  }

  if (data.departmentId) {
    updateData.department = { connect: { id: data.departmentId } };
  }

  if (data.subDepartmentId) {
    updateData.subDepartment = { connect: { id: data.subDepartmentId } };
  }

  if (data.status === "CLOSED") {
    updateData.closedAt = new Date();
    if (!data.closedReason) {
      throw new Error(errors.CLOSE_REASON_REQUIRED);
    }
    updateData.closedReason = data.closedReason;
    updateData.closedBy = data.closedBy || "ADMIN";
  }

  const updated = await prisma.ticket.update({
    where: { ticketId },
    data: updateData,
    include: { department: true, subDepartment: true },
  });

  if (data.departmentId || data.subDepartmentId) {
    const newDept = data.departmentId
      ? await prisma.department.findUnique({ where: { id: data.departmentId } })
      : null;

    const notificationData: Prisma.NotificationCreateInput = {
      ticket: { connect: { id: ticket.id } },
      recipientType: "USER",
      message: `تیکت ${ticket.ticketId} توسط ${ticket.userName} به دپارتمان ${newDept?.name || "جدید"} منتقل شد`,
    };

    if (ticket.userId) {
      notificationData.user = { connect: { id: ticket.userId } };
    }

    await prisma.notification.create({ data: notificationData });
  }

  return updated;
}

export async function deleteTicket(ticketId: string) {
  await prisma.ticket.delete({ where: { ticketId } });
}

export async function rateTicket(ticketId: string, rating: number) {
  if (!rating || rating < 1 || rating > 5) {
    throw new Error(errors.RATING_RANGE);
  }

  const ticket = await prisma.ticket.findUnique({ where: { ticketId } });
  if (!ticket) throw new Error(errors.TICKET_NOT_FOUND);
  if (ticket.rating) throw new Error(errors.TICKET_ALREADY_RATED);

  const updated = await prisma.ticket.update({
    where: { id: ticket.id },
    data: { rating },
  });

  return { rating: updated.rating };
}

interface ReplyData {
  senderType: "USER" | "ADMIN";
  senderName: string;
  message: string;
  attachments?: Array<{
    fileName: string;
    fileSize: number;
    fileType: string;
    fileUrl: string;
  }>;
}

export async function addReply(ticketId: string, data: ReplyData) {
  const { senderType, senderName, message, attachments } = data;

  if (!senderType || !senderName || !message) {
    throw new Error(errors.ALL_FIELDS_REQUIRED);
  }

  if (senderType !== "USER" && senderType !== "ADMIN") {
    throw new Error(errors.INVALID_SENDER_TYPE);
  }

  const ticket = await prisma.ticket.findUnique({ where: { ticketId } });
  if (!ticket) throw new Error(errors.TICKET_NOT_FOUND);
  if (ticket.status === "CLOSED") {
    throw new Error(errors.TICKET_CLOSED);
  }

  const reply = await prisma.ticketReply.create({
    data: {
      ticketId: ticket.id,
      senderType,
      senderName,
      message,
      attachments: attachments
        ? {
            create: attachments.map((att) => ({
              fileName: att.fileName,
              fileSize: att.fileSize,
              fileType: att.fileType,
              fileUrl: att.fileUrl,
            })),
          }
        : undefined,
    },
    include: { attachments: true },
  });

  await prisma.ticket.update({
    where: { id: ticket.id },
    data: { status: "IN_PROGRESS" },
  });

  const recipientType = senderType === "USER" ? "ADMIN" : "USER";
  const notificationData: Prisma.NotificationCreateInput = {
    ticket: { connect: { id: ticket.id } },
    recipientType,
    message: `پاسخ جدید توسط ${senderName} در تیکت ${ticket.ticketId} اضافه شد`,
  };

  if (senderType === "ADMIN" && ticket.userId) {
    notificationData.user = { connect: { id: ticket.userId } };
  }

  await prisma.notification.create({ data: notificationData });

  return reply;
}
