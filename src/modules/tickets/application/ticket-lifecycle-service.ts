import type { Prisma, TicketResolutionOutcome } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runSerializableTransaction } from "@/lib/database-transaction";
import { appendTicketEvent } from "@/modules/tickets/application/ticket-event-outbox";
import { addBusinessDays, parseWeeklySchedule, type SlaCalendarDefinition } from "@/modules/sla-routing/domain/sla-clock";

type Transaction = Prisma.TransactionClient;
const AUTO_CLOSE_BUSINESS_DAYS = 3;

function calendarDefinition(calendar: { timeZone: string; weeklySchedule: Prisma.JsonValue; holidays: Array<{ localDate: Date }> }): SlaCalendarDefinition {
  return {
    timeZone: calendar.timeZone,
    weeklySchedule: parseWeeklySchedule(calendar.weeklySchedule),
    holidayDateKeys: new Set(calendar.holidays.map((holiday) => holiday.localDate.toISOString().slice(0, 10))),
  };
}

async function lifecycleCalendar(transaction: Transaction, ticketId: number, now: Date) {
  const ticketSla = await transaction.ticketSla.findUnique({
    where: { ticketId },
    select: { calendar: { select: { timeZone: true, weeklySchedule: true, holidays: { select: { localDate: true } } } } },
  });
  if (ticketSla?.calendar) return calendarDefinition(ticketSla.calendar);
  const fallback = await transaction.slaCalendar.findFirst({
    where: { status: "ACTIVE", effectiveFrom: { lte: now }, OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }] },
    orderBy: { version: "desc" },
    select: { timeZone: true, weeklySchedule: true, holidays: { select: { localDate: true } } },
  });
  if (!fallback) throw new Error("Active business calendar is required for resolution auto-close");
  return calendarDefinition(fallback);
}

export async function startTicketResolutionCycle(transaction: Transaction, ticketId: number, proposedAt: Date) {
  const calendar = await lifecycleCalendar(transaction, ticketId, proposedAt);
  const latest = await transaction.ticketResolutionCycle.findFirst({ where: { ticketId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
  return transaction.ticketResolutionCycle.create({
    data: {
      ticketId,
      sequence: (latest?.sequence ?? 0) + 1,
      proposedAt,
      reminderOneAt: addBusinessDays(proposedAt, 1, calendar),
      reminderTwoAt: addBusinessDays(proposedAt, 2, calendar),
      autoCloseAt: addBusinessDays(proposedAt, AUTO_CLOSE_BUSINESS_DAYS, calendar),
      activeKey: String(ticketId),
    },
  });
}

export async function finishActiveResolutionCycle(transaction: Transaction, ticketId: number, outcome: Exclude<TicketResolutionOutcome, "PENDING">, closedAt?: Date) {
  return transaction.ticketResolutionCycle.updateMany({
    where: { ticketId, activeKey: String(ticketId), outcome: "PENDING" },
    data: { outcome, activeKey: null, closedAt: closedAt ?? null },
  });
}

async function backfillResolvedCycles(limit: number, now: Date) {
  const tickets = await prisma.ticket.findMany({
    where: { lifecycleStatus: "RESOLVED", resolutionCycles: { none: { outcome: "PENDING" } } },
    orderBy: { id: "asc" },
    take: limit,
    select: { id: true, updatedAt: true, events: { where: { type: "ticket.resolved.v1" }, orderBy: { createdAt: "desc" }, take: 1, select: { createdAt: true } } },
  });
  let created = 0;
  for (const ticket of tickets) {
    const didCreate = await runSerializableTransaction(async (transaction) => {
      const current = await transaction.ticket.findFirst({ where: { id: ticket.id, lifecycleStatus: "RESOLVED", resolutionCycles: { none: { outcome: "PENDING" } } }, select: { id: true } });
      if (!current) return false;
      await startTicketResolutionCycle(transaction, ticket.id, ticket.events[0]?.createdAt ?? ticket.updatedAt);
      return true;
    });
    if (didCreate) created += 1;
  }
  return { evaluated: tickets.length, created, at: now.toISOString() };
}

async function processResolutionCycle(cycleId: bigint, now: Date) {
  return runSerializableTransaction(async (transaction) => {
    const cycle = await transaction.ticketResolutionCycle.findUnique({
      where: { id: cycleId },
      include: { ticket: { select: { id: true, ticketId: true, lifecycleStatus: true, version: true } } },
    });
    if (!cycle || cycle.outcome !== "PENDING" || cycle.activeKey !== String(cycle.ticketId) || cycle.ticket.lifecycleStatus !== "RESOLVED") return { reminders: 0, closed: 0 };
    let reminders = 0;
    const dueCount = now >= cycle.reminderTwoAt ? 2 : now >= cycle.reminderOneAt ? 1 : 0;
    for (let reminder = cycle.reminderCount + 1; reminder <= dueCount; reminder += 1) {
      const changed = await transaction.ticketResolutionCycle.updateMany({ where: { id: cycle.id, outcome: "PENDING", reminderCount: reminder - 1 }, data: { reminderCount: reminder } });
      if (changed.count !== 1) break;
      await appendTicketEvent(transaction, { ticketInternalId: cycle.ticket.id, ticketPublicId: cycle.ticket.ticketId, type: "ticket.resolution_reminder.v1", actorType: "SYSTEM", sourceType: "AUTOMATION", visibility: "PUBLIC", fromStatus: "RESOLVED", toStatus: "RESOLVED", occurredAt: now, metadata: { reminder, autoCloseAt: cycle.autoCloseAt.toISOString() } });
      await transaction.notification.create({ data: { ticketId: cycle.ticket.id, recipientType: "USER", message: `یادآوری ${reminder} از ۲: نتیجه تیکت ${cycle.ticket.ticketId} را تأیید یا رد کنید` } });
      reminders += 1;
    }
    if (now < cycle.autoCloseAt) return { reminders, closed: 0 };
    const updated = await transaction.ticket.updateMany({ where: { id: cycle.ticket.id, version: cycle.ticket.version, lifecycleStatus: "RESOLVED" }, data: { lifecycleStatus: "CLOSED", status: "CLOSED", version: { increment: 1 }, closedAt: now, closedBy: "SYSTEM", closedReason: "بستن خودکار پس از سه روز کاری و دو یادآوری" } });
    if (updated.count !== 1) return { reminders, closed: 0 };
    await finishActiveResolutionCycle(transaction, cycle.ticketId, "AUTO_CLOSED", now);
    await appendTicketEvent(transaction, { ticketInternalId: cycle.ticket.id, ticketPublicId: cycle.ticket.ticketId, type: "ticket.closed.v1", actorType: "SYSTEM", sourceType: "AUTOMATION", visibility: "PUBLIC", fromStatus: "RESOLVED", toStatus: "CLOSED", occurredAt: now, metadata: { source: "resolution-timeout", reminderCount: cycle.reminderCount + reminders } });
    await transaction.notification.create({ data: { ticketId: cycle.ticket.id, recipientType: "USER", message: `تیکت ${cycle.ticket.ticketId} پس از پایان مهلت تأیید بسته شد` } });
    return { reminders, closed: 1 };
  });
}

export async function runTicketLifecycleMaintenance(limit = 100, now = new Date()) {
  const batchSize = Math.min(Math.max(Math.trunc(limit), 1), 500);
  const backfill = await backfillResolvedCycles(batchSize, now);
  const cycles = await prisma.ticketResolutionCycle.findMany({ where: { outcome: "PENDING", OR: [{ reminderOneAt: { lte: now } }, { autoCloseAt: { lte: now } }] }, orderBy: { id: "asc" }, take: batchSize, select: { id: true } });
  let reminders = 0; let closed = 0;
  for (const cycle of cycles) { const result = await processResolutionCycle(cycle.id, now); reminders += result.reminders; closed += result.closed; }
  return { backfill, evaluated: cycles.length, reminders, closed };
}
