import { randomInt, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { SignJWT } from "jose";
import bcrypt from "bcryptjs";

const origin = process.env.R4_SMOKE_ORIGIN?.trim() || "http://localhost:3000";
const prisma = new PrismaClient();
const suffix = String(randomInt(100_000_000, 899_999_999));
const password = "Codex-R4-Temporary-Password!";
const identities = [
  {
    firstName: "کاربر",
    lastName: "آزمایشی",
    nationalCode: `1${suffix}`,
    mobile: `09${suffix}`,
    password,
    confirmPassword: password,
    email: `codex-r4-${suffix}-one@example.invalid`,
    birthday: "1400/01/01",
  },
  {
    firstName: "کاربر",
    lastName: "دوم",
    nationalCode: `2${suffix}`,
    mobile: `09${String(Number(suffix) + 1).padStart(9, "0")}`,
    password,
    confirmPassword: password,
    email: `codex-r4-${suffix}-two@example.invalid`,
    birthday: "1400/01/01",
  },
];

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

function mutationHeaders(cookie, extra = {}) {
  return {
    "Content-Type": "application/json",
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
    ...(cookie ? { Cookie: cookie } : {}),
    ...extra,
  };
}

async function postJson(path, body, cookie, extraHeaders = {}) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    headers: mutationHeaders(cookie, extraHeaders),
    body: JSON.stringify(body),
  });
}

async function provisionIdentity(identity) {
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        firstName: identity.firstName,
        lastName: identity.lastName,
        nationalCode: identity.nationalCode,
        mobile: identity.mobile,
        passwordHash,
        email: identity.email,
        birthday: identity.birthday,
        role: "USER",
      },
    });
    await transaction.party.create({
      data: {
        type: "PERSON",
        displayName: `${identity.firstName} ${identity.lastName}`,
        personProfile: { create: { userId: user.id } },
      },
    });
  });
}

async function createSessionCookie(identity) {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) {
    throw new Error("JWT_SECRET is unavailable for the runtime smoke test");
  }
  const user = await prisma.user.findUnique({
    where: { email: identity.email },
    select: { id: true, personProfile: { select: { partyId: true } } },
  });
  if (!user?.personProfile) throw new Error("Temporary user Party was not created");
  const sessionId = randomUUID();
  const now = Date.now();
  await prisma.session.create({
    data: {
      id: sessionId,
      userId: user.id,
      activePartyId: user.personProfile.partyId,
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
    .sign(new TextEncoder().encode(jwtSecret));
  return `auth-token=${token}`;
}

async function cleanup() {
  const emails = identities.map((identity) => identity.email);
  const users = await prisma.user.findMany({
    where: { email: { in: emails } },
    select: {
      id: true,
      personProfile: { select: { partyId: true } },
    },
  });
  const userIds = users.map((user) => user.id);
  const partyIds = users.flatMap((user) =>
    user.personProfile ? [user.personProfile.partyId] : []
  );
  let ticketsDeleted = 0;
  if (userIds.length > 0) {
    const tickets = await prisma.ticket.findMany({
      where: {
        OR: [
          { userId: { in: userIds } },
          { createdById: { in: userIds } },
          ...(partyIds.length > 0 ? [{ partyId: { in: partyIds } }] : []),
        ],
      },
      select: { id: true, ticketId: true },
    });
    await prisma.outboxEvent.deleteMany({
      where: {
        aggregateType: "TICKET",
        aggregateId: { in: tickets.map((ticket) => ticket.ticketId) },
      },
    });
    ticketsDeleted = (
      await prisma.ticket.deleteMany({
        where: { id: { in: tickets.map((ticket) => ticket.id) } },
      })
    ).count;
    await prisma.personProfile.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (partyIds.length > 0) {
      await prisma.party.deleteMany({ where: { id: { in: partyIds } } });
    }
  }
  return { usersDeleted: userIds.length, ticketsDeleted };
}

async function main() {
  const result = {};
  try {
    for (const identity of identities) await provisionIdentity(identity);
    const [customerCookie, otherCookie] = await Promise.all(
      identities.map(createSessionCookie)
    );

    const catalogResponse = await fetch(`${origin}/api/v2/support/catalog`, {
      headers: { Cookie: customerCookie },
    });
    expectStatus(catalogResponse, 200, "customer catalog");
    const catalog = await readJson(catalogResponse);
    const requestType = catalog.data
      .flatMap((service) => service.requestTypes)
      .find((candidate) => !candidate.requiresBusinessSubject);
    if (!requestType) throw new Error("No request type without a business subject is active");

    const createKey = randomUUID();
    const createBody = {
      requestTypeId: requestType.id,
      subject: `R4 smoke ${suffix}`,
      description: "بررسی runtime هسته تیکت نسخه جدید",
    };
    const createResponse = await postJson(
      "/api/v2/tickets",
      createBody,
      customerCookie,
      { "Idempotency-Key": createKey }
    );
    expectStatus(createResponse, 201, "create ticket");
    const created = await readJson(createResponse);
    const ticketId = created.data.ticketId;
    const initialEtag = createResponse.headers.get("etag");
    if (!ticketId || !initialEtag) throw new Error("Create response omitted ticket id or ETag");

    const createReplay = await postJson(
      "/api/v2/tickets",
      createBody,
      customerCookie,
      { "Idempotency-Key": createKey }
    );
    expectStatus(createReplay, 200, "create idempotency replay");
    if (createReplay.headers.get("idempotency-replayed") !== "true") {
      throw new Error("Create replay header is missing");
    }

    const messageBody = { message: "پیام پیگیری runtime" };
    const messageKey = randomUUID();
    const missingPrecondition = await postJson(
      `/api/v2/tickets/${ticketId}/messages`,
      messageBody,
      customerCookie,
      { "Idempotency-Key": randomUUID() }
    );
    expectStatus(missingPrecondition, 428, "message precondition");

    const messageResponse = await postJson(
      `/api/v2/tickets/${ticketId}/messages`,
      messageBody,
      customerCookie,
      { "Idempotency-Key": messageKey, "If-Match": initialEtag }
    );
    expectStatus(messageResponse, 200, "add message");
    const messageEtag = messageResponse.headers.get("etag");
    if (!messageEtag || messageEtag === initialEtag) {
      throw new Error("Ticket version did not advance after message");
    }

    const messageReplay = await postJson(
      `/api/v2/tickets/${ticketId}/messages`,
      messageBody,
      customerCookie,
      { "Idempotency-Key": messageKey, "If-Match": initialEtag }
    );
    expectStatus(messageReplay, 200, "message idempotency replay");
    if (messageReplay.headers.get("idempotency-replayed") !== "true") {
      throw new Error("Message replay header is missing");
    }

    const reusedKey = await postJson(
      `/api/v2/tickets/${ticketId}/messages`,
      { message: "محتوای متفاوت" },
      customerCookie,
      { "Idempotency-Key": messageKey, "If-Match": messageEtag }
    );
    expectStatus(reusedKey, 409, "idempotency key reuse");

    const staleVersion = await postJson(
      `/api/v2/tickets/${ticketId}/messages`,
      { message: "نسخه قدیمی" },
      customerCookie,
      { "Idempotency-Key": randomUUID(), "If-Match": initialEtag }
    );
    expectStatus(staleVersion, 409, "stale ticket version");

    await prisma.ticket.update({
      where: { ticketId },
      data: {
        lifecycleStatus: "RESOLVED",
        status: "IN_PROGRESS",
        resolutionSummary: "نتیجه آزمایشی آماده تأیید است",
        version: { increment: 1 },
      },
    });
    const resolvedResponse = await fetch(`${origin}/api/v2/tickets/${ticketId}`, {
      headers: { Cookie: customerCookie },
    });
    expectStatus(resolvedResponse, 200, "resolved ticket read");
    const resolvedEtag = resolvedResponse.headers.get("etag");
    if (!resolvedEtag) throw new Error("Resolved ticket response omitted ETag");

    const confirmKey = randomUUID();
    const confirmResponse = await postJson(
      `/api/v2/tickets/${ticketId}/confirm-resolution`,
      {},
      customerCookie,
      { "Idempotency-Key": confirmKey, "If-Match": resolvedEtag }
    );
    expectStatus(confirmResponse, 200, "confirm resolution");
    const closedEtag = confirmResponse.headers.get("etag");
    if (!closedEtag) throw new Error("Confirm response omitted ETag");
    const confirmReplay = await postJson(
      `/api/v2/tickets/${ticketId}/confirm-resolution`,
      {},
      customerCookie,
      { "Idempotency-Key": confirmKey, "If-Match": resolvedEtag }
    );
    expectStatus(confirmReplay, 200, "confirm resolution replay");

    const ratingResponse = await postJson(
      `/api/v2/tickets/${ticketId}/rating`,
      { rating: 5 },
      customerCookie,
      { "Idempotency-Key": randomUUID(), "If-Match": closedEtag }
    );
    expectStatus(ratingResponse, 200, "rate closed ticket");
    const ratedEtag = ratingResponse.headers.get("etag");
    if (!ratedEtag) throw new Error("Rating response omitted ETag");

    const reopenResponse = await postJson(
      `/api/v2/tickets/${ticketId}/reopen`,
      { reason: "مشکل پس از تأیید دوباره رخ داد" },
      customerCookie,
      { "Idempotency-Key": randomUUID(), "If-Match": ratedEtag }
    );
    expectStatus(reopenResponse, 200, "reopen ticket");

    const resetToResolved = await prisma.ticket.update({
      where: { ticketId },
      data: {
        lifecycleStatus: "RESOLVED",
        status: "IN_PROGRESS",
        closedAt: null,
        closedBy: null,
        closedReason: null,
        version: { increment: 1 },
      },
      select: { version: true },
    });
    const rejectResponse = await postJson(
      `/api/v2/tickets/${ticketId}/reject-resolution`,
      { reason: "راهکار مسئله را کامل حل نکرد" },
      customerCookie,
      {
        "Idempotency-Key": randomUUID(),
        "If-Match": `W/"ticket-${ticketId}-v${resetToResolved.version}"`,
      }
    );
    expectStatus(rejectResponse, 200, "reject resolution");

    const otherTenantRead = await fetch(`${origin}/api/v2/tickets/${ticketId}`, {
      headers: { Cookie: otherCookie },
    });
    expectStatus(otherTenantRead, 404, "cross-party ticket read");

    const listResponse = await fetch(`${origin}/api/v2/tickets?limit=1`, {
      headers: { Cookie: customerCookie },
    });
    expectStatus(listResponse, 200, "ticket list");
    const listed = await readJson(listResponse);
    if (!listed.data.some((ticket) => ticket.ticketId === ticketId)) {
      throw new Error("Created ticket is missing from the active Party list");
    }

    const timelineResponse = await fetch(
      `${origin}/api/v2/tickets/${ticketId}/timeline?limit=1`,
      { headers: { Cookie: customerCookie } }
    );
    expectStatus(timelineResponse, 200, "ticket timeline");
    const timeline = await readJson(timelineResponse);
    if (!timeline.page.hasMore || !timeline.page.nextCursor) {
      throw new Error("Timeline cursor was not produced for a multi-item timeline");
    }
    const cursor = timeline.page.nextCursor;
    const replacement = cursor.endsWith("0") ? "1" : "0";
    const tamperedCursor = `${cursor.slice(0, -1)}${replacement}`;
    const tamperedTimeline = await fetch(
      `${origin}/api/v2/tickets/${ticketId}/timeline?cursor=${encodeURIComponent(tamperedCursor)}`,
      { headers: { Cookie: customerCookie } }
    );
    expectStatus(tamperedTimeline, 422, "tampered timeline cursor");

    result.runtime = {
      create: createResponse.status,
      createReplay: createReplay.status,
      missingIfMatch: missingPrecondition.status,
      message: messageResponse.status,
      messageReplay: messageReplay.status,
      reusedKey: reusedKey.status,
      staleVersion: staleVersion.status,
      confirmResolution: confirmResponse.status,
      confirmReplay: confirmReplay.status,
      rating: ratingResponse.status,
      reopen: reopenResponse.status,
      rejectResolution: rejectResponse.status,
      crossPartyRead: otherTenantRead.status,
      list: listResponse.status,
      timeline: timelineResponse.status,
      tamperedCursor: tamperedTimeline.status,
    };
  } finally {
    result.cleanup = await cleanup();
    await prisma.$disconnect();
  }
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "R4 runtime smoke failed");
  process.exitCode = 1;
});
