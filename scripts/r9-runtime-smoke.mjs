import { randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { PrismaClient } from "@prisma/client";

const origin = process.env.R9_SMOKE_ORIGIN?.trim() || "http://localhost:3000";
const jwtSecret = process.env.JWT_SECRET?.trim();
const maintenanceToken = process.env.SLA_MAINTENANCE_TOKEN?.trim() || process.env.ATTACHMENT_CLEANUP_TOKEN?.trim();
const prisma = new PrismaClient();
const suffix = String(randomInt(100_000_000, 899_999_999));
const users = []; const parties = [];
function requireSecret(value, name) { if (!value || value.length < 32) throw new Error(`${name} is unavailable for R9 smoke`); return value; }
async function body(response) { const text = await response.text(); try { return text ? JSON.parse(text) : null; } catch { throw new Error(`Expected JSON from ${response.url}; got ${response.status}`); } }
function expectStatus(response, expected, label) { if (response.status !== expected) throw new Error(`${label}: expected ${expected}, received ${response.status}`); }
async function jwt(userId, sessionId) { return new SignJWT({ sid: sessionId }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setSubject(String(userId)).setIssuer("ticketing-system").setAudience("ticketing-web").setIssuedAt().setExpirationTime("7d").sign(new TextEncoder().encode(requireSecret(jwtSecret, "JWT_SECRET"))); }
async function createUser(role, marker) {
  const user = await prisma.user.create({ data: { firstName: role === "ADMIN" ? "کارشناس" : "مشتری", lastName: `R9 ${marker}`, nationalCode: `${role === "ADMIN" ? 6 : 5}${suffix}`, mobile: `${role === "ADMIN" ? "07" : "06"}${suffix}`, passwordHash: await bcrypt.hash("Temporary-R9-Password!", 12), email: `r9-${marker}-${suffix}@example.invalid`, birthday: "1400/01/01", role } });
  const party = await prisma.party.create({ data: { type: "PERSON", displayName: `${role === "ADMIN" ? "کارشناس" : "مشتری"} R9`, personProfile: { create: { userId: user.id } } } });
  const sessionId = randomUUID(); const now = Date.now();
  await prisma.session.create({ data: { id: sessionId, userId: user.id, activePartyId: party.id, expiresAt: new Date(now + 604_800_000), absoluteExpiresAt: new Date(now + 2_592_000_000) } });
  users.push(user.id); parties.push(party.id);
  return { id: user.id, cookie: `auth-token=${await jwt(user.id, sessionId)}` };
}
async function post(cookie, path, payload, etag, key = randomUUID()) { return fetch(`${origin}${path}`, { method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json", Origin: origin, "Sec-Fetch-Site": "same-origin", "Idempotency-Key": key, ...(etag ? { "If-Match": etag } : {}) }, body: JSON.stringify(payload) }); }
async function getTicket(cookie, path) { const response = await fetch(`${origin}${path}`, { headers: { Cookie: cookie } }); expectStatus(response, 200, `GET ${path}`); return { response, value: await body(response) }; }
async function cleanup() {
  const tickets = await prisma.ticket.findMany({ where: { createdById: { in: users } }, select: { id: true, ticketId: true } });
  if (tickets.length) { await prisma.outboxEvent.deleteMany({ where: { aggregateType: "TICKET", aggregateId: { in: tickets.map((ticket) => ticket.ticketId) } } }); await prisma.ticket.deleteMany({ where: { id: { in: tickets.map((ticket) => ticket.id) } } }); }
  await prisma.userRoleAssignment.deleteMany({ where: { userId: { in: users } } }); await prisma.personProfile.deleteMany({ where: { userId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.party.deleteMany({ where: { id: { in: parties } } });
}

async function main() {
  const result = {};
  try {
    const customer = await createUser("USER", "customer"); const staff = await createUser("ADMIN", "staff");
    const [managerRole, agentRole] = await Promise.all([prisma.role.findUnique({ where: { key: "SUPPORT_MANAGER" } }), prisma.role.findUnique({ where: { key: "SUPPORT_AGENT" } })]);
    if (!managerRole || !agentRole) throw new Error("R9 roles are missing");
    await prisma.userRoleAssignment.create({ data: { userId: staff.id, roleId: managerRole.id, scopeType: "GLOBAL", scopeKey: "*" } });
    const catalog = await getTicket(customer.cookie, "/api/v2/support/catalog");
    const requestType = catalog.value.data.flatMap((service) => service.requestTypes).find((candidate) => !candidate.requiresBusinessSubject && !candidate.requiresRootCause);
    if (!requestType) throw new Error("No suitable R9 request type");
    const createdResponse = await post(customer.cookie, "/api/v2/tickets", { requestTypeId: requestType.id, subject: `R9 lifecycle ${suffix}`, description: "آزمون چرخه کامل حل و همکاری", businessReferences: [], attachments: [] }); expectStatus(createdResponse, 201, "create"); const created = await body(createdResponse); const ticketId = created.data.ticketId;
    const row = await prisma.ticket.findUnique({ where: { ticketId }, select: { supportTeamId: true } }); if (!row?.supportTeamId) throw new Error("Ticket has no team");
    await prisma.userRoleAssignment.create({ data: { userId: staff.id, roleId: agentRole.id, supportTeamId: row.supportTeamId, scopeType: "SUPPORT_TEAM", scopeKey: String(row.supportTeamId) } });
    const queues = await getTicket(staff.cookie, "/api/v2/workspace/queues");
    let detail = await getTicket(staff.cookie, `/api/v2/workspace/tickets/${ticketId}`); let etag = detail.response.headers.get("etag");
    let response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/assign`, { ownerUserId: staff.id, reason: "مالک چرخه R9" }, etag); expectStatus(response, 200, "assign"); etag = response.headers.get("etag");
    response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/collaborators`, { queueId: queues.value.data[0].id, request: "بررسی تکمیلی R9" }, etag); expectStatus(response, 200, "collaborate"); let value = await body(response); etag = response.headers.get("etag"); const workItemId = value.data.workItems.find((item) => item.status === "OPEN")?.id; if (!workItemId) throw new Error("Work item was not created");
    response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/work-items/${workItemId}/complete`, { response: "بررسی داخلی تکمیل شد" }, etag); expectStatus(response, 200, "complete work item"); value = await body(response); etag = response.headers.get("etag"); if (value.data.status !== "IN_PROGRESS" || value.data.workItems.find((item) => item.id === workItemId)?.status !== "COMPLETED") throw new Error("Work-item completion did not restore IN_PROGRESS");
    response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/resolve`, { resolutionSummary: "راهکار نخست ثبت شد" }, etag); expectStatus(response, 200, "first resolve"); value = await body(response); etag = response.headers.get("etag");
    const schedule = value.data.resolutionCycle; if (!schedule || !(schedule.proposedAt < schedule.reminderOneAt && schedule.reminderOneAt < schedule.reminderTwoAt && schedule.reminderTwoAt < schedule.autoCloseAt)) throw new Error("Resolution business-day schedule is invalid");
    const activeCycle = await prisma.ticketResolutionCycle.findFirst({ where: { ticket: { ticketId }, outcome: "PENDING" } }); if (!activeCycle) throw new Error("Active resolution cycle is missing");
    const now = Date.now(); await prisma.ticketResolutionCycle.update({ where: { id: activeCycle.id }, data: { reminderOneAt: new Date(now - 180_000), reminderTwoAt: new Date(now - 120_000), autoCloseAt: new Date(now - 60_000) } });
    const maintenance = await fetch(`${origin}/api/internal/tickets/lifecycle/process`, { method: "POST", headers: { Authorization: `Bearer ${requireSecret(maintenanceToken, "SLA_MAINTENANCE_TOKEN")}` } }); expectStatus(maintenance, 200, "lifecycle maintenance"); const maintenanceResult = await body(maintenance); if (maintenanceResult.reminders !== 2 || maintenanceResult.closed !== 1) throw new Error("Auto-close did not emit two reminders and close exactly once");
    let customerView = await getTicket(customer.cookie, `/api/v2/tickets/${ticketId}`); if (customerView.value.data.status !== "CLOSED") throw new Error("Auto-closed ticket is not CLOSED"); etag = customerView.response.headers.get("etag");
    response = await post(customer.cookie, `/api/v2/tickets/${ticketId}/reopen`, { reason: "نیاز به بررسی دوباره" }, etag); expectStatus(response, 200, "reopen auto-closed"); etag = response.headers.get("etag");
    response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/public-replies`, { message: "بررسی مجدد انجام شد", attachments: [] }, etag); expectStatus(response, 200, "resume reopened"); etag = response.headers.get("etag");
    response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/resolve`, { resolutionSummary: "راهکار دوم" }, etag); expectStatus(response, 200, "second resolve"); etag = response.headers.get("etag");
    response = await post(customer.cookie, `/api/v2/tickets/${ticketId}/reject-resolution`, { reason: "هنوز کامل نیست" }, etag); expectStatus(response, 200, "reject resolution"); etag = response.headers.get("etag");
    response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/public-replies`, { message: "اصلاح نهایی انجام شد", attachments: [] }, etag); expectStatus(response, 200, "final reply"); etag = response.headers.get("etag");
    response = await post(staff.cookie, `/api/v2/workspace/tickets/${ticketId}/resolve`, { resolutionSummary: "راهکار نهایی" }, etag); expectStatus(response, 200, "third resolve"); etag = response.headers.get("etag");
    response = await post(customer.cookie, `/api/v2/tickets/${ticketId}/confirm-resolution`, {}, etag); expectStatus(response, 200, "confirm resolution"); value = await body(response); etag = response.headers.get("etag"); if (value.data.status !== "CLOSED") throw new Error("Confirmation did not close ticket");
    const cycles = await prisma.ticketResolutionCycle.findMany({ where: { ticket: { ticketId } }, orderBy: { sequence: "asc" }, select: { outcome: true } });
    if (JSON.stringify(cycles.map((cycle) => cycle.outcome)) !== JSON.stringify(["AUTO_CLOSED", "REJECTED", "CONFIRMED"])) throw new Error("Resolution history outcomes are incomplete");
    await prisma.ticket.update({ where: { ticketId }, data: { closedAt: new Date(Date.now() - 8 * 86_400_000) } });
    response = await post(customer.cookie, `/api/v2/tickets/${ticketId}/reopen`, { reason: "خارج از مهلت" }, etag); expectStatus(response, 422, "expired reopen");
    result.runtime = { workItemCompleted: true, reminders: maintenanceResult.reminders, autoClosed: maintenanceResult.closed, reopened: true, rejected: true, confirmed: true, resolutionCycles: cycles.map((cycle) => cycle.outcome), expiredReopenRejected: true };
  } finally { await cleanup(); await prisma.$disconnect(); }
  console.log(JSON.stringify(result));
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "R9 runtime smoke failed"); process.exitCode = 1; });
