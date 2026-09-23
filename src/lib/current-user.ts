import { prisma } from "@/lib/prisma";
import { getSessionToken } from "@/lib/auth";

export interface CurrentUser {
  id: number;
  mobile: string;
  firstName: string;
  lastName: string;
  role: "USER" | "ADMIN";
  sessionId: string;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await getSessionToken();
  if (!token) return null;

  const session = await prisma.session.findFirst({
    where: {
      id: token.sessionId,
      userId: token.userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      absoluteExpiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      user: {
        select: {
          id: true,
          mobile: true,
          firstName: true,
          lastName: true,
          role: true,
        },
      },
    },
  });

  if (!session) return null;
  return { ...session.user, sessionId: session.id };
}
