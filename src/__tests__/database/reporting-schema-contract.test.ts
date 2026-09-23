import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectFile = (...segments: string[]) =>
  readFileSync(join(process.cwd(), ...segments), "utf8");

const schema = projectFile("prisma", "schema.prisma");
const kpiContract = projectFile(
  "docs",
  "product-refactor",
  "kpi-definitions.md"
);
const resetScript = projectFile("scripts", "reset-and-seed-product-data.mjs");
const bootstrapScript = projectFile("scripts", "bootstrap-demo-database.mjs");

function prismaModel(modelName: string): string {
  const match = schema.match(
    new RegExp(`model ${modelName} \\{([\\s\\S]*?)\\n\\}`)
  );
  if (!match) throw new Error(`Prisma model ${modelName} is missing`);
  return match[1];
}

describe("KPI reporting database contract", () => {
  it("defines the reporting-owned read models required by KPI-V1", () => {
    const requiredModels = [
      "KpiDefinitionVersion",
      "TicketReportingFact",
      "ReportingProcessedEvent",
      "ReportingProjectionCheckpoint",
      "SupportJourney",
      "KnowledgeArticle",
      "KnowledgeArticleVersion",
      "TransactionVolumeDaily",
      "ReportingRootCauseDimension",
      "RecurringProblemSignal",
    ];

    for (const modelName of requiredModels) {
      expect(() => prismaModel(modelName)).not.toThrow();
    }
  });

  it("enforces idempotency and query indexes in the Prisma schema", () => {
    expect(prismaModel("TicketReportingFact")).toMatch(
      /ticketId\s+Int\s+@unique/
    );
    expect(prismaModel("ReportingProcessedEvent")).toMatch(
      /eventId\s+String\s+@id\s+@db\.Char\(36\)/
    );
    expect(prismaModel("TransactionVolumeDaily")).toContain(
      "@@unique([providerCode, transactionType, localDate, scopeType, scopeKey], map: \"TransactionVolumeDaily_scope_bucket_key\")"
    );
    expect(prismaModel("RecurringProblemSignal")).toMatch(
      /signalKey\s+String\s+@unique/
    );
    expect(prismaModel("TicketReportingFact")).toContain(
      "@@index([supportTeamId, queueId, ticketCreatedAt])"
    );
    expect(prismaModel("TicketReportingFact")).toContain(
      "@@index([firstResponseDueAt, firstResponseSlaState]"
    );
    expect(prismaModel("TicketReportingFact")).toContain(
      "@@index([resolutionDueAt, resolutionSlaState]"
    );
    expect(prismaModel("TicketReportingFact")).toContain(
      "@@index([firstClosedAt, reopenedWithinWindow])"
    );
    expect(prismaModel("TicketReportingFact")).toContain(
      "@@index([normalizedRootCauseId, ticketCreatedAt], map: \"TicketReportingFact_root_cause_created_idx\")"
    );
    expect(prismaModel("TicketReportingFact")).toMatch(
      /partyKeyHash\s+String\?\s+@db\.Char\(64\)/
    );
    expect(prismaModel("Ticket")).toMatch(
      /normalizedRootCauseId\s+Int\?/
    );
    expect(prismaModel("SupportJourney")).toMatch(
      /startCommandKeyHash\s+String\?\s+@unique\s+@db\.Char\(64\)/
    );
    expect(prismaModel("TicketBusinessReference")).toContain(
      "@@index([verificationStatus, referenceType, ticketId], map: \"TicketBusinessReference_verified_type_ticket_idx\")"
    );
    expect(prismaModel("SupportJourney")).toMatch(
      /confirmationCommandKeyHash\s+String\?\s+@unique\s+@db\.Char\(64\)/
    );
    expect(prismaModel("SupportJourney")).toContain(
      "@@index([supportTeamId, startedAt])"
    );
  });

  it("keeps sensitive ticket content out of reporting-owned records", () => {
    const reportingModels = [
      "TicketReportingFact",
      "SupportJourney",
      "TransactionVolumeDaily",
      "RecurringProblemSignal",
    ]
      .map(prismaModel)
      .join("\n");

    expect(reportingModels).not.toMatch(
      /^\s*(mobile|nationalCode|messageBody|ticketText|fileName|paymentReference)\s/m
    );
    expect(prismaModel("SupportJourney")).toMatch(
      /partyKeyHash\s+String\s+@db\.Char\(64\)/
    );
  });

  it("rebuilds the demo database directly from the Prisma schema", () => {
    expect(existsSync(join(process.cwd(), "prisma", "migrations"))).toBe(false);
    expect(bootstrapScript).toContain('"db"');
    expect(bootstrapScript).toContain('"push"');
    expect(bootstrapScript).toContain('"--force-reset"');
    expect(bootstrapScript).toContain('"--accept-data-loss"');
    expect(bootstrapScript).toContain('"--skip-generate"');
    expect(bootstrapScript).toContain("reset-and-seed-product-data.mjs");
  });

  it("pins the active database contract to the approved KPI-V1 document", () => {
    const contractHash = createHash("sha256")
      .update(kpiContract)
      .digest("hex");

    expect(resetScript).toContain(`KPI_CONTRACT_HASH = "${contractHash}"`);
    expect(resetScript).toContain('KPI_DEFINITION_VERSION = "KPI-V1"');
    expect(resetScript).toContain('status: "ACTIVE"');
  });
});
