import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const origin = process.env.R8_SMOKE_ORIGIN?.trim() || "http://localhost:3000";
const jwtSecret = process.env.JWT_SECRET?.trim();
const prisma = new PrismaClient();
const suffix = String(randomInt(100_000_000, 899_999_999));
const createdUsers = [];
const createdParties = [];

function requiredSecret() { if (!jwtSecret || jwtSecret.length < 32) throw new Error("JWT_SECRET is unavailable for the R8 runtime smoke test"); return jwtSecret; }
async function json(response) { const text = await response.text(); try { return text ? JSON.parse(text) : null; } catch { throw new Error(`Expected JSON from ${response.url}; received ${response.status}`); } }
function status(response, expected, label) { if (response.status !== expected) throw new Error(`${label}: expected ${expected}, received ${response.status}`); }
async function token(userId, sessionId) { return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(String(userId)).setIssuer("ticketing-system").setAudience("ticketing-web").setIssuedAt().setExpirationTime("7d").sign(new TextEncoder().encode(requiredSecret())); }

async function provisionUser(role, label) {
  const user = await prisma.user.create({ data: { firstName: role === "ADMIN" ? "کارشناس" : "کاربر", lastName: `آزمایشی ${label}`, nationalCode: `${role === "ADMIN" ? 8 : 7}${suffix}`, mobile: `${role === "ADMIN" ? "08" : "09"}${suffix}`, passwordHash: await bcrypt.hash("Codex-R8-Temporary-Password!", 12), email: `codex-${label.toLowerCase()}-${suffix}@example.invalid`, birthday: "1400/01/01", role } });
  const party = await prisma.party.create({ data: { type: "PERSON", displayName: `${role === "ADMIN" ? "کارشناس" : "کاربر"} آزمایشی ${label}`, personProfile: { create: { userId: user.id } } } });
  const sessionId = randomUUID(); const now = Date.now();
  await prisma.session.create({ data: { id: sessionId, userId: user.id, activePartyId: party.id, expiresAt: new Date(now + 604_800_000), absoluteExpiresAt: new Date(now + 2_592_000_000) } });
  createdUsers.push(user.id); createdParties.push(party.id);
  return { userId: user.id, cookie: `auth-token=${await token(user.id, sessionId)}` };
}

async function post(cookie, url, body, etag, key = randomUUID()) {
  return fetch(`${origin}${url}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin", "Idempotency-Key": key, ...(etag ? { "If-Match": etag } : {}) }, body: JSON.stringify(body) });
}

async function cleanup() {
  const tickets = await prisma.ticket.findMany({ where: { createdById: { in: createdUsers } }, select: { id: true, ticketId: true } });
  if (tickets.length) {
    await prisma.outboxEvent.deleteMany({ where: { aggregateType: "TICKET", aggregateId: { in: tickets.map((ticket) => ticket.ticketId) } } });
    await prisma.ticket.deleteMany({ where: { id: { in: tickets.map((ticket) => ticket.id) } } });
  }
  await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.personProfile.deleteMany({ where: { userId: { in: createdUsers } } });
  await prisma.user.deleteMany({ where: { id: { in: createdUsers } } });
  await prisma.party.deleteMany({ where: { id: { in: createdParties } } });
}

async function main() {
  const result = {};
  try {
    const customer = await provisionUser("USER", "R8-CUSTOMER");
    const staff = await provisionUser("ADMIN", "R8-STAFF");
    const [systemAdministratorRole, agentRole] = await Promise.all([
      prisma.role.findUnique({ where: { key: "SYSTEM_ADMINISTRATOR" }, select: { id: true } }),
      prisma.role.findUnique({ where: { key: "SUPPORT_AGENT" }, select: { id: true } }),
    ]);
    if (!systemAdministratorRole || !agentRole) throw new Error("Workspace roles are not seeded");
    await prisma.userRoleAssignment.create({ data: { userId: staff.userId, roleId: systemAdministratorRole.id, scopeType: "GLOBAL", scopeKey: "*", status: "ACTIVE" } });

    const catalogResponse = await fetch(`${origin}/api/v2/support/catalog`, { headers: { Cookie: customer.cookie } }); status(catalogResponse, 200, "catalog");
    const catalog = await json(catalogResponse);
    const requestType = catalog.data.flatMap((service) => service.requestTypes).find((candidate) => !candidate.requiresBusinessSubject && !candidate.requiresRootCause);
    if (!requestType) throw new Error("No suitable request type exists for R8 smoke");
    const createResponse = await post(customer.cookie, "/api/v2/tickets", { requestTypeId: requestType.id, subject: `R8 agent workspace ${suffix}`, description: "سناریوی کامل فضای کاری کارشناس", businessReferences: [], attachments: [] });
    status(createResponse, 201, "customer create"); const created = await json(createResponse); const ticketId = created.data.ticketId;
    const createdTicket = await prisma.ticket.findUnique({ where: { ticketId }, select: { supportTeamId: true } });
    if (!createdTicket?.supportTeamId) throw new Error("Created ticket has no support team");
    await prisma.userRoleAssignment.create({ data: { userId: staff.userId, roleId: agentRole.id, supportTeamId: createdTicket.supportTeamId, scopeType: "SUPPORT_TEAM", scopeKey: String(createdTicket.supportTeamId), status: "ACTIVE" } });

    const workspacePage = await fetch(`${origin}/admin/workspace`, { headers: { Cookie: staff.cookie } }); status(workspacePage, 200, "workspace page");
    if (!(await workspacePage.text()).includes("فضای کاری پشتیبانی")) throw new Error("Workspace dashboard did not render R8 UI");
    const queuesResponse = await fetch(`${origin}/api/v2/workspace/queues`, { headers: { Cookie: staff.cookie } }); status(queuesResponse, 200, "workspace queues");
    const queues = await json(queuesResponse); if (!queues.data.length) throw new Error("No workspace queues are visible");
    const listResponse = await fetch(`${origin}/api/v2/workspace/tickets?limit=100`, { headers: { Cookie: staff.cookie } }); status(listResponse, 200, "workspace list");
    const list = await json(listResponse); if (!list.data.some((ticket) => ticket.ticketId === ticketId)) throw new Error("Created ticket is outside workspace scope");
    const detailResponse = await fetch(`${origin}/api/v2/workspace/tickets/${ticketId}`, { headers: { Cookie: staff.cookie } }); status(detailResponse, 200, "workspace detail"); let detail = await json(detailResponse); let etag = detailResponse.headers.get("etag");

    const noteResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/internal-notes`, { message: "یادداشت محرمانه R8", attachments: [] }, etag); status(noteResponse, 200, "internal note"); detail = await json(noteResponse); etag = noteResponse.headers.get("etag");
    const customerAfterNote = await fetch(`${origin}/api/v2/tickets/${ticketId}`, { headers: { Cookie: customer.cookie } }); status(customerAfterNote, 200, "customer isolation read");
    if ((await json(customerAfterNote)).data.messages.some((message) => message.body.includes("محرمانه"))) throw new Error("Internal note leaked into customer DTO");

    const assignResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/assign`, { ownerUserId: staff.userId, reason: "مالکیت تست R8" }, etag); status(assignResponse, 200, "assign"); detail = await json(assignResponse); etag = assignResponse.headers.get("etag");
    const priorityResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/priority-change`, { priority: "HIGH", reason: "اعتبارسنجی اولویت" }, etag); status(priorityResponse, 200, "priority"); detail = await json(priorityResponse); etag = priorityResponse.headers.get("etag");
    const collaborationResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/collaborators`, { queueId: queues.data[0].id, request: "بررسی تخصصی داخلی" }, etag); status(collaborationResponse, 200, "collaboration"); detail = await json(collaborationResponse); etag = collaborationResponse.headers.get("etag");
    if (!detail.data.workItems.some((item) => item.request === "بررسی تخصصی داخلی") || detail.data.owner?.id !== staff.userId) throw new Error("Collaboration did not preserve the primary owner");
    const replyResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/public-replies`, { message: "پاسخ عمومی کارشناس R8", attachments: [] }, etag); status(replyResponse, 200, "public reply"); detail = await json(replyResponse); etag = replyResponse.headers.get("etag");
    const waitingResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/request-customer-input`, { message: "لطفاً اطلاعات تکمیلی بفرستید", attachments: [] }, etag); status(waitingResponse, 200, "request input"); detail = await json(waitingResponse); etag = waitingResponse.headers.get("etag");
    if (detail.data.status !== "WAITING_USER") throw new Error("Request input did not enter WAITING_USER");
    const customerReply = await post(customer.cookie, `/api/v2/tickets/${ticketId}/messages`, { message: "اطلاعات تکمیلی مشتری", attachments: [] }, etag); status(customerReply, 200, "customer reply"); etag = customerReply.headers.get("etag");
    const resolveKey = randomUUID();
    const resolveResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/resolve`, { resolutionSummary: "درخواست با موفقیت رسیدگی شد" }, etag, resolveKey); status(resolveResponse, 200, "resolve"); const resolved = await json(resolveResponse);
    const replayResponse = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/resolve`, { resolutionSummary: "درخواست با موفقیت رسیدگی شد" }, etag, resolveKey); status(replayResponse, 200, "resolve replay");
    if (replayResponse.headers.get("idempotency-replayed") !== "true") throw new Error("Workspace command replay was not identified");
    result.runtime = { workspacePage: workspacePage.status, list: listResponse.status, internalNote: noteResponse.status, internalIsolation: true, assignment: assignResponse.status, priority: resolved.data.priority, collaboration: collaborationResponse.status, requestCustomerInput: waitingResponse.status, resolution: resolved.data.status, replay: true };
  } finally { await cleanup(); await prisma.$disconnect(); }
  console.log(JSON.stringify(result));
}

main().catch((error) => { console.error(error instanceof Error ? error.message : "R8 runtime smoke failed"); process.exitCode = 1; });
