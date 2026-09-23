import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const origin = process.env.R5_SMOKE_ORIGIN?.trim() || "http://localhost:3000";
const maintenanceToken =
  process.env.SLA_MAINTENANCE_TOKEN?.trim() ||
  process.env.ATTACHMENT_CLEANUP_TOKEN?.trim();
const jwtSecret = process.env.JWT_SECRET?.trim();
const prisma = new PrismaClient();
const suffix = String(randomInt(100_000_000, 899_999_999));
const identity = {
  mobile: `09${suffix}`,
  nationalCode: `3${suffix}`,
  email: `codex-r5-${suffix}@example.invalid`,
  password: "Codex-R5-Temporary-Password!",
};

function requireSecret(value, name) {
  if (!value || value.length < 32) {
    throw new Error(`${name} is unavailable for the R5 runtime smoke test`);
  }
  return value;
}

async function readJson(response) {
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`${response.url} returned HTTP ${response.status}`);
  }
  return body;
}

function mutationHeaders(cookie, extra = {}) {
  return {
    "Content-Type": "application/json",
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
    Cookie: cookie,
    ...extra,
  };
}

async function runMaintenance() {
  const response = await fetch(`${origin}/api/internal/sla/process`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireSecret(maintenanceToken, "SLA_MAINTENANCE_TOKEN")}`,
    },
  });
  return readJson(response);
}

async function provisionUser() {
  const passwordHash = await bcrypt.hash(identity.password, 12);
  return prisma.$transaction(async (transaction) => {
    const user = await transaction.user.create({
      data: {
        firstName: "کاربر",
        lastName: "آزمایشی SLA",
        nationalCode: identity.nationalCode,
        mobile: identity.mobile,
        passwordHash,
        email: identity.email,
        birthday: "1400/01/01",
        role: "USER",
      },
    });
    const party = await transaction.party.create({
      data: {
        type: "PERSON",
        displayName: "کاربر آزمایشی SLA",
        personProfile: { create: { userId: user.id } },
      },
    });
    return { userId: user.id, partyId: party.id };
  });
}

async function createCookie(userId, partyId) {
  const sessionId = randomUUID();
  const now = Date.now();
  await prisma.session.create({
    data: {
      id: sessionId,
      userId,
      activePartyId: partyId,
      expiresAt: new Date(now + 7 * 24 * 60 * 60 * 1000),
      absoluteExpiresAt: new Date(now + 30 * 24 * 60 * 60 * 1000),
    },
  });
  const token = await new SignJWT({ sid: sessionId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(String(userId))
    .setIssuer("ticketing-system")
    .setAudience("ticketing-web")
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(requireSecret(jwtSecret, "JWT_SECRET")));
  return `auth-token=${token}`;
}

async function appendCustomerInputRequest(ticket) {
  const occurredAt = new Date();
  await prisma.$transaction(async (transaction) => {
    await transaction.ticket.update({
      where: { id: ticket.id },
      data: { lifecycleStatus: "WAITING_USER", version: { increment: 1 } },
    });
    const eventId = randomUUID();
    const event = await transaction.ticketEvent.create({
      data: {
        eventId,
        ticketId: ticket.id,
        type: "ticket.customer_input_requested.v1",
        schemaVersion: 1,
        aggregateVersion: ticket.version + 1,
        visibility: "INTERNAL",
        fromStatus: ticket.lifecycleStatus,
        toStatus: "WAITING_USER",
        actorType: "SYSTEM",
        sourceType: "AUTOMATION",
        reason: "R5 runtime smoke",
        createdAt: occurredAt,
      },
    });
    await transaction.outboxEvent.create({
      data: {
        eventId,
        ticketEventId: event.id,
        aggregateType: "TICKET",
        aggregateId: ticket.ticketId,
        eventType: "ticket.customer_input_requested.v1",
        occurredAt,
        availableAt: occurredAt,
        payload: {
          eventId,
          eventType: "ticket.customer_input_requested.v1",
          aggregateType: "TICKET",
          aggregateId: ticket.ticketId,
          aggregateVersion: ticket.version + 1,
          schemaVersion: 1,
          occurredAt: occurredAt.toISOString(),
          actor: { type: "SYSTEM", id: null },
          sourceType: "AUTOMATION",
          scope: { partyId: null, organizationId: null },
          correlationId: null,
          causationId: null,
          payload: {
            fromStatus: ticket.lifecycleStatus,
            toStatus: "WAITING_USER",
            dimensions: { snapshotStatus: "INCOMPLETE", legacyImported: false },
            attributes: {},
          },
        },
      },
    });
  });
}

async function cleanup(userId, partyId, ticketId) {
  if (ticketId) {
    await prisma.outboxEvent.deleteMany({
      where: { aggregateType: "TICKET", aggregateId: ticketId },
    });
    await prisma.ticket.deleteMany({ where: { ticketId } });
  }
  if (userId) {
    await prisma.personProfile.deleteMany({ where: { userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  if (partyId) await prisma.party.deleteMany({ where: { id: partyId } });
}

async function main() {
  let userId;
  let partyId;
  let ticketId;
  const result = {};
  try {
    ({ userId, partyId } = await provisionUser());
    const cookie = await createCookie(userId, partyId);
    const catalog = await readJson(
      await fetch(`${origin}/api/v2/support/catalog`, { headers: { Cookie: cookie } })
    );
    const requestType = catalog.data
      .flatMap((service) => service.requestTypes)
      .find((candidate) => !candidate.requiresBusinessSubject);
    if (!requestType?.slaPolicy) throw new Error("Active catalog SLA policy is missing");

    const createResponse = await fetch(`${origin}/api/v2/tickets`, {
      method: "POST",
      headers: mutationHeaders(cookie, { "Idempotency-Key": randomUUID() }),
      body: JSON.stringify({
        requestTypeId: requestType.id,
        subject: `R5 smoke ${suffix}`,
        description: "بررسی runtime SLA و Routing",
      }),
    });
    const created = await readJson(createResponse);
    ticketId = created.data.ticketId;
    if (!created.data.sla || created.data.sla.mode !== "OBSERVE_ONLY") {
      throw new Error("Ticket did not expose an observe-only SLA snapshot");
    }

    const ticket = await prisma.ticket.findUnique({
      where: { ticketId },
      include: { sla: true, routingDecisions: true },
    });
    if (!ticket?.sla || ticket.sla.legacyImported) {
      throw new Error("Native ticket SLA snapshot was not persisted");
    }
    if (ticket.routingDecisions.length !== 1) {
      throw new Error("Ticket must have exactly one initial routing decision");
    }

    await appendCustomerInputRequest(ticket);
    let pauseObserved = false;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      await runMaintenance();
      const sla = await prisma.ticketSla.findUnique({ where: { ticketId: ticket.id } });
      if (sla?.pausedAt) {
        pauseObserved = true;
        break;
      }
    }
    if (!pauseObserved) throw new Error("SLA pause projection was not observed");

    const waitingTicket = await prisma.ticket.findUnique({
      where: { id: ticket.id },
      select: { version: true },
    });
    const replyResponse = await fetch(`${origin}/api/v2/tickets/${ticketId}/messages`, {
      method: "POST",
      headers: mutationHeaders(cookie, {
        "Idempotency-Key": randomUUID(),
        "If-Match": `W/"ticket-${ticketId}-v${waitingTicket.version}"`,
      }),
      body: JSON.stringify({ message: "اطلاعات تکمیلی موردنیاز ارسال شد" }),
    });
    await readJson(replyResponse);

    const resumed = await prisma.ticketSla.findUnique({
      where: { ticketId: ticket.id },
      include: { pauses: true },
    });
    if (resumed?.pausedAt || resumed?.resolutionState !== "PENDING") {
      throw new Error("Customer reply did not resume the resolution SLA");
    }
    if (resumed.pauses.length !== 1 || !resumed.pauses[0].endedAt) {
      throw new Error("SLA pause history was not closed exactly once");
    }

    for (let attempt = 0; attempt < 8; attempt += 1) {
      await runMaintenance();
      const remaining = await prisma.outboxDelivery.count({
        where: {
          consumer: "SLA_ROUTING_V1",
          status: { not: "SUCCEEDED" },
          outboxEvent: { aggregateId: ticketId },
        },
      });
      if (remaining === 0) break;
    }
    const [events, succeeded, unhealthy] = await Promise.all([
      prisma.outboxEvent.count({ where: { aggregateId: ticketId } }),
      prisma.outboxDelivery.count({
        where: {
          consumer: "SLA_ROUTING_V1",
          status: "SUCCEEDED",
          outboxEvent: { aggregateId: ticketId },
        },
      }),
      prisma.outboxDelivery.count({
        where: {
          consumer: "SLA_ROUTING_V1",
          status: { in: ["PENDING", "PROCESSING", "RETRY", "DEAD_LETTER"] },
          outboxEvent: { aggregateId: ticketId },
        },
      }),
    ]);
    if (events !== succeeded || unhealthy !== 0) {
      throw new Error("R5 outbox deliveries did not drain cleanly");
    }

    result.runtime = {
      create: createResponse.status,
      policyCode: ticket.sla.policyCode,
      routingDecisions: ticket.routingDecisions.length,
      pauseHistory: resumed.pauses.length,
      outboxEvents: events,
      outboxSucceeded: succeeded,
      unhealthyDeliveries: unhealthy,
    };
  } finally {
    await cleanup(userId, partyId, ticketId);
    await prisma.$disconnect();
  }
  console.log(JSON.stringify(result));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "R5 runtime smoke failed");
  process.exitCode = 1;
});
