import type { z } from "zod";
import type { CurrentUser } from "@/lib/current-user";
import { recordAuditEvent } from "@/lib/audit-log";
import { AUTHENTICATED_MUTATION_LIMIT } from "@/lib/rate-limit";
import { requireWorkspaceApiV2User } from "@/modules/shared/api-v2-authorization";
import { apiV2Error, apiV2Success, handleApiV2Error } from "@/modules/shared/api-v2-response";
import { parseApiV2Json } from "@/modules/shared/api-v2-validation";
import { parseIdempotencyKey } from "@/modules/tickets/contracts/idempotency-key";
import { isSafeTicketIdentifier } from "@/modules/tickets/contracts/ticket-identifier";
import { isTicketCommandError } from "@/modules/tickets/domain/ticket-command-error";
import { ticketEtag } from "@/modules/tickets/domain/ticket-version";

type CommandResult = {
  ticket: { ticketId: string; version: number };
  replayed: boolean;
};

export async function handleWorkspaceCommand<T>(input: {
  request: Request;
  params: Promise<{ ticketId: string }>;
  schema: z.ZodType<T>;
  action: string;
  operation: string;
  fallbackMessage: string;
  execute: (commandInput: {
    user: CurrentUser;
    ticketId: string;
    command: T;
    idempotencyKey: string;
    ifMatch: string | null;
  }) => Promise<CommandResult>;
}) {
  try {
    const auth = await requireWorkspaceApiV2User(input.request, {
      rateLimit: AUTHENTICATED_MUTATION_LIMIT,
    });
    if (!auth.authorized) return auth.response;
    const ticketId = (await input.params).ticketId;
    if (!isSafeTicketIdentifier(ticketId)) {
      return apiV2Error(input.request, "شناسه تیکت معتبر نیست", 400, "INVALID_PATH_PARAMETER");
    }
    const idempotencyKey = parseIdempotencyKey(input.request);
    if (!idempotencyKey.success) return idempotencyKey.response;
    const body = await parseApiV2Json(input.request, input.schema);
    if (!body.success) return body.response;
    const result = await input.execute({
      user: auth.user,
      ticketId,
      command: body.data,
      idempotencyKey: idempotencyKey.data,
      ifMatch: input.request.headers.get("if-match"),
    });
    await recordAuditEvent({
      request: input.request,
      action: input.action,
      outcome: "SUCCESS",
      actorUserId: auth.user.id,
      sessionId: auth.user.sessionId,
      targetType: "TICKET",
      targetId: ticketId,
      metadata: { replayed: result.replayed },
    });
    return apiV2Success(input.request, result.ticket, {
      headers: {
        ETag: ticketEtag(result.ticket.ticketId, result.ticket.version),
        ...(result.replayed ? { "Idempotency-Replayed": "true" } : {}),
      },
    });
  } catch (error) {
    if (isTicketCommandError(error)) {
      return apiV2Error(input.request, error.message, error.status, error.code);
    }
    return handleApiV2Error(input.request, error, input.fallbackMessage, input.operation);
  }
}
