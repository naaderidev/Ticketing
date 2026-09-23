import type { CurrentUser } from "@/lib/current-user";
import { notFoundError } from "@/lib/domain-error";
import { prisma } from "@/lib/prisma";
import { getPartyContextSnapshot } from "@/modules/organizations/application/party-context-service";

const ASSET_REFERENCE_TYPES = new Set([
  "ASSET",
  "POWER_PLANT",
  "METER",
  "SAVING_PROGRAM",
]);

type ReferenceSummary = { key: string; label: string };

function uniqueReferences(items: ReferenceSummary[]): ReferenceSummary[] {
  return [...new Map(items.map((item) => [item.key, item])).values()].sort(
    (left, right) => left.label.localeCompare(right.label, "fa")
  );
}

export async function getCompanySupportOverview(user: CurrentUser) {
  const snapshot = await getPartyContextSnapshot(user);
  const context = snapshot.contexts.find(
    (candidate) => candidate.partyId === snapshot.activePartyId
  );
  if (!context?.organization) {
    throw notFoundError("برای مشاهده پشتیبانی شرکت، ابتدا حساب شرکت را فعال کنید");
  }

  const now = new Date();
  const organization = await prisma.organization.findFirst({
    where: {
      id: context.organization.id,
      status: "ACTIVE",
      partyId: context.partyId,
    },
    select: {
      id: true,
      legalName: true,
      nationalId: true,
      units: {
        orderBy: [{ name: "asc" }, { id: "asc" }],
        select: { id: true, name: true, code: true },
      },
      memberships: {
        where: {
          status: "ACTIVE",
          validFrom: { lte: now },
          OR: [{ validTo: null }, { validTo: { gt: now } }],
        },
        orderBy: [{ role: "asc" }, { user: { lastName: "asc" } }],
        select: {
          id: true,
          role: true,
          user: { select: { id: true, firstName: true, lastName: true } },
          scopes: {
            orderBy: [{ type: "asc" }, { scopeKey: "asc" }],
            select: { type: true, scopeKey: true },
          },
        },
      },
      ticketBusinessReferences: {
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          referenceType: true,
          referenceKey: true,
          displayLabel: true,
        },
      },
    },
  });
  if (!organization) throw notFoundError("شرکت فعال یافت نشد");

  const reviewedTickets = await prisma.ticket.findMany({
    where: {
      organizationId: organization.id,
      accountReview: { isNot: null },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
    select: {
      ticketId: true,
      subject: true,
      resolutionSummary: true,
      accountReview: {
        select: { status: true, decidedAt: true, decisionNote: true },
      },
    },
  });

  const scopes = context.organization.scopes;
  const organizationWide =
    context.organization.role === "MANAGER" ||
    scopes.some((scope) => scope.type === "ORGANIZATION" && scope.scopeKey === "*");
  const allowedBranchKeys = new Set(
    scopes.filter((scope) => scope.type === "BRANCH").map((scope) => scope.scopeKey)
  );
  const allowedContractKeys = new Set(
    scopes.filter((scope) => scope.type === "CONTRACT").map((scope) => scope.scopeKey)
  );
  const allowedAssetKeys = new Set(
    scopes.filter((scope) => scope.type === "ASSET").map((scope) => scope.scopeKey)
  );

  const visibleReferences = organization.ticketBusinessReferences.filter(
    (reference) =>
      organizationWide ||
      (reference.referenceType === "CONTRACT" &&
        allowedContractKeys.has(reference.referenceKey)) ||
      (ASSET_REFERENCE_TYPES.has(reference.referenceType) &&
        allowedAssetKeys.has(reference.referenceKey))
  );
  const contracts = uniqueReferences([
    ...visibleReferences
      .filter((reference) => reference.referenceType === "CONTRACT")
      .map((reference) => ({
        key: reference.referenceKey,
        label: reference.displayLabel ?? reference.referenceKey,
      })),
    ...[...allowedContractKeys].map((key) => ({ key, label: key })),
  ]);
  const assets = uniqueReferences([
    ...visibleReferences
      .filter((reference) => ASSET_REFERENCE_TYPES.has(reference.referenceType))
      .map((reference) => ({
        key: reference.referenceKey,
        label: reference.displayLabel ?? reference.referenceKey,
      })),
    ...[...allowedAssetKeys].map((key) => ({ key, label: key })),
  ]);

  return {
    organization: {
      id: organization.id,
      legalName: organization.legalName,
      nationalId: organization.nationalId,
      role: context.organization.role,
      scopes,
    },
    branches: organization.units.filter(
      (unit) =>
        organizationWide ||
        allowedBranchKeys.has(unit.code) ||
        allowedBranchKeys.has(String(unit.id))
    ),
    representatives: organization.memberships.map((membership) => ({
      id: membership.id,
      role: membership.role,
      name: `${membership.user.firstName} ${membership.user.lastName}`.trim(),
      isCurrentUser: membership.user.id === user.id,
      scopes: membership.scopes,
    })),
    contracts,
    assets,
    companyReport: {
      reviewedCount: reviewedTickets.length,
      approvedCount: reviewedTickets.filter((ticket) => ticket.accountReview?.status === "APPROVED").length,
      pendingCount: reviewedTickets.filter((ticket) => ticket.accountReview?.status === "PENDING").length,
      results: reviewedTickets.map((ticket) => ({
        ticketId: ticket.ticketId,
        subject: ticket.subject,
        resolutionSummary: ticket.resolutionSummary,
        status: ticket.accountReview!.status,
        decidedAt: ticket.accountReview!.decidedAt?.toISOString() ?? null,
        decisionNote: ticket.accountReview!.decisionNote,
      })),
    },
  };
}
