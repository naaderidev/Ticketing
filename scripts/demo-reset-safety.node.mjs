import assert from "node:assert/strict";
import test from "node:test";
import { assertSafeDemoResetTarget } from "./demo-reset-safety.mjs";

const confirmation = ["--confirm=RESET_DEMO_DATABASE"];

test("allows an explicitly confirmed loopback demo database", () => {
  assert.doesNotThrow(() =>
    assertSafeDemoResetTarget({
      environment: {
        DEMO_MODE: "true",
        ALLOW_DEMO_DATABASE_RESET: "true",
        DATABASE_URL: "mysql://demo:demo@127.0.0.1:3306/ticketing",
      },
      argumentsList: confirmation,
    })
  );
});
test("rejects reset unless demo mode and the destructive switch are explicit", () => {
  assert.throws(
    () =>
      assertSafeDemoResetTarget({
        environment: {
          DATABASE_URL: "mysql://demo:demo@127.0.0.1:3306/ticketing",
        },
        argumentsList: confirmation,
      }),
    /DEMO_MODE=true/
  );
});
test("requires an allow-listed host and exact database name for remote reset", () => {
  const environment = {
    DEMO_MODE: "true",
    ALLOW_DEMO_DATABASE_RESET: "true",
    DATABASE_URL: "mysql://demo:demo@database:3306/ticketing_demo",
    DEMO_DATABASE_HOST_ALLOWLIST: "database",
    DEMO_DATABASE_RESET_NAME: "ticketing_demo",
  };

  assert.doesNotThrow(() =>
    assertSafeDemoResetTarget({ environment, argumentsList: confirmation })
  );
  assert.throws(
    () =>
      assertSafeDemoResetTarget({
        environment: {
          ...environment,
          DEMO_DATABASE_RESET_NAME: "another_database",
        },
        argumentsList: confirmation,
      }),
    /must exactly match/
  );
});
