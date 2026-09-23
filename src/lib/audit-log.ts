import { AuditOutcome, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getRequestId, getRequestSourceHash } from "@/lib/request-security";
import { logOperationalError } from "@/lib/operational-logger";

interface AuditEventInput {
  request: Request;
  requestId?: string;
  action: string;
  outcome: AuditOutcome;
  actorUserId?: number;
  activePartyId?: number;
  organizationId?: number;
  sessionId?: string;
  targetType?: string;
  targetId?: string;
  metadata?: Prisma.InputJsonObject;
}

function auditEventData(input: AuditEventInput) {
  const requestId = input.requestId ?? getRequestId(input.request);
  return {
    safeContext: {
      action: input.action,
      outcome: input.outcome,
      requestId,
    },
    data: {
      action: input.action,
      outcome: input.outcome,
      requestId,
      actorUserId: input.actorUserId,
      activePartyId: input.activePartyId,
      organizationId: input.organizationId,
      sessionId: input.sessionId,
      targetType: input.targetType,
      targetId: input.targetId,
      sourceHash: getRequestSourceHash(input.request),
      metadata: input.metadata,
    },
  };
}

export async function recordAuditEvent(input: AuditEventInput): Promise<void> {
  const { safeContext, data } = auditEventData(input);

  try {
    await prisma.auditEvent.create({ data });
  } catch (error) {
    logOperationalError("security_audit_persistence_failed", error, safeContext);
  }
}

export async function recordRequiredAuditEvent(
  input: AuditEventInput
): Promise<void> {
  const { data } = auditEventData(input);
  await prisma.auditEvent.create({ data });
}
