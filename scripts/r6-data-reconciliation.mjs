import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

try {
  const [total, verified, missingCanonicalSnapshot, sourceGroups] =
    await Promise.all([
      prisma.ticketBusinessReference.count(),
      prisma.ticketBusinessReference.count({
        where: { verificationStatus: "VERIFIED" },
      }),
      prisma.ticketBusinessReference.count({
        where: {
          OR: [
            { sourceSystem: null },
            { entityType: null },
            { externalId: null },
            { snapshotFetchedAt: null },
          ],
        },
      }),
      prisma.ticketBusinessReference.groupBy({
        by: ["sourceSystem", "entityType", "verificationStatus"],
        _count: { _all: true },
      }),
    ]);

  const invalidExternalVerified = await prisma.ticketBusinessReference.count({
    where: {
      sourceSystem: { not: null, notIn: ["TICKETING_LOCAL"] },
      verificationStatus: { not: "VERIFIED" },
    },
  });

  const result = {
    counts: {
      total,
      verified,
      sources: sourceGroups.map((group) => ({
        sourceSystem: group.sourceSystem,
        entityType: group.entityType,
        verificationStatus: group.verificationStatus,
        count: group._count._all,
      })),
    },
    invariants: {
      missingCanonicalSnapshot,
      invalidExternalVerified,
    },
  };
  const ok = Object.values(result.invariants).every((value) => value === 0);
  console.log(JSON.stringify({ ok, ...result }));
  if (!ok) process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
