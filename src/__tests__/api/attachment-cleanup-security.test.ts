import { POST } from "@/app/api/internal/attachments/cleanup/route";
import {
  cleanupExpiredPendingUploads,
  processAttachmentDeletionJobs,
} from "@/lib/attachment-service";
import { consumeRateLimit, deleteExpiredRateLimitBuckets } from "@/lib/rate-limit";
import { deleteExpiredSessions } from "@/lib/auth";
import {
  deleteExpiredTicketCommandReceipts,
  reconcileMappedLegacyTickets,
} from "@/modules/tickets/application/ticket-service";

jest.mock("@/lib/attachment-config", () => ({
  getAttachmentCleanupToken: jest.fn(
    () => "test-cleanup-token-with-at-least-32-characters"
  ),
}));

jest.mock("@/lib/attachment-service", () => ({
  cleanupExpiredPendingUploads: jest.fn(),
  processAttachmentDeletionJobs: jest.fn(),
}));

jest.mock("@/lib/rate-limit", () => ({
  consumeRateLimit: jest.fn(),
  deleteExpiredRateLimitBuckets: jest.fn(),
}));

jest.mock("@/lib/auth", () => ({
  deleteExpiredSessions: jest.fn(),
}));

jest.mock("@/modules/tickets/application/ticket-service", () => ({
  deleteExpiredTicketCommandReceipts: jest.fn(),
  reconcileMappedLegacyTickets: jest.fn(),
}));

jest.mock("@/lib/audit-log", () => ({
  recordAuditEvent: jest.fn(),
}));

jest.mock("@/lib/request-security", () => ({
  getRequestSourceHash: jest.fn(() => "source-hash"),
}));

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status || 200,
      json: () => Promise.resolve(body),
    })),
  },
}));

describe("attachment cleanup endpoint", () => {
  beforeEach(() => {
    (consumeRateLimit as jest.Mock).mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 60,
    });
    (deleteExpiredRateLimitBuckets as jest.Mock).mockResolvedValue({ count: 0 });
    (deleteExpiredSessions as jest.Mock).mockResolvedValue({ count: 0 });
    (deleteExpiredTicketCommandReceipts as jest.Mock).mockResolvedValue({
      count: 0,
    });
    (reconcileMappedLegacyTickets as jest.Mock).mockResolvedValue({
      reconciled: 0,
      skipped: 0,
    });
  });

  it("does not run cleanup without the maintenance credential", async () => {
    const response = await POST(
      new Request("http://localhost/api/internal/attachments/cleanup", {
        method: "POST",
      })
    );

    expect(response.status).toBe(401);
    expect(cleanupExpiredPendingUploads).not.toHaveBeenCalled();
    expect(processAttachmentDeletionJobs).not.toHaveBeenCalled();
  });

  it("runs bounded cleanup with the correct bearer credential", async () => {
    (cleanupExpiredPendingUploads as jest.Mock).mockResolvedValue({
      deleted: 2,
      failed: 0,
    });
    (processAttachmentDeletionJobs as jest.Mock).mockResolvedValue({
      deleted: 1,
      failed: 0,
    });

    const response = await POST(
      new Request("http://localhost/api/internal/attachments/cleanup", {
        method: "POST",
        headers: {
          Authorization:
            "Bearer test-cleanup-token-with-at-least-32-characters",
        },
      })
    );

    expect(response.status).toBe(200);
    expect(cleanupExpiredPendingUploads).toHaveBeenCalledWith(100);
    expect(processAttachmentDeletionJobs).toHaveBeenCalledWith(100);
    expect(deleteExpiredTicketCommandReceipts).toHaveBeenCalledTimes(1);
    expect(reconcileMappedLegacyTickets).toHaveBeenCalledWith(100);
  });
});
