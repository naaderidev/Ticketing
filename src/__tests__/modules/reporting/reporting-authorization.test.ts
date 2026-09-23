import { prisma } from "@/lib/prisma";
import {
  REPORTING_PERMISSIONS,
  hasReportingExportPermissionForScope,
  resolveReportingAccessScope,
  resolveReportingTicketDrillDownWhere,
} from "@/modules/reporting/application/reporting-authorization";

jest.mock("@/lib/prisma", () => ({
  prisma: { userRoleAssignment: { findMany: jest.fn() } },
}));

function assignment(input: {
  permission: string;
  scopeType: "GLOBAL" | "SUPPORT_TEAM";
  scopeKey: string;
  supportTeamId: number | null;
}) {
  return {
    scopeType: input.scopeType,
    scopeKey: input.scopeKey,
    supportTeamId: input.supportTeamId,
    role: {
      permissions: [{ permission: { key: input.permission } }],
    },
  };
}

describe("reporting authorization scope", () => {
  beforeEach(() => jest.clearAllMocks());

  it("prioritizes a global management grant", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      assignment({
        permission: REPORTING_PERMISSIONS.READ_TEAM,
        scopeType: "SUPPORT_TEAM",
        scopeKey: "3",
        supportTeamId: 3,
      }),
      assignment({
        permission: REPORTING_PERMISSIONS.READ_GLOBAL,
        scopeType: "GLOBAL",
        scopeKey: "*",
        supportTeamId: null,
      }),
    ]);

    await expect(resolveReportingAccessScope(7)).resolves.toEqual({
      type: "GLOBAL",
      accessMode: "MANAGEMENT",
      teamIds: null,
    });
  });

  it("unions only explicit and internally consistent team assignments", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      assignment({
        permission: REPORTING_PERMISSIONS.READ_TEAM,
        scopeType: "SUPPORT_TEAM",
        scopeKey: "9",
        supportTeamId: 9,
      }),
      assignment({
        permission: REPORTING_PERMISSIONS.READ_TEAM,
        scopeType: "SUPPORT_TEAM",
        scopeKey: "invalid",
        supportTeamId: 4,
      }),
      assignment({
        permission: REPORTING_PERMISSIONS.READ_TEAM,
        scopeType: "GLOBAL",
        scopeKey: "*",
        supportTeamId: null,
      }),
    ]);

    await expect(resolveReportingAccessScope(7)).resolves.toEqual({
      type: "TEAMS",
      accessMode: "MANAGEMENT",
      teamIds: [9],
    });
  });

  it("allows a global audit aggregate but denies a system role without an explicit grant", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValueOnce([
      assignment({
        permission: REPORTING_PERMISSIONS.AUDIT_READ,
        scopeType: "GLOBAL",
        scopeKey: "*",
        supportTeamId: null,
      }),
    ]);
    await expect(resolveReportingAccessScope(8)).resolves.toEqual({
      type: "GLOBAL",
      accessMode: "AUDIT",
      teamIds: null,
    });

    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValueOnce([]);
    await expect(resolveReportingAccessScope(1)).resolves.toBeNull();
  });
});

describe("reporting export authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("requires a global export grant for a global report", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      { scopeType: "SUPPORT_TEAM", scopeKey: "3", supportTeamId: 3 },
    ]);
    await expect(hasReportingExportPermissionForScope(7, {
      type: "GLOBAL",
      accessMode: "MANAGEMENT",
      teamIds: null,
    })).resolves.toBe(false);

    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      { scopeType: "GLOBAL", scopeKey: "*", supportTeamId: null },
    ]);
    await expect(hasReportingExportPermissionForScope(7, {
      type: "GLOBAL",
      accessMode: "MANAGEMENT",
      teamIds: null,
    })).resolves.toBe(true);
  });

  it("requires export coverage for every readable team", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      { scopeType: "SUPPORT_TEAM", scopeKey: "3", supportTeamId: 3 },
      { scopeType: "SUPPORT_TEAM", scopeKey: "4", supportTeamId: 4 },
    ]);
    await expect(hasReportingExportPermissionForScope(7, {
      type: "TEAMS",
      accessMode: "MANAGEMENT",
      teamIds: [3, 4],
    })).resolves.toBe(true);
  });
});

describe("reporting drill-down ticket authorization", () => {
  beforeEach(() => jest.clearAllMocks());

  it("intersects report access with ordinary workspace ticket scope", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([
      {
        scopeType: "GLOBAL",
        scopeKey: "*",
        supportTeamId: null,
        role: { permissions: [{ permission: { key: "support.workspace.access" } }] },
      },
      {
        scopeType: "SUPPORT_TEAM",
        scopeKey: "9",
        supportTeamId: 9,
        role: { permissions: [{ permission: { key: "ticket.workspace.read" } }] },
      },
    ]);
    await expect(resolveReportingTicketDrillDownWhere(7)).resolves.toEqual({
      ticket: {
        OR: [
          { supportTeamId: { in: [9] } },
          { workItems: { some: { supportTeamId: { in: [9] }, status: "OPEN" } } },
        ],
      },
    });
  });

  it("denies drill-down when ordinary workspace access is absent", async () => {
    (prisma.userRoleAssignment.findMany as jest.Mock).mockResolvedValue([]);
    await expect(resolveReportingTicketDrillDownWhere(7)).resolves.toBeNull();
  });
});
