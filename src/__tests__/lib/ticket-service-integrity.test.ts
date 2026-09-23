import { runSerializableTransaction } from "@/lib/database-transaction";
import {
  addReply,
  createTicket,
  deleteTicketForRetention,
  rateTicket,
  updateTicket,
} from "@/lib/ticket-service";
import { errors } from "@/lib/strings";
import {
  claimPendingUploads,
  processAttachmentDeletionJobs,
  queueAttachmentDeletionJobs,
} from "@/lib/attachment-service";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    ticket: {
      findMany: jest.fn(),
      count: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock("@/lib/database-transaction", () => ({
  runSerializableTransaction: jest.fn(),
}));

jest.mock("@/lib/attachment-service", () => ({
  claimPendingUploads: jest.fn(),
  processAttachmentDeletionJobs: jest.fn(),
  queueAttachmentDeletionJobs: jest.fn(),
}));

jest.mock("@/modules/tickets/application/ticket-event-outbox", () => ({
  appendTicketEvent: jest.fn(),
}));

jest.mock("@/modules/sla-routing/application/sla-service", () => ({
  appendTicketSlaStartedEvent: jest.fn(),
  createTicketSlaSnapshot: jest.fn().mockResolvedValue({
    enforcementMode: "OBSERVE_ONLY",
  }),
  excludeTicketSlaAfterLegacyClosure: jest.fn(),
  markTicketFirstResponse: jest.fn(),
  recordRoutingDecision: jest.fn(),
  resumeTicketResolutionSla: jest.fn(),
  slaPolicyInclude: {},
}));

const transaction = {
  department: { findUnique: jest.fn(), findFirst: jest.fn() },
  subDepartment: { findUnique: jest.fn(), findFirst: jest.fn() },
  user: { findUnique: jest.fn() },
  legacySupportCatalogMapping: { findFirst: jest.fn() },
  supportRequestType: { findFirst: jest.fn(), findUnique: jest.fn() },
  supportCatalogRoute: { findFirst: jest.fn() },
  ticket: {
    findUnique: jest.fn(),
    create: jest.fn(),
    delete: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
  },
  ticketReply: { create: jest.fn() },
  ticketMessage: { create: jest.fn() },
  ticketEvent: { create: jest.fn() },
  ticketAssignment: { create: jest.fn(), updateMany: jest.fn() },
  notification: { create: jest.fn() },
};

describe("ticket service data integrity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (runSerializableTransaction as jest.Mock).mockImplementation(
      (operation) => operation(transaction)
    );
    (processAttachmentDeletionJobs as jest.Mock).mockResolvedValue({
      deleted: 0,
      failed: 0,
    });
    transaction.legacySupportCatalogMapping.findFirst.mockResolvedValue(null);
    transaction.supportRequestType.findUnique.mockResolvedValue({
      id: 90,
      routes: [
        {
          id: 89,
          version: 1,
          defaultPriority: "NORMAL",
          queue: { id: 91, teamId: 92 },
          slaPolicy: { id: 93 },
        },
      ],
    });
    transaction.ticketMessage.create.mockResolvedValue({ id: BigInt(501) });
  });

  it("creates a ticket and both notifications in one transaction", async () => {
    transaction.department.findFirst.mockResolvedValue({ id: 1, name: "فنی" });
    transaction.subDepartment.findFirst.mockResolvedValue({ id: 2, departmentId: 1 });
    transaction.user.findUnique.mockResolvedValue({
      id: 7,
      personProfile: { partyId: 70 },
    });
    transaction.ticket.create.mockResolvedValue({
      id: 10,
      ticketId: "TK-TEST-1",
      userName: "کاربر تست",
      department: { name: "فنی" },
    });
    transaction.notification.create.mockResolvedValue({ id: 1 });

    await createTicket({
      subject: "موضوع",
      message: "پیام",
      userName: "کاربر تست",
      departmentId: "1",
      subDepartmentId: "2",
      userId: 7,
    });

    expect(runSerializableTransaction).toHaveBeenCalledTimes(1);
    expect(transaction.department.findFirst).toHaveBeenCalledWith({
      where: { id: 1, internalOnly: false },
    });
    expect(transaction.subDepartment.findFirst).toHaveBeenCalledWith({
      where: {
        id: 2,
        internalOnly: false,
        department: { internalOnly: false },
      },
    });
    expect(transaction.ticket.create).toHaveBeenCalledTimes(1);
    expect(transaction.ticketAssignment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        ticketId: 10,
        queueId: 91,
        supportTeamId: 92,
        activeKey: "10",
      }),
    });
    expect(appendTicketEvent).toHaveBeenCalledWith(
      transaction,
      expect.objectContaining({
        ticketInternalId: 10,
        ticketPublicId: "TK-TEST-1",
        type: "ticket.created.v1",
      })
    );
    expect(transaction.notification.create).toHaveBeenCalledTimes(2);
  });

  it("claims attachment references for the authenticated uploader", async () => {
    transaction.department.findFirst.mockResolvedValue({ id: 1, name: "فنی" });
    transaction.subDepartment.findFirst.mockResolvedValue({ id: 2, departmentId: 1 });
    transaction.user.findUnique.mockResolvedValue({
      id: 7,
      personProfile: { partyId: 70 },
    });
    transaction.ticket.create.mockResolvedValue({
      id: 10,
      ticketId: "TK-TEST-1",
      userName: "کاربر تست",
      department: { name: "فنی" },
    });

    const attachments = [
      { uploadId: "7e77c970-75ae-4f2e-a296-6d5183c9f12a" },
    ];
    await createTicket({
      subject: "موضوع",
      message: "پیام",
      userName: "کاربر تست",
      departmentId: "1",
      subDepartmentId: "2",
      userId: 7,
      attachmentUploaderId: 11,
      attachments,
    });

    expect(claimPendingUploads).toHaveBeenCalledWith(
      transaction,
      attachments,
      11,
      {
        kind: "message",
        ticketId: 10,
        messageId: BigInt(501),
      }
    );
  });

  it("rejects a transfer to a sub-department from another department", async () => {
    transaction.ticket.findUnique.mockResolvedValue({
      id: 10,
      ticketId: "TK-TEST-1",
      departmentId: 1,
      subDepartmentId: 2,
      userId: 7,
      userName: "کاربر تست",
    });
    transaction.department.findFirst.mockResolvedValue({ id: 3, name: "مالی" });
    transaction.subDepartment.findFirst.mockResolvedValue({ id: 4, departmentId: 9 });

    await expect(
      updateTicket("TK-TEST-1", { departmentId: 3, subDepartmentId: 4 })
    ).rejects.toMatchObject({
      kind: "VALIDATION",
      message: errors.SUB_DEPARTMENT_DEPARTMENT_MISMATCH,
    });
    expect(transaction.ticket.update).not.toHaveBeenCalled();
  });

  it("allows only one atomic rating write", async () => {
    transaction.ticket.updateMany.mockResolvedValue({ count: 0 });
    transaction.ticket.findUnique.mockResolvedValue({ id: 10 });

    await expect(rateTicket("TK-TEST-1", 5)).rejects.toMatchObject({
      kind: "CONFLICT",
      message: errors.TICKET_ALREADY_RATED,
    });
  });

  it("does not create a reply after a concurrent close", async () => {
    transaction.ticket.findUnique.mockResolvedValue({
      id: 10,
      ticketId: "TK-TEST-1",
      status: "OPEN",
      userId: 7,
    });
    transaction.ticket.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      addReply("TK-TEST-1", {
        senderType: "USER",
        senderName: "کاربر تست",
        message: "پاسخ",
      })
    ).rejects.toMatchObject({
      kind: "CONFLICT",
      message: errors.TICKET_CLOSED,
    });
    expect(transaction.ticketReply.create).not.toHaveBeenCalled();
  });

  it("clears closure metadata when reopening a ticket", async () => {
    transaction.ticket.findUnique.mockResolvedValue({
      id: 10,
      ticketId: "TK-TEST-1",
      departmentId: 1,
      subDepartmentId: 2,
      userId: 7,
      userName: "کاربر تست",
    });
    transaction.ticket.update.mockResolvedValue({ id: 10, status: "OPEN" });

    await updateTicket("TK-TEST-1", { status: "OPEN" });

    expect(transaction.ticket.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "OPEN",
          closedAt: null,
          closedReason: null,
          closedBy: null,
        }),
      })
    );
  });

  it("queues attachment deletion durably before deleting a ticket", async () => {
    const storedAttachments = [
      { storageKey: "attachments/7/one", fileUrl: null },
      { storageKey: null, fileUrl: "/uploads/legacy.pdf" },
    ];
    transaction.ticket.findUnique.mockResolvedValue({
      id: 10,
      attachments: [storedAttachments[0]],
      replies: [{ attachments: [storedAttachments[1]] }],
    });

    await deleteTicketForRetention("TK-TEST-1");

    expect(queueAttachmentDeletionJobs).toHaveBeenCalledWith(
      transaction,
      storedAttachments
    );
    expect(transaction.ticket.delete).toHaveBeenCalledWith({
      where: { id: 10 },
    });
    expect(processAttachmentDeletionJobs).toHaveBeenCalledWith(100);
  });
});
