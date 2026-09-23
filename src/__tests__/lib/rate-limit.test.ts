import { prisma } from "@/lib/prisma";
import { consumeRateLimit } from "@/lib/rate-limit";

jest.mock("@/lib/prisma", () => ({
  prisma: {
    rateLimitBucket: {
      updateMany: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock("@/lib/request-security", () => ({
  hashSecurityValue: jest.fn(() => "a".repeat(64)),
}));

const policy = { scope: "test", limit: 2, windowSeconds: 60 };
const now = new Date("2026-09-12T10:00:30.000Z");

describe("durable rate limiter", () => {
  it("creates the first bucket without storing the raw identity", async () => {
    (prisma.rateLimitBucket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.rateLimitBucket.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.rateLimitBucket.create as jest.Mock).mockResolvedValue({});

    await expect(consumeRateLimit(policy, "raw-mobile", now)).resolves.toEqual({
      allowed: true,
      retryAfterSeconds: 30,
    });
    expect(prisma.rateLimitBucket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ keyHash: "a".repeat(64) }),
    });
    expect(JSON.stringify((prisma.rateLimitBucket.create as jest.Mock).mock.calls)).not.toContain(
      "raw-mobile"
    );
  });

  it("atomically increments an existing bucket below the limit", async () => {
    (prisma.rateLimitBucket.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    await expect(consumeRateLimit(policy, "identity", now)).resolves.toMatchObject({
      allowed: true,
    });
    expect(prisma.rateLimitBucket.create).not.toHaveBeenCalled();
  });

  it("blocks an existing bucket at its limit", async () => {
    (prisma.rateLimitBucket.updateMany as jest.Mock).mockResolvedValue({ count: 0 });
    (prisma.rateLimitBucket.findUnique as jest.Mock).mockResolvedValue({ count: 2 });

    await expect(consumeRateLimit(policy, "identity", now)).resolves.toEqual({
      allowed: false,
      retryAfterSeconds: 30,
    });
  });
});
