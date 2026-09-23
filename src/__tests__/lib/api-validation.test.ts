import { z } from "zod";
import {
  handleApiError,
  parseJsonBody,
  parsePositiveInteger,
  parseQuery,
  parseTicketIdentifier,
} from "@/lib/api-validation";
import { errors } from "@/lib/strings";
import { conflictError } from "@/lib/domain-error";

jest.mock("next/server", () => ({
  NextResponse: {
    json: jest.fn((body, init) => ({
      status: init?.status ?? 200,
      json: () => Promise.resolve(body),
    })),
  },
}));

describe("API boundary validation", () => {
  const strictSchema = z.object({ name: z.string().trim().min(1) }).strict();

  it("returns a stable response for malformed JSON", async () => {
    const request = new Request("http://localhost", { method: "POST", body: "{" });
    const result = await parseJsonBody(request, strictSchema);

    expect(result.success).toBe(false);
    if (result.success) return;
    await expect(result.response.json()).resolves.toMatchObject({
      error: expect.any(String),
      code: "MALFORMED_JSON",
    });
  });

  it("rejects unknown JSON fields and returns field details", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "فنی", isAdmin: true }),
    });
    const result = await parseJsonBody(request, strictSchema);

    expect(result.success).toBe(false);
    if (result.success) return;
    await expect(result.response.json()).resolves.toMatchObject({
      code: "INVALID_REQUEST",
      details: { fieldErrors: expect.any(Object) },
    });
  });

  it("normalizes valid JSON through the schema", async () => {
    const request = new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ name: "  فنی  " }),
    });
    await expect(parseJsonBody(request, strictSchema)).resolves.toEqual({
      success: true,
      data: { name: "فنی" },
    });
  });

  it("rejects unknown and duplicate query parameters", async () => {
    const schema = z.object({ page: z.coerce.number().int().positive().optional() }).strict();
    const unknown = parseQuery(new URLSearchParams("sort=desc"), schema);
    const duplicate = parseQuery(new URLSearchParams("page=1&page=2"), schema);

    expect(unknown.success).toBe(false);
    expect(duplicate.success).toBe(false);
  });

  it("accepts only safe positive integer path parameters", () => {
    expect(parsePositiveInteger("42")).toEqual({ success: true, data: 42 });
    expect(parsePositiveInteger("1abc").success).toBe(false);
    expect(parsePositiveInteger("0").success).toBe(false);
  });

  it("validates ticket identifiers", () => {
    expect(parseTicketIdentifier("TK-ABC-123")).toEqual({ success: true, data: "TK-ABC-123" });
    expect(parseTicketIdentifier("../secret").success).toBe(false);
  });

  it("maps known domain errors and hides unexpected messages", async () => {
    const known = handleApiError(conflictError(errors.DEPARTMENT_ALREADY_EXISTS), "fallback", "context");
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const unknown = handleApiError(new Error("database password leaked"), "fallback", "context");

    expect(known.status).toBe(409);
    await expect(unknown.json()).resolves.toEqual({ error: "fallback", code: "INTERNAL_ERROR" });
    consoleError.mockRestore();
  });
});
