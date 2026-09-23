import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import {
  SessionTokenPayload,
  signToken,
  verifyToken,
} from "@/lib/auth-token";
import { isDemoMode } from "@/lib/demo-mode";

export const AUTH_COOKIE_NAME = "auth-token";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
export const SESSION_ABSOLUTE_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export type { SessionTokenPayload } from "@/lib/auth-token";
export { signToken, verifyToken } from "@/lib/auth-token";

function authCookieOptions() {
  return {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production" && !isDemoMode(),
  sameSite: "strict" as const,
  maxAge: SESSION_DURATION_MS / 1000,
  path: "/",
  priority: "high" as const,
  };
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

async function writeAuthCookie(session: SessionTokenPayload): Promise<void> {
  const token = await signToken(session);
  const cookieStore = await cookies();
  cookieStore.set(AUTH_COOKIE_NAME, token, authCookieOptions());
}

export async function createAuthSession(userId: number): Promise<string> {
  const sessionId = randomUUID();
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_DURATION_MS);
  const absoluteExpiresAt = new Date(now + SESSION_ABSOLUTE_DURATION_MS);

  const personProfile = await prisma.personProfile.findUnique({
    where: { userId },
    select: { partyId: true },
  });

  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      activePartyId: personProfile?.partyId ?? null,
      expiresAt,
      absoluteExpiresAt,
    },
  });
  await writeAuthCookie({ userId, sessionId });

  return sessionId;
}

export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(AUTH_COOKIE_NAME);
}

export async function getSessionToken(): Promise<SessionTokenPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export async function revokeCurrentSession(): Promise<string | null> {
  const session = await getSessionToken();
  if (!session) return null;

  await prisma.session.updateMany({
    where: {
      id: session.sessionId,
      userId: session.userId,
      revokedAt: null,
    },
    data: { revokedAt: new Date() },
  });

  return session.sessionId;
}

export async function refreshAuthSession(
  session: SessionTokenPayload
): Promise<boolean> {
  const now = new Date();
  const currentSession = await prisma.session.findFirst({
    where: {
      id: session.sessionId,
      userId: session.userId,
      revokedAt: null,
      expiresAt: { gt: now },
      absoluteExpiresAt: { gt: now },
    },
    select: { absoluteExpiresAt: true },
  });
  if (!currentSession) return false;

  const expiresAt = new Date(
    Math.min(
      now.getTime() + SESSION_DURATION_MS,
      currentSession.absoluteExpiresAt.getTime()
    )
  );
  const result = await prisma.session.updateMany({
    where: {
      id: session.sessionId,
      userId: session.userId,
      revokedAt: null,
      expiresAt: { gt: now },
      absoluteExpiresAt: currentSession.absoluteExpiresAt,
    },
    data: { expiresAt, lastSeenAt: now },
  });

  if (result.count !== 1) return false;
  await writeAuthCookie(session);
  return true;
}

export async function deleteExpiredSessions(now = new Date()) {
  const revokedRetentionCutoff = new Date(
    now.getTime() - 30 * 24 * 60 * 60 * 1000
  );
  return prisma.session.deleteMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { absoluteExpiresAt: { lte: now } },
        { revokedAt: { lte: revokedRetentionCutoff } },
      ],
    },
  });
}
