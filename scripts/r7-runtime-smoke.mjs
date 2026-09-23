import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const origin = process.env.R7_SMOKE_ORIGIN?.trim() || "http://localhost:3000";
const jwtSecret = process.env.JWT_SECRET?.trim();
const prisma = new PrismaClient();
const suffix = String(randomInt(100_000_000, 899_999_999));

function requireSecret(value, name) {
  if (!value || value.length < 32) {
    throw new Error(`${name} is unavailable for the R7 runtime smoke test`);
  }
  return value;
}

async function readJson(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Expected JSON from ${response.url}; received HTTP ${response.status}`);
  }
}

function expectStatus(response, expected, label) {
  if (response.status !== expected) {
    throw new Error(`${label}: expected HTTP ${expected}, received ${response.status}`);
  }
}

async function provisionCustomer() {
  const user = await prisma.user.create({
    data: {
      firstName: "کاربر",
      lastName: "آزمایشی R7",
      nationalCode: `7${suffix}`,
      mobile: `09${suffix}`,
      passwordHash: await bcrypt.hash("Codex-R7-Temporary-Password!", 12),
      email: `codex-r7-${suffix}@example.invalid`,
      birthday: "1400/01/01",
      role: "USER",
    },
  });
  const party = await prisma.party.create({
    data: {
      type: "PERSON",
      displayName: "کاربر آزمایشی R7",
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
  return {
    userId: user.id,
    partyId: party.id,
    cookie: `auth-token=${token}`,
  };
}

async function cleanup(userId, partyId) {
  if (!userId) return;
  const tickets = await prisma.ticket.findMany({
    where: { createdById: userId },
    select: { id: true, ticketId: true },
  });
  if (tickets.length > 0) {
    await prisma.outboxEvent.deleteMany({
      where: {
        aggregateType: "TICKET",
        aggregateId: { in: tickets.map((ticket) => ticket.ticketId) },
      },
    });
    await prisma.ticket.deleteMany({
      where: { id: { in: tickets.map((ticket) => ticket.id) } },
    });
  }
  await prisma.personProfile.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  if (partyId) await prisma.party.deleteMany({ where: { id: partyId } });
}

async function main() {
  let userId;
  let partyId;
  const result = {};
  try {
    const customer = await provisionCustomer();
    ({ userId, partyId } = customer);
    const headers = { Cookie: customer.cookie };

    const formPage = await fetch(`${origin}/user/tickets/new`, { headers });
    expectStatus(formPage, 200, "customer create page");
    const formHtml = await formPage.text();
    if (!formHtml.includes("درخواست جدید") || !formHtml.includes("در حال آماده‌سازی فرم")) {
      throw new Error("Customer create route did not render the R7 experience");
    }

    const catalogResponse = await fetch(`${origin}/api/v2/support/catalog`, { headers });
    expectStatus(catalogResponse, 200, "customer catalog");
    const catalog = await readJson(catalogResponse);
    const requestType = catalog.data
      .flatMap((service) => service.requestTypes)
      .find((candidate) => !candidate.requiresBusinessSubject);
    if (!requestType) throw new Error("No active request type without a business subject exists");

    const createResponse = await fetch(`${origin}/api/v2/tickets`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        "Idempotency-Key": randomUUID(),
      },
      body: JSON.stringify({
        requestTypeId: requestType.id,
        subject: `R7 customer experience ${suffix}`,
        description: "بررسی یکپارچه فرم، فهرست، جزئیات و پاسخ مشتری",
        businessReferences: [],
        attachments: [],
      }),
    });
    expectStatus(createResponse, 201, "customer create command");
    const created = await readJson(createResponse);
    const ticketId = created?.data?.ticketId;
    const etag = createResponse.headers.get("etag");
    if (!ticketId || !etag || created.data.status !== "IN_PROGRESS" || !created.data.sla) {
      throw new Error("Create response omitted the customer status, SLA, ticket id, or ETag");
    }

    const listPage = await fetch(`${origin}/user/tickets`, { headers });
    expectStatus(listPage, 200, "customer list page");
    if (!(await listPage.text()).includes("درخواست‌های من")) {
      throw new Error("Customer list route did not render the R7 experience");
    }

    const listResponse = await fetch(`${origin}/api/v2/tickets?limit=5`, { headers });
    expectStatus(listResponse, 200, "customer ticket list");
    const list = await readJson(listResponse);
    if (!list.data.some((ticket) => ticket.ticketId === ticketId)) {
      throw new Error("Created ticket is missing from the customer list");
    }

    const messageResponse = await fetch(`${origin}/api/v2/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: {
        ...headers,
        "Content-Type": "application/json",
        Origin: origin,
        "Sec-Fetch-Site": "same-origin",
        "Idempotency-Key": randomUUID(),
        "If-Match": etag,
      },
      body: JSON.stringify({
        message: "پاسخ مشتری از تجربه R7",
        attachments: [],
      }),
    });
    expectStatus(messageResponse, 200, "customer reply command");
    const updated = await readJson(messageResponse);
    if (!updated.data.messages.some((message) => message.body === "پاسخ مشتری از تجربه R7")) {
      throw new Error("Customer reply is missing from the public conversation");
    }

    const detailPage = await fetch(`${origin}/user/tickets/${ticketId}`, { headers });
    expectStatus(detailPage, 200, "customer detail page");
    if (!(await detailPage.text()).includes("در حال دریافت تیکت")) {
      throw new Error("Customer detail route did not render the R7 experience");
    }

    result.runtime = {
      createPage: formPage.status,
      createCommand: createResponse.status,
      listPage: listPage.status,
      listApi: listResponse.status,
      replyCommand: messageResponse.status,
      detailPage: detailPage.status,
      status: created.data.status,
      slaPresent: Boolean(created.data.sla),
    };
  } finally {
    await cleanup(userId, partyId);
    await prisma.$disconnect();
  }
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "R7 runtime smoke failed");
  process.exitCode = 1;
});
