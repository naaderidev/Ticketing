import type { CurrentUser } from "@/lib/current-user";
import { runSerializableTransaction } from "@/lib/database-transaction";
import {
  getPersistenceErrorCode,
  notFoundError,
} from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";

export type PartyContextDto = {
  partyId: number;
  type: "PERSON" | "ORGANIZATION";
  displayName: string;
  organization: {
    id: number;
    legalName: string;
    membershipId: number;
    role: "REPRESENTATIVE" | "MANAGER";
    scopes: Array<{
      type: "ORGANIZATION" | "BRANCH" | "CONTRACT" | "ASSET";
      scopeKey: string;
    }>;
  } | null;
};

async function createMissingPersonParty(userId: number): Promise<void> {
  try {
    await runSerializableTransaction(async (transaction) => {
      const user = await transaction.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          personProfile: { select: { id: true } },
        },
      });
      if (!user) throw notFoundError("کاربر یافت نشد");
      if (user.personProfile) return;

      await transaction.party.create({
        data: {
          type: "PERSON",
          displayName: `${user.firstName} ${user.lastName}`.trim(),
          personProfile: { create: { userId: user.id } },
        },
      });
    });
  } catch (error) {
    if (getPersistenceErrorCode(error) !== "P2002") throw error;
  }
}

export async function getAvailablePartyContexts(
  userId: number,
  now = new Date()
): Promise<PartyContextDto[]> {
  let personProfile = await prisma.personProfile.findUnique({
    where: { userId },
    include: { party: true },
  });

  if (!personProfile) {
    await createMissingPersonParty(userId);
    personProfile = await prisma.personProfile.findUnique({
      where: { userId },
      include: { party: true },
    });
  }
  if (!personProfile) throw notFoundError("طرف حساب فردی کاربر یافت نشد");

  const memberships = await prisma.organizationMembership.findMany({
    where: {
      userId,
      status: "ACTIVE",
      validFrom: { lte: now },
      OR: [{ validTo: null }, { validTo: { gt: now } }],
      organization: {
        status: "ACTIVE",
        party: { status: "ACTIVE" },
      },
    },
    include: {
      scopes: { orderBy: [{ type: "asc" }, { scopeKey: "asc" }] },
      organization: { include: { party: true } },
    },
    orderBy: { organization: { legalName: "asc" } },
  });

  return [
    {
      partyId: personProfile.party.id,
      type: "PERSON",
      displayName: personProfile.party.displayName,
      organization: null,
    },
    ...memberships.map((membership) => ({
      partyId: membership.organization.party.id,
      type: "ORGANIZATION" as const,
      displayName: membership.organization.party.displayName,
      organization: {
        id: membership.organization.id,
        legalName: membership.organization.legalName,
        membershipId: membership.id,
        role: membership.role,
        scopes: membership.scopes.map((scope) => ({
          type: scope.type,
          scopeKey: scope.scopeKey,
        })),
      },
    })),
  ];
}

export async function getPartyContextSnapshot(user: CurrentUser) {
  const [contexts, session] = await Promise.all([
    getAvailablePartyContexts(user.id),
    prisma.session.findUnique({
      where: { id: user.sessionId },
      select: { activePartyId: true },
    }),
  ]);

  const activePartyId = contexts.some(
    (context) => context.partyId === session?.activePartyId
  )
    ? session?.activePartyId ?? contexts[0].partyId
    : contexts[0].partyId;

  return { activePartyId, contexts };
}

export async function switchActivePartyContext(input: {
  user: CurrentUser;
  partyId: number;
}) {
  const contexts = await getAvailablePartyContexts(input.user.id);
  const selectedContext = contexts.find(
    (context) => context.partyId === input.partyId
  );
  if (!selectedContext) throw notFoundError("طرف حساب یافت نشد");

  const updated = await prisma.session.updateMany({
    where: {
      id: input.user.sessionId,
      userId: input.user.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
      absoluteExpiresAt: { gt: new Date() },
    },
    data: { activePartyId: selectedContext.partyId },
  });
  if (updated.count !== 1) throw notFoundError("نشست کاربری معتبر نیست");

  return selectedContext;
}

export async function getPersonPartyId(userId: number): Promise<number | null> {
  const profile = await prisma.personProfile.findUnique({
    where: { userId },
    select: { partyId: true },
  });
  return profile?.partyId ?? null;
}
