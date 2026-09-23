import { assertRuntimeConfiguration } from "@/lib/deployment-config";
import { prisma } from "@/lib/prisma";
import { logOperationalError } from "@/lib/operational-logger";

const READINESS_CACHE_TTL_MS = 5_000;

export type ReadinessResult =
  | { ready: true }
  | { ready: false };

export interface ReadinessDependencies {
  validateConfiguration(requestUrl: string): void;
  checkDatabase(): Promise<void>;
  now(): number;
  logFailure(error: unknown): void;
}

interface CachedReadiness {
  expiresAt: number;
  result: ReadinessResult;
}

export function createReadinessChecker(
  dependencies: ReadinessDependencies,
  cacheTtlMs = READINESS_CACHE_TTL_MS
): (requestUrl: string) => Promise<ReadinessResult> {
  let cachedReadiness: CachedReadiness | undefined;
  let pendingCheck: Promise<ReadinessResult> | undefined;

  async function runCheck(requestUrl: string): Promise<ReadinessResult> {
    try {
      dependencies.validateConfiguration(requestUrl);
      await dependencies.checkDatabase();
      return { ready: true };
    } catch (error) {
      dependencies.logFailure(error);
      return { ready: false };
    }
  }

  return async (requestUrl: string): Promise<ReadinessResult> => {
    const now = dependencies.now();
    if (cachedReadiness && now < cachedReadiness.expiresAt) {
      return cachedReadiness.result;
    }

    if (pendingCheck) return pendingCheck;

    pendingCheck = runCheck(requestUrl)
      .then((result) => {
        cachedReadiness = {
          expiresAt: dependencies.now() + cacheTtlMs,
          result,
        };
        return result;
      })
      .finally(() => {
        pendingCheck = undefined;
      });

    return pendingCheck;
  };
}

const checkReadinessWithDefaults = createReadinessChecker({
  validateConfiguration: assertRuntimeConfiguration,
  async checkDatabase(): Promise<void> {
    await prisma.$queryRaw`SELECT 1`;
  },
  now: Date.now,
  logFailure(error: unknown): void {
    logOperationalError("readiness_check_failed", error);
  },
});

export function checkReadiness(requestUrl: string): Promise<ReadinessResult> {
  return checkReadinessWithDefaults(requestUrl);
}
