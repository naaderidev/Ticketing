import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const origin = process.env.R6_SMOKE_ORIGIN?.trim() || "http://localhost:3000";
const jwtSecret = process.env.JWT_SECRET?.trim();
const prisma = new PrismaClient();
const suffix = String(randomInt(100_000_000, 899_999_999));

function requireSecret(value, name) {
  if (!value || value.length < 32) {
    throw new Error(`${name} is unavailable for the R6 runtime smoke test`);
  }
  return value;
}

async function provisionUser() {
  const user = await prisma.user.create({
    data: {
      firstName: "کاربر",
      lastName: "آزمایشی R6",
      nationalCode: `4${suffix}`,
      mobile: `09${suffix}`,
      passwordHash: await bcrypt.hash("Codex-R6-Temporary-Password!", 12),
      email: `codex-r6-${suffix}@example.invalid`,
      birthday: "1400/01/01",
      role: "USER",
    },
  });
  const party = await prisma.party.create({
    data: {
      type: "PERSON",
      displayName: "کاربر آزمایشی R6",
      personProfile: { create: { userId: user.id } },
    },
  });
  const sessionId = randomUUID();
  const now = Date.now();
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      activePartyId: party.id,
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      absoluteExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(user.id))
    .setIssuer("ticketing-system")
    .setAudience("ticketing-web")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(requireSecret(jwtSecret, "JWT_SECRET")));
  return { userId: user.id, partyId: party.id, cookie: `auth-token=${token}` };
}

async function cleanup(userId, partyId) {
  if (userId) {
    await prisma.personProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  if (partyId) await prisma.party.deleteMany({ where: { id: partyId } });
}

async function main() {
  if (
    ["1", "true", "on"].includes(
      process.env.FEATURE_BUSINESS_REFERENCE_INTEGRATIONS_ENABLED?.toLowerCase()
    )
  ) {
    throw new Error("R6 fail-closed smoke requires the integration flag to be off");
  }

  let userId;
  let partyId;
  try {
    const provisioned = await provisionUser();
    ({ userId, partyId } = provisioned);
    const requestType = await prisma.supportRequestType.findFirst({
      where: {
        status: "ACTIVE",
        businessSubjectType: {
          in: [
            "CONTRACT",
            "INVOICE",
            "PAYMENT",
            "SETTLEMENT",
            "POWER_PLANT",
            "METER",
            "SAVING_PROGRAM",
          ],
        },
      },
      select: { id: true, businessSubjectType: true },
    });
    if (!requestType?.businessSubjectType) {
      throw new Error("No active external business subject request type exists");
    }

    const createResponse = await fetch(`${origin}/api/v2/tickets`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        Cookie: provisioned.cookie,
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        requestTypeId: requestType.id,
        subject: `R6 fail-closed smoke ${suffix}`,
        description: "Provider خاموش است و نباید داده تأییدنشده ذخیره شود",
        businessReferences: [
          { type: requestType.businessSubjectType, key: `R6-${suffix}` },
        ],
      }),
    });
    const createBody = await createResponse.json();
    if (
      createResponse.status !== 503 ||
      createBody?.error?.code !== "DEPENDENCY_UNAVAILABLE"
    ) {
      throw new Error(`Ticket create did not fail closed: HTTP ${createResponse.status}`);
    }
    const [tickets, receipts] = await Promise.all([
      prisma.ticket.count({ where: { createdById: userId } }),
      prisma.ticketCommandReceipt.count({ where: { actorUserId: userId } }),
    ]);
    if (tickets !== 0 || receipts !== 0) {
      throw new Error("Fail-closed verification left partial ticket state");
    }

    const searchResponse = await fetch(
      `${origin}/api/v2/business-subjects/${requestType.businessSubjectType}?q=R6`,
      { headers: { Cookie: provisioned.cookie } }
    );
    const searchBody = await searchResponse.json();
    if (searchResponse.status !== 404 || searchBody?.error?.code !== "NOT_FOUND") {
      throw new Error(`Disabled search endpoint was discoverable: HTTP ${searchResponse.status}`);
    }

    console.log(
      JSON.stringify({
        failClosedCreateStatus: createResponse.status,
        disabledSearchStatus: searchResponse.status,
        partialTickets: tickets,
        partialReceipts: receipts,
      })
    );
  } finally {
    await cleanup(userId, partyId);
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "R6 runtime smoke failed");
  process.exitCode = 1;
});
