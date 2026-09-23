import { prisma } from "@/lib/prisma";

export const KNOWLEDGE_PERMISSIONS = {
  MANAGE: "knowledge.article.manage",
  PUBLISH: "knowledge.article.publish",
} as const;

export async function hasGlobalKnowledgePermission(
  userId: number,
  permissionKey: string,
  now = new Date()
): Promise<boolean> {
  const assignment = await prisma.userRoleAssignment.findFirst({
    where: {
      userId,
      scopeType: "GLOBAL",
      scopeKey: "*",
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      role: {
        permissions: { some: { permission: { key: permissionKey } } },
      },
    },
    select: { id: true },
  });
  return assignment !== null;
}
