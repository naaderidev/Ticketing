import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hashSecurityValue } from "@/lib/request-security";

export interface RateLimitPolicy {
  scope: string;
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export const AUTHENTICATED_MUTATION_LIMIT: RateLimitPolicy = {
  scope: "authenticated-mutation",
  limit: 120,
  windowSeconds: 60,
};

export const UPLOAD_LIMIT: RateLimitPolicy = {
  scope: "attachment-upload",
  limit: 20,
  windowSeconds: 10 * 60,
};

export const BUSINESS_REFERENCE_LOOKUP_LIMIT: RateLimitPolicy = {
  scope: "business-reference-lookup",
  limit: 60,
  windowSeconds: 60,
};

export const REPORTING_QUERY_LIMIT: RateLimitPolicy = {
  scope: "reporting-query",
  limit: 30,
  windowSeconds: 60,
};

export const REPORTING_EXPORT_LIMIT: RateLimitPolicy = {
  scope: "reporting-export",
  limit: 10,
  windowSeconds: 5 * 60,
};

function getWindow(now: Date, windowSeconds: number) {
  const windowMs = windowSeconds * 1000;
  const windowStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return {
    windowStart: new Date(windowStartMs),
    expiresAt: new Date(windowStartMs + windowMs * 2),
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((windowStartMs + windowMs - now.getTime()) / 1000)
    ),
  };
}

async function consumeExistingBucket(
  policy: RateLimitPolicy,
  keyHash: string,
  windowStart: Date
): Promise<boolean | null> {
  const updated = await prisma.rateLimitBucket.updateMany({
    where: {
      scope: policy.scope,
      keyHash,
      windowStart,
      count: { lt: policy.limit },
    },
    data: { count: { increment: 1 } },
  });
  if (updated.count === 1) return true;

  const existing = await prisma.rateLimitBucket.findUnique({
    where: {
      scope_keyHash_windowStart: {
        scope: policy.scope,
        keyHash,
        windowStart,
      },
    },
    select: { count: true },
  });
  return existing ? false : null;
}

export async function consumeRateLimit(
  policy: RateLimitPolicy,
  identity: string,
  now = new Date()
): Promise<RateLimitResult> {
  const keyHash = hashSecurityValue("rate-limit", identity);
  const window = getWindow(now, policy.windowSeconds);
  const existingResult = await consumeExistingBucket(
    policy,
    keyHash,
    window.windowStart
  );

  if (existingResult !== null) {
    return {
      allowed: existingResult,
      retryAfterSeconds: window.retryAfterSeconds,
    };
  }

  try {
    await prisma.rateLimitBucket.create({
      data: {
        scope: policy.scope,
        keyHash,
        windowStart: window.windowStart,
        expiresAt: window.expiresAt,
      },
    });
    return { allowed: true, retryAfterSeconds: window.retryAfterSeconds };
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const racedResult = await consumeExistingBucket(
        policy,
        keyHash,
        window.windowStart
      );
      return {
        allowed: racedResult === true,
        retryAfterSeconds: window.retryAfterSeconds,
      };
    }
    throw error;
  }
}

export async function deleteExpiredRateLimitBuckets(now = new Date()) {
  return prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lte: now } } });
}
