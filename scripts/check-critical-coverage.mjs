import { readFile } from "node:fs/promises";
import path from "node:path";

const reportPath = path.resolve("coverage", "coverage-summary.json");
const report = JSON.parse(await readFile(reportPath, "utf8"));

const criticalModules = [
  "src/lib/api-authorization.ts",
  "src/lib/api-validation.ts",
  "src/lib/auth-token.ts",
  "src/lib/authorization-policy.ts",
  "src/lib/csrf-protection.ts",
  "src/lib/current-user.ts",
  "src/lib/database-transaction.ts",
  "src/lib/domain-error.ts",
  "src/lib/route-access-policy.ts",
  "src/modules/shared/api-v2-validation.ts",
  "src/modules/sla-routing/domain/sla-clock.ts",
  "src/modules/tickets/application/ticket-cursor.ts",
  "src/modules/tickets/application/ticket-event-outbox.ts",
  "src/modules/tickets/application/ticket-timeline-cursor.ts",
  "src/modules/tickets/contracts/idempotency-key.ts",
  "src/modules/tickets/contracts/ticket-identifier.ts",
  "src/modules/tickets/contracts/ticket-schemas.ts",
  "src/modules/tickets/domain/ticket-state-machine.ts",
  "src/modules/tickets/domain/ticket-version.ts",
];

const thresholds = {
  statements: 85,
  branches: 65,
  functions: 90,
  lines: 85,
};

const normalizedEntries = new Map(
  Object.entries(report)
    .filter(([key]) => key !== "total")
    .map(([key, value]) => [key.replaceAll("\\", "/"), value])
);

const summaries = criticalModules.map((modulePath) => {
  const entry = [...normalizedEntries.entries()].find(([key]) =>
    key.endsWith(`/${modulePath}`)
  );
  if (!entry) throw new Error(`Critical coverage entry is missing: ${modulePath}`);
  return entry[1];
});

const failures = [];
for (const [metric, minimum] of Object.entries(thresholds)) {
  const counts = summaries.reduce(
    (total, summary) => ({
      covered: total.covered + summary[metric].covered,
      measured: total.measured + summary[metric].total,
    }),
    { covered: 0, measured: 0 }
  );
  const percentage = (counts.covered / counts.measured) * 100;
  if (percentage < minimum) {
    failures.push(`${metric}: ${percentage.toFixed(2)}% < ${minimum}%`);
  }
}

if (failures.length > 0) {
  throw new Error(`Critical coverage thresholds failed: ${failures.join(", ")}`);
}

console.log("Critical security-module coverage thresholds passed.");
